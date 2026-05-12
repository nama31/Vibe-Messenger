"""
Integration tests for the four auth endpoints:
  POST /auth/register
  POST /auth/login
  GET  /auth/me
  POST /auth/logout

Uses an in-memory SQLite async engine so no real database is required.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.core.security import decode_token
from app.main import app

# ---------------------------------------------------------------------------
# Test database setup
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def override_get_db():
    async with TestSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
async def setup_database():
    """Create all tables before each test and drop them after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    """AsyncClient wired to the FastAPI app with the test DB override."""
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REGISTER_PAYLOAD = {
    "username": "alice",
    "email": "alice@example.com",
    "password": "s3cr3tPass",
    "display_name": "Alice",
}

LOGIN_PAYLOAD = {
    "email": "alice@example.com",
    "password": "s3cr3tPass",
}


async def register_user(client: AsyncClient, payload: dict | None = None) -> dict:
    """Register a user and return the parsed JSON response."""
    data = payload or REGISTER_PAYLOAD
    resp = await client.post("/auth/register", json=data)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_register_happy_path(client: AsyncClient):
    """POST /auth/register with valid data → 201 with AuthResponse."""
    resp = await client.post("/auth/register", json=REGISTER_PAYLOAD)

    assert resp.status_code == 201
    body = resp.json()

    # AuthResponse shape
    assert "user" in body
    assert "access_token" in body
    assert "refresh_token" in body

    user = body["user"]
    assert user["username"] == "alice"
    assert user["display_name"] == "Alice"
    assert "id" in user
    # password_hash must never appear in the response
    assert "password_hash" not in body
    assert "password_hash" not in user


async def test_register_duplicate(client: AsyncClient):
    """Registering the same email/username twice → second call returns 409."""
    await register_user(client)

    resp = await client.post("/auth/register", json=REGISTER_PAYLOAD)
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Username or email already registered"


async def test_login_happy_path(client: AsyncClient):
    """Register then login → 200 with AuthResponse."""
    await register_user(client)

    resp = await client.post("/auth/login", json=LOGIN_PAYLOAD)
    assert resp.status_code == 200

    body = resp.json()
    assert "user" in body
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["user"]["username"] == "alice"


async def test_login_unknown_email(client: AsyncClient):
    """Login with a non-existent email → 404."""
    resp = await client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "whatever"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "No account found with that email"


async def test_login_wrong_password(client: AsyncClient):
    """Login with correct email but wrong password → 401."""
    await register_user(client)

    resp = await client.post(
        "/auth/login",
        json={"email": "alice@example.com", "password": "wrongpassword"},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Incorrect password"


async def test_get_me_valid_token(client: AsyncClient):
    """GET /auth/me with a valid Bearer token → 200 with UserRead."""
    auth = await register_user(client)
    token = auth["access_token"]

    resp = await client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    user = resp.json()
    assert user["username"] == "alice"
    assert user["id"] == auth["user"]["id"]


async def test_get_me_no_token(client: AsyncClient):
    """GET /auth/me with no Authorization header → 403 (FastAPI HTTPBearer behavior)."""
    resp = await client.get("/auth/me")
    # FastAPI's HTTPBearer returns 403 when the Authorization header is absent,
    # and 401 when the token is present but invalid/expired.
    assert resp.status_code == 403


async def test_logout_valid_token(client: AsyncClient):
    """POST /auth/logout with a valid token → 204 No Content."""
    auth = await register_user(client)
    token = auth["access_token"]

    resp = await client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204
    assert resp.content == b""


async def test_logout_bad_token(client: AsyncClient):
    """POST /auth/logout with an invalid token → 401."""
    resp = await client.post(
        "/auth/logout",
        headers={"Authorization": "Bearer this.is.not.a.valid.token"},
    )
    assert resp.status_code == 401


async def test_token_sub_roundtrip(client: AsyncClient):
    """The access_token sub claim must equal str(user.id) from the register response."""
    auth = await register_user(client)

    user_id = auth["user"]["id"]
    access_token = auth["access_token"]

    payload = decode_token(access_token)
    assert payload["sub"] == user_id
