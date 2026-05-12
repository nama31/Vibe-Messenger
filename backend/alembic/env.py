import asyncio
import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# ── Fix the Python path so Alembic can find the 'app' module ──────────────
# This dynamically points to the /app directory inside Docker
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Import the metadata so Alembic can autogenerate migrations ────────────
from app.core.database import Base  # noqa: E402
from app.models import User, Conversation, ConversationParticipant, Message  # noqa: E402, F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection: Connection) -> None:
    """Run actual migrations synchronously inside the async connection."""
    context.configure(
        connection=connection, 
        target_metadata=target_metadata,
        compare_type=True  # Catches column type changes automatically
    )
    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations() -> None:
    """In this scenario we need to create an async Engine
    and associate a connection with the context.
    """
    from app.core.config import settings

    # Render (and most managed Postgres providers) give a URL with the
    # plain `postgresql://` scheme. SQLAlchemy's async engine requires
    # `postgresql+asyncpg://`. Normalise it here so alembic always uses
    # the asyncpg driver regardless of what the env var contains.
    db_url = settings.DATABASE_URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgres://"):
        # Heroku / some Render plans use the older `postgres://` alias
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)

    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = db_url
    
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()