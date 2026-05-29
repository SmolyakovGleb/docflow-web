from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.user import User
from app.schemas.dictionary import (
    DictionaryEntryCreate,
    DictionaryEntryUpdate,
    DictionaryResponse,
    DictionarySummaryResponse,
    DictionaryType,
)
from app.services.auth import get_current_user
from app.services.dictionaries import get_dictionaries_summary, get_dictionary_response

READONLY_DICTIONARY_DETAIL = "Per-user dictionary editing is deferred until post-MVP"

router = APIRouter(prefix="/dictionaries", tags=["dictionaries"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _raise_not_implemented() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=READONLY_DICTIONARY_DETAIL,
    )


@router.get(
    "",
    response_model=DictionarySummaryResponse,
    summary="Список словарей",
    description=(
        "Возвращает все поддерживаемые словари для sidebar-навигации. "
        "Поле `entry_count` уже учитывает merged-снимок base + user записей."
    ),
    responses={
        200: {"description": "Список словарей со счетчиками"},
    },
)
async def list_dictionaries(
    session: DbSession,
    current_user: CurrentUser,
) -> DictionarySummaryResponse:
    _ = current_user
    return await get_dictionaries_summary(session)


@router.get(
    "/{dict_type}",
    response_model=DictionaryResponse,
    summary="Получить словарь",
    description=(
        "Возвращает мёрж базовых записей (из `pipeline/data/` submodule) "
        "и пользовательских правок из БД. "
        "Поле `source`: `base` — из submodule, `user` — правка в БД.\n\n"
        "**Поддерживаемые типы (`dict_type`):**\n"
        "| Значение | Файл |\n"
        "|----------|------|\n"
        "| `dictionary` | `dictionary.json` — основной RU→EN словарь |\n"
        "| `glossary` | `glossary.json` — расширенный глоссарий (валидатор) |\n"
        "| `static_terms` | `pre_translator/static_terms.json` |\n"
        "| `section_headings` | `pre_translator/section_headings.json` |\n"
        "| `note_titles` | `pre_translator/note_titles.json` |\n"
        "| `include_labels` | `pre_translator/include_labels.json` |\n"
        "| `prompt` | `prompt.txt` — системный промпт LLM (key всегда `main`) |"
    ),
    responses={
        200: {"description": "Записи словаря (base + user)"},
        422: {"description": "Неизвестный `dict_type`"},
    },
)
async def get_dictionary(
    dict_type: DictionaryType,
    session: DbSession,
    current_user: CurrentUser,
) -> DictionaryResponse:
    return await get_dictionary_response(session, dict_type)


@router.post(
    "/{dict_type}",
    summary="Добавить запись в словарь",
    description="Добавляет пользовательскую запись. **MVP: не реализовано** — возвращает `501`.",
    responses={
        201: {"description": "Запись добавлена"},
        501: {"description": "Не реализовано в MVP"},
    },
)
async def create_dictionary_entry(
    dict_type: DictionaryType,
    payload: DictionaryEntryCreate,
    current_user: CurrentUser,
) -> None:
    _ = (dict_type, payload, current_user)
    _raise_not_implemented()


@router.patch(
    "/{dict_type}/{entry_id}",
    summary="Обновить запись словаря",
    description=(
        "Обновляет пользовательскую запись или перекрывает базовую. "
        "**MVP: не реализовано** — возвращает `501`."
    ),
    responses={
        200: {"description": "Запись обновлена"},
        501: {"description": "Не реализовано в MVP"},
    },
)
async def update_dictionary_entry(
    dict_type: DictionaryType,
    entry_id: UUID,
    payload: DictionaryEntryUpdate,
    current_user: CurrentUser,
) -> None:
    _ = (dict_type, entry_id, payload, current_user)
    _raise_not_implemented()


@router.delete(
    "/{dict_type}/{entry_id}",
    summary="Удалить запись словаря",
    description=(
        "Для пользовательских записей — физическое удаление. "
        "Для базовых записей (из submodule) — soft delete (`is_deleted=true`), "
        "запись исключается из мёржа при запуске пайплайна. "
        "**MVP: не реализовано** — возвращает `501`."
    ),
    responses={
        204: {"description": "Запись удалена"},
        501: {"description": "Не реализовано в MVP"},
    },
)
async def delete_dictionary_entry(
    dict_type: DictionaryType,
    entry_id: UUID,
    current_user: CurrentUser,
) -> None:
    _ = (dict_type, entry_id, current_user)
    _raise_not_implemented()
