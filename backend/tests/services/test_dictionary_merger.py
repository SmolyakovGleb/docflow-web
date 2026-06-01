from __future__ import annotations

import json

from app.models.dictionary_entry import DictionaryEntry
from app.services import dictionary_merger


def write_json(path, payload):
    path.write_text(json.dumps(payload), encoding="utf-8")


def seed_base_files(data_dir, pre_dir):
    write_json(data_dir / "dictionary.json", {})
    write_json(data_dir / "glossary.json", {})
    (data_dir / "prompt.txt").write_text("Base prompt", encoding="utf-8")
    write_json(pre_dir / "static_terms.json", {})
    write_json(pre_dir / "section_headings.json", {})
    write_json(pre_dir / "note_titles.json", {})
    write_json(pre_dir / "include_labels.json", {})
    write_json(pre_dir / "page_title_verbs.json", {})
    write_json(pre_dir / "page_title_nouns.json", {})


async def test_merge_override(tmp_path, db_session, test_user, monkeypatch):
    data_dir = tmp_path / "data"
    pre_dir = data_dir / "pre_translator"
    pre_dir.mkdir(parents=True)
    write_json(data_dir / "dictionary.json", {"hello": "Hello", "world": "World"})
    write_json(data_dir / "glossary.json", {})
    (data_dir / "prompt.txt").write_text("Base prompt", encoding="utf-8")
    write_json(pre_dir / "static_terms.json", {})
    write_json(pre_dir / "section_headings.json", {})
    write_json(pre_dir / "note_titles.json", {})
    write_json(pre_dir / "include_labels.json", {})
    write_json(pre_dir / "page_title_verbs.json", {})
    write_json(pre_dir / "page_title_nouns.json", {})

    monkeypatch.setattr(dictionary_merger, "PIPELINE_DATA_DIR", data_dir)
    monkeypatch.setattr(dictionary_merger, "PRE_TRANSLATOR_DATA_DIR", pre_dir)

    db_session.add(
        DictionaryEntry(
            dict_type="dictionary",
            key="hello",
            value="Hi",
            created_by=test_user.id,
        )
    )
    await db_session.commit()

    merged = await dictionary_merger.merge_pipeline_data(db_session)

    assert merged.dictionary == {"hello": "Hi", "world": "World"}


async def test_merge_delete(tmp_path, db_session, test_user, monkeypatch):
    data_dir = tmp_path / "data"
    pre_dir = data_dir / "pre_translator"
    pre_dir.mkdir(parents=True)
    write_json(data_dir / "dictionary.json", {"hello": "Hello", "world": "World"})
    write_json(data_dir / "glossary.json", {})
    (data_dir / "prompt.txt").write_text("Base prompt", encoding="utf-8")
    write_json(pre_dir / "static_terms.json", {})
    write_json(pre_dir / "section_headings.json", {})
    write_json(pre_dir / "note_titles.json", {})
    write_json(pre_dir / "include_labels.json", {})
    write_json(pre_dir / "page_title_verbs.json", {})
    write_json(pre_dir / "page_title_nouns.json", {})

    monkeypatch.setattr(dictionary_merger, "PIPELINE_DATA_DIR", data_dir)
    monkeypatch.setattr(dictionary_merger, "PRE_TRANSLATOR_DATA_DIR", pre_dir)

    db_session.add(
        DictionaryEntry(
            dict_type="dictionary",
            key="world",
            value="",
            is_deleted=True,
            created_by=test_user.id,
        )
    )
    await db_session.commit()

    merged = await dictionary_merger.merge_pipeline_data(db_session)

    assert merged.dictionary == {"hello": "Hello"}


async def test_merge_prompt(tmp_path, db_session, test_user, monkeypatch):
    data_dir = tmp_path / "data"
    pre_dir = data_dir / "pre_translator"
    pre_dir.mkdir(parents=True)
    seed_base_files(data_dir, pre_dir)

    monkeypatch.setattr(dictionary_merger, "PIPELINE_DATA_DIR", data_dir)
    monkeypatch.setattr(dictionary_merger, "PRE_TRANSLATOR_DATA_DIR", pre_dir)

    db_session.add(
        DictionaryEntry(
            dict_type="prompt",
            key="main",
            value="Custom prompt",
            created_by=test_user.id,
        )
    )
    await db_session.commit()

    merged = await dictionary_merger.merge_pipeline_data(db_session)

    assert merged.prompt == "Custom prompt"


async def test_merge_yaml_dictionary_and_prompt(tmp_path, db_session, test_user, monkeypatch):
    data_dir = tmp_path / "data"
    pre_dir = data_dir / "pre_translator"
    pre_dir.mkdir(parents=True)
    seed_base_files(data_dir, pre_dir)

    yaml_dir = data_dir / "yaml"
    (yaml_dir / "tm").mkdir(parents=True)
    write_json(yaml_dir / "dictionary.json", {"Календарь": "Calendar"})
    (yaml_dir / "prompt.txt").write_text("Base yaml prompt", encoding="utf-8")
    write_json(yaml_dir / "tm" / "cache.json", {})

    monkeypatch.setattr(dictionary_merger, "PIPELINE_DATA_DIR", data_dir)
    monkeypatch.setattr(dictionary_merger, "PRE_TRANSLATOR_DATA_DIR", pre_dir)

    db_session.add_all(
        [
            DictionaryEntry(
                dict_type="yaml_dictionary",
                key="События",
                value="Events",
                created_by=test_user.id,
            ),
            DictionaryEntry(
                dict_type="yaml_prompt",
                key="main",
                value="Custom yaml prompt",
                created_by=test_user.id,
            ),
        ]
    )
    await db_session.commit()

    merged = await dictionary_merger.merge_pipeline_data(db_session)

    assert merged.yaml_dictionary == {"Календарь": "Calendar", "События": "Events"}
    assert merged.yaml_prompt == "Custom yaml prompt"


async def test_merge_yaml_dictionary_defaults_when_files_absent(
    tmp_path, db_session, test_user, monkeypatch
):
    data_dir = tmp_path / "data"
    pre_dir = data_dir / "pre_translator"
    pre_dir.mkdir(parents=True)
    seed_base_files(data_dir, pre_dir)

    # No yaml/ subdir at all — merge must degrade gracefully.
    monkeypatch.setattr(dictionary_merger, "PIPELINE_DATA_DIR", data_dir)
    monkeypatch.setattr(dictionary_merger, "PRE_TRANSLATOR_DATA_DIR", pre_dir)

    merged = await dictionary_merger.merge_pipeline_data(db_session)

    assert merged.yaml_dictionary == {}
    assert merged.yaml_prompt == ""


async def test_merge_pre_translator_files(tmp_path, db_session, test_user, monkeypatch):
    data_dir = tmp_path / "data"
    pre_dir = data_dir / "pre_translator"
    pre_dir.mkdir(parents=True)
    write_json(data_dir / "dictionary.json", {})
    write_json(data_dir / "glossary.json", {})
    (data_dir / "prompt.txt").write_text("Base prompt", encoding="utf-8")
    write_json(pre_dir / "static_terms.json", {"crm": "CRM"})
    write_json(pre_dir / "section_headings.json", {"methods": "Methods"})
    write_json(pre_dir / "note_titles.json", {})
    write_json(pre_dir / "include_labels.json", {})
    write_json(pre_dir / "page_title_verbs.json", {"verb": "Get"})
    write_json(pre_dir / "page_title_nouns.json", {"noun": "deal"})

    monkeypatch.setattr(dictionary_merger, "PIPELINE_DATA_DIR", data_dir)
    monkeypatch.setattr(dictionary_merger, "PRE_TRANSLATOR_DATA_DIR", pre_dir)

    db_session.add_all(
        [
            DictionaryEntry(
                dict_type="static_terms",
                key="crm",
                value="Customer relationship management",
                created_by=test_user.id,
            ),
            DictionaryEntry(
                dict_type="note_titles",
                key="important",
                value="Important",
                created_by=test_user.id,
            ),
        ]
    )
    await db_session.commit()

    merged = await dictionary_merger.merge_pipeline_data(db_session)

    assert merged.pre_translator_files["static_terms"] == {
        "crm": "Customer relationship management"
    }
    assert merged.pre_translator_files["section_headings"] == {"methods": "Methods"}
    assert merged.pre_translator_files["note_titles"] == {"important": "Important"}
    assert merged.pre_translator_files["page_title_verbs"] == {"verb": "Get"}
    assert merged.pre_translator_files["page_title_nouns"] == {"noun": "deal"}
