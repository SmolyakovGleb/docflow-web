from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.github import GitHubAPIError
from app.services.incremental_translate import build_translation_context


def make_task(*, previous_task_id=None, before_sha=None, file_path="docs/index.md"):
    task = MagicMock()
    task.previous_task_id = previous_task_id
    task.before_sha = before_sha
    task.file_path = file_path
    return task


def make_project(
    *,
    source_repo="org/source",
    target_repo="org/target",
    target_branch="main",
    incremental_threshold=40,
):
    project = MagicMock()
    project.source_repo = source_repo
    project.target_repo = target_repo
    project.target_branch = target_branch
    project.incremental_threshold = incremental_threshold
    return project


def make_github_client(*, old_en=None, old_ru=None, old_ru_404=False):
    client = MagicMock()
    client.get_file_at_sha = AsyncMock(return_value=old_en)
    if old_ru_404:
        client.get_file_content = AsyncMock(
            side_effect=GitHubAPIError(status_code=404, detail="Not Found")
        )
    else:
        client.get_file_content = AsyncMock(return_value=(old_ru, "blob-sha"))
    return client


def _paras(n: int) -> str:
    return "\n\n".join(f"Paragraph {i}" for i in range(n))


def _paras_with_changes(n: int, changed: list[int]) -> str:
    parts = [f"Paragraph {i}" if i not in changed else f"Changed paragraph {i}" for i in range(n)]
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Full translation — no previous task
# ---------------------------------------------------------------------------


async def test_full_when_no_previous_task_id():
    task = make_task(previous_task_id=None, before_sha="abc")
    project = make_project()
    client = make_github_client()

    ctx = await build_translation_context(task, project, "# Content", client)

    assert ctx.is_incremental is False
    assert ctx.content == "# Content"
    client.get_file_at_sha.assert_not_called()
    client.get_file_content.assert_not_called()


async def test_full_when_no_before_sha():
    task = make_task(previous_task_id=uuid.uuid4(), before_sha=None)
    project = make_project()
    client = make_github_client()

    ctx = await build_translation_context(task, project, "# Content", client)

    assert ctx.is_incremental is False
    client.get_file_at_sha.assert_not_called()


# ---------------------------------------------------------------------------
# Full translation — GitHub fallbacks
# ---------------------------------------------------------------------------


async def test_full_when_old_en_not_found():
    task = make_task(previous_task_id=uuid.uuid4(), before_sha="before-sha")
    project = make_project()
    client = make_github_client(old_en=None)

    ctx = await build_translation_context(task, project, "# Content", client)

    assert ctx.is_incremental is False
    client.get_file_at_sha.assert_awaited_once_with(
        project.source_repo, task.file_path, "before-sha"
    )
    client.get_file_content.assert_not_called()


async def test_full_when_old_ru_not_found_404():
    task = make_task(previous_task_id=uuid.uuid4(), before_sha="before-sha")
    project = make_project()
    client = make_github_client(old_en="# Old EN", old_ru_404=True)

    ctx = await build_translation_context(task, project, "# Content", client)

    assert ctx.is_incremental is False


async def test_github_error_non_404_propagates():
    task = make_task(previous_task_id=uuid.uuid4(), before_sha="before-sha")
    project = make_project()
    client = make_github_client(old_en="# Old EN")
    client.get_file_content = AsyncMock(
        side_effect=GitHubAPIError(status_code=502, detail="Bad gateway")
    )

    with pytest.raises(GitHubAPIError) as exc_info:
        await build_translation_context(task, project, "# New EN", client)

    assert exc_info.value.status_code == 502


# ---------------------------------------------------------------------------
# Threshold: 40%, 3/10 changed → incremental
# ---------------------------------------------------------------------------


async def test_incremental_when_below_threshold():
    """30% changed (3/10) with threshold 40% → is_incremental=True."""
    old_en = _paras(10)
    new_en = _paras_with_changes(10, changed=[2, 5, 8])
    old_ru = "\n\n".join(f"RU para {i}" for i in range(10))

    task = make_task(previous_task_id=uuid.uuid4(), before_sha="before-sha")
    project = make_project(incremental_threshold=40)
    client = make_github_client(old_en=old_en, old_ru=old_ru)

    ctx = await build_translation_context(task, project, new_en, client)

    assert ctx.is_incremental is True
    assert len(ctx.dirty_indices) == 3
    assert set(ctx.dirty_indices) == {2, 5, 8}
    assert len(ctx.new_paras) == 10


# ---------------------------------------------------------------------------
# Threshold: 40%, 5/10 changed → full
# ---------------------------------------------------------------------------


async def test_full_when_above_threshold():
    """50% changed (5/10) with threshold 40% → is_incremental=False."""
    old_en = _paras(10)
    new_en = _paras_with_changes(10, changed=[0, 2, 4, 6, 8])
    old_ru = "\n\n".join(f"RU para {i}" for i in range(10))

    task = make_task(previous_task_id=uuid.uuid4(), before_sha="before-sha")
    project = make_project(incremental_threshold=40)
    client = make_github_client(old_en=old_en, old_ru=old_ru)

    ctx = await build_translation_context(task, project, new_en, client)

    assert ctx.is_incremental is False
    assert ctx.content == new_en


# ---------------------------------------------------------------------------
# Incremental context has correct content for LLM
# ---------------------------------------------------------------------------


async def test_incremental_content_contains_only_dirty_paragraphs():
    old_en = _paras(5)
    new_en = _paras_with_changes(5, changed=[1, 3])
    old_ru = "\n\n".join(f"RU para {i}" for i in range(5))

    task = make_task(previous_task_id=uuid.uuid4(), before_sha="before-sha")
    project = make_project(incremental_threshold=40)
    client = make_github_client(old_en=old_en, old_ru=old_ru)

    ctx = await build_translation_context(task, project, new_en, client)

    assert ctx.is_incremental is True
    # content should only contain the two changed paragraphs
    content_paras = ctx.content.split("\n\n")
    assert len(content_paras) == 2
    assert "Changed paragraph 1" in ctx.content
    assert "Changed paragraph 3" in ctx.content


# ---------------------------------------------------------------------------
# Threshold boundary: exactly at threshold → full (ratio * 100 > threshold)
# ---------------------------------------------------------------------------


async def test_full_when_exactly_at_threshold():
    """40% changed (4/10) with threshold 40% → 40 is NOT > 40 → incremental."""
    old_en = _paras(10)
    new_en = _paras_with_changes(10, changed=[0, 2, 4, 6])
    old_ru = "\n\n".join(f"RU para {i}" for i in range(10))

    task = make_task(previous_task_id=uuid.uuid4(), before_sha="before-sha")
    project = make_project(incremental_threshold=40)
    client = make_github_client(old_en=old_en, old_ru=old_ru)

    ctx = await build_translation_context(task, project, new_en, client)

    # ratio=0.4, 0.4*100=40, NOT > 40 → incremental
    assert ctx.is_incremental is True


async def test_incremental_alignment_survives_insertion():
    """Inserting a paragraph shifts new indices; aligned_old_ru must follow."""
    old_en = "A\n\nB\n\nC"
    old_ru = "ru A\n\nru B\n\nru C"
    new_en = "NEW\n\nA\n\nB\n\nC"  # insert NEW at front → only index 0 is dirty

    task = make_task(previous_task_id=uuid.uuid4(), before_sha="before-sha")
    project = make_project(incremental_threshold=40)
    client = make_github_client(old_en=old_en, old_ru=old_ru)

    ctx = await build_translation_context(task, project, new_en, client)

    assert ctx.is_incremental is True
    assert ctx.dirty_indices == [0]
    # new indices 1,2,3 (the shifted clean paragraphs) map to old RU
    assert ctx.aligned_old_ru == {1: "ru A", 2: "ru B", 3: "ru C"}


async def test_full_when_one_above_threshold():
    """41% changed with threshold 40% → full (strictly greater)."""
    # 5/12 ≈ 41.6% > 40%
    old_en = _paras(12)
    new_en = _paras_with_changes(12, changed=[0, 2, 4, 6, 8])
    old_ru = "\n\n".join(f"RU para {i}" for i in range(12))

    task = make_task(previous_task_id=uuid.uuid4(), before_sha="before-sha")
    project = make_project(incremental_threshold=40)
    client = make_github_client(old_en=old_en, old_ru=old_ru)

    ctx = await build_translation_context(task, project, new_en, client)

    assert ctx.is_incremental is False
