"""add_before_sha_to_commit_groups

Revision ID: b8e3f2a7c9d1
Revises: a1b2c3d4e5f6
Create Date: 2026-05-29 17:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'b8e3f2a7c9d1'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('commit_groups', sa.Column('before_sha', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('commit_groups', 'before_sha')
