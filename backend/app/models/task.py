from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.publication import Publication
    from app.models.user import User


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    file_path: Mapped[str]
    github_ref: Mapped[str]
    github_sha: Mapped[str | None]
    commit_message: Mapped[str | None]
    commit_author_name: Mapped[str | None]
    commit_author_login: Mapped[str | None]
    source_file_sha: Mapped[str | None]
    target_file_sha: Mapped[str | None]
    original_content: Mapped[str]
    translated_content: Mapped[str | None]
    conflict_base: Mapped[str | None]
    conflict_ours: Mapped[str | None]
    conflict_theirs: Mapped[str | None]
    status: Mapped[str] = mapped_column(server_default="queued")
    current_stage: Mapped[str | None]
    log: Mapped[str | None]
    error: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User] = relationship(back_populates="tasks")
    project: Mapped[Project | None] = relationship(back_populates="tasks")
    publications: Mapped[list[Publication]] = relationship(back_populates="task")

    @property
    def project_name(self) -> str | None:
        return self.project.name if self.project is not None else None

    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'done', 'failed', 'published', 'conflict')",
            name="tasks_status_check",
        ),
        Index("idx_tasks_user_id", "user_id"),
        Index("idx_tasks_project_id", "project_id"),
        Index("idx_tasks_status", "status"),
        Index("idx_tasks_created_at", "created_at"),
        Index("idx_tasks_repo_path", "project_id", "file_path"),
    )
