from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class GithubInstallation(Base):
    """Установка GitHub App на аккаунт/организацию.

    installation_id выдаётся GitHub при установке App; под него минтятся
    короткоживущие installation-токены для работы с выбранными репами.
    """

    __tablename__ = "github_installations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    installation_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    account_login: Mapped[str | None] = mapped_column(nullable=True)
    account_type: Mapped[str | None] = mapped_column(nullable=True)  # Organization | User
    # Кто инициировал установку (через подписанный state) и в какой команде —
    # для скоупинга видимости репозиториев. NULL пока установка не привязана.
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    suspended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    repositories: Mapped[list[GithubInstallationRepo]] = relationship(
        back_populates="installation",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class GithubInstallationRepo(Base):
    """Репозиторий (`owner/name`), доступный в рамках установки App.

    Кэш того, что вернул GitHub при установке / событиях installation_repositories.
    full_name уникален: один репозиторий покрывается ровно одной установкой.
    """

    __tablename__ = "github_installation_repos"
    __table_args__ = (UniqueConstraint("full_name", name="uq_installation_repo_full_name"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    installation_pk: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("github_installations.id", ondelete="CASCADE"), index=True
    )
    # UNIQUE(full_name) уже создаёт backing-индекс в Postgres — отдельный index не нужен.
    full_name: Mapped[str] = mapped_column()

    installation: Mapped[GithubInstallation] = relationship(back_populates="repositories")
