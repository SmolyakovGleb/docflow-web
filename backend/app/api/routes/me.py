from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db_session
from app.models.user import User
from app.services import github_app
from app.services.auth import decrypt_github_access_token, get_current_user
from app.services.github import GitHubClient
from app.services.projects import _get_user_team_id, ensure_github_linked

router = APIRouter(prefix="/me", tags=["auth"])
CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[AsyncSession, Depends(get_db_session)]


@router.get(
    "/github-repos",
    response_model=list[str],
    summary="GitHub repositories of current user",
    description=(
        "Возвращает список доступных GitHub-репозиториев в формате `owner/repo`.\n\n"
        "При настроенном GitHub App — репы установок, привязанных к пользователю "
        "или его команде (кэш `/installation/repositories` в БД). Иначе fallback на "
        "репы привязанного OAuth-аккаунта."
    ),
    responses={
        200: {"description": "Список репозиториев"},
        400: {"description": "Нет ни установки App, ни привязанного GitHub-аккаунта"},
        401: {"description": "Not authenticated"},
    },
)
async def get_github_repos(current_user: CurrentUser, session: DbSession) -> list[str]:
    settings = get_settings()

    if settings.github_app_enabled:
        team_id = await _get_user_team_id(session, current_user.id)
        repos = await github_app.repos_visible_to(session, current_user.id, team_id)
        if repos:
            return repos

    # Fallback: репы привязанного OAuth-аккаунта (legacy / пока App не установлен).
    ensure_github_linked(current_user)
    assert current_user.github_access_token is not None
    github_client = GitHubClient(decrypt_github_access_token(current_user.github_access_token))
    return await github_client.get_user_repos()
