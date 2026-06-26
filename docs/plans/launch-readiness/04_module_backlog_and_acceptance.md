# 04 全模块 Backlog 与验收标准

## 0. 优先级定义

- P0：上线测试阻断，不做会产生安全、成本、稳定性或核心路径事故。
- P1：测试体验关键项，不做会显著影响激活、留存和反馈质量。
- P2：增强项，可进入公开测试后迭代。

## 1. 账号与登录

### 当前证据

- `LoginView`、`AdminLoginView`、`RegisterView`、邮箱验证、密码重置已存在。
- 前端 `LoginPortal` 支持 demo login。
- `App.tsx` 使用 `localStorage.mh_token` 和 `/auth/me/` 恢复会话。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | 生产禁用 demo login 和 unauthenticated API | 生产 env 下无 demo 自动填充；匿名请求非公开 API 401/403 |
| P0 | 登录失败限速 | 同账号/IP 多次失败触发 429 或临时锁定 |
| P0 | cookie/session 过期 UI 恢复 | 清 cookie 后刷新自动跳登录 |
| P0 | 注册白名单或邀请码 | 未获邀邮箱无法注册测试环境 |
| P1 | 会话管理 | 用户可查看当前设备和退出其他设备 |
| P1 | 密码重置事件审计 | reset request/complete 写 SecurityEvent |

## 2. 组织、成员与 RBAC

### 当前证据

- `Membership`、`ROLE_MATRIX` 已存在。
- 但多个组织资源 view 未显式检查 membership。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | 统一组织资源 guard | 所有 org/project/asset/task/billing/config API 都用同一权限函数 |
| P0 | 跨组织访问测试 | A 用户访问 B 组织项目返回 403/404 |
| P0 | viewer/creator/ops/admin 权限测试 | 每个角色能力与 ROLE_MATRIX 一致 |
| P1 | 成员邀请 | admin 可邀请、取消邀请、改角色、移除成员 |
| P1 | 组织切换器 | 多组织用户可切换，query key 和 localStorage 同步 |
| P2 | SSO 预留 | Enterprise plan 可接 SAML/OIDC |

## 3. 首页 Dashboard

### 当前证据

- `AnalyticsDashboardView` 返回任务、成本、资产、社区、项目、趋势。
- `App.tsx` 顶部通知中心使用 dashboard recent_tasks。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P1 | 首页变成行动面板 | 空状态、失败任务、继续项目、额度提醒均有 CTA |
| P1 | 增加任务中心入口 | active/failed/succeeded 可筛选查看 |
| P1 | Dashboard 聚合默认近 30 天 | 大组织不会全表聚合 |
| P2 | 用户行为漏斗 | onboarding、首个项目、首个任务、首个资产可见 |

## 4. Onboarding

### 当前证据

- `OnboardingModal` 是本地 state 流程。
- `completeOnboarding()` 构造本地 content package，不保证写后端品牌记忆。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P1 | Onboarding 写入 Project.brand_context | 刷新后项目页可见 |
| P1 | 无项目时自动创建项目和 Campaign | 新用户完成引导后有真实项目 |
| P1 | 引导后提交第一份内容包任务 | GenerationTask 和 Asset 均创建 |
| P2 | 每步埋点 | 后台能看每步流失 |

## 5. 项目与品牌记忆

### 当前证据

- `ProjectManager` 已支持项目、文件夹、筛选、品牌记忆编辑。
- 后端 `Project.brand_context` 是 JSONField。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | 项目 API 权限隔离 | 非成员不可读写项目 |
| P1 | 品牌记忆结构化 | 基础、受众、风格、禁区、渠道、参考分区 |
| P1 | 完整度评分 | 缺失项有提示，不阻塞高级用户 |
| P1 | 品牌记忆影响生成 | task payload 或 metadata 记录使用的 brand_context 版本 |
| P2 | 品牌记忆版本恢复 | 可查看和恢复历史版本 |

## 6. 一键内容包

### 当前证据

- `ContentPackageView` 直接同步调用 `generate_content_package()`。
- 前端 `ContentPackagePanel` 负责内容包体验。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P1 | 内容包异步任务化 | HTTP 快速返回 task id，结果可轮询恢复 |
| P1 | 结果自动入资产 | 文案、分镜、图片提示词分 asset 或 compound asset |
| P1 | 导出 Markdown/PDF | 导出写 AuditLog |
| P2 | 多渠道版本 | 小红书/抖音/公众号可并行生成和对比 |

## 7. 单项生成：文案、图片、分镜、音频、视频

### 当前证据

- 各生成 view 支持 sync 和 async 分支。
- async 分支存在 `queue_generation_task` 未导入风险。
- `useGenerationTask` 支持轮询，视频轮询 150 次、3 秒间隔。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | 修复 async 分支引用 | 所有 async=true 接口不 500 |
| P0 | 真实 AI 调用强制异步 | sync 只允许 mock/test 或短任务 |
| P1 | 统一任务卡片 | 所有生成入口状态和错误体验一致 |
| P1 | 任务取消和重试 | queued/running 可取消，failed 可 retry |
| P1 | 成本预估 | 提交前提示额度，超额拦截 |
| P2 | 批量生成 | 同 brief 多渠道、多标题、多图版本 |

## 8. 工作流

### 当前证据

- `WorkspaceDraft` 保存 nodes/edges/viewport。
- `run_workspace_workflow()` 拓扑排序后逐节点同步运行。
- 节点失败后整体可 completed 或 failed，重试会 cascade downstream。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | 工作流运行权限检查保留并扩展 | 只有 creator/admin 可运行 |
| P1 | 工作流运行异步化 | 长工作流不阻塞 HTTP |
| P1 | 运行快照 | 每次 run 有 run_id，不覆盖历史输出 |
| P1 | 节点级失败恢复 | 只重试失败节点或从节点向后重跑 |
| P1 | 运行前校验 | 断边、循环、缺配置、预计成本提示 |
| P2 | 条件分支 | 基于 review score 或字段做分支 |
| P2 | 模板版本 | 成功工作流保存为版本化模板 |

## 9. 资产库

### 当前证据

- `Asset` 有 type/title/source_url/tags/metadata。
- `WorkspaceAssetsView` 有分页、筛选、搜索、新建。
- 前端 `AssetsLibrary` 有 grid、preview、create/edit/delete。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | 对象存储落地 | 历史媒体不依赖 provider 临时 URL |
| P0 | 资产权限隔离 | 非成员不可读写组织资产 |
| P1 | 资产详情页 | 来源任务、成本、模型、项目、审阅状态可见 |
| P1 | 删除进入回收站 | 支持恢复，硬删仅 admin |
| P1 | 批量操作 | 批量打标签、导出、删除 |
| P2 | 语义搜索 | 接入 embedding/vector backend |

## 10. 审阅

### 当前证据

- `ReviewPage` 主要是前端内容包版本切换。
- 后端有 `review` task type，但没有 ReviewItem 流程模型。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P1 | 新增审阅对象 | Asset 或 ReviewItem 有状态流转 |
| P1 | 评论和打回 | reviewer 可评论、approve、request changes |
| P1 | 公开发布前强制 review | 未通过不能 public publish |
| P2 | 字段级评论 | 对标题/段落/画面/脚本逐段评论 |

## 11. 模板库、社区、RAG

### 当前证据

- `CommunityCreationView` 默认全表。
- `RAGSearchView` 是关键词 fallback。
- `rag_search_upgrade_plan.md` 已存在未跟踪文件，不在本次修改。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | visibility 字段 | private/workspace/public 明确隔离 |
| P0 | RAG 默认不跨组织 | 只搜当前组织和授权 public |
| P1 | 公共发布确认 | 明示会公开哪些字段 |
| P1 | 模板 fork | fork_count 和来源模板可追踪 |
| P2 | 向量检索 | pgvector/外部向量库，支持品牌记忆召回 |

## 12. AI Gateway 与模型配置

### 当前证据

- 支持 agnes、openai、anthropic、gemini、local_proxy、mock。
- `AIConfiguration` 支持 organization、scope、billing_mode。
- `AIConfigModelsView` 可拉 live models。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | API Key 加密 | DB 不可读明文 key |
| P0 | AI Config 权限收紧 | 只有 admin 可读写敏感配置 |
| P0 | 关闭生产 mock fallback | 真实失败不能静默返回 demo |
| P1 | provider 健康检查 | last_validated_at、last_error 可见 |
| P1 | lane policy 可解释 | 文本/图片/音频/视频使用哪个模型可见 |
| P1 | 成本计算真实化 | 不只 estimate，使用 provider usage |
| P2 | 自动 fallback 策略 | admin 可配置 fallback chain |

## 13. 计费与额度

### 当前证据

- `PLAN_LIMITS` 有 free/pro/enterprise。
- `BillingPlansView` 可读写 subscription_plan。
- `UsageEvent` 和 `CreditLedgerEntry` 已存在。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | 计费写操作仅 admin | creator/viewer/ops 不可改 plan |
| P0 | 任务前额度拦截 | 余额不足返回 402，不创建真实 provider 调用 |
| P1 | 测试额度发放 | 后台可给组织/用户 grant credit |
| P1 | 用量拆分 | 按项目、成员、模型、任务类型展示 |
| P1 | BYOK 折扣解释 | 平台成本和 BYOK 调用分开 |
| P2 | 支付集成 | Stripe/Paddle/国内支付按市场决定 |

## 14. 运营后台

### 当前证据

- `AdminConsolePage` 与 `api/admin_console.py` 已有用户、组织、任务、安全事件、额度相关能力。
- 超级管理员和普通工作台已分离。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | 后台只允许 superuser | 已有测试保留 |
| P1 | 测试用户漏斗 | 注册、验证、首任务、首资产、留存可看 |
| P1 | 失败任务队列 | 可按 provider/task_type/failure_code 筛选 |
| P1 | 成本异常告警 | 单组织/单用户高消耗高亮 |
| P1 | 安全事件处理 | 冻结、解冻、重发验证、重置密码 |
| P2 | 运营备注 | 给用户/组织加内部 notes |

## 15. 全局 AI Assistant

### 当前证据

- `AssistantSession`、`AssistantMessage` 已持久化。
- `AssistantChatView` 使用 SSE，能调用工具。
- 前端有 `AssistantBubble`、`AssistantPanel`、`PageContextTracker`。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | Assistant 权限隔离 | session 必须属于当前 org/user |
| P1 | 工具调用权限 | assistant 调工具前复用同一 RBAC |
| P1 | 敏感操作确认 | 删除、发布、改 key、改计费不能直接执行 |
| P1 | 成本记录 | assistant LLM usage 写 UsageEvent |
| P2 | 上下文引用 | 回答能引用当前项目、资产、任务 |

## 16. 通知中心

### 当前证据

- `App.tsx` 从 dashboard recent_tasks 生成 notificationItems。
- 顶部有 active task、failed task、api health。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P1 | 后端通知模型 | 刷新后已读状态不丢失 |
| P1 | 任务完成通知 | 长任务完成后用户可回到结果 |
| P1 | 额度和安全通知 | 额度低、登录异常、key 失效可提醒 |
| P2 | 邮件通知 | 长视频完成/审阅请求可邮件通知 |

## 17. 搜索

### 当前证据

- 顶部 `globalSearch` 只是输入状态，未形成真实搜索体验。
- 项目和资产模块各自有局部搜索。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P1 | 全局搜索接口 | 搜项目、资产、任务、模板 |
| P1 | 搜索结果分组 | 每类显示 top 5 和跳转 |
| P2 | 语义搜索 | 品牌记忆、历史内容和资产 embedding |

## 18. 文档、法务和支持

### 当前证据

- footer 中 `[TERMS] [PRIVACY] [SUPPORT]` 是占位链接。

### Backlog

| 优先级 | 任务 | 验收标准 |
| --- | --- | --- |
| P0 | 隐私政策和测试条款 | footer 指向真实页面 |
| P0 | AI 生成免责声明 | 内容生成页和公开发布流程可见 |
| P1 | 支持入口 | 用户能提交 bug/反馈/联系运营 |
| P1 | 数据删除说明 | 用户知道如何删除项目和账号 |

## 19. 测试矩阵

### 后端 P0

- Auth tests：匿名、登录、过期、admin separation。
- RBAC tests：viewer/creator/ops/admin。
- Cross-org tests：所有资源类型。
- AI key tests：加密、脱敏、权限。
- Task tests：async submit、poll、retry、idempotency。
- Billing tests：quota deny、credit debit。
- Community tests：visibility 和 RAG scope。

### 前端 P0/P1

- AuthGate 状态恢复。
- Onboarding 写后端。
- 任务卡片状态。
- 项目切换状态一致。
- 生成失败错误文案。
- 资产详情和删除确认。
- AI 设置非 admin 不可见或只读。

### 手工验收脚本

1. 新用户注册、验证邮箱、完成 onboarding。
2. 创建项目，填写品牌记忆。
3. 生成内容包，查看任务进度。
4. 生成图片和视频，刷新页面恢复进度。
5. 在资产库找到结果，送审。
6. reviewer 打回，creator 修改，再批准。
7. admin 查看本组织成本和任务。
8. 尝试访问其他组织资源，确认失败。
9. 配置 BYOK key，验证模型列表，删除 key。
10. 额度不足时生成被拦截。

## 20. 最小上线测试范围

如果时间紧，最小可上线测试范围如下：

必须开放：

- 登录/注册/邮箱验证。
- 项目和品牌记忆。
- 一键内容包。
- 文案/图片生成。
- 资产库。
- 任务中心。
- 计费用量只读。
- 管理后台。

暂不开放或隐藏：

- 公开视频社区。
- 真实视频生成，除非队列和对象存储完成。
- 复杂工作流模板市场。
- 多组织自助切换。
- 支付购买。

隐藏策略：

- 导航项保留但显示“测试中”。
- 或通过 feature flag 控制。
- 不要让用户进入无法完成闭环的功能。

