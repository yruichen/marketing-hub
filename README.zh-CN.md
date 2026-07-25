<a name="readme-top"></a>

<div align="center">
  <img src="./docs/images/brand-mark.svg" alt="Marketing Hub 品牌标志" width="96" height="96" />

  <h1>Marketing Hub</h1>

  <p><strong>把一个想法，变成可追踪、可编排、可治理的 AI 营销工作流。</strong></p>
  <p>面向营销策划、多模态内容生成、可视化工作流、项目资产与 AI 成本治理的一体化工作台。</p>

  <p>
    <a href="./README.md">English</a>
    ·
    <a href="#快速开始">快速开始</a>
    ·
    <a href="./docs/README.md">文档</a>
    ·
    <a href="./CONTRIBUTING.md">参与贡献</a>
  </p>
</div>

## 核心能力

- 从一句创意生成结构化品牌上下文和可运行的工作流草稿。
- 在可视化画布中编排文案、图片提示词、配图、分镜、配音、视频和审核节点。
- 用项目、文件夹、活动、收藏、资产、模板和品牌记忆沉淀营销成果。
- 追踪生成任务、Provider、模型、Token、成本、成功率和工作区健康度。
- 通过 AI Gateway 统一管理多 Provider、BYOK、模型策略、fallback、Prompt 版本和成本审计。

## 产品预览

| 灵感到营销链路 | 工作区健康度 |
| --- | --- |
| ![Marketing Hub 灵感工作台](./docs/images/main_window.png) | ![Marketing Hub 数据首页](./docs/images/dashboard.png) |

| 可视化工作流 | 项目资产 |
| --- | --- |
| ![Marketing Hub 工作流画布](./docs/images/workflow.png) | ![Marketing Hub 项目管理](./docs/images/project.png) |

## 项目特点

- **执行可追踪**：生成任务具有 queued、running、succeeded、failed 等持久化状态。
- **工作流可组合**：DAG 运行时校验节点输入输出、按拓扑顺序执行并支持失败重试。
- **模型供应商解耦**：业务功能统一经过 AI Gateway，不直接绑定某一家模型服务。
- **多租户协作**：组织、成员、RBAC、项目、活动与资产共享一致的工作区模型。
- **成本可治理**：Provider、模型、Token、fallback 和成本估算与生成记录关联。

## 技术架构

```text
React 19 + Vite + React Flow
              │
              │ Session Auth + REST API
              ▼
Django + DRF ── AI Gateway ── 模型 Provider
      │              │
      │              └── 策略、Prompt、Fallback、成本
      ├── PostgreSQL
      └── Celery + Redis
```

```text
marketing-hub/
  backend/        Django API、领域应用、工作流运行时、AI Gateway
  frontend/       React SPA、业务模块、可视化工作流
  docs/           产品、架构、运维和规划文档
```

## 快速开始

### Docker Compose

```bash
git clone https://github.com/yruichen/marketing-hub.git
cd marketing-hub
docker compose up
```

启动后访问：

- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:8000/api`

Docker 开发环境会同时启动 PostgreSQL、Redis 和 Celery worker。

> Demo bootstrap 仅用于本地开发。生产检查会拒绝 Demo 账号自动创建、Mock Provider 和不安全的部署配置。

### 本地开发

后端需要 Python 3.12 与 `uv`：

```bash
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
```

前端需要 Node.js 22：

```bash
cd frontend
npm ci
npm run dev
```

Celery Worker：

```bash
cd backend
uv run celery -A core worker --loglevel=info
```

环境变量参考 [.env.example](./.env.example) 和 [backend/.env.example](./backend/.env.example)。

## 验证

```bash
cd backend
uv run python manage.py check
uv run python manage.py test
```

```bash
cd frontend
npm run lint
npm run test
npm run build
```

GitHub Actions 还会检查 migration drift，并构建后端与前端生产镜像。

## 文档与协作

- [文档索引](./docs/README.md)
- [工程协作规范](./ENGINEERING_PLAYBOOK.md)
- [开发流程](./docs/operations/development_workflow.md)
- [后端模块化](./docs/architecture/backend_modularization.md)
- [Prompt 治理](./docs/architecture/ai_content_generation_prompt_governance.md)
- [产品 Walkthrough](./docs/product/walkthrough.md)

项目正在积极开发，当前重点是生产加固、工作流可靠性、AI 评测治理和社区协作体验。

## 授权模式

Marketing Hub 是**源码可见（source-available）项目，不是纯开源项目**。

- 非商业使用遵循 [PolyForm Noncommercial License 1.0.0](./LICENSE)。
- 任何商业使用都需要单独购买商业许可证，详见 [商业授权说明](./COMMERCIAL_LICENSE.md)。
- 贡献遵循 [Contributor Terms](./CONTRIBUTOR_TERMS.md)，确保项目可以同时提供非商业许可和付费商业授权。

仓库目前继续保持私有，待公开范围、隐私审计和现有贡献者授权记录全部完成后，再创建全新的无历史公开仓库。

<p align="right"><a href="#readme-top">回到顶部</a></p>
