from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import get_settings
from app.core.encryption import decrypt_value, encrypt_value


def test_encrypt_decrypt_roundtrip() -> None:
    secret = "gho_some_github_access_token_value"
    assert decrypt_value(encrypt_value(secret)) == secret


def test_uses_dedicated_encryption_key_not_session_secret() -> None:
    """Шифрование должно идти на ENCRYPTION_KEY, а НЕ на ключе из session_secret."""
    settings = get_settings()
    token = encrypt_value("repo-token")

    # Расшифровка реальным ENCRYPTION_KEY работает
    real = Fernet(settings.encryption_key.encode("utf-8"))
    assert real.decrypt(token.encode("utf-8")).decode("utf-8") == "repo-token"

    # А старым способом (sha256 от session_secret) — уже НЕ читается:
    # ключи разведены, компрометация session_secret не вскрывает токены.
    legacy_key = base64.urlsafe_b64encode(
        hashlib.sha256(settings.session_secret.encode("utf-8")).digest()
    )
    try:
        legacy_ok = (
            Fernet(legacy_key).decrypt(token.encode("utf-8")).decode("utf-8") == "repo-token"
        )
    except Exception:
        legacy_ok = False
    assert legacy_ok is False


def test_encryption_key_is_valid_fernet() -> None:
    # config-валидатор обязан гарантировать корректный Fernet-ключ
    settings = get_settings()
    Fernet(settings.encryption_key.encode("utf-8"))  # не должно бросать
