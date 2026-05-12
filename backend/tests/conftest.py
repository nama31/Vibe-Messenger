"""
Pytest configuration for backend tests.

Sets required environment variables before any app modules are imported,
so that pydantic-settings can construct the Settings object without a
real database or Redis connection.
"""

import os
from unittest.mock import AsyncMock, patch

import pytest

# Provide dummy values for required settings so the app modules can be
# imported without a live database or Redis instance.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-unit-tests-only")


@pytest.fixture(autouse=True)
def mock_redis_lifecycle():
    """Prevent the FastAPI lifespan from trying to connect to a real Redis."""
    with (
        patch("app.core.redis.init_redis", new_callable=AsyncMock),
        patch("app.core.redis.close_redis", new_callable=AsyncMock),
    ):
        yield
