"""add task conflict fields

Revision ID: 7b9c2d1e4f6a
Revises: e4c2a1b8f901
Create Date: 2026-05-13 13:30:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7b9c2d1e4f6a"
down_revision: str | Sequence[str] | None = "e4c2a1b8f901"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("conflict_base", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("conflict_ours", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("conflict_theirs", sa.Text(), nullable=True))
        batch_op.drop_constraint("tasks_status_check", type_="check")
        batch_op.create_check_constraint(
            "tasks_status_check",
            "status IN ('queued', 'running', 'done', 'failed', 'published', 'conflict')",
        )


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_constraint("tasks_status_check", type_="check")
        batch_op.create_check_constraint(
            "tasks_status_check",
            "status IN ('queued', 'running', 'done', 'failed', 'published')",
        )
        batch_op.drop_column("conflict_theirs")
        batch_op.drop_column("conflict_ours")
        batch_op.drop_column("conflict_base")
