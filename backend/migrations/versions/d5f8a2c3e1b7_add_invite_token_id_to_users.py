"""link users to their invite token

Revision ID: d5f8a2c3e1b7
Revises: c1f9e2d4b7a5
Create Date: 2026-05-18 12:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d5f8a2c3e1b7"
down_revision = "c1f9e2d4b7a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add column first without FK to avoid deferred-constraint issues
    op.add_column(
        "users",
        sa.Column("invite_token_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_invite_token_id",
        "users", "invite_tokens",
        ["invite_token_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_invite_token_id", "users", type_="foreignkey")
    op.drop_column("users", "invite_token_id")
