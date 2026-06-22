from __future__ import annotations

import base64

import httpx
import pytest

from app.services.github import GitHubAPIError, GitHubClient


def make_response(
    method: str,
    url: str,
    status_code: int,
    *,
    json: dict | list | None = None,
) -> httpx.Response:
    request = httpx.Request(method, url)
    return httpx.Response(status_code, json=json, request=request)


@pytest.fixture
def mocked_async_client(mocker):
    client = mocker.AsyncMock()
    client.__aenter__.return_value = client
    client.__aexit__.return_value = None
    mocker.patch("app.services.github.httpx.AsyncClient", return_value=client)
    return client


async def test_get_file_content_decodes_base64(mocked_async_client):
    encoded_content = base64.b64encode("# Hello".encode("utf-8")).decode("utf-8")
    mocked_async_client.get.return_value = make_response(
        "GET",
        "https://api.github.com/repos/acme/docs/contents/readme.md",
        200,
        json={"content": encoded_content, "sha": "blob-sha"},
    )

    client = GitHubClient("github-token")

    content, sha = await client.get_file_content("acme/docs", "readme.md", "main")

    assert content == "# Hello"
    assert sha == "blob-sha"
    _, kwargs = mocked_async_client.get.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer github-token"
    assert kwargs["params"] == {"ref": "main"}


async def test_get_file_content_raises_on_invalid_utf8(mocked_async_client):
    encoded_content = base64.b64encode(b"\xff\xfe\xfd").decode("utf-8")
    mocked_async_client.get.return_value = make_response(
        "GET",
        "https://api.github.com/repos/acme/docs/contents/readme.md",
        200,
        json={"content": encoded_content, "sha": "blob-sha"},
    )

    client = GitHubClient("github-token")

    with pytest.raises(GitHubAPIError) as exc_info:
        await client.get_file_content("acme/docs", "readme.md", "main")

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "GitHub returned a non-UTF-8 file"


async def test_get_file_sha_returns_none_if_404(mocked_async_client):
    mocked_async_client.get.return_value = make_response(
        "GET",
        "https://api.github.com/repos/acme/docs/contents/readme.md",
        404,
        json={"message": "Not Found"},
    )

    client = GitHubClient("github-token")

    sha = await client.get_file_sha("acme/docs", "readme.md", "main")

    assert sha is None


async def test_get_repo_tree_filters_translatable_files_recursively(mocked_async_client):
    mocked_async_client.get.return_value = make_response(
        "GET",
        "https://api.github.com/repos/acme/docs/git/trees/main",
        200,
        json={
            "tree": [
                {"path": "docs/index.md", "type": "blob"},
                {"path": "docs/guide/setup.md", "type": "blob"},
                {"path": "docs/api/b24-toc.yaml", "type": "blob"},
                {"path": "docs/api/legacy/b24-toc.yml", "type": "blob"},
                {"path": "docs/image.png", "type": "blob"},
                {"path": "README.md", "type": "blob"},
                {"path": "docs/nested", "type": "tree"},
            ]
        },
    )

    client = GitHubClient("github-token")

    files = await client.get_repo_tree("acme/docs", "main", "docs")

    assert files == [
        "docs/api/b24-toc.yaml",
        "docs/api/legacy/b24-toc.yml",
        "docs/guide/setup.md",
        "docs/index.md",
    ]
    _, kwargs = mocked_async_client.get.call_args
    assert kwargs["params"] == {"recursive": "1"}


async def test_create_or_update_file_sends_correct_payload(mocked_async_client):
    mocked_async_client.put.return_value = make_response(
        "PUT",
        "https://api.github.com/repos/acme/docs/contents/readme.md",
        200,
        json={"commit": {"sha": "commit-sha"}},
    )

    client = GitHubClient("github-token")

    commit_sha = await client.create_or_update_file(
        repo="acme/docs",
        path="readme.md",
        message="Update docs",
        content="# Updated",
        sha="current-sha",
        branch="main",
    )

    assert commit_sha == "commit-sha"
    _, kwargs = mocked_async_client.put.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer github-token"
    assert kwargs["json"] == {
        "message": "Update docs",
        "content": base64.b64encode("# Updated".encode("utf-8")).decode("utf-8"),
        "branch": "main",
        "sha": "current-sha",
    }


async def test_get_user_repos_returns_all_non_archived(mocked_async_client):
    mocked_async_client.get.side_effect = [
        make_response(
            "GET",
            "https://api.github.com/user/repos?page=1",
            200,
            json=[
                {"full_name": "acme/docs", "archived": False},
                {"full_name": "acme/old-docs", "archived": True},
            ],
        ),
        make_response(
            "GET",
            "https://api.github.com/user/repos?page=2",
            200,
            json=[
                {"full_name": "org/private-docs", "archived": False},
            ],
        ),
        make_response(
            "GET",
            "https://api.github.com/user/repos?page=3",
            200,
            json=[],
        ),
    ]

    client = GitHubClient("github-token")

    repos = await client.get_user_repos()

    assert repos == ["acme/docs", "org/private-docs"]
    assert mocked_async_client.get.await_count == 3


async def test_list_installation_repos_paginates_and_filters(mocked_async_client):
    mocked_async_client.get.side_effect = [
        make_response(
            "GET",
            "https://api.github.com/installation/repositories?page=1",
            200,
            json={
                "total_count": 3,
                "repositories": [
                    {"full_name": "acme/docs-ru", "archived": False},
                    {"full_name": "acme/old", "archived": True},
                ],
            },
        ),
        make_response(
            "GET",
            "https://api.github.com/installation/repositories?page=2",
            200,
            json={"total_count": 3, "repositories": [{"full_name": "acme/docs-en"}]},
        ),
        make_response(
            "GET",
            "https://api.github.com/installation/repositories?page=3",
            200,
            json={"total_count": 3, "repositories": []},
        ),
    ]

    client = GitHubClient("installation-token")

    repos = await client.list_installation_repos()

    assert repos == ["acme/docs-ru", "acme/docs-en"]
    assert mocked_async_client.get.await_count == 3


async def test_create_or_update_file_without_sha(mocked_async_client):
    mocked_async_client.put.return_value = make_response(
        "PUT",
        "https://api.github.com/repos/acme/docs/contents/new.md",
        201,
        json={"commit": {"sha": "new-commit-sha"}},
    )

    client = GitHubClient("github-token")

    commit_sha = await client.create_or_update_file(
        repo="acme/docs",
        path="new.md",
        message="Create file",
        content="# New",
        sha=None,
        branch="main",
    )

    assert commit_sha == "new-commit-sha"
    _, kwargs = mocked_async_client.put.call_args
    assert "sha" not in kwargs["json"]


async def test_github_api_error_raised_on_500(mocked_async_client):
    mocked_async_client.get.return_value = make_response(
        "GET",
        "https://api.github.com/repos/acme/docs/contents/readme.md",
        500,
        json={"message": "Internal Server Error"},
    )

    client = GitHubClient("github-token")

    with pytest.raises(GitHubAPIError) as exc_info:
        await client.get_file_content("acme/docs", "readme.md", "main")

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Internal Server Error"
