"""add task user owner

Revision ID: f2b6c4d9a1e3
Revises: e4c2a1b8f901
Create Date: 2026-05-13 11:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f2b6c4d9a1e3"
down_revision = "e4c2a1b8f901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("user_id", sa.Uuid(), nullable=True))

    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE tasks
            SET user_id = projects.user_id
            FROM projects
            WHERE tasks.project_id = projects.id
              AND tasks.user_id IS NULL
            """
        )
    )
    bind.execute(
        sa.text(
            """
            WITH latest_publication AS (
                SELECT DISTINCT ON (task_id)
                    task_id,
                    published_by
                FROM publications
                ORDER BY task_id, published_at DESC
            )
            UPDATE tasks
            SET user_id = latest_publication.published_by
            FROM latest_publication
            WHERE tasks.id = latest_publication.task_id
              AND tasks.user_id IS NULL
            """
        )
    )

    remaining = bind.execute(
        sa.text("SELECT count(*) FROM tasks WHERE user_id IS NULL")
    ).scalar_one()
    if remaining:
        raise RuntimeError(
            "Found tasks without an owner while backfilling tasks.user_id. "
            "Assign owners to legacy orphan tasks before running this migration."
        )

    op.alter_column("tasks", "user_id", nullable=False)
    op.create_foreign_key("fk_tasks_user_id_users", "tasks", "users", ["user_id"], ["id"])
    op.create_index("idx_tasks_user_id", "tasks", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_tasks_user_id", table_name="tasks")
    op.drop_constraint("fk_tasks_user_id_users", "tasks", type_="foreignkey")
    op.drop_column("tasks", "user_id")
