from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, Index, Integer, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.task import Task


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    display_name: Mapped[str | None]
    github_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    github_login: Mapped[str | None]
    github_access_token: Mapped[str | None]
    token_version: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    projects: Mapped[list[Project]] = relationship(back_populates="user")
    tasks: Mapped[list[Task]] = relationship(back_populates="user")

    @property
    def github_linked(self) -> bool:
        return self.github_id is not None

    __table_args__ = (
        Index(
            "idx_users_github_id", "github_id",
            unique=True,
            postgresql_where=text("github_id IS NOT NULL"),
        ),
    )
