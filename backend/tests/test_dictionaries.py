from __future__ import annotations

import json

from app.models.dictionary_entry import DictionaryEntry
from app.services import dictionary_merger


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


async def test_get_dictionary_returns_merged_entries(
    auth_client, db_session, test_user, monkeypatch, tmp_path
):
    data_dir = tmp_path / "data"
    pre_dir = data_dir / "pre_translator"
    pre_dir.mkdir(parents=True)
    write_json(data_dir / "dictionary.json", {"world": "World", "hello": "Hello"})
    write_json(data_dir / "glossary.json", {})
    (data_dir / "prompt.txt").write_text("Base prompt", encoding="utf-8")
    write_json(pre_dir / "static_terms.json", {})
    write_json(pre_dir / "section_headings.json", {})
    write_json(pre_dir / "note_titles.json", {})
    write_json(pre_dir / "include_labels.json", {})

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

    response = await auth_client.get("/dictionaries/dictionary")

    assert response.status_code == 200
    assert response.json() == {
        "dict_type": "dictionary",
        "entries": [
            {
                "key": "hello",
                "value": "Hi",
                "source": "user",
                "entry_id": response.json()["entries"][0]["entry_id"],
                "updated_by": "Test User",
                "updated_at": response.json()["entries"][0]["updated_at"],
            },
            {
                "key": "world",
                "value": "World",
                "source": "base",
                "entry_id": None,
                "updated_by": None,
                "updated_at": None,
            },
        ],
    }


async def test_get_prompt_returns_single_main_entry(
    auth_client, db_session, test_user, monkeypatch, tmp_path
):
    data_dir = tmp_path / "data"
    pre_dir = data_dir / "pre_translator"
    pre_dir.mkdir(parents=True)
    write_json(data_dir / "dictionary.json", {})
    write_json(data_dir / "glossary.json", {})
    (data_dir / "prompt.txt").write_text("Base prompt", encoding="utf-8")
    write_json(pre_dir / "static_terms.json", {})
    write_json(pre_dir / "section_headings.json", {})
    write_json(pre_dir / "note_titles.json", {})
    write_json(pre_dir / "include_labels.json", {})

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

    response = await auth_client.get("/dictionaries/prompt")

    assert response.status_code == 200
    assert response.json() == {
        "dict_type": "prompt",
        "entries": [
            {
                "key": "main",
                "value": "Custom prompt",
                "source": "user",
                "entry_id": response.json()["entries"][0]["entry_id"],
                "updated_by": "Test User",
                "updated_at": response.json()["entries"][0]["updated_at"],
            }
        ],
    }


async def test_get_prompt_returns_base_when_no_override(auth_client, monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    pre_dir = data_dir / "pre_translator"
    pre_dir.mkdir(parents=True)
    write_json(data_dir / "dictionary.json", {})
    write_json(data_dir / "glossary.json", {})
    (data_dir / "prompt.txt").write_text("Base prompt", encoding="utf-8")
    write_json(pre_dir / "static_terms.json", {})
    write_json(pre_dir / "section_headings.json", {})
    write_json(pre_dir / "note_titles.json", {})
    write_json(pre_dir / "include_labels.json", {})

    monkeypatch.setattr(dictionary_merger, "PIPELINE_DATA_DIR", data_dir)
    monkeypatch.setattr(dictionary_merger, "PRE_TRANSLATOR_DATA_DIR", pre_dir)

    response = await auth_client.get("/dictionaries/prompt")

    assert response.status_code == 200
    assert response.json() == {
        "dict_type": "prompt",
        "entries": [
            {
                "key": "main",
                "value": "Base prompt",
                "source": "base",
                "entry_id": None,
                "updated_by": None,
                "updated_at": None,
            }
        ],
    }


async def test_get_prompt_returns_base_when_deleted(
    auth_client, db_session, test_user, monkeypatch, tmp_path
):
    data_dir = tmp_path / "data"
    pre_dir = data_dir / "pre_translator"
    pre_dir.mkdir(parents=True)
    write_json(data_dir / "dictionary.json", {})
    write_json(data_dir / "glossary.json", {})
    (data_dir / "prompt.txt").write_text("Base prompt", encoding="utf-8")
    write_json(pre_dir / "static_terms.json", {})
    write_json(pre_dir / "section_headings.json", {})
    write_json(pre_dir / "note_titles.json", {})
    write_json(pre_dir / "include_labels.json", {})

    monkeypatch.setattr(dictionary_merger, "PIPELINE_DATA_DIR", data_dir)
    monkeypatch.setattr(dictionary_merger, "PRE_TRANSLATOR_DATA_DIR", pre_dir)

    db_session.add(
        DictionaryEntry(
            dict_type="prompt",
            key="main",
            value="Custom prompt",
            is_deleted=True,
            created_by=test_user.id,
        )
    )
    await db_session.commit()

    response = await auth_client.get("/dictionaries/prompt")

    assert response.status_code == 200
    assert response.json()["entries"][0]["source"] == "base"
    assert response.json()["entries"][0]["value"] == "Base prompt"


async def test_get_dictionary_hides_deleted_entries(
    auth_client, db_session, test_user, monkeypatch, tmp_path
):
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

    response = await auth_client.get("/dictionaries/dictionary")

    assert response.status_code == 200
    assert response.json()["entries"] == [
        {
            "key": "hello",
            "value": "Hello",
            "source": "base",
            "entry_id": None,
            "updated_by": None,
            "updated_at": None,
        }
    ]


async def test_list_dictionaries_returns_summary_counts(
    auth_client,
    db_session,
    test_user,
    monkeypatch,
    tmp_path,
):
    data_dir = tmp_path / "data"
    pre_dir = data_dir / "pre_translator"
    pre_dir.mkdir(parents=True)
    write_json(data_dir / "dictionary.json", {"hello": "Hello", "world": "World"})
    write_json(data_dir / "glossary.json", {"deal": "Deal"})
    (data_dir / "prompt.txt").write_text("Base prompt", encoding="utf-8")
    write_json(pre_dir / "static_terms.json", {"api": "API"})
    write_json(pre_dir / "section_headings.json", {})
    write_json(pre_dir / "note_titles.json", {"note": "Note"})
    write_json(pre_dir / "include_labels.json", {"include": "Include"})

    monkeypatch.setattr(dictionary_merger, "PIPELINE_DATA_DIR", data_dir)
    monkeypatch.setattr(dictionary_merger, "PRE_TRANSLATOR_DATA_DIR", pre_dir)

    db_session.add_all(
        [
            DictionaryEntry(
                dict_type="dictionary",
                key="hello",
                value="Hi",
                created_by=test_user.id,
            ),
            DictionaryEntry(
                dict_type="dictionary",
                key="world",
                value="",
                is_deleted=True,
                created_by=test_user.id,
            ),
            DictionaryEntry(
                dict_type="glossary",
                key="crm",
                value="CRM",
                created_by=test_user.id,
            ),
            DictionaryEntry(
                dict_type="prompt",
                key="main",
                value="Custom prompt",
                created_by=test_user.id,
            ),
        ]
    )
    await db_session.commit()

    response = await auth_client.get("/dictionaries")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {"dict_type": "dictionary", "entry_count": 1},
            {"dict_type": "glossary", "entry_count": 2},
            {"dict_type": "static_terms", "entry_count": 1},
            {"dict_type": "section_headings", "entry_count": 0},
            {"dict_type": "note_titles", "entry_count": 1},
            {"dict_type": "include_labels", "entry_count": 1},
            {"dict_type": "prompt", "entry_count": 1},
        ]
    }


async def test_get_dictionary_invalid_type_returns_422(auth_client):
    response = await auth_client.get("/dictionaries/unknown")

    assert response.status_code == 422


async def test_dictionary_write_endpoints_return_501(auth_client):
    post_response = await auth_client.post(
        "/dictionaries/dictionary",
        json={"key": "lead", "value": "lead"},
    )
    patch_response = await auth_client.patch(
        "/dictionaries/dictionary/550e8400-e29b-41d4-a716-446655440000",
        json={"value": "updated"},
    )
    delete_response = await auth_client.delete(
        "/dictionaries/dictionary/550e8400-e29b-41d4-a716-446655440000"
    )

    expected = {"detail": "Per-user dictionary editing is deferred until post-MVP"}
    assert post_response.status_code == 501
    assert post_response.json() == expected
    assert patch_response.status_code == 501
    assert patch_response.json() == expected
    assert delete_response.status_code == 501
    assert delete_response.json() == expected
