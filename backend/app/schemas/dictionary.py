from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

DictionaryType = Literal[
    "dictionary",
    "glossary",
    "static_terms",
    "section_headings",
    "note_titles",
    "include_labels",
    "prompt",
]
DictionaryEntrySource = Literal["base", "user"]


class DictionaryEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str = Field(..., description="Ключ (RU термин или `main` для `prompt`)")
    value: str = Field(..., description="Значение (EN перевод или текст промпта)")
    source: DictionaryEntrySource = Field(..., description="`base` — из submodule файла; `user` — правка в БД")
    entry_id: UUID | None = Field(None, description="ID записи в БД; `null` для базовых записей без правок")
    updated_by: str | None = Field(None, description="Имя пользователя, создавшего правку")
    updated_at: datetime | None = Field(None, description="Дата последней правки")


class DictionaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    dict_type: DictionaryType
    entries: list[DictionaryEntryRead]


class DictionaryEntryCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    value: str


class DictionaryEntryUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    value: str
