"""audit_security_columns

Adds:
- users.token_version (JWT revocation)
- projects.version (optimistic locking)
- Re-encrypts projects.webhook_secret using session_secret-derived Fernet key

Revision ID: d1a4f8b3e9c7
Revises: c8f8f53f3e2a
Create Date: 2026-05-08 09:00:00.000000
"""

from __future__ import annotations

import base64
import hashlib
import os

import sqlalchemy as sa
from alembic import op
from cryptography.fernet import Fernet

revision = "d1a4f8b3e9c7"
down_revision = "c8f8f53f3e2a"
branch_labels = None
depends_on = None


def _get_fernet() -> Fernet:
    session_secret = os.environ.get("SESSION_SECRET")
    if not session_secret:
        raise RuntimeError("SESSION_SECRET must be set to run this migration")
    key_bytes = hashlib.sha256(session_secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.add_column(
        "projects",
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )

    fernet = _get_fernet()
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, webhook_secret FROM projects")).fetchall()
    for row in rows:
        plaintext = row.webhook_secret
        try:
            fernet.decrypt(plaintext.encode("utf-8"))
            continue
        except Exception:
            pass
        encrypted = fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")
        bind.execute(
            sa.text("UPDATE projects SET webhook_secret = :s WHERE id = :id"),
            {"s": encrypted, "id": row.id},
        )


def downgrade() -> None:
    fernet = _get_fernet()
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, webhook_secret FROM projects")).fetchall()
    for row in rows:
        encrypted = row.webhook_secret
        try:
            plaintext = fernet.decrypt(encrypted.encode("utf-8")).decode("utf-8")
        except Exception:
            continue
        bind.execute(
            sa.text("UPDATE projects SET webhook_secret = :s WHERE id = :id"),
            {"s": plaintext, "id": row.id},
        )

    op.drop_column("projects", "version")
    op.drop_column("users", "token_version")
