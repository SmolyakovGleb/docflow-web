"""merge all heads

Revision ID: c1f9e2d4b7a5
Revises: a6d3f4b2c1e0, b3e7a9f1c2d4
Create Date: 2026-05-15

"""

from collections.abc import Sequence

revision: str = "c1f9e2d4b7a5"
down_revision: str | Sequence[str] | None = ("a6d3f4b2c1e0", "b3e7a9f1c2d4")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass