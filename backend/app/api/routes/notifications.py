from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.user import User
from app.schemas.notification import (
    NotificationChannelCreate,
    NotificationChannelRead,
    NotificationChannelUpdate,
)
from app.services import bitrix_notify
from app.services.auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])
CurrentUser = Annotated[User, Depends(get_current_user)]


def _raise_not_implemented() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=bitrix_notify.NOTIFICATION_STUB_DETAIL,
    )


@router.get(
    "/channels",
    response_model=list[NotificationChannelRead],
    summary="Список каналов уведомлений",
    description="Возвращает все каналы уведомлений. `webhook_url` и `bitrix_token` в ответе не включаются.",
)
async def get_notification_channels(current_user: CurrentUser) -> list[NotificationChannelRead]:
    _ = current_user
    return []


@router.post(
    "/channels",
    summary="Создать канал уведомлений",
    description=(
        "Два варианта метода доставки:\n\n"
        "**Incoming Webhook** (`method: incoming_webhook`) — проще, адресат задаётся в Bitrix24:\n"
        "```json\n{\"name\": \"...\", \"method\": \"incoming_webhook\", "
        "\"webhook_url\": \"https://...\", \"events\": [\"failure\"]}\n```\n\n"
        "**REST API** (`method: rest_api`) — гибче, можно выбрать адресат:\n"
        "```json\n{\"name\": \"...\", \"method\": \"rest_api\", \"bitrix_token\": \"...\", "
        "\"destination_type\": \"user\", \"destination_id\": \"42\", \"events\": [\"done\"]}\n```\n\n"
        "`destination_type`: `user` (личное сообщение), `chat` (групповой чат), `channel` (открытый канал).\n\n"
        "**Поддерживаемые события:** `failure`, `conflict`, `done`, `published`.\n\n"
        "**MVP: не реализовано** — возвращает `501`."
    ),
    responses={
        201: {"description": "Канал создан"},
        501: {"description": "Не реализовано в MVP"},
    },
)
async def create_notification_channel(
    payload: NotificationChannelCreate,
    current_user: CurrentUser,
) -> None:
    _ = (payload, current_user)
    _raise_not_implemented()


@router.patch(
    "/channels/{channel_id}",
    summary="Обновить канал уведомлений",
    description="Частичное обновление: `name`, `events`, `is_active`. **MVP: не реализовано** — возвращает `501`.",
    responses={
        200: {"description": "Канал обновлён"},
        404: {"description": "Канал не найден"},
        501: {"description": "Не реализовано в MVP"},
    },
)
async def update_notification_channel(
    channel_id: UUID,
    payload: NotificationChannelUpdate,
    current_user: CurrentUser,
) -> None:
    _ = (channel_id, payload, current_user)
    _raise_not_implemented()


@router.delete(
    "/channels/{channel_id}",
    summary="Удалить канал уведомлений",
    description="**MVP: не реализовано** — возвращает `501`.",
    responses={
        204: {"description": "Канал удалён"},
        404: {"description": "Канал не найден"},
        501: {"description": "Не реализовано в MVP"},
    },
)
async def delete_notification_channel(
    channel_id: UUID,
    current_user: CurrentUser,
) -> None:
    _ = (channel_id, current_user)
    _raise_not_implemented()


@router.post(
    "/channels/{channel_id}/test",
    summary="Отправить тестовое уведомление",
    description="Отправляет тестовое сообщение через канал для проверки настроек. **MVP: не реализовано** — возвращает `501`.",
    responses={
        200: {"description": "Сообщение отправлено"},
        404: {"description": "Канал не найден"},
        501: {"description": "Не реализовано в MVP"},
        502: {"description": "Ошибка Bitrix24 API"},
    },
)
async def test_notification_channel(
    channel_id: UUID,
    current_user: CurrentUser,
) -> None:
    _ = (channel_id, current_user)
    _raise_not_implemented()
