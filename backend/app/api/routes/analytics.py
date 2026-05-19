from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.project import Project
from app.models.task import Task
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.analytics import AnalyticsResponse, TasksPerDayBucket, TopErrorStat
from app.services.auth import get_current_user
from app.services.history_analytics import (
    apply_source_repo_filter,
    extract_error_type,
    get_visible_project_or_404,
    get_visible_source_repos,
)

router = APIRouter(tags=["analytics"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
ALL_TASK_STATUSES = ("queued", "running", "done", "failed", "published", "conflict")


@router.get(
    "/analytics",
    response_model=AnalyticsResponse,
    summary="Аналитика задач",
    description=(
        "Агрегированная статистика по задачам перевода: успешность, среднее время, "
        "распределение по статусам, динамика по дням, топ ошибок.\n\n"
        "Видимость по той же логике, что и `/history`: задачи проектов с совпадающим `source_repo`. "
        "Фильтры: `project_id`, диапазон дат (`from`/`to`)."
    ),
    responses={
        200: {"description": "Агрегированная статистика"},
        404: {"description": "Указанный `project_id` не входит в видимые проекты"},
    },
)
async def get_analytics(
    session: DbSession,
    current_user: CurrentUser,
    project_id: UUID | None = None,
    team_id: UUID | None = None,
    date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
) -> AnalyticsResponse:
    visible_source_repos = await get_visible_source_repos(session, current_user)

    if project_id is not None:
        project = await get_visible_project_or_404(session, project_id, visible_source_repos)
        project_id = project.id

    if team_id is not None:
        member_exists = await session.scalar(
            select(TeamMember.id).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == current_user.id,
            )
        )
        team = await session.get(Team, team_id)
        is_owner = team is not None and team.owner_id == current_user.id
        if not member_exists and not is_owner:
            raise HTTPException(status_code=403, detail="Not a team member")

    def _q(*cols):
        q = select(*cols).join(Project, Task.project_id == Project.id)
        if team_id is not None:
            q = q.where(Project.team_id == team_id)
        else:
            q = apply_source_repo_filter(q, visible_source_repos)
        if project_id is not None:
            q = q.where(Task.project_id == project_id)
        if date_from is not None:
            q = q.where(Task.created_at >= date_from)
        if date_to is not None:
            q = q.where(Task.created_at <= date_to)
        return q

    # tasks_by_status via GROUP BY
    status_rows = (await session.execute(
        _q(Task.status, func.count().label("cnt")).group_by(Task.status)
    )).all()
    tasks_by_status = {s: 0 for s in ALL_TASK_STATUSES}
    for row_status, cnt in status_rows:
        tasks_by_status[row_status] = cnt
    total_tasks = sum(tasks_by_status.values())
    published_count = tasks_by_status["published"]

    successful = tasks_by_status["done"] + tasks_by_status["published"]
    terminal = successful + tasks_by_status["failed"]
    success_rate = successful / terminal if terminal else 0.0

    # avg_duration via SQL AVG(EXTRACT(EPOCH FROM completed_at - created_at))
    avg_row = await session.scalar(
        _q(func.avg(func.extract("epoch", Task.completed_at - Task.created_at)))
        .where(Task.completed_at.is_not(None))
    )
    avg_duration_seconds = float(avg_row or 0.0)

    # tasks_per_day via GROUP BY DATE(created_at), Task.status
    day_col = func.date(Task.created_at).label("day")
    per_day_rows = (await session.execute(
        _q(day_col, Task.status, func.count().label("cnt"))
        .group_by(day_col, Task.status)
        .order_by(day_col, Task.status)
    )).all()
    per_day_map: dict[str, dict[str, int]] = {}
    for day, status, cnt in per_day_rows:
        key = str(day)
        bucket = per_day_map.setdefault(key, {task_status: 0 for task_status in ALL_TASK_STATUSES})
        bucket[status] = cnt
    tasks_per_day = [
        TasksPerDayBucket(date=day, **bucket) for day, bucket in per_day_map.items()
    ]

    # top_errors: only error texts fetched, parsing in Python
    error_texts = (await session.scalars(
        _q(Task.error).where(Task.error.is_not(None))
    )).all()
    error_counter: Counter[str] = Counter(extract_error_type(e) for e in error_texts)
    top_errors = [
        TopErrorStat(error_type=et, count=cnt)
        for et, cnt in sorted(error_counter.items(), key=lambda item: (-item[1], item[0]))
    ]

    return AnalyticsResponse(
        total_tasks=total_tasks,
        published_count=published_count,
        success_rate=success_rate,
        avg_duration_seconds=avg_duration_seconds,
        tasks_by_status=tasks_by_status,
        tasks_per_day=tasks_per_day,
        top_errors=top_errors,
    )
