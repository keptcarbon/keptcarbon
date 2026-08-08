"""asyncpg connection pool for the PostGIS database.

Reads DATABASE_HOST/PORT/USER/PASSWORD/NAME, which docker-compose.yml already
injects into the backend service (pointing at the `postgis` container).
"""
import asyncio
import logging
import os
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None

# The postgis container's healthcheck can briefly report "healthy" while
# postgres is still cycling through its init-script phase, before it accepts
# TCP connections. Retry with backoff instead of crashing on the first race.
_MAX_CONNECT_ATTEMPTS = 10
_RETRY_DELAY_SECONDS = 3


async def init_pool() -> None:
    global _pool
    if _pool is not None:
        return

    for attempt in range(1, _MAX_CONNECT_ATTEMPTS + 1):
        try:
            _pool = await asyncpg.create_pool(
                host=os.environ["DATABASE_HOST"],
                port=int(os.environ.get("DATABASE_PORT", 5432)),
                user=os.environ["DATABASE_USER"],
                password=os.environ["DATABASE_PASSWORD"],
                database=os.environ["DATABASE_NAME"],
                min_size=1,
                max_size=10,
            )
            return
        except (OSError, asyncpg.PostgresError) as exc:
            if attempt == _MAX_CONNECT_ATTEMPTS:
                raise
            logger.warning(
                "Database not ready (attempt %d/%d): %s -- retrying in %ds",
                attempt, _MAX_CONNECT_ATTEMPTS, exc, _RETRY_DELAY_SECONDS,
            )
            await asyncio.sleep(_RETRY_DELAY_SECONDS)


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized -- call init_pool() during app startup.")
    return _pool
