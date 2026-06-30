from __future__ import annotations

from dataclasses import dataclass, field

from app.models.project import Project
from app.models.task import Task
from app.services.github import GitHubAPIError, GitHubClient
from app.services.paragraph_diff import (
    find_dirty_paragraphs,
    map_unchanged_to_old,
    split_paragraphs,
)


@dataclass
class TranslationContext:
    content: str
    is_incremental: bool
    dirty_indices: list[int] = field(default_factory=list)
    aligned_old_ru: dict[int, str] = field(default_factory=dict)
    new_paras: list[str] = field(default_factory=list)
    # Готовый перевод без обращения к LLM: документ изменился только реформатированием
    # (грязных абзацев нет) — переводить нечего, переиспользуем старый RU целиком.
    precomputed: str | None = None


def _full(content: str, new_paras: list[str]) -> TranslationContext:
    return TranslationContext(content=content, is_incremental=False, new_paras=new_paras)


async def build_translation_context(
    task: Task,
    project: Project,
    new_en: str,
    github_client: GitHubClient,
) -> TranslationContext:
    """Build translation context deciding between full and incremental translation.

    Returns TranslationContext where:
      - is_incremental=False  → translate the full content
      - is_incremental=True   → translate only dirty_indices paragraphs, then merge
    """
    new_paras = split_paragraphs(new_en)

    if task.previous_task_id is None or task.before_sha is None:
        return _full(new_en, new_paras)

    old_en = await github_client.get_file_at_sha(
        project.source_repo, task.file_path, task.before_sha
    )
    if old_en is None:
        return _full(new_en, new_paras)

    try:
        old_ru, _ = await github_client.get_file_content(
            project.target_repo, task.file_path, project.target_branch
        )
    except GitHubAPIError as exc:
        if exc.status_code == 404:
            return _full(new_en, new_paras)
        raise

    old_en_paras = split_paragraphs(old_en)
    old_ru_paras = split_paragraphs(old_ru)

    # Инкремент опирается на позиционный параллелизм old_en[k] ↔ old_ru[k]. Если число
    # абзацев в старых EN и RU разошлось — параллелизм нарушен, и clean-абзацы получат
    # ЧУЖОЙ старый перевод. Безопасно деградируем к полному переводу.
    if len(old_en_paras) != len(old_ru_paras):
        return _full(new_en, new_paras)

    if not new_paras:
        return _full(new_en, new_paras)

    dirty_indices = find_dirty_paragraphs(new_paras, old_en_paras)

    ratio = len(dirty_indices) / len(new_paras)
    if ratio * 100 > project.incremental_threshold:
        return _full(new_en, new_paras)

    # Map each clean (unchanged) new paragraph to its old Russian translation.
    # The pipeline preserves block structure, so old_en[k] is positionally
    # parallel with old_ru[k]. We compose:
    #   new index --(same-language SequenceMatcher)--> old_en index
    #   old_en index --(positional)--> old_ru paragraph
    # This keeps the mapping correct even when paragraphs were inserted or
    # removed (which shifts new indices relative to old_en/old_ru).
    new_to_old_en = map_unchanged_to_old(new_paras, old_en_paras)
    aligned_old_ru = {
        new_idx: old_ru_paras[old_idx]
        for new_idx, old_idx in new_to_old_en.items()
        if old_idx < len(old_ru_paras)
    }

    if not dirty_indices:
        # Все абзацы чистые — переводить нечего. Собираем старый RU в новом порядке
        # и отдаём как готовый результат, не запуская LLM на пустом вводе.
        precomputed = "\n\n".join(
            aligned_old_ru.get(i, new_paras[i]) for i in range(len(new_paras))
        )
        return TranslationContext(
            content="",
            is_incremental=True,
            dirty_indices=[],
            aligned_old_ru=aligned_old_ru,
            new_paras=new_paras,
            precomputed=precomputed,
        )

    dirty_content = "\n\n".join(new_paras[i] for i in dirty_indices)

    return TranslationContext(
        content=dirty_content,
        is_incremental=True,
        dirty_indices=dirty_indices,
        aligned_old_ru=aligned_old_ru,
        new_paras=new_paras,
    )
