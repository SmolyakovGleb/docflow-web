from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ARRAY, DateTime, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import get_settings
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.task import Task
    from app.models.user import User


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str]
    source_repo: Mapped[str]
    source_branch: Mapped[str] = mapped_column(default="main", server_default="main")
    target_repo: Mapped[str]
    target_branch: Mapped[str] = mapped_column(default="main", server_default="main")
    webhook_secret: Mapped[str]
    exclude_patterns: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="projects")
    tasks: Mapped[list[Task]] = relationship(back_populates="project")

    @property
    def webhook_url(self) -> str:
        base_url = get_settings().app_base_url.rstrip("/")
        return f"{base_url}/webhook/{self.id}"

    __table_args__ = (Index("idx_projects_user_id", "user_id"),)
