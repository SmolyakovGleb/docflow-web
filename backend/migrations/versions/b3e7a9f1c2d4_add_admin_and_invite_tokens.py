"""add admin flag and invite tokens

Revision ID: b3e7a9f1c2d4
Revises: f2b6c4d9a1e3
Create Date: 2026-05-15 16:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b3e7a9f1c2d4"
down_revision = "f2b6c4d9a1e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_table(
        "invite_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("used_by_id", sa.Uuid(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["used_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("idx_invite_tokens_token", "invite_tokens", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index("idx_invite_tokens_token", table_name="invite_tokens")
    op.drop_table("invite_tokens")
    op.drop_column("users", "is_admin")
