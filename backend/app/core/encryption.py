from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet

from app.core.config import get_settings


@lru_cache
def _get_fernet() -> Fernet:
    # Отдельный ENCRYPTION_KEY (полноценный Fernet-ключ), НЕ производный от
    # session_secret: разделение назначений ключей. session_secret подписывает
    # JWT-сессии, ENCRYPTION_KEY шифрует GitHub-токены и webhook-секреты в БД.
    # Компрометация/ротация одного не затрагивает другое.
    settings = get_settings()
    return Fernet(settings.encryption_key.encode("utf-8"))


def encrypt_value(value: str) -> str:
    return _get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_value(value: str) -> str:
    return _get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
