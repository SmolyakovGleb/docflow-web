"""add github_oauth_states (cookieless OAuth state)

Revision ID: c5a9d3e1f7b2
Revises: b8e3f2a7c9d1
Create Date: 2026-06-19 16:30:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c5a9d3e1f7b2"
down_revision = "b8e3f2a7c9d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "github_oauth_states",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("return_to", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_github_oauth_states_state", "github_oauth_states", ["state"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_github_oauth_states_state", table_name="github_oauth_states")
    op.drop_table("github_oauth_states")
