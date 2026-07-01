from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "DocFlow Web Backend"
    debug: bool = False
    database_url: str = Field(alias="DATABASE_URL")
    session_secret: str = Field(alias="SESSION_SECRET")
    encryption_key: str = Field(alias="ENCRYPTION_KEY")

    postgres_user: str = Field(alias="POSTGRES_USER")
    postgres_password: str = Field(alias="POSTGRES_PASSWORD")
    postgres_db: str = Field(alias="POSTGRES_DB")

    github_client_id: str | None = Field(default=None, alias="GITHUB_CLIENT_ID")
    github_client_secret: str | None = Field(default=None, alias="GITHUB_CLIENT_SECRET")
    frontend_base_url: str = Field(default="http://localhost:3000", alias="FRONTEND_BASE_URL")

    api_key: str | None = Field(default=None, alias="API_KEY")
    base_url: str | None = Field(default=None, alias="BASE_URL")
    model: str | None = Field(default=None, alias="MODEL")
    app_base_url: str = Field(default="http://localhost:8080", alias="APP_BASE_URL")

    # Файлы крупнее лимита не переводятся (защита от дорогих/ненадёжных прогонов и
    # переполнения контекста LLM): задача не создаётся, файл попадает в skipped.
    max_file_chars: int = Field(default=30_000, alias="MAX_FILE_CHARS")
    # Секрет для catch-up-эндпоинта (внешний триггер добирает пропущенные вебхуки,
    # напр. потерянные на холодном старте спящей VM). Не задан → эндпоинт выключен.
    catchup_secret: str | None = Field(default=None, alias="CATCHUP_SECRET")
    # Гард catch-up от лавины: если пропущено больше файлов (очень старый базовый sha
    # / переписанная история) — авто-добор НЕ делаем, нужен ручной full-sync.
    catchup_max_files: int = Field(default=200, alias="CATCHUP_MAX_FILES")

    # GitHub App (точечный доступ к выбранным репам через installation-токены).
    # Сосуществует со старым OAuth App (dual-mode) во время миграции.
    github_app_id: str | None = Field(default=None, alias="GITHUB_APP_ID")
    github_app_slug: str | None = Field(default=None, alias="GITHUB_APP_SLUG")
    github_app_private_key: str | None = Field(default=None, alias="GITHUB_APP_PRIVATE_KEY")
    github_app_webhook_secret: str | None = Field(default=None, alias="GITHUB_APP_WEBHOOK_SECRET")

    @field_validator("github_app_private_key", mode="before")
    @classmethod
    def normalize_private_key(cls, v: str | None) -> str | None:
        # В .env PEM обычно хранят одной строкой с литеральными \n — разворачиваем
        # обратно в настоящие переводы строк, чтобы jose принял ключ.
        if isinstance(v, str) and "\\n" in v and "-----BEGIN" in v:
            return v.replace("\\n", "\n")
        return v

    @property
    def github_app_enabled(self) -> bool:
        return bool(self.github_app_id and self.github_app_private_key)

    @field_validator("debug", mode="before")
    @classmethod
    def validate_debug(cls, v: bool | str) -> bool:
        if isinstance(v, bool):
            return v

        normalized = str(v).strip().lower()
        true_values = {"1", "true", "yes", "on", "debug", "dev", "development", "local"}
        false_values = {"0", "false", "no", "off", "release", "prod", "production"}

        if normalized in true_values:
            return True
        if normalized in false_values:
            return False

        raise ValueError("DEBUG must be a boolean or one of: dev/debug/release/prod")

    @field_validator("session_secret")
    @classmethod
    def validate_session_secret(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SESSION_SECRET must be at least 32 characters long")
        return v

    @field_validator("encryption_key")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        # Должен быть валидным Fernet-ключом (urlsafe base64, 32 байта).
        # Сгенерировать: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
        from cryptography.fernet import Fernet

        try:
            Fernet(v.encode("utf-8"))
        except (ValueError, TypeError) as exc:
            raise ValueError(
                "ENCRYPTION_KEY must be a valid Fernet key "
                "(urlsafe base64, 32 bytes). Generate with Fernet.generate_key()."
            ) from exc
        return v

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url.startswith("postgresql+asyncpg://"):
            return self.database_url
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self.database_url

    @property
    def github_callback_url(self) -> str:
        return f"{self.frontend_base_url.rstrip('/')}/auth/github/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()
