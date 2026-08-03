"""asyncpg connection pool for the PostGIS database.

Reads DATABASE_HOST/PORT/USER/PASSWORD/NAME, which docker-compose.yml already
injects into the backend service (pointing at the `postgis` container).
"""
import os
from typing import Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None


async def init_pool() -> None:
    global _pool
    if _pool is not None:
        return
    _pool = await asyncpg.create_pool(
        host=os.environ["DATABASE_HOST"],
        port=int(os.environ.get("DATABASE_PORT", 5432)),
        user=os.environ["DATABASE_USER"],
        password=os.environ["DATABASE_PASSWORD"],
        database=os.environ["DATABASE_NAME"],
        min_size=1,
        max_size=10,
    )


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized -- call init_pool() during app startup.")
    return _pool
