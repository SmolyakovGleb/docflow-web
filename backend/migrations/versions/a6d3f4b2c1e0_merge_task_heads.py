"""merge task migration heads

Revision ID: a6d3f4b2c1e0
Revises: 7b9c2d1e4f6a, f2b6c4d9a1e3
Create Date: 2026-05-13 15:45:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

revision: str = "a6d3f4b2c1e0"
down_revision: str | Sequence[str] | None = ("7b9c2d1e4f6a", "f2b6c4d9a1e3")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
