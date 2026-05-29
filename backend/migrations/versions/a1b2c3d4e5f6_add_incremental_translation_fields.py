"""add_incremental_translation_fields

Revision ID: a1b2c3d4e5f6
Revises: 3c1d45e4ad48
Create Date: 2026-05-28 12:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'a1b2c3d4e5f6'
down_revision = '3c1d45e4ad48'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('previous_task_id', sa.Uuid(), nullable=True))
    op.add_column('tasks', sa.Column('before_sha', sa.String(), nullable=True))
    op.add_column('tasks', sa.Column('incremental_paragraphs_count', sa.Integer(), nullable=True))
    op.add_column('tasks', sa.Column('incremental_total_paragraphs', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_tasks_previous_task_id',
        'tasks', 'tasks',
        ['previous_task_id'], ['id'],
        ondelete='SET NULL',
    )
    op.add_column('projects', sa.Column(
        'incremental_threshold', sa.Integer(),
        server_default=sa.text('40'), nullable=False,
    ))


def downgrade() -> None:
    op.drop_column('projects', 'incremental_threshold')
    op.drop_constraint('fk_tasks_previous_task_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'incremental_total_paragraphs')
    op.drop_column('tasks', 'incremental_paragraphs_count')
    op.drop_column('tasks', 'before_sha')
    op.drop_column('tasks', 'previous_task_id')
