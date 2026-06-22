from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt

from app.services import github_app


def _make_response(method: str, url: str, status_code: int, *, json=None) -> httpx.Response:
    return httpx.Response(status_code, json=json, request=httpx.Request(method, url))


@pytest.fixture
def rsa_keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = (
        key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("utf-8")
    )
    return private_pem, public_pem


@pytest.fixture
def app_settings(mocker, rsa_keypair):
    private_pem, public_pem = rsa_keypair
    fake = SimpleNamespace(
        github_app_enabled=True,
        github_app_id="123456",
        github_app_private_key=private_pem,
        github_app_slug="docflow",
        github_app_webhook_secret="whsecret",
    )
    mocker.patch("app.services.github_app.get_settings", return_value=fake)
    return public_pem


@pytest.fixture(autouse=True)
def _clear_token_cache():
    github_app._token_cache.clear()
    github_app._token_locks.clear()
    yield
    github_app._token_cache.clear()
    github_app._token_locks.clear()


@pytest.fixture
def mocked_async_client(mocker):
    client = mocker.AsyncMock()
    client.__aenter__.return_value = client
    client.__aexit__.return_value = None
    mocker.patch("app.services.github_app.httpx.AsyncClient", return_value=client)
    return client


def test_generate_app_jwt_signs_with_rs256(app_settings):
    public_pem = app_settings
    token = github_app.generate_app_jwt()
    claims = jwt.decode(
        token, public_pem, algorithms=["RS256"], options={"verify_aud": False}
    )
    assert claims["iss"] == "123456"
    assert claims["exp"] > claims["iat"]


def test_generate_app_jwt_raises_when_not_configured(mocker):
    fake = SimpleNamespace(
        github_app_enabled=False, github_app_id=None, github_app_private_key=None
    )
    mocker.patch("app.services.github_app.get_settings", return_value=fake)
    with pytest.raises(github_app.GithubAppError):
        github_app.generate_app_jwt()


async def test_get_installation_token_caches(app_settings, mocked_async_client):
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    mocked_async_client.post.return_value = _make_response(
        "POST",
        "https://api.github.com/app/installations/42/access_tokens",
        201,
        json={"token": "ghs_secret", "expires_at": expires},
    )

    first = await github_app.get_installation_token(42)
    second = await github_app.get_installation_token(42)

    assert first == "ghs_secret"
    assert second == "ghs_secret"
    # Второй вызов берёт из кэша — POST к GitHub ровно один.
    assert mocked_async_client.post.call_count == 1


async def test_get_installation_token_raises_on_error(app_settings, mocked_async_client):
    mocked_async_client.post.return_value = _make_response(
        "POST",
        "https://api.github.com/app/installations/42/access_tokens",
        404,
        json={"message": "Not Found"},
    )
    with pytest.raises(github_app.GithubAppError):
        await github_app.get_installation_token(42)


async def test_find_installation_for_repo(db_session):
    installation = await github_app.sync_installation(
        db_session,
        installation_id=99,
        account_login="acme",
        account_type="Organization",
        full_names=["acme/docs-ru", "acme/docs-en"],
    )
    await db_session.commit()

    assert installation.installation_id == 99
    assert await github_app.find_installation_for_repo(db_session, "acme/docs-en") == 99
    assert await github_app.find_installation_for_repo(db_session, "acme/other") is None


async def test_find_installation_skips_suspended(db_session):
    await github_app.sync_installation(
        db_session,
        installation_id=7,
        account_login="acme",
        account_type="Organization",
        suspended=True,
        full_names=["acme/docs-ru"],
    )
    await db_session.commit()

    assert await github_app.find_installation_for_repo(db_session, "acme/docs-ru") is None


async def _make_user(db_session, email: str):
    from app.models.user import User
    from app.services.auth import hash_password

    user = User(email=email, password_hash=hash_password("x"), display_name=email)
    db_session.add(user)
    await db_session.flush()
    return user


async def test_repos_visible_to_scopes_by_user_and_team(db_session):
    from app.models.team import Team

    alice = await _make_user(db_session, "alice@example.com")
    bob = await _make_user(db_session, "bob@example.com")
    team = Team(name="docs", owner_id=alice.id)
    db_session.add(team)
    await db_session.flush()

    # Установка Алисы (личная), установка Боба, и командная установка.
    await github_app.sync_installation(
        db_session, installation_id=1, account_login="a", account_type="User",
        created_by_user_id=alice.id, full_names=["a/alice-repo"],
    )
    await github_app.sync_installation(
        db_session, installation_id=2, account_login="b", account_type="User",
        created_by_user_id=bob.id, full_names=["b/bob-repo"],
    )
    await github_app.sync_installation(
        db_session, installation_id=3, account_login="t", account_type="Organization",
        team_id=team.id, full_names=["t/team-repo"],
    )
    await db_session.commit()

    alice_with_team = await github_app.repos_visible_to(db_session, alice.id, team.id)
    assert set(alice_with_team) == {"a/alice-repo", "t/team-repo"}
    # Боб не в команде → видит только свою.
    assert await github_app.repos_visible_to(db_session, bob.id, None) == ["b/bob-repo"]


async def test_setup_binding_survives_unbound_webhook_resync(db_session):
    alice = await _make_user(db_session, "carol@example.com")
    # setup привязал установку к пользователю.
    await github_app.sync_installation(
        db_session, installation_id=9, account_login="a", account_type="User",
        created_by_user_id=alice.id, full_names=["a/repo"],
    )
    # Вебхук-ресинк без user-контекста НЕ должен сбросить привязку.
    await github_app.sync_installation(
        db_session, installation_id=9, account_login="a", account_type="User",
        full_names=["a/repo", "a/repo2"],
    )
    await db_session.commit()

    assert await github_app.repos_visible_to(db_session, alice.id, None) == [
        "a/repo",
        "a/repo2",
    ]


async def test_sync_does_not_wipe_cache_on_fetch_failure(db_session, mocker):
    await github_app.sync_installation(
        db_session,
        installation_id=55,
        account_login="acme",
        account_type="Organization",
        full_names=["acme/docs-ru", "acme/docs-en"],
    )
    await db_session.commit()

    # full_names=None → пойдёт в fetch, который падает транзиентной ошибкой.
    mocker.patch(
        "app.services.github_app.fetch_installation_repos",
        side_effect=github_app.GithubAppError("boom"),
    )
    await github_app.sync_installation(
        db_session,
        installation_id=55,
        account_login="acme",
        account_type="Organization",
    )
    await db_session.commit()

    # Кэш должен остаться нетронутым, а не обнулиться.
    assert await github_app.find_installation_for_repo(db_session, "acme/docs-en") == 55


async def test_repo_can_move_between_installations(db_session):
    await github_app.sync_installation(
        db_session,
        installation_id=100,
        account_login="acme",
        account_type="Organization",
        full_names=["acme/shared"],
    )
    # Та же репа появляется под другой установкой — не должно быть IntegrityError,
    # маппинг переезжает на новую установку.
    await github_app.sync_installation(
        db_session,
        installation_id=200,
        account_login="acme2",
        account_type="Organization",
        full_names=["acme/shared"],
    )
    await db_session.commit()

    assert await github_app.find_installation_for_repo(db_session, "acme/shared") == 200


async def test_replace_installation_repos_is_idempotent(db_session):
    await github_app.sync_installation(
        db_session,
        installation_id=11,
        account_login="acme",
        account_type="Organization",
        full_names=["acme/a", "acme/b"],
    )
    # Повторная синхронизация с другим списком полностью заменяет кэш.
    await github_app.sync_installation(
        db_session,
        installation_id=11,
        account_login="acme",
        account_type="Organization",
        full_names=["acme/b", "acme/c"],
    )
    await db_session.commit()

    assert await github_app.find_installation_for_repo(db_session, "acme/a") is None
    assert await github_app.find_installation_for_repo(db_session, "acme/c") == 11
