# Tasks: auth-phase1

## Task List

- [x] 1. Add `pwd_context` to `security.py`
  - Add `from passlib.context import CryptContext` import
  - Create module-level `pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")`
  - **Files:** `backend/app/core/security.py`

- [x] 2. Update `get_current_user` to return a `User` ORM object
  - Add `db: AsyncSession = Depends(get_db)` parameter to `get_current_user`
  - After `decode_token`, extract `payload.get("sub")` and validate it is not `None`
  - Wrap `uuid.UUID(user_id_str)` in a try/except `ValueError` and raise `HTTP 401` on failure
  - Execute `select(User).where(User.id == user_uuid)` via `await db.execute(...)`
  - Raise `HTTP 401 "User not found"` if `scalar_one_or_none()` returns `None`
  - Return the `User` ORM instance
  - Add required imports: `uuid`, `select`, `AsyncSession`, `Depends`, `get_db`, `User`
  - **Files:** `backend/app/core/security.py`

- [x] 3. Implement `POST /auth/register`
  - Import `pwd_context` from `app.core.security` and `or_` from `sqlalchemy`
  - Query for existing user: `select(User).where(or_(User.username == body.username, User.email == body.email))`
  - Raise `HTTP 409 "Username or email already registered"` if a row is found
  - Hash password: `pwd_context.hash(body.password)`
  - Construct and `db.add()` a new `User` instance; `await db.commit()`; `await db.refresh(user)`
  - Issue tokens: `create_access_token({"sub": str(user.id)})` and `create_refresh_token(...)`
  - Return `AuthResponse(user=UserRead.model_validate(user), access_token=..., refresh_token=...)`
  - **Files:** `backend/app/api/routers/auth.py`

- [x] 4. Implement `POST /auth/login`
  - Query for user by email: `select(User).where(User.email == body.email)`
  - Raise `HTTP 404 "No account found with that email"` if not found
  - Verify password: `pwd_context.verify(body.password, user.password_hash)`; raise `HTTP 401 "Incorrect password"` on failure
  - Issue tokens and return `AuthResponse` (same structure as register)
  - **Files:** `backend/app/api/routers/auth.py`

- [x] 5. Implement `GET /auth/me`
  - Replace `pass` with `return current_user` (the dependency already returns a `User` ORM object; FastAPI serialises it via `response_model=UserRead`)
  - **Files:** `backend/app/api/routers/auth.py`

- [x] 6. Implement `POST /auth/logout`
  - Replace `pass` with `return` (or simply remove `pass`); the endpoint body is intentionally empty
  - Ensure `status_code=204` is set on the decorator (already present in stub)
  - **Files:** `backend/app/api/routers/auth.py`

- [x] 7. Write property-based tests for `pwd_context`
  - Create `backend/tests/test_security_props.py`
  - Use `hypothesis` with `st.text(min_size=8)` strategy
  - **Property 1:** `∀ p: pwd_context.verify(p, pwd_context.hash(p)) is True`
  - **Property 2:** `∀ p1 ≠ p2: pwd_context.verify(p1, pwd_context.hash(p2)) is False`
  - **Files:** `backend/tests/test_security_props.py`

- [x] 8. Write example-based integration tests for all four endpoints
  - Create `backend/tests/test_auth.py` using `pytest` + `httpx.AsyncClient` with the FastAPI `app`
  - Use an in-memory SQLite async engine (or test DB fixture) to isolate tests
  - Cover: happy-path register (201), duplicate register (409), happy-path login (200), unknown email (404), wrong password (401), GET /me with valid token (200), GET /me with no token (401), POST /logout (204), POST /logout with bad token (401)
  - Assert token `sub` claim round-trips to the correct user UUID
  - **Files:** `backend/tests/test_auth.py`
