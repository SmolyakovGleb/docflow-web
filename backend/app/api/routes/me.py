from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.models.user import User
from app.services.auth import decrypt_github_access_token, get_current_user
from app.services.github import GitHubClient
from app.services.projects import ensure_github_linked

router = APIRouter(prefix="/me", tags=["auth"])
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get(
    "/github-repos",
    response_model=list[str],
    summary="GitHub repositories of current user",
    description=(
        "Возвращает список доступных GitHub-репозиториев текущего пользователя "
        "в формате `owner/repo`. Требует привязанный GitHub-аккаунт."
    ),
    responses={
        200: {"description": "Список репозиториев текущего пользователя"},
        400: {"description": "GitHub account is not linked"},
        401: {"description": "Not authenticated"},
    },
)
async def get_github_repos(current_user: CurrentUser) -> list[str]:
    ensure_github_linked(current_user)
    assert current_user.github_access_token is not None

    github_client = GitHubClient(decrypt_github_access_token(current_user.github_access_token))
    return await github_client.get_user_repos()
