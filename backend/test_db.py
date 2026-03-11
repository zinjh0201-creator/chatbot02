import asyncio
import os
import asyncpg
import ssl
from dotenv import load_dotenv

load_dotenv("../.env")

async def check_db():
    print("Connecting to DB...")
    url = os.getenv('DATABASE_URL')
    use_ssl = "sslmode=require" in url or "ssl=true" in url.lower()
    if use_ssl:
        url = url.replace("?sslmode=require", "").replace("&sslmode=require", "")
        url = url.replace("?ssl=true", "").replace("&ssl=true", "")
        if "?" in url and url.rstrip().endswith("?"):
            url = url.rstrip("?")
    ssl_ctx = ssl.create_default_context() if use_ssl else False

    pool = await asyncpg.create_pool(url, ssl=ssl_ctx, min_size=1, max_size=2)
    async with pool.acquire() as conn:
        tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
        print('Tables:', [t['table_name'] for t in tables])
        
        has_docs = await conn.fetchval("SELECT count(*) FROM information_schema.tables WHERE table_name='documents'")
        if has_docs:
            docs = await conn.fetchval('SELECT count(*) FROM documents')
            print('Documents count:', docs)
            if docs > 0:
                sample = await conn.fetch('SELECT * FROM documents LIMIT 3')
                print('Columns:', sample[0].keys())
                for row in sample:
                    print({k: str(v)[:100] for k,v in dict(row).items()})

asyncio.run(check_db())
