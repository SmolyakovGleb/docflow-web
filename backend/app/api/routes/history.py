from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db_session
from app.models.publication import Publication
from app.models.task import Task
from app.models.user import User
from app.schemas.publication import (
    HistoryPublicationRead,
    HistoryPublisherOptionRead,
    HistoryResponse,
)
from app.services.auth import get_current_user
from app.services.history_analytics import (
    apply_history_filters,
    get_visible_project_or_404,
    get_visible_source_repos,
    list_history_publishers,
)

router = APIRouter(tags=["history"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get(
    "/history",
    response_model=HistoryResponse,
    summary="История публикаций",
    description=(
        "Лента публикаций по всем проектам, у которых `source_repo` совпадает с проектами "
        "текущего пользователя. Это позволяет команде, работающей над одним репозиторием, "
        "видеть общую историю без явного шаринга проектов.\n\n"
        "Фильтры: `project_id`, `published_by`, диапазон дат (`from`/`to`). "
        "Сортировка по `published_at DESC`."
    ),
    responses={
        200: {"description": "История публикаций"},
        404: {"description": "Указанный `project_id` не входит в видимые проекты"},
    },
)
async def get_history(
    session: DbSession,
    current_user: CurrentUser,
    project_id: UUID | None = None,
    published_by: UUID | None = None,
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> HistoryResponse:
    visible_source_repos = await get_visible_source_repos(session, current_user)

    if project_id is not None:
        project = await get_visible_project_or_404(session, project_id, visible_source_repos)
        project_id = project.id

    items_query = apply_history_filters(
        select(Publication),
        visible_source_repos=visible_source_repos,
        project_id=project_id,
        published_by=published_by,
        date_from=date_from,
        date_to=date_to,
    ).options(
        selectinload(Publication.publisher),
        selectinload(Publication.task).selectinload(Task.project),
    )
    items_query = items_query.order_by(Publication.published_at.desc()).limit(limit).offset(offset)

    count_query = apply_history_filters(
        select(func.count(Publication.id)),
        visible_source_repos=visible_source_repos,
        project_id=project_id,
        published_by=published_by,
        date_from=date_from,
        date_to=date_to,
    )

    publications = list((await session.scalars(items_query)).all())
    total = int((await session.scalar(count_query)) or 0)
    publishers = await list_history_publishers(
        session,
        visible_source_repos=visible_source_repos,
        project_id=project_id,
        date_from=date_from,
        date_to=date_to,
    )

    return HistoryResponse(
        items=[
            HistoryPublicationRead.model_validate(item).model_copy(
                update={
                    "can_open_task": item.task is not None and item.task.user_id == current_user.id,
                }
            )
            for item in publications
        ],
        publishers=[
            HistoryPublisherOptionRead(id=publisher_id, label=label)
            for publisher_id, label in publishers
        ],
        total=total,
        limit=limit,
        offset=offset,
    )
