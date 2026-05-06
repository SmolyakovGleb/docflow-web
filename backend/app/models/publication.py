from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.task import Task
    from app.models.user import User


class Publication(Base):
    __tablename__ = "publications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"))
    published_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    target_repo: Mapped[str]
    target_path: Mapped[str]
    commit_sha: Mapped[str]
    target_file_sha_before: Mapped[str | None]
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    task: Mapped[Task] = relationship(back_populates="publications")
    publisher: Mapped[User] = relationship(foreign_keys=[published_by])

    __table_args__ = (
        Index("idx_publications_task_id", "task_id"),
        Index("idx_publications_published_by", "published_by"),
    )
