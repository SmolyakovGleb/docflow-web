"""GitHub App: подпись App-JWT и минт короткоживущих installation-токенов.

Сосуществует со старым OAuth App (dual-mode). Доступ к репам в режиме App идёт
не под пользовательским OAuth-токеном, а под installation-токеном (TTL ~1 час),
который минтится из RS256-JWT, подписанного приватным ключом App.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import Iterable

import httpx
from jose import jwt
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.github_installation import GithubInstallation, GithubInstallationRepo

logger = logging.getLogger(__name__)

GITHUB_API_BASE_URL = "https://api.github.com"
_APP_JWT_TTL_SECONDS = 540  # 9 минут (< лимита GitHub в 10 мин)
_INSTALLATION_TOKEN_MARGIN_SECONDS = 60  # обновить чуть раньше реального истечения

# Кэш installation-токенов: installation_id -> (token, expires_at_epoch)
_token_cache: dict[int, tuple[str, float]] = {}
_token_locks: dict[int, asyncio.Lock] = {}


class GithubAppError(Exception):
    """App не сконфигурирован или GitHub вернул ошибку при минте токена."""


def _require_app_settings() -> tuple[str, str]:
    settings = get_settings()
    if not settings.github_app_enabled:
        raise GithubAppError("GitHub App is not configured")
    assert settings.github_app_id is not None
    assert settings.github_app_private_key is not None
    return settings.github_app_id, settings.github_app_private_key


def generate_app_jwt() -> str:
    """RS256-JWT для аутентификации как сам App (не как installation)."""
    app_id, private_key = _require_app_settings()
    now = int(time.time())
    claims = {
        # iat на минуту назад — страховка от рассинхрона часов с GitHub.
        "iat": now - 60,
        "exp": now + _APP_JWT_TTL_SECONDS,
        "iss": app_id,
    }
    return jwt.encode(claims, private_key, algorithm="RS256")


def _app_headers() -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {generate_app_jwt()}",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def get_installation_token(installation_id: int) -> str:
    """Вернуть installation-токен (из кэша или свежий)."""
    cached = _token_cache.get(installation_id)
    now = time.time()
    if cached is not None and cached[1] - _INSTALLATION_TOKEN_MARGIN_SECONDS > now:
        return cached[0]

    lock = _token_locks.setdefault(installation_id, asyncio.Lock())
    async with lock:
        # Перепроверка: пока ждали лок, другой корутин мог уже обновить токен.
        cached = _token_cache.get(installation_id)
        now = time.time()
        if cached is not None and cached[1] - _INSTALLATION_TOKEN_MARGIN_SECONDS > now:
            return cached[0]

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{GITHUB_API_BASE_URL}/app/installations/{installation_id}/access_tokens",
                    headers=_app_headers(),
                )
        except httpx.HTTPError as exc:
            raise GithubAppError("Failed to mint installation token") from exc

        if response.status_code >= 400:
            detail = "Failed to mint installation token"
            try:
                payload = response.json()
                if isinstance(payload, dict) and payload.get("message"):
                    detail = str(payload["message"])
            except ValueError:
                pass
            raise GithubAppError(detail)

        payload = response.json()
        token = payload.get("token")
        if not token:
            raise GithubAppError("GitHub returned an invalid installation token payload")

        # expires_at в ISO; на крайний случай — окно в 1 час от текущего момента.
        expires_at_epoch = time.time() + 3600
        expires_raw = payload.get("expires_at")
        if isinstance(expires_raw, str):
            try:
                from datetime import datetime

                expires_at_epoch = datetime.fromisoformat(
                    expires_raw.replace("Z", "+00:00")
                ).timestamp()
            except ValueError:
                pass

        _token_cache[installation_id] = (str(token), expires_at_epoch)
        return str(token)


def invalidate_installation_token(installation_id: int) -> None:
    _token_cache.pop(installation_id, None)


async def find_installation_for_repo(
    session: AsyncSession, full_name: str
) -> int | None:
    """installation_id, покрывающий данный `owner/repo`, либо None."""
    row = await session.execute(
        select(GithubInstallation.installation_id)
        .join(
            GithubInstallationRepo,
            GithubInstallationRepo.installation_pk == GithubInstallation.id,
        )
        .where(
            GithubInstallationRepo.full_name == full_name,
            GithubInstallation.suspended_at.is_(None),
        )
    )
    return row.scalar_one_or_none()


async def installation_token_for_repo(
    session: AsyncSession, full_name: str
) -> str | None:
    """installation-токен для работы с репой, либо None если репа не покрыта App."""
    installation_id = await find_installation_for_repo(session, full_name)
    if installation_id is None:
        return None
    return await get_installation_token(installation_id)


async def repos_visible_to(
    session: AsyncSession, user_id: uuid.UUID, team_id: uuid.UUID | None
) -> list[str]:
    """Репозитории установок, привязанных к пользователю или его команде.

    Скоупинг: установка видна, если её инициировал этот пользователь
    (`created_by_user_id`) или она привязана к его команде (`team_id`).
    Непривязанные установки (created_by/team = NULL) не видны никому.
    """
    visibility = GithubInstallation.created_by_user_id == user_id
    if team_id is not None:
        visibility = visibility | (GithubInstallation.team_id == team_id)

    rows = await session.scalars(
        select(GithubInstallationRepo.full_name)
        .join(
            GithubInstallation,
            GithubInstallation.id == GithubInstallationRepo.installation_pk,
        )
        .where(GithubInstallation.suspended_at.is_(None), visibility)
        .order_by(GithubInstallationRepo.full_name)
    )
    return list(dict.fromkeys(rows.all()))


async def upsert_installation(
    session: AsyncSession,
    *,
    installation_id: int,
    account_login: str | None,
    account_type: str | None,
    suspended: bool = False,
    created_by_user_id: uuid.UUID | None = None,
    team_id: uuid.UUID | None = None,
) -> GithubInstallation:
    from datetime import datetime, timezone

    suspended_at = datetime.now(timezone.utc) if suspended else None

    # Атомарный upsert: при установке GitHub шлёт `installation`-вебхук на
    # /webhook/github/app ОДНОВРЕМЕННО с редиректом браузера на /setup — оба
    # вызывают upsert по одному installation_id. SELECT-then-INSERT тут гонится и
    # падает на UNIQUE(installation_id). ON CONFLICT решает гонку атомарно.
    # COALESCE: привязку к юзеру/команде не затираем NULL'ом из вебхука.
    stmt = pg_insert(GithubInstallation).values(
        installation_id=installation_id,
        account_login=account_login,
        account_type=account_type,
        suspended_at=suspended_at,
        created_by_user_id=created_by_user_id,
        team_id=team_id,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["installation_id"],
        set_={
            "account_login": stmt.excluded.account_login,
            "account_type": stmt.excluded.account_type,
            "suspended_at": stmt.excluded.suspended_at,
            "updated_at": func.now(),
            "created_by_user_id": func.coalesce(
                stmt.excluded.created_by_user_id,
                GithubInstallation.created_by_user_id,
            ),
            "team_id": func.coalesce(
                stmt.excluded.team_id, GithubInstallation.team_id
            ),
        },
    )
    await session.execute(stmt)
    await session.flush()

    installation = await session.scalar(
        select(GithubInstallation).where(
            GithubInstallation.installation_id == installation_id
        )
    )
    assert installation is not None
    return installation


async def replace_installation_repos(
    session: AsyncSession,
    installation: GithubInstallation,
    full_names: Iterable[str],
) -> None:
    """Полностью заменить кэш репозиториев установки на переданный список."""
    names = list(dict.fromkeys(full_names))
    # Сначала чистим записи этой установки.
    await session.execute(
        delete(GithubInstallationRepo).where(
            GithubInstallationRepo.installation_pk == installation.id
        )
    )
    # И записи с теми же full_name под ДРУГИМИ установками (репа могла «переехать»),
    # иначе глобальный UNIQUE(full_name) даст IntegrityError при вставке.
    if names:
        await session.execute(
            delete(GithubInstallationRepo).where(
                GithubInstallationRepo.full_name.in_(names)
            )
        )
    for full_name in names:
        session.add(
            GithubInstallationRepo(installation_pk=installation.id, full_name=full_name)
        )
    await session.flush()


async def fetch_installation_repos(installation_id: int) -> list[str]:
    """Список репозиториев установки напрямую у GitHub (через installation-токен)."""
    # Локальный импорт, чтобы не тянуть GitHubClient на уровень модуля.
    from app.services.github import GitHubClient

    token = await get_installation_token(installation_id)
    return await GitHubClient(token).list_installation_repos()


async def sync_installation(
    session: AsyncSession,
    *,
    installation_id: int,
    account_login: str | None,
    account_type: str | None,
    suspended: bool = False,
    full_names: Iterable[str] | None = None,
    created_by_user_id: uuid.UUID | None = None,
    team_id: uuid.UUID | None = None,
) -> GithubInstallation:
    """Upsert установки + обновление кэша её репозиториев.

    Если `full_names` не передан — подтянуть актуальный список у GitHub.
    """
    installation = await upsert_installation(
        session,
        installation_id=installation_id,
        account_login=account_login,
        account_type=account_type,
        suspended=suspended,
        created_by_user_id=created_by_user_id,
        team_id=team_id,
    )
    if full_names is None:
        try:
            full_names = await fetch_installation_repos(installation_id)
        except GithubAppError:
            # Транзиентная ошибка GitHub НЕ должна затирать кэш репозиториев
            # (иначе все покрытые проекты молча выпадут из App-режима). Оставляем
            # существующий список как есть — обновим на следующем успешном событии.
            logger.exception(
                "installation_repo_fetch_failed",
                extra={"installation_id": installation_id},
            )
            return installation
    await replace_installation_repos(session, installation, full_names)
    return installation
