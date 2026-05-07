import os
import secrets

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

os.environ["DEBUG"] = "true"

from app.db.base import Base
from app.db.session import get_db_session
from app.main import app

TEST_DATABASE_URL = os.getenv(
    "DATABASE_TEST_URL",
    "postgresql+asyncpg://docflow:docflow_secret@localhost:5433/docflow_test",
)


@pytest.fixture(scope="session")
async def engine():
    """Создаёт все таблицы один раз на сессию, удаляет после всех тестов."""
    engine = create_async_engine(TEST_DATABASE_URL, pool_pre_ping=True, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session(engine):
    """Отдельная сессия на каждый тест. После теста очищает все таблицы."""
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()
        # Очистить данные после теста, сохранив схему
        if Base.metadata.sorted_tables:
            table_names = ", ".join(t.name for t in Base.metadata.sorted_tables)
            await session.execute(text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"))
            await session.commit()


@pytest.fixture
async def client(db_session: AsyncSession):
    """HTTP-клиент с подменённой БД-сессией. Не аутентифицирован."""
    async def override_get_db():
        yield db_session

    limiter = getattr(app.state, "limiter", None)
    storage = getattr(limiter, "_storage", None)
    if storage is not None and hasattr(storage, "reset"):
        storage.reset()

    app.dependency_overrides[get_db_session] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(db_session: AsyncSession):
    """Создаёт тестового пользователя в БД. Доступен после Этапа 1+3."""
    from app.models.user import User
    from app.services.auth import hash_password

    user = User(
        email="test@example.com",
        password_hash=hash_password("testpassword"),
        display_name="Test User",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def auth_client(client: AsyncClient, test_user):
    """HTTP-клиент с активной сессией (JWT cookie). Доступен после Этапа 3."""
    response = await client.post("/auth/login", json={
        "email": "test@example.com",
        "password": "testpassword",
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return client


@pytest.fixture
async def test_project(db_session: AsyncSession, test_user):
    """Создаёт тестовый проект. Доступен после Этапа 1+5."""
    from app.models.project import Project

    project = Project(
        user_id=test_user.id,
        name="Test Project",
        source_repo="test-org/source-repo",
        source_branch="main",
        target_repo="test-org/target-repo",
        target_branch="main",
        webhook_secret=secrets.token_hex(32),
    )
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    return project
