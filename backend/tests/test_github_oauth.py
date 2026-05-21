from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest

from app.core.config import get_settings
from app.services.auth import decrypt_github_access_token


@pytest.fixture
def github_oauth_settings(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "github-client-id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "github-client-secret")
    monkeypatch.setenv("APP_BASE_URL", "http://localhost:8080")
    monkeypatch.setenv("FRONTEND_BASE_URL", "http://localhost:3000")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def extract_state(location: str) -> str:
    return parse_qs(urlparse(location).query)["state"][0]


async def test_connect_unauthenticated(client, github_oauth_settings):
    response = await client.get("/auth/github/connect", follow_redirects=False)

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


async def test_connect_redirects_to_github(auth_client, github_oauth_settings):
    response = await auth_client.get("/auth/github/connect", follow_redirects=False)

    assert response.status_code == 302
    assert response.cookies["github_oauth_state"]
    assert response.cookies["github_oauth_return_to"].strip('"') == "http://localhost:3000/tasks"

    location = urlparse(response.headers["location"])
    params = parse_qs(location.query)

    assert location.scheme == "https"
    assert location.netloc == "github.com"
    assert location.path == "/login/oauth/authorize"
    assert params["client_id"] == ["github-client-id"]
    assert params["scope"] == ["repo"]
    assert params["redirect_uri"] == ["http://localhost:3000/auth/github/callback"]
    assert params["state"] == [response.cookies["github_oauth_state"]]


async def test_callback_saves_token(
    auth_client,
    db_session,
    test_user,
    github_oauth_settings,
    mocker,
):
    connect_response = await auth_client.get(
        "/auth/github/connect?return_to=/repositories/new",
        follow_redirects=False,
        headers={"referer": "http://localhost:5173/repositories/new"},
    )
    state = extract_state(connect_response.headers["location"])

    mocker.patch("app.api.routes.auth.exchange_code_for_token", return_value="github-access-token")
    mocker.patch(
        "app.api.routes.auth.get_github_user",
        return_value={"id": 123456, "login": "octocat"},
    )

    response = await auth_client.get(
        f"/auth/github/callback?code=test-code&state={state}",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:5173/repositories/new?github_linked=1"

    await db_session.refresh(test_user)
    assert test_user.github_id == 123456
    assert test_user.github_login == "octocat"
    assert test_user.github_access_token is not None
    assert test_user.github_access_token != "github-access-token"
    assert decrypt_github_access_token(test_user.github_access_token) == "github-access-token"
    assert auth_client.cookies.get("github_oauth_state") is None

    me_response = await auth_client.get("/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["github_linked"] is True
    assert me_response.json()["github_login"] == "octocat"


async def test_callback_wrong_state(auth_client, github_oauth_settings, mocker):
    await auth_client.get("/auth/github/connect", follow_redirects=False)

    exchange_code_for_token = mocker.patch(
        "app.api.routes.auth.exchange_code_for_token",
        return_value="github-access-token",
    )
    get_github_user = mocker.patch(
        "app.api.routes.auth.get_github_user",
        return_value={"id": 123456, "login": "octocat"},
    )

    response = await auth_client.get(
        "/auth/github/callback?code=test-code&state=wrong-state",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:3000/tasks?github_error=invalid_state"
    exchange_code_for_token.assert_not_called()
    get_github_user.assert_not_called()


async def test_callback_account_already_linked(
    auth_client,
    db_session,
    test_user,
    github_oauth_settings,
    mocker,
):
    from app.models.user import User
    from app.services.auth import hash_password

    other_user = User(
        email="other@example.com",
        password_hash=hash_password("otherpassword"),
        display_name="Other User",
        github_id=123456,
        github_login="other-octocat",
        github_access_token="encrypted-token",
    )
    db_session.add(other_user)
    await db_session.commit()

    connect_response = await auth_client.get(
        "/auth/github/connect?reconnect=1",
        follow_redirects=False,
    )
    state = extract_state(connect_response.headers["location"])

    mocker.patch("app.api.routes.auth.exchange_code_for_token", return_value="github-access-token")
    mocker.patch(
        "app.api.routes.auth.get_github_user",
        return_value={"id": 123456, "login": "octocat"},
    )

    response = await auth_client.get(
        f"/auth/github/callback?code=test-code&state={state}",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:3000/tasks?github_error=already_linked"

    await db_session.refresh(test_user)
    assert test_user.github_id is None
    assert test_user.github_login is None
    assert test_user.github_access_token is None


async def test_callback_without_session_returns_401(client, github_oauth_settings):
    response = await client.get(
        "/auth/github/callback?code=test-code&state=test-state",
        follow_redirects=False,
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


async def test_callback_relinks_same_user_and_refreshes_token(
    auth_client,
    db_session,
    test_user,
    github_oauth_settings,
    mocker,
):
    test_user.github_id = 123456
    test_user.github_login = "old-login"
    test_user.github_access_token = "old-encrypted-token"
    await db_session.commit()

    connect_response = await auth_client.get(
        "/auth/github/connect?reconnect=1",
        follow_redirects=False,
    )
    state = extract_state(connect_response.headers["location"])

    mocker.patch(
        "app.api.routes.auth.exchange_code_for_token",
        return_value="new-github-access-token",
    )
    mocker.patch(
        "app.api.routes.auth.get_github_user",
        return_value={"id": 123456, "login": "new-login"},
    )

    response = await auth_client.get(
        f"/auth/github/callback?code=test-code&state={state}",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:3000/tasks?github_linked=1"

    await db_session.refresh(test_user)
    assert test_user.github_id == 123456
    assert test_user.github_login == "new-login"
    assert test_user.github_access_token not in {
        None,
        "old-encrypted-token",
        "new-github-access-token",
    }


async def test_connect_returns_to_current_frontend_screen_when_already_linked(
    auth_client,
    db_session,
    test_user,
    github_oauth_settings,
):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = "encrypted-token"
    await db_session.commit()

    response = await auth_client.get(
        "/auth/github/connect?return_to=/repositories/new",
        follow_redirects=False,
        headers={"referer": "http://localhost:5173/repositories/new"},
    )

    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:5173/repositories/new?github_linked=1"


async def test_disconnect_unauthenticated(client):
    response = await client.delete("/auth/github/connect")

    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}


async def test_disconnect_when_not_connected(auth_client, db_session, test_user):
    # test_user не имеет github_id по умолчанию — DELETE должен быть идемпотентным
    assert test_user.github_id is None

    response = await auth_client.delete("/auth/github/connect")

    assert response.status_code == 200
    assert response.json() == {"ok": True}

    await db_session.refresh(test_user)
    assert test_user.github_id is None


async def test_disconnect_clears_fields(auth_client, db_session, test_user):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = "encrypted-token"
    await db_session.commit()

    response = await auth_client.delete("/auth/github/connect")

    assert response.status_code == 200
    assert response.json() == {"ok": True}

    await db_session.refresh(test_user)
    assert test_user.github_id is None
    assert test_user.github_login is None
    assert test_user.github_access_token is None

    me_response = await auth_client.get("/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["github_linked"] is False
    assert me_response.json()["github_login"] is None
