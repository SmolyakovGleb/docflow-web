from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GithubOauthState(Base):
    """Серверное хранилище CSRF-state для GitHub OAuth.

    Раньше state жил в httpOnly-куке, но за гейтвеем VibeCode Set-Cookie режется.
    Теперь /auth/github/connect создаёт запись (state → пользователь + куда вернуть),
    а /auth/github/callback валидирует по ней без куки.
    """

    __tablename__ = "github_oauth_states"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    state: Mapped[str] = mapped_column(unique=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    return_to: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
