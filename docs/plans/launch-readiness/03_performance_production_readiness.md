# 03 性能与生产环境升级计划

## 0. 目标

上线测试不是大规模商业上线，但必须具备生产环境基本条件：

- Web 进程稳定。
- Worker 独立可扩缩。
- 数据库可备份可恢复。
- 静态资源高效分发。
- 长任务不阻塞请求。
- 错误可定位。
- 成本和队列可监控。

## 1. 部署运行方式

### 1.1 当前状态

- `backend/Dockerfile`：`CMD ["uv", "run", "python", "manage.py", "runserver", "0.0.0.0:8000"]`
- `frontend/Dockerfile`：`CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]`
- `docker-compose.yml`：backend/worker/frontend 都是开发设置，`DJANGO_DEBUG=true`。

### 1.2 风险

- Django runserver 不适合生产。
- Vite dev server 不适合生产。
- 静态资源没有 immutable cache 和压缩策略。
- 容器没有 healthcheck。
- Web 和 worker 没有 resource limit。

### 1.3 升级动作

P0：

- Backend 改用 gunicorn：
  - `gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 120`
- Frontend 生产镜像：
  - `npm run build`
  - 用 nginx 或静态托管服务发布 `dist/`
- docker compose 分离：
  - `docker-compose.dev.yml`
  - `docker-compose.prod.yml`
- 增加 healthcheck：
  - backend `/api/health/`
  - worker celery ping
  - redis ping
  - postgres ready

P1：

- 使用托管 Postgres/Redis。
- 使用对象存储和 CDN。
- 使用 blue/green 或 rolling deploy。

验收标准：

- 生产容器中不出现 `runserver` 和 `vite dev`。
- `DJANGO_DEBUG=False` 启动。
- 前端 dist 有 gzip/br cache。

## 2. 后端性能

### 2.1 当前风险

部分接口有 N+1 或全表风险：

- `ProjectCollectionView.get()` 对每个 project 调用 `campaigns.count()`、`assets.count()`、`workspace_drafts.count()`、`workflow_templates.count()`、`generation_tasks.exists()`。
- `AnalyticsDashboardView.get()` 每次聚合全组织全部 UsageEvent/GenerationTask。
- `CommunityCreationView.get()` 默认返回全表且不分页。
- `RAGSearchView.get()` 对所有 CommunityCreation 做 Python 字符串扫描。
- `WorkspaceAssetsView.get()` 搜索 tags 使用 `icontains` 对 JSON 字段低效。
- `AssistantSessionListView` 有上限 50，合理，但 message history 拼装可能随 session 增大变慢。

### 2.2 P0 优化

- 所有列表接口分页。
- Project 列表用 annotate 聚合：
  - campaign_count
  - asset_count
  - draft_count
  - template_count
  - latest_generation_status
  - total_cost_usd
- Dashboard 增加时间范围参数，默认近 30 天。
- Community/Template 列表分页，默认 organization scope。
- RAG 搜索先限制 scope 和 top N，再做 fallback。
- Task 列表分页，默认最近 50，可按 status/type/project 过滤。

### 2.3 索引建议

新增或确认索引：

- `GenerationTask(organization, -created_at)`
- `GenerationTask(organization, status, -created_at)`
- `GenerationTask(organization, task_type, -created_at)`
- `GenerationTask(project, -created_at)`
- `UsageEvent(organization, -created_at)`
- `UsageEvent(organization, provider, -created_at)`
- `Asset(organization, asset_type, -created_at)`
- `Asset(project, -created_at)`
- `WorkspaceDraft(organization, -updated_at)`
- `WorkspaceDraft(project, status, -updated_at)`
- `CommunityCreation(organization, creation_type, -created_at)`
- `CommunityCreation(visibility, -created_at)`，新增 visibility 后。
- `AuditLog(organization, action, -created_at)`

验收标准：

- 项目列表 1000 个项目 P95 < 800ms。
- 任务列表 10000 条任务 P95 < 800ms。
- Dashboard 默认近 30 天 P95 < 1.2s。

## 3. 任务队列和 AI 调用

### 3.1 当前状态

- `GenerationTask` 状态：queued/running/succeeded/failed。
- `CELERY_TASK_ALWAYS_EAGER` 开发默认 true。
- `schedule_generation_task()` 在 eager 时用 daemon thread，非 eager 时走 Celery。
- `/tasks/` 可以 `run_now=false` 入队。
- 单项生成 async 分支存在 `queue_generation_task` 未导入风险。

### 3.2 风险

- sync 任务会阻塞请求。
- daemon thread 在进程退出时可能丢任务。
- 没有任务取消、超时、重试次数、失败分类。
- 没有 provider-level concurrency limit。
- 没有任务前额度预估和拦截。

### 3.3 升级动作

P0：

- 所有真实 AI 调用必须异步执行。
- 修复 `generation/views.py` 引用，统一使用 `schedule_generation_task()`。
- `GenerationTask` 增加字段：
  - `started_at`
  - `attempt_count`
  - `max_attempts`
  - `failure_code`
  - `queued_at`
  - `cancelled_at`
  - `runtime_ms`
- Celery task 设置 soft/hard time limit。
- Worker 启动参数设并发数和队列：
  - text queue
  - media queue
  - workflow queue
- 任务幂等：所有生成 POST 自动生成或要求 `Idempotency-Key`。

P1：

- 增加任务取消 endpoint。
- 增加任务 retry endpoint，保留原 task 和 retry_of。
- 增加 dead-letter queue 或 failed task 管理台。

验收标准：

- 提交视频任务 HTTP 在 1 秒内返回 202。
- Worker crash 后 queued/running 任务能被恢复或标记超时。
- 同一 idempotency key 不会重复扣费。
- 任务失败有 failure_code：quota_exceeded、provider_timeout、provider_auth、validation_error、internal_error。

## 4. 前端性能

### 4.1 当前状态

- 已有 lazy：WorkflowBuilder、BrainstormPage。
- 已有 TanStack Query Provider，但很多模块仍手动 `apiFetch + useState`。
- `App.tsx` 仍承担大量全局状态、任务通知、路由判断、auth、workspace、dashboard。
- 多个 full-height 页面，长列表如资产库每页 60。

### 4.2 优化动作

P0：

- 所有核心数据查询迁移到 Query hooks：
  - auth me
  - workspace bootstrap
  - dashboard
  - projects
  - assets
  - billing
  - ai config
  - tasks
- query key 必须包含 organization/project/campaign。
- mutation 后统一 invalidation，避免手动同步遗漏。
- 全局错误边界：页面级 ErrorBoundary + fallback。
- `apiFetch` 统一处理 401/403/402/429。

P1：

- 继续拆分 `App.tsx`：
  - AuthGate
  - AppShell
  - Topbar
  - NotificationCenter
  - WorkspaceRouteRenderer
  - ResetPasswordDialog
- 对资产库、项目列表、模板库做虚拟列表或更小分页。
- 使用 bundle analyzer 控制首包。
- Markdown、React Flow、assistant 相关代码继续懒加载。

验收标准：

- 首屏 JS bundle 可解释，非首屏模块不进入初始 chunk。
- 切换项目后所有模块读取同一 workspace scope。
- API 401 后自动清 session marker 并跳登录。

## 5. 数据库和迁移

### 5.1 当前状态

- PostgreSQL when env set，SQLite fallback。
- CI 有 migration drift check。

### 5.2 上线动作

P0：

- 测试环境必须使用 PostgreSQL，不使用 SQLite。
- 每次 deploy 前自动备份数据库。
- migration 执行前有 dry run 和回滚说明。
- 大字段 JSONField 评估大小：GenerationTask.payload/result、Asset.metadata、WorkspaceDraft.nodes/edges。

P1：

- 大 result 或媒体 metadata 移到对象存储，数据库只存引用。
- 审计日志和任务结果归档策略。
- 数据保留策略：失败任务 payload 30/90 天可配置。

验收标准：

- 从备份恢复演练成功。
- migration 失败不会导致服务半升级。

## 6. 对象存储和媒体处理

### 6.1 当前状态

`OBJECT_STORAGE_BACKEND` 和 `OBJECT_STORAGE_BUCKET` 仅在 settings 中存在，Asset 主要依赖 `source_url`。

### 6.2 风险

- 第三方 provider 返回的临时 URL 过期。
- 用户上传素材无受控入口。
- 视频/音频大文件不适合直接经 Django 传输。
- 删除资产无法删除远端对象。

### 6.3 升级动作

P0：

- 接入 S3/R2/OSS 之一。
- 新增 object key 字段或 AssetFile 模型：
  - bucket
  - object_key
  - content_type
  - size_bytes
  - checksum
  - visibility
  - thumbnail_key
- 生成结果落地到对象存储，再创建 Asset。
- 前端访问使用短期签名 URL 或 CDN public URL。

P1：

- 图片生成缩略图。
- 音频/视频转码状态。
- 病毒扫描或文件类型校验。
- 生命周期策略：临时文件 7 天，正式资产长期保留。

验收标准：

- provider 临时链接失效后，资产库仍可打开历史内容。
- 删除资产会删除或标记删除对象存储文件。

## 7. 可观测性

### 7.1 必需指标

应用层：

- request count/status/latency
- API P50/P95/P99
- 401/403/429/500 比例
- slow endpoint top 10

任务层：

- queued/running/succeeded/failed count
- queue latency
- runtime by task_type
- failure_code by provider
- retry count
- active worker count

AI 成本层：

- tokens by org/project/provider/model
- cost by org/project/provider/model
- fallback_used count
- BYOK vs platform usage
- quota denied count

前端层：

- JS error
- route load time
- task submit failure
- onboarding drop-off
- API error toast count

### 7.2 工具建议

最小方案：

- Sentry：前后端错误。
- structlog 或标准 logging JSON：request id、user id、org id、task id。
- Celery Flower：测试期队列可视化。
- Postgres 慢查询日志。

进阶方案：

- OpenTelemetry + Prometheus/Grafana。
- Loki/ELK 日志查询。
- UptimeRobot/Better Stack 外部探活。

验收标准：

- 一个用户反馈“视频生成卡住”时，运营能用 username/org/task id 找到完整链路。
- 500 错误自动进入告警。
- 队列积压超过阈值告警。

## 8. CI/CD 和质量门禁

### 8.1 当前 CI 已有

- backend `uv sync`
- `manage.py check`
- `check --deploy`
- migration drift
- backend tests
- frontend `npm ci`
- lint
- unit test
- build

### 8.2 必补门禁

P0：

- 后端安全权限测试加入 CI。
- 生产危险 env 测试。
- frontend type/lint/build 已有，继续保留。
- 禁止提交 `.env`、数据库、密钥。
- Docker build 测试。

P1：

- API contract tests。
- Storybook 或组件快照测试。
- Lighthouse CI。
- Playwright 可以保留在 CI，但本计划不使用 Playwright 做代码审计。

验收标准：

- main 分支不允许跳过 CI。
- 权限回归测试失败则不可合并。

## 9. 灰度和回滚

### 9.1 灰度策略

- 第一批：内部 3-5 人。
- 第二批：10 个种子用户，邀请制。
- 第三批：30-50 个用户，限制额度。
- 每批独立观察 48 小时。

### 9.2 回滚策略

- 前端静态版本可回滚。
- 后端镜像可回滚。
- 数据库 migration 需要 forward-only 设计，危险迁移先双写。
- AI provider 配置可一键禁用某 provider。
- 任务队列可暂停特定 queue。

验收标准：

- 发布失败 15 分钟内可恢复上一版本。
- 额度异常消耗时可停用 platform key。

