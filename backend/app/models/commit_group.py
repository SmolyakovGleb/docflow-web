from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.task import Task


class CommitGroup(Base):
    __tablename__ = "commit_groups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL"), nullable=True
    )
    github_sha: Mapped[str]
    github_ref: Mapped[str]
    commit_message: Mapped[str | None]
    commit_author_name: Mapped[str | None]
    commit_author_login: Mapped[str | None]
    file_paths: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(
        default="pending_confirmation", server_default="pending_confirmation"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped[Project] = relationship(back_populates="commit_groups")
    tasks: Mapped[list[Task]] = relationship(back_populates="commit_group")

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_confirmation', 'processing', 'done', 'cancelled')",
            name="commit_groups_status_check",
        ),
        Index("idx_commit_groups_project_id", "project_id"),
        Index("idx_commit_groups_user_id", "user_id"),
        Index("idx_commit_groups_status", "status"),
    )
