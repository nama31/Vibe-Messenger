"""
Create a superuser account from environment variables.

Usage (via docker-compose):
  docker-compose run --rm superuser

Required env vars:
  SUPERUSER_USERNAME    — e.g. admin
  SUPERUSER_EMAIL       — e.g. admin@example.com
  SUPERUSER_PASSWORD    — min 8 chars
  SUPERUSER_DISPLAY_NAME — e.g. Admin  (optional, defaults to username)

The script is idempotent: if the username or email already exists it prints
a message and exits cleanly (exit code 0).
"""

import asyncio
import os
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# ---------------------------------------------------------------------------
# Read config from environment
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ["DATABASE_URL"]

username = os.environ.get("SUPERUSER_USERNAME", "admin")
email = os.environ.get("SUPERUSER_EMAIL", "admin@example.com")
password = os.environ.get("SUPERUSER_PASSWORD", "")
display_name = os.environ.get("SUPERUSER_DISPLAY_NAME", username)

if len(password) < 8:
    print("ERROR: SUPERUSER_PASSWORD must be at least 8 characters.", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Async DB setup (reuse app models so we stay in sync with migrations)
# ---------------------------------------------------------------------------

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def main() -> None:
    # Import here so the app's Base/models are available after engine is set up
    from app.models import User  # noqa: PLC0415
    from app.core.security import pwd_context  # noqa: PLC0415

    async with AsyncSessionLocal() as session:
        # Check for existing user
        result = await session.execute(
            select(User).where(
                (User.username == username) | (User.email == email)
            )
        )
        existing = result.scalar_one_or_none()

        if existing is not None:
            print(
                f"Superuser already exists: username='{existing.username}' "
                f"email='{existing.email}' — skipping creation."
            )
            return

        # Create the superuser
        hashed = pwd_context.hash(password)
        user = User(
            username=username,
            email=email,
            password_hash=hashed,
            display_name=display_name,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        print(
            f"Superuser created successfully!\n"
            f"  id           : {user.id}\n"
            f"  username     : {user.username}\n"
            f"  email        : {user.email}\n"
            f"  display_name : {user.display_name}\n"
        )


if __name__ == "__main__":
    asyncio.run(main())
