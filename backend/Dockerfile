# Build context: repo root (не backend/) — нужен доступ к pipeline/ submodule.
# Требует: git submodule update --init перед docker compose build.
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/pipeline:/app/backend

COPY pipeline/ ./pipeline/

COPY backend/pyproject.toml ./backend/
COPY backend/app/ ./backend/app/
RUN pip install --no-cache-dir \
    "click>=8.3.1" \
    "mistune>=3.2.0" \
    "python-dotenv>=1.2.2" \
    "requests>=2.33.0" \
 && pip install --no-cache-dir -e ./backend/

COPY backend/migrations/ ./backend/migrations/
COPY backend/alembic.ini ./backend/
COPY backend/entrypoint.sh ./backend/entrypoint.sh
RUN chmod +x ./backend/entrypoint.sh

WORKDIR /app/backend

ENTRYPOINT ["./entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
