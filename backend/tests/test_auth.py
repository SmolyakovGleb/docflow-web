from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession


async def test_register_success(client):
    response = await client.post(
        "/auth/register",
        json={
            "email": "new@example.com",
            "password": "strongpassword",
            "display_name": "New User",
        },
    )

    assert response.status_code == 201
    assert response.json()["email"] == "new@example.com"
    assert "password_hash" not in response.json()
    assert "session" in response.cookies


async def test_register_duplicate_email(client, test_user):
    response = await client.post(
        "/auth/register",
        json={
            "email": test_user.email,
            "password": "strongpassword",
            "display_name": "Another User",
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Email already registered"}


async def test_login_success(client, test_user):
    response = await client.post(
        "/auth/login",
        json={
            "email": "test@example.com",
            "password": "testpassword",
        },
    )

    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"
    assert "session" in response.cookies


async def test_login_wrong_password(client, test_user):
    response = await client.post(
        "/auth/login",
        json={
            "email": "test@example.com",
            "password": "wrongpassword",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}


async def test_login_nonexistent_email(client):
    # Путь через DUMMY_PASSWORD_HASH — должен вернуть тот же 401, что и неверный пароль.
    response = await client.post(
        "/auth/login",
        json={
            "email": "nobody@example.com",
            "password": "anypassword",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}


async def test_login_updates_last_login_at(client, db_session: AsyncSession, test_user):
    initial_last_login_at = test_user.last_login_at

    await client.post(
        "/auth/login",
        json={"email": "test@example.com", "password": "testpassword"},
    )

    await db_session.refresh(test_user)
    assert test_user.last_login_at >= initial_last_login_at


async def test_me_authenticated(auth_client, test_user):
    response = await auth_client.get("/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == test_user.email
    assert "password_hash" not in response.json()


async def test_me_unauthenticated(client):
    response = await client.get("/auth/me")

    assert response.status_code == 401


async def test_logout_clears_cookie(auth_client):
    logout_response = await auth_client.post("/auth/logout")

    assert logout_response.status_code == 200

    me_response = await auth_client.get("/auth/me")
    assert me_response.status_code == 401


async def test_change_password_success(auth_client, client, test_user):
    response = await auth_client.post(
        "/auth/change-password",
        json={
            "current_password": "testpassword",
            "new_password": "newstrongpassword",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}

    login_response = await client.post(
        "/auth/login",
        json={
            "email": test_user.email,
            "password": "newstrongpassword",
        },
    )
    assert login_response.status_code == 200


async def test_change_password_does_not_update_last_login_at(auth_client, db_session, test_user):
    initial_last_login_at = test_user.last_login_at

    response = await auth_client.post(
        "/auth/change-password",
        json={
            "current_password": "testpassword",
            "new_password": "newstrongpassword",
        },
    )

    assert response.status_code == 200

    await db_session.refresh(test_user)
    assert test_user.last_login_at == initial_last_login_at


async def test_change_password_unauthenticated(client):
    response = await client.post(
        "/auth/change-password",
        json={"current_password": "testpassword", "new_password": "newpassword"},
    )

    assert response.status_code == 401


async def test_change_password_wrong_current_password(auth_client):
    response = await auth_client.post(
        "/auth/change-password",
        json={
            "current_password": "wrongpassword",
            "new_password": "newstrongpassword",
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Current password is incorrect"}


async def test_logout_invalidates_old_token(auth_client, client, test_user):
    cookies_before_logout = dict(auth_client.cookies)
    await auth_client.post("/auth/logout")

    response = await client.get("/auth/me", cookies=cookies_before_logout)
    assert response.status_code == 401


async def test_change_password_invalidates_old_token(auth_client, client, test_user):
    old_cookies = dict(auth_client.cookies)
    response = await auth_client.post(
        "/auth/change-password",
        json={
            "current_password": "testpassword",
            "new_password": "newstrongpassword",
        },
    )
    assert response.status_code == 200

    response = await client.get("/auth/me", cookies=old_cookies)
    assert response.status_code == 401


async def test_rate_limit_login(client, test_user):
    last_response = None

    for _ in range(11):
        last_response = await client.post(
            "/auth/login",
            json={
                "email": "test@example.com",
                "password": "wrongpassword",
            },
        )

    assert last_response is not None
    assert last_response.status_code == 429


async def test_rate_limit_register(client):
    last_response = None

    for index in range(11):
        last_response = await client.post(
            "/auth/register",
            json={
                "email": f"user-{index}@example.com",
                "password": "strongpassword",
                "display_name": "Rate Limited User",
            },
        )

    assert last_response is not None
    assert last_response.status_code == 429
