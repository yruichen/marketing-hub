# Marketing-Hub 升级执行报告

## 已落地能力

### 1. 项目制协作空间骨架
- 新增 `Organization`、`Membership`、`Project`、`Campaign` 模型。
- 新增工作区接口：
  - `GET /api/workspace/bootstrap/`
  - `GET|POST /api/workspace/`
- 社区作品现在可关联组织、项目、活动，不再只是一条全局裸数据。

### 2. 资产库与任务账本
- 新增 `Asset` 模型，为后续 S3/OSS/DAM 接入保留真实数据结构。
- 新增 `GenerationTask` 模型，记录生成任务状态、输入、输出、错误、Token 估算和成本估算。
- 新增本地任务接口：
  - `GET|POST /api/tasks/`
  - `GET|POST /api/tasks/<id>/`
- 新增本地 worker 命令：`uv run python manage.py process_generation_tasks`。
- 新增 Celery 应用与 worker 任务：
  - `core/celery.py`
  - `api/tasks.py`
  - `process_generation_task`
- `GenerationTask` 现在记录 `celery_task_id`，方便关联 Celery broker 中的异步任务。

### 3. 成本审计与数据看板
- 新增 `UsageEvent` 模型，每次生成任务会写入 Token 和成本估算记录。
- 新增数据看板接口：`GET /api/dashboard/`。
- 前端新增“数据看板”入口，展示当前工作区、任务状态、任务类型分布、社区作品数量、资产数量、Token 和成本统计。
- 前端四类生成入口已改为任务提交 + 轮询，完成后再更新文案、图片、分镜或音频输出。

### 4. 后端配置云原生化
- `core/settings.py` 支持环境变量配置：
  - `DJANGO_SECRET_KEY`
  - `DJANGO_DEBUG`
  - `DJANGO_ALLOWED_HOSTS`
  - `POSTGRES_DB`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
  - `POSTGRES_HOST`
  - `POSTGRES_PORT`
  - `REDIS_URL`
  - `CELERY_BROKER_URL`
  - `CELERY_RESULT_BACKEND`
  - `OBJECT_STORAGE_BACKEND`
  - `OBJECT_STORAGE_BUCKET`
- 本地默认仍可回退 SQLite，避免没有 PostgreSQL 时无法开发。
- 新增 `docker-compose.yml`，包含 PostgreSQL、Redis、后端、前端。
- `docker-compose.yml` 新增 `worker` 服务，使用 Redis broker 执行 Celery 任务。
- 本地默认 `CELERY_TASK_ALWAYS_EAGER=true`，用于没有 Redis worker 时验证任务链路；Docker Compose 中设置为 `false`，由真实 worker 消费队列。

### 5. 真实降级说明
- RAG 搜索不再伪装成“连接 SQLite Vector database index”，现在明确返回本地 keyword similarity fallback。
- 图片接口不再声称生成了真实图片二进制，明确说明当前返回 curated preview asset。
- OpenAI TTS 分支不再声称已经合成并保存音频，明确说明对象存储未接入时返回 fallback preview audio。
- 本地 eager 模式不是分布式异步队列，只是开发验证模式；真正异步执行需要启动 Redis 和 Celery worker。

## 尚未真实实现的升级项

以下能力需要外部基础设施、付费服务或更长周期改造，本次未做假实现：

- S3/OSS 对象存储、CDN、预签名上传 URL。
- Qdrant/Milvus 向量数据库、embedding 索引、语义路由和长期记忆。
- React Flow 可视化 Agent Builder。
- Kafka/RabbitMQ 事件总线。
- Kong/APISIX API Gateway、限流、熔断。
- WebSocket/SSE 推送网关。
- Sentry/Prometheus/APM。
- 真实创作者收益、打赏、排行榜和模板市场交易闭环。

## 下一次升级建议

1. 接入对象存储，重写 `generate_audio` 和 `generate_image` 的媒体持久化返回路径。
2. 引入 Qdrant 或 Milvus，新增 `EmbeddingDocument` / `VectorIndexJob` 模型，替换当前 keyword fallback。
3. 将前端 `App.tsx` 拆成 Copy/Image/Storyboard/Audio/Community/Config/Dashboard 多个模块，再引入 Query Cache 或 React Query。
4. 在 Docker Compose 基础上加入 CI：后端 `manage.py check`、迁移校验、测试；前端 `npm run lint`、`npm run build`。
