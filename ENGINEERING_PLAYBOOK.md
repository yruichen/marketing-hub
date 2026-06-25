# Marketing Hub Engineering Playbook

版本：V1
日期：2026-06-25
适用范围：生产上线准备、多人协作开发、代码边界、评审、测试、发布、运维治理

## 1. 目标

Marketing Hub 正在从原型/MVP 进入生产级环境。接下来所有开发都要围绕三个目标收敛：

- 可上线：功能可部署、可配置、可观测、可回滚。
- 可协作：多人并行开发时模块边界清晰，冲突可控，评审标准一致。
- 可演进：AI Gateway、品牌记忆、工作流、计费、多租户权限等核心能力可以继续扩展，不靠临时 patch 堆叠。

本文件是根目录级工程规范。更细的产品计划和架构说明仍放在 `docs/`。

## 2. 当前系统边界

### 2.1 Monorepo 边界

```text
marketing-hub/
  backend/       Django + DRF + Celery + AI Gateway
  frontend/      React + Vite + TanStack Query + Zustand
  docs/          产品、架构、计划、归档材料
```

规则：

- 后端和前端依赖独立管理，不在根目录混装业务依赖。
- 根目录只放跨项目规范、启动配置、CI、Docker、README 和协作文件。
- 新增共享脚本前先判断是否属于 `backend/`、`frontend/` 或 `docs/`，不要把根目录变成杂物区。

### 2.2 后端边界

当前后端是 domain-modular Django：

- `api/`：共享模型、序列化、RBAC、contracts、scope、服务和兼容层。
- `workspaces/`：组织、项目、文件夹、活动、draft、dashboard。
- `generation/`：内容生成、任务创建、工作流运行/重试。
- `ai_gateway/`：provider adapter、model policy、prompt、成本估算。
- `billing/`：套餐、额度、用量。
- `community/`：社区内容、搜索。
- `accounts/`：登录、成员管理。

硬边界：

- 现阶段 Django models 仍集中在 `backend/api/models.py`，新增模型也先放这里，避免 migrations 分散。
- domain app 可以拥有 views、urls、services、tasks，但不要各自定义重复模型。
- 业务权限必须经过 `api/rbac.py`、`api/permissions.py` 或明确的 scope helper，不在 view 里散写角色判断。
- AI provider 调用必须经过 `AIModelGateway`，不要在业务 view 里直接调外部模型 API。
- 生成类异步任务必须落到 `GenerationTask` 或后续明确的 task ledger，不做不可追踪后台调用。

### 2.3 前端边界

当前前端正在从大 `App.tsx` 逐步模块化：

- `app/`：providers、routes、全局装配。
- `features/`：业务模块。
- `components/`：可复用组件或历史兼容组件。
- `shared/`：API client、store、utils。
- `hooks/`：跨模块 hooks。
- `types/`：共享 TypeScript 类型。

硬边界：

- 新功能优先进入 `features/<domain>/`，不要继续扩大 `App.tsx`。
- API 请求统一走 `useApi.ts` / shared API client，不能散落 `fetch`。
- 服务端状态优先用 TanStack Query；纯 UI 状态用 Zustand 或局部 state。
- 工作流画布、项目管理、品牌记忆、AI 设置、计费等大模块要保持独立目录。
- 视觉风格遵守现有 editorial design system，不随意引入新的 UI 框架。

## 3. 分支与协作模型

### 3.1 分支

推荐：

- `main`：随时可部署。禁止直接提交。
- `feat/<scope>-<short-name>`：功能开发。
- `fix/<scope>-<short-name>`：缺陷修复。
- `chore/<scope>-<short-name>`：维护、配置、文档。
- `refactor/<scope>-<short-name>`：结构调整。

示例：

```text
feat/brand-memory-ingestion
fix/workflow-retry-status
chore/ci-production-checks
refactor/frontend-project-manager
```

### 3.2 Pull Request 标准

每个 PR 必须说明：

- 变更目标。
- 涉及模块。
- 数据库迁移情况。
- API contract 变化。
- UI 截图或录屏，若涉及前端。
- 测试结果。
- 风险和回滚方式。

建议 PR 大小：

- 普通业务 PR：少于 500 行核心代码变化。
- 大重构：先拆设计文档、数据迁移、兼容层、切换调用方、清理旧代码几个 PR。
- 不要把“功能 + 重构 + 格式化 + 文档整理”混在一个 PR。

### 3.3 Code Owners 思路

正式多人协作后建议建立 ownership：

| 区域 | Owner 类型 |
|---|---|
| `backend/api/models.py`, migrations | Backend lead |
| `backend/ai_gateway/` | AI platform owner |
| `backend/generation/`, workflow runtime | Workflow owner |
| `backend/billing/`, RBAC | Platform owner |
| `frontend/src/features/workflows/` | Frontend workflow owner |
| `frontend/src/features/projects/` | Product workspace owner |
| `frontend/src/features/brand-memory/` | AI memory owner |
| `docs/plans/`, `docs/architecture/` | Tech lead / product owner |

## 4. 代码规范

### 4.1 通用

- 优先小函数、小模块、清晰输入输出。
- 不把业务规则藏在 UI 文案、prompt 字符串或临时 JSON 里。
- 不新增无法测试、无法审计、无法回滚的隐式行为。
- 保持命名稳定：API 字段、task type、workflow node type 一旦上线就是 contract。
- 所有跨模块 contract 变化必须同步更新类型、序列化、测试和文档。

### 4.2 Python / Django

- Python 版本：3.12。
- 依赖管理：`uv`。
- API 层使用 DRF，错误返回结构要稳定。
- 新增 service 逻辑优先放 domain service，不把复杂业务写在 view。
- 数据库查询必须带租户 scope，默认按 organization/project/campaign 限制。
- Celery task 必须幂等，至少能安全重试一次。
- 外部 AI/API 调用必须记录 provider、model、成本、fallback、错误信息。
- migrations 必须可前滚；生产环境不接受手动改库作为常规流程。

### 4.3 TypeScript / React

- TypeScript 类型不要用 `any` 逃避 contract，除非包裹第三方未知结构并有边界转换。
- 表单、API payload、服务端返回要有明确类型。
- 组件承担 UI，数据获取和副作用尽量放 hooks 或 feature service。
- 大组件超过约 400 行时，新功能优先拆分，不继续堆叠。
- 所有用户可见 loading/error/empty 状态都要处理。
- 不在组件里硬编码后端 URL，统一走 API base config。

### 4.4 AI / Prompt / Memory

- Prompt、skill、style、memory policy 都按资产治理，不在业务代码里随手拼接。
- 新增核心 prompt 必须有 key、owner、输出契约、风险等级和 fallback 策略。
- 品牌记忆写入必须可见、可删除、可追踪来源。
- 语言风格克隆不得复制用户样本原文，不做未经授权的人格模仿。
- 自动进化类能力必须先产生 proposal，不直接修改生产 prompt 或 active memory。

## 5. API 与数据契约

### 5.1 API 变更

任何 API 变更需要明确：

- 是否向后兼容。
- 是否影响前端类型。
- 是否影响 e2e 流程。
- 是否需要 migration。
- 是否需要权限变更。

禁止：

- 无版本意识地删除字段。
- 把同一个字段在不同接口里返回不同语义。
- 用中文展示文案作为业务枚举值的唯一判断依据。

建议：

- 内部枚举使用稳定英文 key，前端再映射中文 label。
- 新字段先 additive，再迁移调用方，最后清理旧字段。
- 复杂 JSON 字段要有 contract 文档或 Pydantic/Zod schema。

### 5.2 数据库

- 生产默认 PostgreSQL。
- SQLite 仅用于本地轻量开发和 fallback。
- 多租户数据必须有 organization 维度或可追溯到 organization。
- 删除操作要考虑软删除、审计日志和关联资产。
- 大字段、向量、文件、媒体资产要有增长策略，不无限写入主表。

## 6. 测试策略

### 6.1 必跑检查

Backend：

```bash
cd backend
uv run python manage.py check
uv run python manage.py test
```

Frontend：

```bash
cd frontend
npm run lint
npm run build
npm run test
```

E2E：

```bash
cd frontend
npm run test:e2e
```

### 6.2 测试分层

- Unit tests：纯函数、schema normalizer、RBAC、cost calculator、prompt normalizer。
- Service tests：workspace、generation、billing、brand memory、workflow execution。
- API tests：权限、租户隔离、错误结构、状态流转。
- Frontend tests：关键组件、hooks、状态转换。
- E2E tests：登录、项目选择、品牌记忆保存、内容生成、工作流运行、计费页。
- Eval tests：prompt/memory/style 的轻量规则评测，不能只靠人工看输出。

### 6.3 合并门禁

合并到 `main` 前至少满足：

- CI 通过。
- 新增后端业务逻辑有测试或明确测试缺口。
- 新增前端复杂交互有组件测试或 e2e 覆盖计划。
- 涉及 AI 输出契约时有 normalize/fallback 测试。
- 涉及迁移时本地跑过 migrate。

## 7. 环境与配置

### 7.1 环境分层

建议环境：

- `local`：开发机，SQLite 或 Docker PostgreSQL。
- `dev`：共享开发环境，可重置数据。
- `staging`：生产等价预发环境。
- `production`：真实用户环境。

### 7.2 配置规则

- 所有 secret 只能通过环境变量或 secret manager 注入。
- `.env` 不提交。
- `DJANGO_DEBUG=False` 是生产硬要求。
- 生产必须显式配置 `DJANGO_ALLOWED_HOSTS`、`CSRF_TRUSTED_ORIGINS`、数据库、Redis。
- AI provider key 必须组织级加密存储或由部署环境注入，不写入日志。

### 7.3 推荐生产配置项

Backend：

```env
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=<secret>
DJANGO_ALLOWED_HOSTS=<domain>
CSRF_TRUSTED_ORIGINS=https://<domain>
SESSION_COOKIE_SAMESITE=Lax
DATABASE_URL=<postgres-url>
REDIS_URL=<redis-url>
CELERY_TASK_ALWAYS_EAGER=False
OBJECT_STORAGE_BACKEND=s3
OBJECT_STORAGE_BUCKET=<bucket>
```

Frontend：

```env
VITE_API_BASE_URL=https://<domain>/api
```

## 8. 发布与回滚

### 8.1 发布前 Checklist

- CI 全绿。
- migrations 已审核。
- staging 已部署并冒烟测试。
- `DJANGO_DEBUG=False` 验证。
- 静态资源 build 成功。
- Celery worker 和 Redis 正常。
- 数据库备份策略可用。
- 关键 API 有健康检查。
- Sentry/日志/指标已接入或有明确替代方案。
- 回滚版本和回滚步骤明确。

### 8.2 数据迁移

- 危险迁移拆两步：先 additive，再切流量，最后删除旧字段。
- 大表迁移避免长事务和锁表。
- 数据 backfill 用 management command 或 Celery job，记录进度。
- 回滚时不能依赖“手动记得改回来”。

### 8.3 回滚

每次发布必须能回答：

- 回滚代码是否兼容新旧 schema。
- 已写入的新数据是否会破坏旧代码。
- AI prompt/model 配置是否能独立回滚。
- 前端静态资源是否可切回上一版本。

## 9. 安全与合规边界

- 所有用户数据必须按 organization scope 隔离。
- 后端写操作必须有权限检查。
- CSRF/session auth 规则不能绕过。
- 生成内容要保留任务账本，便于审计。
- 用户上传素材和品牌记忆要有删除路径。
- AI 输出不得默认视为事实，审核、引用和发布链路要保留风险提示。
- 日志不得输出 API key、session cookie、provider secret、完整敏感 payload。

## 10. 可观测性

生产级最小观测面：

- API 错误率、延迟、状态码。
- Celery 队列长度、任务失败率、重试次数。
- 数据库连接、慢查询、磁盘增长。
- Redis 可用性。
- AI provider 成本、token、fallback 率、错误类型。
- GenerationTask 状态分布。
- 前端构建版本和运行时错误。

建议事件：

- `generation_task_created`
- `generation_task_succeeded`
- `generation_task_failed`
- `workflow_run_started`
- `workflow_run_failed`
- `brand_memory_updated`
- `ai_provider_fallback_used`
- `billing_limit_reached`

## 11. 大型重构规则

大型重构必须先写 plan，至少包含：

- 背景和目标。
- 不做什么。
- 模块边界。
- 数据模型变化。
- API 变化。
- 迁移策略。
- 测试策略。
- 灰度和回滚。

推荐拆法：

1. 加 contract 和测试。
2. 加新模型/新 service，保持旧调用。
3. 双写或兼容读取。
4. 切换调用方。
5. 清理旧代码。
6. 删除旧字段或旧接口。

适用场景：

- 品牌记忆 2.0。
- AI Gateway 多 lane 扩展。
- 工作流 runtime 重构。
- 计费和权限模型升级。
- 前端大组件拆分。

## 12. 文档规范

- 当前架构：`docs/architecture/`
- 当前计划：`docs/plans/`
- 运维/开发流程：`docs/operations/`
- 产品说明：`docs/product/`
- 历史草稿：`docs/archive/`
- 根目录：只放跨团队必须看到的规范，例如本文件、README、AGENTS。

文档更新要求：

- 改架构边界时更新 architecture 文档。
- 改开发流程时更新 operations 文档。
- 新增大型计划时放到 plans，并更新 `docs/README.md`。
- 历史草稿不要删除，移动到 archive。

## 13. 当前优先级

生产化前最优先补齐：

1. 环境分层：local/dev/staging/production。
2. Secret 管理和生产 `DJANGO_DEBUG=False` 配置。
3. PostgreSQL 生产 schema 和 migration 流程。
4. Celery/Redis 任务可靠性和失败重试。
5. 基础观测：错误、成本、任务失败、API 延迟。
6. 多租户权限回归测试。
7. AI Gateway prompt/model/memory 版本审计。
8. 前端关键路径 e2e。

这份 playbook 是工程基线。后续如果团队规模扩大，应把它拆成更正式的 CONTRIBUTING、SECURITY、RELEASE 和 CODEOWNERS 文件。

