from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dictionary_entry import DictionaryEntry

PIPELINE_ROOT = Path(__file__).resolve().parents[3] / "pipeline"
PIPELINE_DATA_DIR = PIPELINE_ROOT / "data"
PRE_TRANSLATOR_DATA_DIR = PIPELINE_DATA_DIR / "pre_translator"
PRE_TRANSLATOR_FILE_TYPES = {
    "static_terms": "static_terms.json",
    "section_headings": "section_headings.json",
    "note_titles": "note_titles.json",
    "include_labels": "include_labels.json",
}


@dataclass(frozen=True)
class MergedPipelineData:
    dictionary: dict[str, str]
    glossary: dict[str, str]
    prompt: str
    pre_translator_files: dict[str, dict[str, str]]


def _load_json(path: Path) -> dict[str, str]:
    return json.loads(path.read_text(encoding="utf-8"))


async def _load_entries(session: AsyncSession, dict_type: str) -> list[DictionaryEntry]:
    result = await session.scalars(
        select(DictionaryEntry).where(DictionaryEntry.dict_type == dict_type)
    )
    return list(result.all())


def _merge_mapping(base: dict[str, str], entries: list[DictionaryEntry]) -> dict[str, str]:
    merged = dict(base)

    for entry in entries:
        if entry.is_deleted:
            merged.pop(entry.key, None)
            continue
        merged[entry.key] = entry.value

    return merged


async def _merge_prompt(session: AsyncSession) -> str:
    prompt = (PIPELINE_DATA_DIR / "prompt.txt").read_text(encoding="utf-8")
    entries = await _load_entries(session, "prompt")

    for entry in entries:
        if entry.key != "main":
            continue
        prompt = "" if entry.is_deleted else entry.value

    return prompt


async def merge_pipeline_data(session: AsyncSession) -> MergedPipelineData:
    dictionary = _merge_mapping(
        _load_json(PIPELINE_DATA_DIR / "dictionary.json"),
        await _load_entries(session, "dictionary"),
    )
    glossary = _merge_mapping(
        _load_json(PIPELINE_DATA_DIR / "glossary.json"),
        await _load_entries(session, "glossary"),
    )
    pre_translator_files = {
        dict_type: _merge_mapping(
            _load_json(PRE_TRANSLATOR_DATA_DIR / filename),
            await _load_entries(session, dict_type),
        )
        for dict_type, filename in PRE_TRANSLATOR_FILE_TYPES.items()
    }

    return MergedPipelineData(
        dictionary=dictionary,
        glossary=glossary,
        prompt=await _merge_prompt(session),
        pre_translator_files=pre_translator_files,
    )


def write_pre_translator_files(
    target_dir: Path,
    pre_translator_files: dict[str, dict[str, str]],
) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)

    for dict_type, payload in pre_translator_files.items():
        filename = PRE_TRANSLATOR_FILE_TYPES[dict_type]
        (target_dir / filename).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )
