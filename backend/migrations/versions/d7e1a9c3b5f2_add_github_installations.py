"""add github_installations + github_installation_repos (GitHub App)

Revision ID: d7e1a9c3b5f2
Revises: c5a9d3e1f7b2
Create Date: 2026-06-22 11:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d7e1a9c3b5f2"
down_revision = "c5a9d3e1f7b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "github_installations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("installation_id", sa.BigInteger(), nullable=False),
        sa.Column("account_login", sa.String(), nullable=True),
        sa.Column("account_type", sa.String(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("team_id", sa.Uuid(), nullable=True),
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_github_installations_installation_id",
        "github_installations",
        ["installation_id"],
        unique=True,
    )
    op.create_index(
        "ix_github_installations_created_by_user_id",
        "github_installations",
        ["created_by_user_id"],
    )
    op.create_index(
        "ix_github_installations_team_id",
        "github_installations",
        ["team_id"],
    )

    op.create_table(
        "github_installation_repos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("installation_pk", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(
            ["installation_pk"], ["github_installations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("full_name", name="uq_installation_repo_full_name"),
    )
    op.create_index(
        "ix_github_installation_repos_installation_pk",
        "github_installation_repos",
        ["installation_pk"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_github_installation_repos_installation_pk",
        table_name="github_installation_repos",
    )
    op.drop_table("github_installation_repos")
    op.drop_index(
        "ix_github_installations_team_id", table_name="github_installations"
    )
    op.drop_index(
        "ix_github_installations_created_by_user_id", table_name="github_installations"
    )
    op.drop_index(
        "ix_github_installations_installation_id", table_name="github_installations"
    )
    op.drop_table("github_installations")
