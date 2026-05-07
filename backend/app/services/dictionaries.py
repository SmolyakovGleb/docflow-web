from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.dictionary_entry import DictionaryEntry
from app.schemas.dictionary import (
    DictionaryEntryRead,
    DictionaryResponse,
    DictionaryType,
)
from app.services import dictionary_merger

MAPPING_FILE_TYPES: dict[DictionaryType, str] = {
    "dictionary": "dictionary.json",
    "glossary": "glossary.json",
    "static_terms": dictionary_merger.PRE_TRANSLATOR_FILE_TYPES["static_terms"],
    "section_headings": dictionary_merger.PRE_TRANSLATOR_FILE_TYPES["section_headings"],
    "note_titles": dictionary_merger.PRE_TRANSLATOR_FILE_TYPES["note_titles"],
    "include_labels": dictionary_merger.PRE_TRANSLATOR_FILE_TYPES["include_labels"],
}


def _load_json(path) -> dict[str, str]:
    return json.loads(path.read_text(encoding="utf-8"))


async def _load_entries(
    session: AsyncSession,
    dict_type: DictionaryType,
) -> list[DictionaryEntry]:
    result = await session.scalars(
        select(DictionaryEntry)
        .where(DictionaryEntry.dict_type == dict_type)
        .options(
            selectinload(DictionaryEntry.creator),
            selectinload(DictionaryEntry.updater),
        )
    )
    return list(result.all())


def _resolve_user_name(entry: DictionaryEntry) -> str | None:
    user = entry.updater or entry.creator
    if user is None:
        return None
    return user.display_name or user.email


def _build_user_entry(entry: DictionaryEntry) -> DictionaryEntryRead:
    return DictionaryEntryRead(
        key=entry.key,
        value=entry.value,
        source="user",
        entry_id=entry.id,
        updated_by=_resolve_user_name(entry),
        updated_at=entry.updated_at,
    )


def _build_base_entry(key: str, value: str) -> DictionaryEntryRead:
    return DictionaryEntryRead(
        key=key,
        value=value,
        source="base",
        entry_id=None,
        updated_by=None,
        updated_at=None,
    )


def _get_mapping_path(dict_type: DictionaryType):
    filename = MAPPING_FILE_TYPES[dict_type]
    if dict_type in {"dictionary", "glossary"}:
        return dictionary_merger.PIPELINE_DATA_DIR / filename
    return dictionary_merger.PRE_TRANSLATOR_DATA_DIR / filename


async def _build_mapping_response(
    session: AsyncSession,
    dict_type: DictionaryType,
) -> DictionaryResponse:
    base_entries = _load_json(_get_mapping_path(dict_type))
    user_entries = await _load_entries(session, dict_type)
    user_entries_by_key = {entry.key: entry for entry in user_entries}

    merged_keys = sorted(set(base_entries) | {entry.key for entry in user_entries if not entry.is_deleted})
    response_entries: list[DictionaryEntryRead] = []

    for key in merged_keys:
        user_entry = user_entries_by_key.get(key)
        if user_entry is not None:
            if user_entry.is_deleted:
                continue
            response_entries.append(_build_user_entry(user_entry))
            continue

        base_value = base_entries.get(key)
        if base_value is not None:
            response_entries.append(_build_base_entry(key, base_value))

    return DictionaryResponse(dict_type=dict_type, entries=response_entries)


async def _build_prompt_response(session: AsyncSession) -> DictionaryResponse:
    base_prompt = (dictionary_merger.PIPELINE_DATA_DIR / "prompt.txt").read_text(encoding="utf-8")
    prompt_entries = await _load_entries(session, "prompt")
    prompt_entry = next((entry for entry in prompt_entries if entry.key == "main"), None)

    if prompt_entry is not None and not prompt_entry.is_deleted:
        entry = _build_user_entry(prompt_entry)
    else:
        entry = _build_base_entry("main", base_prompt)

    return DictionaryResponse(dict_type="prompt", entries=[entry])


async def get_dictionary_response(
    session: AsyncSession,
    dict_type: DictionaryType,
) -> DictionaryResponse:
    if dict_type == "prompt":
        return await _build_prompt_response(session)

    return await _build_mapping_response(session, dict_type)
