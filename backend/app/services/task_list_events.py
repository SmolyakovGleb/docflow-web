from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.models.task import Task

TASK_LIST_EVENT_SUBSCRIPTIONS: dict[UUID, "TaskListSubscription"] = {}
MAX_TASK_LIST_EVENT_SUBSCRIPTIONS = 500


@dataclass
class TaskListSubscription:
    id: UUID
    user_id: UUID
    team_id: UUID | None
    status: str | None
    project_id: UUID | None
    search: str | None
    queue: asyncio.Queue[dict[str, Any] | None] = field(default_factory=asyncio.Queue)


def format_sse_event(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def _evict_oldest_subscriptions_if_needed() -> None:
    while len(TASK_LIST_EVENT_SUBSCRIPTIONS) >= MAX_TASK_LIST_EVENT_SUBSCRIPTIONS:
        oldest_id = next(iter(TASK_LIST_EVENT_SUBSCRIPTIONS))
        close_subscription(oldest_id)


def register_subscription(
    *,
    user_id: UUID,
    team_id: UUID | None,
    status: str | None,
    project_id: UUID | None,
    search: str | None,
) -> TaskListSubscription:
    _evict_oldest_subscriptions_if_needed()
    subscription = TaskListSubscription(
        id=uuid.uuid4(),
        user_id=user_id,
        team_id=team_id,
        status=status,
        project_id=project_id,
        search=search.strip().lower() if search else None,
    )
    TASK_LIST_EVENT_SUBSCRIPTIONS[subscription.id] = subscription
    return subscription


def close_subscription(subscription_id: UUID) -> None:
    subscription = TASK_LIST_EVENT_SUBSCRIPTIONS.pop(subscription_id, None)
    if subscription is not None:
        subscription.queue.put_nowait(None)


def _task_matches_scope(
    task: Task,
    subscription: TaskListSubscription,
    *,
    status_override: str | None,
) -> bool:
    belongs_to_user = task.user_id == subscription.user_id
    belongs_to_team = (
        subscription.team_id is not None
        and task.team_id is not None
        and task.team_id == subscription.team_id
    )
    if not belongs_to_user and not belongs_to_team:
        return False

    if subscription.project_id is not None and task.project_id != subscription.project_id:
        return False

    effective_status = task.status if status_override is None else status_override
    if subscription.status is not None and effective_status != subscription.status:
        return False

    if not subscription.search:
        return True

    needle = subscription.search
    file_path = task.file_path.lower()
    commit_message = (task.commit_message or "").lower()
    return needle in file_path or needle in commit_message


def publish_task_status_changed(task: Any, *, previous_status: str) -> None:
    payload = {
        "task_id": str(task.id),
        "project_id": str(task.project_id) if task.project_id is not None else None,
        "status": task.status,
        "current_stage": task.current_stage,
    }
    for subscription in list(TASK_LIST_EVENT_SUBSCRIPTIONS.values()):
        belongs_to_user = task.user_id == subscription.user_id
        belongs_to_team = (
            subscription.team_id is not None
            and task.team_id is not None
            and task.team_id == subscription.team_id
        )
        if not belongs_to_user and not belongs_to_team:
            continue
        if subscription.project_id is not None and task.project_id != subscription.project_id:
            continue
        if subscription.status is not None:
            # Notify if task was OR is in this subscription's status scope
            if task.status != subscription.status and previous_status != subscription.status:
                continue
        if subscription.search:
            needle = subscription.search
            if (
                needle not in task.file_path.lower()
                and needle not in (task.commit_message or "").lower()
            ):
                continue
        subscription.queue.put_nowait({"event": "task_updated", "data": payload})


def publish_commit_group_event(commit_group: Any, *, event_type: str) -> None:
    payload = {
        "commit_group_id": str(commit_group.id),
        "project_id": str(commit_group.project_id),
        "github_sha": commit_group.github_sha,
        "files_count": len(commit_group.file_paths),
        "commit_message": commit_group.commit_message,
        "commit_author_name": commit_group.commit_author_name,
        "commit_author_login": commit_group.commit_author_login,
        "status": commit_group.status,
        "created_at": commit_group.created_at.isoformat(),
    }
    for subscription in list(TASK_LIST_EVENT_SUBSCRIPTIONS.values()):
        belongs_to_user = commit_group.user_id == subscription.user_id
        belongs_to_team = (
            subscription.team_id is not None
            and getattr(commit_group, "team_id", None) == subscription.team_id
        )
        if not belongs_to_user and not belongs_to_team:
            continue
        if (
            subscription.project_id is not None
            and commit_group.project_id != subscription.project_id
        ):
            continue
        subscription.queue.put_nowait({"event": event_type, "data": payload})


def publish_task_entered_scope(task: Task, *, previous_status: str | None = None) -> None:
    payload = {
        "task_id": str(task.id),
        "project_id": str(task.project_id) if task.project_id is not None else None,
        "status": task.status,
    }

    for subscription in list(TASK_LIST_EVENT_SUBSCRIPTIONS.values()):
        matches_now = _task_matches_scope(task, subscription, status_override=None)
        if not matches_now:
            continue

        matched_before = False
        if previous_status is not None:
            matched_before = _task_matches_scope(
                task,
                subscription,
                status_override=previous_status,
            )

        if matched_before:
            continue

        subscription.queue.put_nowait({"event": "task_entered", "data": payload})
