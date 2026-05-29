"""add stage6 task fields

Revision ID: e4c2a1b8f901
Revises: d1a4f8b3e9c7
Create Date: 2026-05-12 15:40:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e4c2a1b8f901"
down_revision: str | Sequence[str] | None = "d1a4f8b3e9c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("commit_author_name", sa.String(), nullable=True))
    op.add_column("tasks", sa.Column("commit_author_login", sa.String(), nullable=True))
    op.add_column("tasks", sa.Column("current_stage", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "current_stage")
    op.drop_column("tasks", "commit_author_login")
    op.drop_column("tasks", "commit_author_name")
