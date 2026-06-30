from __future__ import annotations

import re
from difflib import SequenceMatcher
from hashlib import md5

# Строка-ограждение fenced-блока: ```… или ~~~… (3+), допускается отступ и info-string.
_FENCE_RE = re.compile(r"^[ \t]*(`{3,}|~{3,})([^\n]*)$")


def split_paragraphs(text: str) -> list[str]:
    """Разбивает текст на абзацы по пустым строкам, НО не внутри fenced-блоков кода.

    Наивный split("\\n\\n") разрывал блок ```…``` с пустой строкой внутри на части,
    из-за чего число абзацев в EN и RU расходилось и позиционное выравнивание
    инкремента подставляло чужой перевод. Здесь пустая строка внутри ограждённого
    блока кода НЕ считается границей абзаца.
    """
    paragraphs: list[str] = []
    current: list[str] = []
    open_fence: tuple[str, int] | None = None

    def flush() -> None:
        if current:
            joined = "\n".join(current).strip()
            if joined:
                paragraphs.append(joined)
            current.clear()

    for line in text.split("\n"):
        match = _FENCE_RE.match(line)
        if match:
            marker = match.group(1)
            char, length = marker[0], len(marker)
            if open_fence is None:
                open_fence = (char, length)
            elif char == open_fence[0] and length >= open_fence[1] and match.group(2).strip() == "":
                open_fence = None  # закрывающее ограждение (без info-string, длина >= открывающей)
            current.append(line)
            continue

        if open_fence is not None:
            current.append(line)
            continue

        if line.strip() == "":
            flush()
        else:
            current.append(line)

    flush()
    return paragraphs


def _hash(para: str) -> str:
    return md5(para.encode(), usedforsecurity=False).hexdigest()


def find_dirty_paragraphs(new_paras: list[str], old_paras: list[str]) -> list[int]:
    old_hashes = {_hash(p) for p in old_paras}
    new_hashes = [_hash(p) for p in new_paras]

    # Use SequenceMatcher to align sequences so that inserted/deleted
    # paragraphs in the middle don't cause a cascade of false positives.
    matcher = SequenceMatcher(None, [_hash(p) for p in old_paras], new_hashes, autojunk=False)

    dirty: set[int] = set()
    for tag, _i1, _i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        # 'replace', 'insert' — all new_paras positions in [j1, j2) are dirty
        for j in range(j1, j2):
            dirty.add(j)

    # Also mark as dirty any paragraph whose hash is not in old at all
    # (handles the replace/insert cases above, but be explicit)
    for j, h in enumerate(new_hashes):
        if h not in old_hashes:
            dirty.add(j)

    return sorted(dirty)


def map_unchanged_to_old(new_paras: list[str], old_paras: list[str]) -> dict[int, int]:
    """Map index of each unchanged paragraph in new_paras to its index in old_paras.

    Uses SequenceMatcher equal blocks so that insertions/deletions shift indices
    correctly. Only paragraphs present unchanged in both sequences are mapped.
    """
    matcher = SequenceMatcher(
        None, [_hash(p) for p in old_paras], [_hash(p) for p in new_paras], autojunk=False
    )
    mapping: dict[int, int] = {}
    for tag, i1, i2, j1, _j2 in matcher.get_opcodes():
        if tag != "equal":
            continue
        for offset in range(i2 - i1):
            mapping[j1 + offset] = i1 + offset  # new index -> old index
    return mapping


def merge_translations(
    new_paras: list[str],
    dirty_indices: list[int],
    new_translations: dict[int, str],
    aligned_old_ru: dict[int, str],
) -> str:
    dirty_set = set(dirty_indices)
    result: list[str] = []
    for i, para in enumerate(new_paras):
        if i in dirty_set:
            result.append(new_translations.get(i, para))
        else:
            result.append(aligned_old_ru.get(i, para))
    return "\n\n".join(result)
