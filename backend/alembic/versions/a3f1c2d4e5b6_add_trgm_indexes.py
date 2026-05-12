"""add pg_trgm extension and GIN indexes for user search

Revision ID: a3f1c2d4e5b6
Revises: 1c28b85acf2e
Create Date: 2026-05-12 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "a3f1c2d4e5b6"
down_revision: Union[str, Sequence[str], None] = "1c28b85acf2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable trigram extension (idempotent — safe to run multiple times)
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # GIN trigram indexes for fast ILIKE / similarity search on user fields
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_users_username_trgm "
        "ON users USING GIN (username gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_users_display_name_trgm "
        "ON users USING GIN (display_name gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_display_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_users_username_trgm")
    # Leave pg_trgm extension in place — other things may depend on it
