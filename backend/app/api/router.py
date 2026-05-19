from fastapi import APIRouter

from app.api.routes.admin import router as admin_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.auth import router as auth_router
from app.api.routes.dictionaries import router as dictionaries_router
from app.api.routes.health import router as health_router
from app.api.routes.history import router as history_router
from app.api.routes.me import router as me_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.projects import router as projects_router
from app.api.routes.tasks import router as tasks_router
from app.api.routes.teams import router as teams_router
from app.api.routes.webhook import router as webhook_router

api_router = APIRouter()
api_router.include_router(admin_router)
api_router.include_router(analytics_router)
api_router.include_router(auth_router)
api_router.include_router(dictionaries_router)
api_router.include_router(health_router)
api_router.include_router(history_router)
api_router.include_router(me_router)
api_router.include_router(notifications_router)
api_router.include_router(projects_router)
api_router.include_router(tasks_router)
api_router.include_router(teams_router)
api_router.include_router(webhook_router)
