from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ARRAY, DateTime, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import get_settings
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.commit_group import CommitGroup
    from app.models.task import Task
    from app.models.user import User


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str]
    source_repo: Mapped[str]
    source_branch: Mapped[str] = mapped_column(default="main", server_default="main")
    target_repo: Mapped[str]
    target_branch: Mapped[str] = mapped_column(default="main", server_default="main")
    webhook_secret: Mapped[str]
    exclude_patterns: Mapped[list[str]] = mapped_column(
        ARRAY(Text), default=list, server_default="{}"
    )
    version: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"))
    webhook_file_limit: Mapped[int] = mapped_column(default=50, server_default=text("50"))
    pipeline_paused: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    incremental_threshold: Mapped[int] = mapped_column(
        Integer, default=40, server_default=text("40")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="projects")
    tasks: Mapped[list[Task]] = relationship(back_populates="project")
    commit_groups: Mapped[list[CommitGroup]] = relationship(back_populates="project")

    @property
    def is_team_project(self) -> bool:
        return self.team_id is not None

    @property
    def webhook_url(self) -> str:
        base_url = get_settings().app_base_url.rstrip("/")
        return f"{base_url}/webhook/{self.id}"

    __table_args__ = (Index("idx_projects_user_id", "user_id"),)
