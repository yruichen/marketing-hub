FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev

COPY . .

EXPOSE 8000

CMD ["uv", "run", "gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "4", "--timeout", "120", "--graceful-timeout", "30", "--max-requests", "1000", "--max-requests-jitter", "100"]
