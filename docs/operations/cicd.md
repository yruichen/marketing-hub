# CI/CD

Marketing Hub 使用 GitHub Actions 做持续集成（CI）与持续部署（CD）。

## 工作流概览

| 工作流 | 文件 | 触发条件 | 作用 |
|--------|------|----------|------|
| CI | `.github/workflows/ci.yml` | `main` 分支 push / PR | 测试、Lint、构建、Docker 镜像验证 |
| CD | `.github/workflows/cd.yml` | CI 在 `main` 上成功后 / 手动触发 | SSH 部署到生产服务器 |

```mermaid
flowchart LR
  PR[Pull Request] --> CI
  Push[Push to main] --> CI
  CI -->|全部通过| CD
  CD --> Checkout[Actions checkout]
  Checkout --> Rsync[rsync 同步到服务器]
  Rsync --> Deploy[scripts/deploy.sh]
  Deploy --> Compose[docker compose prod]
```

## CI 门禁

CI 包含以下 Job，全部通过才允许合并 / 触发 CD：

1. **Secrets Guard** — 禁止提交 `.env` 等敏感文件
2. **Backend CI** — `uv sync`、`manage.py check`、`check --deploy`、migration drift、单元测试
3. **Frontend CI** — `npm ci`、lint、vitest、production build
4. **Docker Build** — 构建 backend 与 frontend（prod target）镜像，确保 Dockerfile 可用

## CD 部署流程

CD 在 CI 成功且事件为 `main` 分支 push 后自动运行，也可在 Actions 页面手动 **Run workflow**。

部署采用 **方案 B：Actions 传代码**，服务器**不需要** git 仓库，也**不需要** GitHub Deploy key 或私钥：

1. GitHub Actions checkout 代码（使用 `GITHUB_TOKEN`）
2. rsync 同步到服务器（保留服务器上的 `backend/.env` 和根目录 `.env`）
3. SSH 执行 `scripts/deploy.sh`

服务器上 `scripts/deploy.sh` 的步骤：

1. `docker compose -f docker-compose.yml -f docker-compose.prod.yml build`
2. `migrate --noinput`
3. `up -d --remove-orphans`
4. 清理悬空镜像

## 首次服务器配置

### 1. 安装依赖

```bash
# Ubuntu/Debian 示例
sudo apt update
sudo apt install -y git docker.io docker-compose-plugin
sudo usermod -aG docker $USER
```

### 2. 创建部署目录

```bash
mkdir -p /root/marketing-hub
cd /root/marketing-hub
```

首次部署由 CD 自动 rsync 代码；也可手动上传或解压代码到该目录。

### 3. 配置生产环境变量

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env：生产密钥、POSTGRES_*、DJANGO_ALLOWED_HOSTS、CSRF_TRUSTED_ORIGINS 等
```

在项目根目录创建 `.env`（供 docker compose 读取）：

```bash
cat > .env <<'EOF'
VITE_API_BASE_URL=https://your-domain.com/api
FRONTEND_PORT=80
EOF
```

### 4. 首次手动部署

```bash
bash scripts/deploy.sh
```

## GitHub Secrets 配置

在仓库 **Settings → Secrets and variables → Actions** 中添加：

| Secret | 说明 | 示例 |
|--------|------|------|
| `DEPLOY_HOST` | 服务器 IP 或域名 | `117.72.16.215` |
| `DEPLOY_USER` | SSH 用户名 | `ubuntu` |
| `DEPLOY_SSH_KEY` | 私钥（用于 Actions SSH 登录服务器） | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `DEPLOY_PATH` | 服务器上的项目目录 | `/root/marketing-hub` |
| `DEPLOY_PORT` | SSH 端口（可选） | `22` |

### GitHub Environment（推荐）

在 **Settings → Environments** 创建 `production` 环境，将上述 Secrets 绑定到该环境，并可开启 **Required reviewers** 实现部署审批。

CD workflow 已声明 `environment: production`，Secrets 也可放在 Environment 级别。

## 本地开发 vs 生产

| 场景 | 命令 |
|------|------|
| 本地开发（热更新） | `docker compose up` |
| 生产部署 | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |

- 本地 `frontend` 使用 Dockerfile `dev` target（Vite dev server，端口 5173）
- 生产 `frontend` 使用 `prod` target（Nginx 静态资源，端口 80）

## 分支保护建议

在 **Settings → Branches → Branch protection rules** 为 `main` 启用：

- Require a pull request before merging
- Require status checks to pass：`Backend CI`、`Frontend CI`、`Docker Build`、`Secrets Guard`
- Require branches to be up to date before merging

## 回滚

在 GitHub Actions 中重新运行目标 commit 对应的 CD workflow，或在本地 checkout 目标版本后手动 rsync 并执行 `bash scripts/deploy.sh`。

数据库 migration 已执行时，回滚代码后需自行评估是否需要 reverse migration。

## 故障排查

```bash
# 查看容器状态
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend worker frontend

# 手动迁移
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm backend uv run python manage.py migrate --noinput
```
