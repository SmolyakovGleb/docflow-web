from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str]
    method: Mapped[str]
    webhook_url: Mapped[str | None]
    bitrix_token: Mapped[str | None]
    destination_type: Mapped[str | None]
    destination_id: Mapped[str | None]
    events: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    creator: Mapped[User] = relationship(foreign_keys=[created_by])

    @property
    def destination_label(self) -> str:
        if self.method == "incoming_webhook":
            return "incoming webhook"
        if self.destination_type and self.destination_id:
            return f"{self.destination_type} · {self.destination_id}"
        return self.method

    __table_args__ = (
        Index(
            "idx_notification_channels_active", "is_active",
            postgresql_where=text("is_active = true"),
        ),
    )
