# Requirements: auth-phase1

## Introduction

This document captures the functional and non-functional requirements for Phase 1 of the Vibe Messenger authentication system. The scope is limited to four HTTP endpoints (`POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`) and the supporting security utilities in `security.py`.

## Requirements

### Requirement 1: User Registration

**User Story:** As a new visitor, I want to create an account so that I can use Vibe Messenger.

1. GIVEN a `POST /auth/register` request with a valid `UserCreate` body (unique username, unique email, password ≥ 8 chars, display_name 1–80 chars), WHEN the request is processed, THEN the system persists a new `User` row in the database, hashes the password with bcrypt, and returns `HTTP 201` with an `AuthResponse` body containing a `UserRead` object plus an access token and a refresh token.
2. GIVEN a `POST /auth/register` request where `username` or `email` already exists in the database, WHEN the request is processed, THEN the system returns `HTTP 409` with `detail: "Username or email already registered"` and does not create a new user row.
3. GIVEN any successfully registered user, WHEN the `User` row is inspected, THEN `user.password_hash` starts with `$2b$` and the plaintext password is never stored.
4. GIVEN a successful registration, WHEN the `AuthResponse` is returned, THEN `access_token` is a valid HS256 JWT with `sub = str(user.id)` expiring in `ACCESS_TOKEN_EXPIRE_MINUTES` minutes, and `refresh_token` is a valid HS256 JWT with `sub = str(user.id)` expiring in `REFRESH_TOKEN_EXPIRE_DAYS` days.

### Requirement 2: User Login

**User Story:** As a registered user, I want to log in with my email and password so that I receive tokens to access protected endpoints.

1. GIVEN a `POST /auth/login` request with a `LoginRequest` body where `email` matches an existing user and `password` matches `user.password_hash`, WHEN the request is processed, THEN the system returns `HTTP 200` with an `AuthResponse` body containing the user's `UserRead` object plus a fresh JWT pair.
2. GIVEN a `POST /auth/login` request where `email` does not match any user in the database, WHEN the request is processed, THEN the system returns `HTTP 404` with `detail: "No account found with that email"`.
3. GIVEN a `POST /auth/login` request where `email` matches an existing user but `password` does not match `user.password_hash`, WHEN the request is processed, THEN the system returns `HTTP 401` with `detail: "Incorrect password"`.

### Requirement 3: Get Current User

**User Story:** As an authenticated user, I want to retrieve my own profile so that the client can display my information.

1. GIVEN a `GET /auth/me` request with a valid `Authorization: Bearer <access_token>` header, WHEN the request is processed, THEN the system returns `HTTP 200` with a `UserRead` body representing the user whose `id` matches the `sub` claim in the token.
2. GIVEN a `GET /auth/me` request with a missing, expired, or malformed `Authorization` header, WHEN the request is processed, THEN the system returns `HTTP 401`.

### Requirement 4: Logout

**User Story:** As an authenticated user, I want to log out so that the client can clear its local token state.

1. GIVEN a `POST /auth/logout` request with a valid `Authorization: Bearer <access_token>` header, WHEN the request is processed, THEN the system returns `HTTP 204 No Content` with an empty body and makes no database mutations.
2. GIVEN a token used in a `POST /auth/logout` request, WHEN the same token is subsequently used on another protected endpoint before its natural expiry, THEN the request succeeds (no blacklist is maintained in Phase 1).
3. GIVEN a `POST /auth/logout` request with a missing, expired, or malformed `Authorization` header, WHEN the request is processed, THEN the system returns `HTTP 401`.

### Requirement 5: get_current_user Dependency

**User Story:** As a developer, I want `get_current_user` to return a `User` ORM object so that protected endpoints receive a fully-hydrated user instance rather than a raw token dict.

1. GIVEN a valid Bearer token whose `sub` claim is a UUID string matching an existing user, WHEN `get_current_user` is called as a FastAPI dependency, THEN it returns the corresponding `User` ORM instance fetched from the database via `AsyncSession`.
2. GIVEN a token that is expired, has an invalid signature, or is otherwise malformed, WHEN `get_current_user` is called, THEN it raises `HTTPException(status_code=401)`.
3. GIVEN a valid token whose `sub` UUID does not correspond to any row in the `users` table, WHEN `get_current_user` is called, THEN it raises `HTTPException(status_code=401, detail="User not found")`.
4. GIVEN a token whose `sub` claim is present but is not a valid UUID string, WHEN `get_current_user` is called, THEN it raises `HTTPException(status_code=401, detail="Invalid sub claim format")`.

### Requirement 6: Password Hashing Utility

**User Story:** As a developer, I want a bcrypt-backed `CryptContext` available in `security.py` so that all password operations use a consistent, secure hashing scheme.

1. GIVEN the `pwd_context` module-level object in `security.py`, WHEN inspected, THEN it is a `passlib.context.CryptContext` instance with `schemes=["bcrypt"]`.
2. GIVEN any plaintext password string `p`, WHEN `h = pwd_context.hash(p)` is called followed by `pwd_context.verify(p, h)`, THEN `verify` returns `True`.
3. GIVEN any plaintext password string `p` and a hash `h` derived from a different password, WHEN `pwd_context.verify(p, h)` is called, THEN `verify` returns `False`.
