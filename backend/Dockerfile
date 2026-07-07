FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

WORKDIR /app

# 国内构建：用 GitHub 镜像下载 uv 二进制，避免 pip 访问 files.pythonhosted.org 超时
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL --retry 5 --retry-delay 5 --connect-timeout 30 --max-time 600 \
       "https://ghfast.top/https://github.com/astral-sh/uv/releases/download/0.11.26/uv-x86_64-unknown-linux-gnu.tar.gz" \
       -o /tmp/uv.tar.gz \
    && tar -xzf /tmp/uv.tar.gz -C /usr/local/bin --strip-components=1 \
    && rm -f /tmp/uv.tar.gz \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev

COPY . .

EXPOSE 8000

CMD ["uv", "run", "gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "4", "--timeout", "120", "--graceful-timeout", "30", "--max-requests", "1000", "--max-requests-jitter", "100"]
