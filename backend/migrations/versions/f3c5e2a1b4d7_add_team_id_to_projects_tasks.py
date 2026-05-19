"""add team_id to projects and tasks

Revision ID: f3c5e2a1b4d7
Revises: e2b4a1c3f5d8
Create Date: 2026-05-18 19:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f3c5e2a1b4d7"
down_revision = "e2b4a1c3f5d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("team_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_projects_team_id",
        "projects", "teams",
        ["team_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_projects_team_id", "projects", ["team_id"])

    op.add_column("tasks", sa.Column("team_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_tasks_team_id",
        "tasks", "teams",
        ["team_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_tasks_team_id", "tasks", ["team_id"])


def downgrade() -> None:
    op.drop_index("idx_tasks_team_id", table_name="tasks")
    op.drop_constraint("fk_tasks_team_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "team_id")

    op.drop_index("idx_projects_team_id", table_name="projects")
    op.drop_constraint("fk_projects_team_id", "projects", type_="foreignkey")
    op.drop_column("projects", "team_id")
