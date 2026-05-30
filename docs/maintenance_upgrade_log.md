# Marketing-Hub 维护与升级日志

## 2026-05-30 企业级工作区与任务账本升级

### 已完成

- 新增组织、成员、项目、活动、资产、生成任务、成本审计模型。
- 新增工作区、任务队列、数据看板 API。
- 生成接口保留原有同步返回兼容性，同时写入 `GenerationTask` 和 `UsageEvent`。
- 前端新增“数据看板”入口，展示工作区范围、任务数量、任务类型分布、Token 与成本审计。
- 后端配置支持 PostgreSQL、Redis、Celery broker/result backend 等环境变量。
- 新增 Dockerfile 与 `docker-compose.yml`，可拉起 PostgreSQL、Redis、Django、Vite。
- 清理不真实的模拟说明：RAG、图片、TTS 的未接入能力现在明确标注为 fallback，不伪装成真实云能力。

### 验证

- `uv run python manage.py check` 通过。
- `uv run python manage.py makemigrations --check --dry-run` 通过。
- `uv run python manage.py test` 可执行，但当前后端测试数为 0。
- `npm run lint` 通过。
- `npm run build` 通过。

### 后续

- 详见 `docs/upgrade_execution_report.md`。

## 2026-05-30 Celery 异步任务管线升级

### 已完成

- 新增 Django/Celery 集成入口 `core/celery.py`。
- 新增 `api.tasks.process_generation_task`，由 Celery worker 消费 `GenerationTask`。
- `GenerationTask` 增加 `celery_task_id`，用于追踪 broker 派发任务。
- `/api/tasks/` 在 `run_now=false` 时会创建账本任务并派发到 Celery。
- 四类前端生成入口改为提交异步任务并轮询 `/api/tasks/<id>/`，任务完成后再更新输出面板。
- `docker-compose.yml` 增加 `worker` 服务；Compose 环境下 `CELERY_TASK_ALWAYS_EAGER=false`，由 Redis + worker 执行。

### 真实边界

- 本地非 Compose 开发默认 `CELERY_TASK_ALWAYS_EAGER=true`，这是为了在没有 Redis worker 的情况下验证完整代码路径，不代表分布式异步。
- 真正的异步队列需要启动 Redis 和 Celery worker。

## 2026-05-29 前端稳定性与 Creative Sketchbook 视觉升级

### 修复内容

- 修复 `App.tsx` 中 `handleCopyClipboard` 未定义导致 `npm run build` 失败的问题。
- 为文案、图片、分镜、音频、AI 配置、社区作品等接口数据补充明确 TypeScript 类型，移除前端中的 `any` lint 错误。
- 调整初始化数据拉取逻辑，避免 React 19 hooks 规则报错。
- 修复未被 Tailwind 默认生成的自定义类：
  - `border-1.5`
  - `border-b-1.5`
  - `h-4.5`
  - `w-4.5`
  - `duration-250`
  - `hover:scale-103`
  - `active:scale-97`
  - `focus:border-slate-650`
- 清理输入、按钮、子菜单和列表中的图标/emoji，保留主工作区顶部的书签式图标，符合“少图标、重排版”的编辑设计方向。

### 设计升级

- 维持 Raw Oatmeal / Warm Alabaster 纸张背景、Warm Obsidian 主描边与正文低疲劳色值。
- 保留不对称纸张圆角、硬墨印阴影、错位纸页与轻微旋转，强化 open binder / loose-leaf workspace 观感。
- 输入区继续使用下划线书写空间，正文编辑区使用纯白描边纸块。
- 输出区继续以 typed manuscript / polaroid sheet 呈现，正文使用更舒适的长行高和柔和文字色。
- 滑块保留黑色手调刻度线与硬边手柄。

### 验证

- `npm run lint` 通过。
- `npm run build` 通过。
- 本地 Vite 服务启动成功。
- `curl -I http://localhost:5173/` 返回 `HTTP/1.1 200 OK`。

### 备注

- 当前环境未安装 Playwright，未执行自动浏览器截图验证。
- 后端和其他已有未提交改动未被回退，本次仅处理前端稳定性、视觉规范和文档日志。
