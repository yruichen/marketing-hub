# Marketing Hub 上线测试全面升级计划

版本：V1 代码审计版  
日期：2026-06-26  
适用阶段：封闭测试前 2-6 周、种子用户测试、生产灰度  
审计范围：`backend/` Django、`frontend/` React、Docker、CI、现有 `docs/`

## 0. 结论

当前产品已经不是纯 Demo：它具备账号注册、邮箱验证、组织/成员、项目、活动、品牌记忆、工作流草稿、生成任务、资产库、社区/模板、计费展示、AI Gateway、后台运营台、审计日志和基础 CI。

但它距离“可公开上线测试”的差距主要不在功能数量，而在四件事：

1. 权限和数据隔离没有形成系统性闭环。
2. 生产运行条件仍以开发环境为中心。
3. 用户体验存在“看得到功能，但不一定走得通闭环”的问题。
4. AI 任务、成本、资产、错误恢复和运维观测还不够可解释、可控、可追责。

本计划的建议不是继续堆生成入口，而是先把“从想法到内容包、从内容包到资产、从资产到复用、从复用到计费和运营监控”的测试闭环做扎实。

## 1. 代码现状证据

### 1.1 已具备能力

- `backend/accounts/views.py`：已有普通登录、管理员独立登录、注册、邮箱验证、密码重置、用户资料、SecurityEvent。
- `backend/api/models.py`：已有 Organization、Membership、Project、Campaign、WorkspaceDraft、GenerationTask、Asset、UsageEvent、CreditLedgerEntry、AIConfiguration、AuditLog、AssistantSession。
- `backend/api/rbac.py` 与 `backend/api/permissions.py`：已有角色矩阵和部分 DRF permission class。
- `backend/generation/views.py`：已有内容包、文案、图片、分镜、音频、视频、任务队列、工作流运行、节点重试、灵感风暴接口。
- `backend/ai_gateway/`：已有 provider adapter、模型配置、fallback、prompt catalog、全局 assistant。
- `frontend/src/app/navigation.ts`：已有主要信息架构：灵感风暴、首页、内容包、单项生成、项目、工作流、资产、审阅、模板、个人主页、计费、设置。
- `frontend/src/App.tsx`：已有 App Shell、通知中心、右侧上下文面板、onboarding、全局 assistant、admin mode 分支。
- `frontend/src/features/*`：项目、资产、生成、工作流、AI 设置、计费、后台、社区、个人主页等模块已拆出。
- `.github/workflows/ci.yml`：已有后端 check/test、生产 settings smoke check、migration drift、前端 lint/test/build。

### 1.2 上线阻断风险

这些项建议作为 P0 处理，未完成前不建议开放外部测试账号。

| 风险 | 当前证据 | 用户/业务影响 | 级别 |
| --- | --- | --- | --- |
| 组织权限未系统落实 | 多个 APIView 没有显式 `permission_classes`，依赖默认权限；Project/Folder/Asset 等视图按请求参数查组织但缺少一致的 membership guard | 测试用户可能看到或修改非所属组织数据 | P0 |
| 匿名/demo scope 仍存在 | `api/scope.py:get_scope()` 对匿名请求会 `ensure_demo_workspace(username)`；CI 开启 `ALLOW_UNAUTHENTICATED_API=True` | 生产配置一旦误设，会把真实请求导入 Demo 工作区 | P0 |
| AI Key 明文字段 | `AIConfiguration.api_key` 是普通 `CharField`，序列化只 mask 输出 | 数据库泄露或后台误用会暴露客户密钥 | P0 |
| 部分异步接口直接调用未导入函数 | `generation/views.py` 的多个 async 分支调用 `queue_generation_task(task)`，但文件导入列表未导入该函数；通用 `/tasks/` 使用 `schedule_generation_task` | 单项生成 async 模式会 500，视频/长任务路径容易断 | P0 |
| 生产容器仍跑开发服务器 | `backend/Dockerfile` 使用 `manage.py runserver`；`frontend/Dockerfile` 使用 `npm run dev`；`docker-compose.yml` 默认 `DJANGO_DEBUG=true` | 无法承受真实流量，安全 header/静态资源/进程管理不达标 | P0 |
| 权限类存在“安全 GET 放行” | `OrganizationRolePermission.allow_safe_without_membership=True`；`CanManageAIConfiguration` safe methods 直接 True | 敏感配置列表、组织资源查询可能被过度读取 | P0 |
| 任务成本账本可为负且无额度拦截 | `persist_credit_debit()` 只写入负向 ledger，没有任务前预算校验、并发限额、超额策略 | 成本不可控，测试期可能被刷爆模型额度 | P0 |
| 对象存储未落地 | `OBJECT_STORAGE_BACKEND` 有 env，但 Asset 只有 `source_url` 字段和外链保存 | 图片/音频/视频无法生产级持久化、鉴权、过期、CDN | P0 |
| 社区和 RAG 默认全表检索 | `CommunityCreation.objects.all()` 与关键词 fallback | 私有素材可能进入公共灵感流，检索质量也不足 | P0 |

## 2. 上线测试目标

### 2.1 体验目标

封闭测试用户应能在 8 分钟内完成：

1. 注册或登录。
2. 创建或选择工作区项目。
3. 填写品牌记忆。
4. 从灵感风暴或内容包生成第一份可用内容。
5. 查看任务进度与失败原因。
6. 把结果沉淀到资产库。
7. 在项目或审阅页继续修改。

### 2.2 安全目标

上线测试必须满足：

1. 所有非公开 API 均要求登录。
2. 所有组织级资源按 membership 隔离。
3. AI Key 加密存储，只允许组织 admin 管理。
4. Demo、mock、unauthenticated、debug 默认在生产关闭。
5. 管理后台与普通工作台隔离。
6. 关键行为有审计日志和 SecurityEvent。

### 2.3 性能和生产目标

封闭测试阶段最低目标：

1. 前端首屏可交互小于 3 秒。
2. 常规 API P95 小于 800ms。
3. 生成任务提交 P95 小于 1 秒，长任务异步执行。
4. 任务状态可恢复，页面刷新后不丢进度。
5. Celery worker 与 web 进程隔离。
6. 有错误日志、慢查询、队列积压、任务失败率告警。

## 3. 文档结构

- [01 用户体验升级计划](./01_user_experience_upgrade_plan.md)
- [02 安全与合规上线计划](./02_security_compliance_readiness.md)
- [03 性能与生产环境升级计划](./03_performance_production_readiness.md)
- [04 全模块 Backlog 与验收标准](./04_module_backlog_and_acceptance.md)
- [05 工作流体验优化计划](./05_workflow_experience_optimization_plan.md)
- [06 顶尖黑客测试安全防御计划](./06_adversarial_security_defense_plan.md)

## 4. 推荐排期

### Sprint 0：上线阻断修复，3-5 天

目标：不做新功能，先移除明显上线事故点。

- 关闭生产匿名访问、mock fallback、demo bootstrap。
- 修复 `queue_generation_task` 未导入问题。
- 给 Project/Folder/Asset/Community/Billing/AI Config/Assistant 全部加组织级权限检查。
- AI Key 加密存储或接入密钥管理。
- 生产 Docker 改为 gunicorn/uvicorn + nginx 或托管平台标准启动。
- 增加 smoke tests：普通用户无法访问其他组织资源，viewer 无法写入，admin 才能改 key。

### Sprint 1：测试用户主路径，1 周

目标：让 10-30 个种子用户能稳定跑通核心路径。

- Onboarding 改为真正创建/更新项目品牌记忆，而不是只写本地 state。
- 内容包、单项生成、工作流运行统一改为异步任务体验。
- 任务中心支持刷新恢复、取消、重试、错误解释。
- 资产库接入对象存储或至少完成受控上传/下载接口。
- 全局搜索先做项目/资产/任务三类搜索。
- 右侧 ContextPanel 改成任务、项目、资产可操作面板。

### Sprint 2：安全、计费、运营后台，1-2 周

目标：测试期能控人、控量、控成本、控风险。

- 邀请码/白名单注册、测试额度发放、组织额度拦截。
- 管理后台增加任务失败队列、模型成本排行、异常登录、用户冻结恢复。
- 计费页从展示页升级为用量解释页：余额、30 天消耗、按成员/项目/模型拆分。
- BYOK 模式增加密钥校验、轮换、删除、最后使用时间。

### Sprint 3：生产观测和性能压测，1 周

目标：测试中出现问题时能定位、能止损。

- Sentry 或同类错误追踪。
- 结构化日志、request id、task id 串联。
- Celery Flower/Prometheus 指标、队列长度告警。
- 数据库索引和分页优化。
- 前端 bundle 分析、路由懒加载、长列表虚拟化。

## 5. Go/No-Go 检查

上线测试前必须全部为 Go：

- `DJANGO_DEBUG=False` 下 `manage.py check --deploy` 通过。
- `ALLOW_UNAUTHENTICATED_API=False` 下所有核心测试通过。
- 普通用户无法通过任何 API 访问非 membership 组织。
- AI Key 数据库字段不再明文可读。
- Demo 登录仅在本地开发开启。
- 所有生成任务可异步提交、轮询、失败重试。
- 任务成本写入 UsageEvent 和 CreditLedgerEntry，且超额会被拦截。
- 图片、音频、视频资产有持久化存储策略。
- 管理后台可以查看用户、组织、任务、安全事件、额度。
- 有备份、回滚、错误追踪、日志留存方案。
