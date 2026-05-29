"""add_completed_at_to_tasks

Revision ID: c8f8f53f3e2a
Revises: 9a7fd32c779a
Create Date: 2026-05-07 16:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c8f8f53f3e2a"
down_revision = "9a7fd32c779a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "completed_at")
