from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session

router = APIRouter(tags=["health"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]


class HealthResponse(BaseModel):
    status: str


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Проверка работоспособности",
    description="Проверяет доступность сервиса и подключение к базе данных (`SELECT 1`).",
)
async def health_check(session: DbSession) -> HealthResponse:
    await session.execute(text("SELECT 1"))
    return HealthResponse(status="ok")
