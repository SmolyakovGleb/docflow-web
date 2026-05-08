from __future__ import annotations

import uuid

import pytest
from freezegun import freeze_time
from jose.exceptions import ExpiredSignatureError

from app.services.auth import create_jwt, decode_jwt, hash_password, verify_password


def test_hash_password_not_plaintext():
    password = "secret-password"

    hashed = hash_password(password)

    assert hashed != password


def test_verify_password_correct():
    hashed = hash_password("secret-password")

    assert verify_password("secret-password", hashed) is True


def test_verify_password_wrong():
    hashed = hash_password("secret-password")

    assert verify_password("wrong-password", hashed) is False


def test_create_and_decode_jwt():
    user_id = uuid.uuid4()

    token = create_jwt(user_id, token_version=1)
    payload = decode_jwt(token)

    assert payload["sub"] == str(user_id)
    assert payload["tv"] == 1


def test_decode_expired_jwt():
    user_id = uuid.uuid4()

    with freeze_time("2026-01-01T00:00:00Z"):
        token = create_jwt(user_id, token_version=1)

    with freeze_time("2026-02-02T00:00:00Z"):
        with pytest.raises(ExpiredSignatureError):
            decode_jwt(token)
