import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChatMode = "document" | "gemini";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: {
    mode?: ChatMode;
    similarity?: number | null;
    sources?: string[];
  };
};

type ChatResponse = {
  answer: string;
  mode: ChatMode;
  similarity?: number | null;
  sources?: string[];
};

// const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (window.location.hostname === "localhost" ? "http://localhost:8000" : "/api");
const STORAGE_KEY = "ragchat.messages.v1";
const MAX_PDF_MB = 200;

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ChatMessage[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, pending]);

  const canSend = useMemo(
    () => input.trim().length > 0 && !pending,
    [input, pending],
  );

  async function send() {
    const text = input.trim();
    if (!text || pending) return;

    setInput("");
    const userMsg: ChatMessage = { id: uid(), role: "user", text };
    setMessages((m) => [...m, userMsg]);

    setPending(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ChatResponse;
      const assistantMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        text: data.answer,
        meta: {
          mode: data.mode,
          similarity: data.similarity ?? null,
          sources: data.sources ?? [],
        },
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (e) {
      const assistantMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        text: `[오류]\n${e instanceof Error ? e.message : String(e)}`,
      };
      setMessages((m) => [...m, assistantMsg]);
    } finally {
      setPending(false);
    }
  }

  const uploadPdf = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("PDF 파일만 업로드 가능합니다.");
      return;
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      setUploadError(`파일 크기는 ${MAX_PDF_MB}MB 이하여야 합니다.`);
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/ingest-pdf`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `업로드 실패 (${res.status})`);
      }
      setUploadError(null);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void uploadPdf(f);
      e.target.value = "";
    },
    [uploadPdf],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void uploadPdf(f);
    },
    [uploadPdf],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  function clearHistory() {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="page">
      <aside className={`sidebar ${isSidebarOpen ? "" : "closed"}`}>
        <div className="sidebarHeaderRow">
          <div className="sidebarTitle">
            <span className="sidebarIcon" aria-hidden>
              📄
            </span>
            문서 업로드
          </div>
          <button 
            type="button" 
            className="closeSidebarBtn" 
            onClick={() => setIsSidebarOpen(false)}
            aria-label="사이드바 닫기"
          >
            ×
          </button>
        </div>
        <p className="sidebarHint">PDF 문서를 업로드해 주세요</p>
        
        <div
          className={`dropZone ${dragOver ? "dropZoneActive" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <span className="dropZoneText">여기로 파일을 드래그하세요</span>
          <span className="dropZoneLimit">최대 {MAX_PDF_MB}MB 지원 (PDF)</span>
        </div>
        <button
          type="button"
          className="browseBtn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          파일 찾아보기
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={onFileChange}
          className="hiddenInput"
          aria-hidden
        />
        {uploadError && <p className="uploadError">{uploadError}</p>}
        {uploading && <p className="uploadStatus">문서 분석 중…</p>}
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbarLeft">
            {!isSidebarOpen && (
              <button 
                type="button" 
                className="toggleSidebarBtn" 
                onClick={() => setIsSidebarOpen(true)}
                aria-label="사이드바 열기"
              >
                ≡
              </button>
            )}
            <div className="titles">
              <h1 className="title">생산성 강화 RAG 챗봇</h1>
              <p className="subtitle">
                사내 규정, 매뉴얼 등 PDF를 업로드하고 질문해 보세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ghostBtn"
            onClick={clearHistory}
            disabled={pending || messages.length === 0}
          >
            대화 지우기
          </button>
        </header>

        <div className="chat" ref={listRef}>
          {messages.length === 0 ? (
            <div className="empty">
              <div className="emptyCard">
                <div className="emptyTitle">무엇이든 물어보세요!</div>
                <div className="emptyDesc">
                  왼쪽에 문서를 업로드하면 <b>[문서 참조 답변]</b>을,<br/> 
                  업로드하지 않으면 <b>[AI 추론 답변]</b>을 제공합니다.
                </div>
                <div className="emptyHint">예: "사내 휴가 규정 요약해 줘."</div>
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`msgRow ${m.role}`}>
                <div className="msgBubble">
                  <pre className="msgText">{m.text}</pre>
                  {m.role === "assistant" && m.meta?.mode ? (
                    <div className="meta">
                      <span className={`badge ${m.meta.mode}`}>
                        {m.meta.mode === "document"
                          ? "🎯 문서 참조"
                          : "✨ AI 추론"}
                      </span>
                      {typeof m.meta.similarity === "number" ? (
                        <span className="sim">
                          정확도: {(m.meta.similarity * 100).toFixed(1)}%
                        </span>
                      ) : null}
                      {m.meta.sources && m.meta.sources.length > 0 ? (
                        <details className="sources">
                          <summary>참고한 문서 열어보기</summary>
                          <ul>
                            {m.meta.sources.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
          {pending && (
            <div className="msgRow assistant">
              <div className="msgBubble">
                <div className="typing">
                  <span className="t" />
                  <span className="t" />
                  <span className="t" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="composerWrapper">
          <div className="composer">
            <textarea
              className="input"
              rows={1}
              placeholder="메시지를 입력하세요 (Shift + Enter로 줄바꿈)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={pending}
            />
            <button
              type="button"
              className="sendBtn"
              onClick={() => void send()}
              disabled={!canSend}
              aria-label="전송"
            >
              <span className="sendArrow" aria-hidden>
                ↑
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

