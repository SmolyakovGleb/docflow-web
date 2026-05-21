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
