from __future__ import annotations

from app.services.paragraph_diff import (
    find_dirty_paragraphs,
    map_unchanged_to_old,
    merge_translations,
    split_paragraphs,
)

# ---------------------------------------------------------------------------
# split_paragraphs
# ---------------------------------------------------------------------------


def test_split_paragraphs_basic():
    text = "Para one\n\nPara two\n\nPara three"
    assert split_paragraphs(text) == ["Para one", "Para two", "Para three"]


def test_split_paragraphs_strips_whitespace():
    text = "  Alpha  \n\n  Beta  "
    assert split_paragraphs(text) == ["Alpha", "Beta"]


def test_split_paragraphs_skips_empty_blocks():
    text = "A\n\n\n\nB"
    assert split_paragraphs(text) == ["A", "B"]


def test_split_paragraphs_empty_string():
    assert split_paragraphs("") == []


# ---------------------------------------------------------------------------
# find_dirty_paragraphs — 10-paragraph scenario
# ---------------------------------------------------------------------------

PARAS = [f"Paragraph {i}" for i in range(10)]


def test_find_dirty_two_changed():
    new_paras = list(PARAS)
    new_paras[2] = "Changed paragraph 2"
    new_paras[7] = "Changed paragraph 7"
    dirty = find_dirty_paragraphs(new_paras, PARAS)
    assert dirty == [2, 7]


def test_find_dirty_none_changed():
    dirty = find_dirty_paragraphs(list(PARAS), PARAS)
    assert dirty == []


def test_find_dirty_all_changed():
    new_paras = [f"New {i}" for i in range(10)]
    dirty = find_dirty_paragraphs(new_paras, PARAS)
    assert dirty == list(range(10))


# ---------------------------------------------------------------------------
# find_dirty_paragraphs — insertion in the middle
# ---------------------------------------------------------------------------


def test_find_dirty_insert_in_middle():
    # Insert a new paragraph between index 4 and 5
    old = list(PARAS)
    new = old[:5] + ["Brand new paragraph"] + old[5:]
    dirty = find_dirty_paragraphs(new, old)
    # Only the inserted paragraph should be dirty; the rest are unchanged
    assert 5 in dirty
    unchanged_indices = [i for i in range(len(new)) if i != 5]
    for idx in unchanged_indices:
        assert idx not in dirty


def test_find_dirty_insert_at_start():
    old = list(PARAS)
    new = ["Inserted at start"] + old
    dirty = find_dirty_paragraphs(new, old)
    assert dirty == [0]


def test_find_dirty_delete_paragraph():
    old = list(PARAS)
    new = old[:3] + old[4:]  # remove index 3
    dirty = find_dirty_paragraphs(new, old)
    # All surviving paragraphs are unchanged
    assert dirty == []


# ---------------------------------------------------------------------------
# map_unchanged_to_old
# ---------------------------------------------------------------------------


def test_map_unchanged_identical():
    paras = ["A", "B", "C"]
    assert map_unchanged_to_old(paras, paras) == {0: 0, 1: 1, 2: 2}


def test_map_unchanged_with_insertion():
    old = ["A", "B", "C"]
    new = ["NEW", "A", "B", "C"]
    # new index 0 is the insertion (not mapped); 1,2,3 map to old 0,1,2
    assert map_unchanged_to_old(new, old) == {1: 0, 2: 1, 3: 2}


def test_map_unchanged_with_change():
    old = ["A", "B", "C"]
    new = ["A", "CHANGED", "C"]
    # index 1 changed → not mapped; 0 and 2 map straight across
    assert map_unchanged_to_old(new, old) == {0: 0, 2: 2}


# ---------------------------------------------------------------------------
# merge_translations
# ---------------------------------------------------------------------------


def _make_paras(n: int) -> list[str]:
    return [f"EN para {i}" for i in range(n)]


def test_merge_uses_new_translations_for_dirty():
    new_paras = _make_paras(5)
    dirty_indices = [1, 3]
    new_translations = {1: "RU translated 1", 3: "RU translated 3"}
    aligned_old_ru = {0: "RU old 0", 2: "RU old 2", 4: "RU old 4"}

    result = merge_translations(new_paras, dirty_indices, new_translations, aligned_old_ru)
    lines = result.split("\n\n")

    assert lines[0] == "RU old 0"
    assert lines[1] == "RU translated 1"
    assert lines[2] == "RU old 2"
    assert lines[3] == "RU translated 3"
    assert lines[4] == "RU old 4"


def test_merge_fallback_to_en_when_no_old_ru():
    new_paras = ["EN A", "EN B"]
    dirty_indices = [0]
    new_translations: dict[int, str] = {}  # missing translation
    aligned_old_ru: dict[int, str] = {}  # no old RU either

    result = merge_translations(new_paras, dirty_indices, new_translations, aligned_old_ru)
    lines = result.split("\n\n")
    # Falls back to EN para when translation missing
    assert lines[0] == "EN A"
    assert lines[1] == "EN B"


def test_merge_all_dirty():
    new_paras = ["A", "B", "C"]
    dirty_indices = [0, 1, 2]
    new_translations = {0: "RU A", 1: "RU B", 2: "RU C"}
    aligned_old_ru: dict[int, str] = {}

    result = merge_translations(new_paras, dirty_indices, new_translations, aligned_old_ru)
    assert result == "RU A\n\nRU B\n\nRU C"


def test_merge_none_dirty():
    new_paras = ["A", "B"]
    dirty_indices: list[int] = []
    new_translations: dict[int, str] = {}
    aligned_old_ru = {0: "RU A", 1: "RU B"}

    result = merge_translations(new_paras, dirty_indices, new_translations, aligned_old_ru)
    assert result == "RU A\n\nRU B"
