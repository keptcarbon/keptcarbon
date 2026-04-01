import os
import asyncio
import logging
from typing import Optional

from fastapi import FastAPI
import asyncpg

app = FastAPI()
db_pool: Optional[asyncpg.pool.Pool] = None


async def _create_pool_with_retries(host, port, user, password, database, max_retries=10, base_delay=1):
    """Try to create an asyncpg pool with retries and exponential backoff."""
    last_exc = None
    for attempt in range(1, max_retries + 1):
        try:
            pool = await asyncpg.create_pool(host=host, port=port, user=user, password=password, database=database)
            logging.info(f"Connected to DB on attempt {attempt}")
            return pool
        except Exception as e:
            last_exc = e
            logging.warning(f"DB connection attempt {attempt} failed: {e}")
            if attempt == max_retries:
                break
            # exponential backoff with a small cap
            await asyncio.sleep(min(base_delay * (2 ** (attempt - 1)), 10))
    raise last_exc


@app.on_event("startup")
async def startup():
    global db_pool
    db_host = os.getenv("DATABASE_HOST", "db")
    db_port = int(os.getenv("DATABASE_PORT", "5432"))
    user = os.getenv("DATABASE_USER", "postgres")
    password = os.getenv("DATABASE_PASSWORD", "postgres")
    database = os.getenv("DATABASE_NAME", "keptcarbon")
    db_pool = await _create_pool_with_retries(db_host, db_port, user, password, database)


@app.on_event("shutdown")
async def shutdown():
    global db_pool
    if db_pool:
        await db_pool.close()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/db_version")
async def db_version():
    global db_pool
    if not db_pool:
        return {"error": "no db pool"}
    async with db_pool.acquire() as conn:
        version = await conn.fetchval("select version()")
    return {"version": version}
