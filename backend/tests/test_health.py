from __future__ import annotations

from datetime import UTC, datetime

from app.api.routes import health as health_module
from app.models.task import Task


async def test_health_includes_pipeline_version_and_last_webhook_at(
    client,
    db_session,
    test_project,
    mocker,
):
    created_at = datetime(2026, 5, 12, 10, 30, tzinfo=UTC)
    db_session.add(
        Task(
            user_id=test_project.user_id,
            project_id=test_project.id,
            file_path="docs/webhook.md",
            github_ref="refs/heads/main",
            github_sha="after-sha",
            commit_message="Update docs",
            source_file_sha="source-sha",
            target_file_sha="target-sha",
            original_content="# Source",
            status="queued",
            created_at=created_at,
        )
    )
    await db_session.commit()

    mocker.patch("app.api.routes.health.get_pipeline_version", return_value="abc1234")

    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "pipeline_version": "abc1234",
        "last_webhook_at": "2026-05-12T10:30:00Z",
    }


def test_pipeline_version_read_from_pyproject():
    """Версия читается из pipeline/pyproject.toml и не бывает 'unknown'."""
    version = health_module._read_pyproject_version()
    assert version is not None
    assert version != "unknown"
    combined = health_module.get_pipeline_version()
    assert combined != "unknown"
    assert combined.startswith(version)


def test_pipeline_version_falls_back_to_sha_without_pyproject(mocker):
    """Если pyproject не прочитался, остаётся git SHA, а не 'unknown'."""
    mocker.patch.object(health_module, "_read_pyproject_version", return_value=None)
    mocker.patch.object(health_module, "_read_git_sha", return_value="deadbee")
    health_module.get_pipeline_version.cache_clear()
    try:
        assert health_module.get_pipeline_version() == "deadbee"
    finally:
        health_module.get_pipeline_version.cache_clear()
