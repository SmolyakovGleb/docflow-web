from __future__ import annotations

from app.services.auth import encrypt_github_access_token


async def test_get_github_repos_returns_current_user_repos(auth_client, db_session, test_user, mocker):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")
    await db_session.commit()

    github_client = mocker.Mock()
    github_client.get_user_repos = mocker.AsyncMock(
        return_value=["acme/docs", "acme/docs-en", "org/private-docs"]
    )
    github_client_cls = mocker.patch("app.api.routes.me.GitHubClient", return_value=github_client)

    response = await auth_client.get("/me/github-repos")

    assert response.status_code == 200
    assert response.json() == ["acme/docs", "acme/docs-en", "org/private-docs"]
    github_client_cls.assert_called_once_with("github-token")
    github_client.get_user_repos.assert_awaited_once()


async def test_get_github_repos_requires_github_link(auth_client):
    response = await auth_client.get("/me/github-repos")

    assert response.status_code == 400
    assert response.json() == {"detail": "GitHub account is not linked"}
