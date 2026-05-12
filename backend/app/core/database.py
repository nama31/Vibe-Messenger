from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def _make_engine():
    """
    Create the async engine lazily so that importing this module
    (e.g. from alembic env.py) does not immediately try to connect
    or validate the DATABASE_URL driver.

    Also normalises `postgresql://` → `postgresql+asyncpg://` so the
    app works whether the env var uses the plain Render/Heroku URL or
    the asyncpg-prefixed one.
    """
    from app.core.config import settings  # local import avoids circular deps

    url = settings.DATABASE_URL
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)

    return create_async_engine(url, echo=False, future=True)


# Module-level singletons — created on first use, not at import time.
_engine = None
_session_factory = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = _make_engine()
    return _engine


def get_session_factory():
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_factory()() as session:
        try:
            yield session
        finally:
            await session.close()
