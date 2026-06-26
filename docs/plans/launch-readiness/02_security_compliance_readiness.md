# 02 安全与合规上线计划

## 0. 目标

Marketing Hub 是多租户 AI SaaS。上线测试前的安全底线是：

- 账号可信。
- 组织隔离可信。
- 密钥托管可信。
- 资产访问可信。
- 成本消耗可信。
- 管理员行为可追踪。

如果这些不可信，用户体验做得再好也不适合开放外部测试。

## 1. 认证体系

### 1.1 当前状态

已有：

- 普通用户登录：`accounts/views.py:LoginView`
- 管理员独立登录：`AdminLoginView`
- `/auth/me/` 会恢复 session。
- 注册、邮箱验证、密码重置。
- `SecurityEvent` 记录登录成功/失败、管理员登录失败等。
- 前端用 `localStorage.mh_token='session'` 作为 UI 登录标记，真实认证依赖 cookie session。

### 1.2 风险

- 前端 `localStorage.mh_token` 只是 UI 标记，若 cookie 过期会出现短暂“以为已登录”的状态。
- Demo 登录在开发环境默认启用，若生产 env 误配会被保留。
- 缺少登录限速、失败锁定、设备管理、会话列表、强制下线。
- 邮箱验证链接和密码重置链接有效期 1 小时合理，但缺少使用后失效记录。

### 1.3 升级动作

P0：

- 生产 `VITE_ENABLE_DEMO_LOGIN=false`，隐藏 Demo 自动填充。
- 生产 `ALLOW_UNAUTHENTICATED_API=False`。
- `/auth/me/` 作为前端唯一登录真相；`localStorage.mh_token` 只能做 optimistic marker。
- 登录失败按 IP、账号、邮箱限速。
- 密码重置成功后记录 SecurityEvent，并让旧 session 失效。

P1：

- 增加会话管理：当前设备、最近登录、退出其他设备。
- 高风险操作二次验证：改 key、删除项目、公开发布、发放额度。
- 测试期支持邀请码/白名单注册，避免开放注册被刷。

验收标准：

- 清掉 cookie 但保留 localStorage 时，前端能自动回到登录页。
- 连续失败登录会被限速并记录 SecurityEvent。
- 超级管理员不能进入普通工作台，这一点现有测试已有，应继续保留。

## 2. 授权和多租户隔离

### 2.1 当前状态

已有：

- `Organization`、`Membership`、role：admin、creator、ops、viewer。
- `api/rbac.py` 有 role matrix。
- `api/permissions.py` 有 `IsOrganizationMember`、`CanManageOrganization`、`CanWriteOrganization` 等。
- `WorkflowRunView` 和 `WorkflowNodeRetryView` 显式检查 `organization_for_user()`。

### 2.2 主要风险

多个视图直接根据 request 中的 organization/project/campaign 参数查询资源，未统一确认当前用户 membership。典型风险：

- `ProjectCollectionView.get()` 可以按 organization slug 获取项目列表。
- `FolderCollectionView.get()` 可以按 organization slug 获取文件夹。
- `ProjectDetailView.get()` 通过 pk 获取项目详情，没有 membership check。
- `WorkspaceAssetsView` 依赖 `get_scope()`，而 `get_scope()` 对匿名用户会创建/返回 demo workspace。
- `BillingPlansView.post()` 修改套餐，未显式要求 admin。
- `CommunityCreationView.get()` 和 `RAGSearchView.get()` 默认全表。
- `AIConfigView.get()` 的 permission 对 safe method 放行。

### 2.3 统一权限模型

所有 API 按资源类型定义最低权限：

| 资源 | Read | Create/Update | Delete | Admin Action |
| --- | --- | --- | --- | --- |
| Organization | member | admin | platform admin | platform admin |
| Membership | admin | admin | admin | platform admin |
| Project | member | creator | admin | admin |
| Folder | member | creator | admin | admin |
| Campaign | member | creator | admin | admin |
| Brand Context | member | creator | admin | admin |
| WorkspaceDraft | member | creator | admin | admin |
| Workflow Run | creator | creator | admin | admin |
| GenerationTask | member | creator | admin | admin |
| Asset | member | creator | admin | admin |
| Billing | ops/admin read | admin write | admin | platform admin |
| AIConfiguration | admin | admin | admin | platform admin |
| Community Public | public read | creator publish | owner/admin | platform admin |
| Admin Console | none | none | none | superuser |

### 2.4 代码改造建议

新增服务函数：

- `get_member_organization_or_403(request, slug_or_id)`
- `get_project_for_member_or_403(request, pk)`
- `get_asset_for_member_or_403(request, pk)`
- `require_org_capability(request, organization, capability)`
- `filter_queryset_for_user(queryset, request.user, organization_field='organization')`

所有 view 第一行必须解析并校验组织，不允许散落查询。

P0 改造文件：

- `backend/workspaces/view_modules/projects.py`
- `backend/workspaces/view_modules/assets.py`
- `backend/workspaces/view_modules/workspace.py`
- `backend/workspaces/view_modules/campaigns.py`
- `backend/workspaces/view_modules/analytics.py`
- `backend/billing/views.py`
- `backend/community/views.py`
- `backend/ai_gateway/views.py`
- `backend/generation/views.py`

验收测试：

- user A 属于 org A，user B 属于 org B。
- user A 访问 org B project list 返回 403 或空。
- user A 通过 pk 访问 org B project detail 返回 404/403。
- viewer 创建项目返回 403。
- ops 可看 billing，不可改 plan。
- creator 可生成内容，不可改 AI Key。
- admin 可改 key、成员、套餐。

## 3. AI Key 和密钥治理

### 3.1 当前状态

`AIConfiguration`：

- organization 可为空，表示 platform config。
- BYOK 时 organization scoped。
- `api_key` 是普通 `CharField`。
- serializer 只返回 `api_key_masked`。
- `AIConfigModelsView` 会用保存的 api_key 拉模型列表。

### 3.2 风险

- 数据库明文保存客户密钥。
- 后台、备份、日志或调试 shell 可直接读取。
- 缺少密钥轮换、删除、最后使用时间、失败次数。
- `CanManageAIConfiguration` safe method 放行过宽。
- `resolve_staff_user_from_request()` 支持从 request username 解析 staff，生产环境不应依赖用户名参数授权。

### 3.3 升级动作

P0：

- 接入字段级加密：Django encrypted model field、KMS envelope encryption 或 Vault。
- `api_key` 只允许写入，不允许读取明文。
- 移除 request username 作为 staff 权限依据，所有管理行为只看 authenticated session。
- AI Config GET 仅 admin 可见，普通 creator 只能看到“是否已配置”和 provider 名称。
- AuditLog 记录 key_change，但 metadata 不存 key、base_url token、完整错误响应。

P1：

- AIConfiguration 增加：
  - `key_fingerprint`
  - `last_validated_at`
  - `last_used_at`
  - `last_error`
  - `rotation_required`
  - `created_by`
  - `updated_by`
- 删除 key 时软删除或清空密文字段并记录审计。
- BYOK key 支持测试调用，不成功不激活。

验收标准：

- 数据库中无法看到原始 key。
- 非 admin 访问 `/ai/config/` 返回 403 或脱敏摘要。
- 修改 key 后 AuditLog 可追踪 actor、org、provider、scope。

## 4. 生产配置安全

### 4.1 当前状态

`settings.py` 已有不少生产开关：

- `DJANGO_DEBUG`
- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `CORS_ALLOW_ALL_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `SESSION_COOKIE_SECURE`
- `CSRF_COOKIE_SECURE`
- `SECURE_SSL_REDIRECT`
- `SECURE_HSTS_SECONDS`
- `AI_ALLOW_MOCK_PROVIDER`
- `AI_ALLOW_MOCK_FALLBACK`
- `ALLOW_UNAUTHENTICATED_API`

CI 已有 `manage.py check --deploy` smoke check。

### 4.2 风险

- `docker-compose.yml` 默认 `DJANGO_DEBUG=true`。
- `backend/Dockerfile` 使用 `runserver`。
- `frontend/Dockerfile` 使用 Vite dev server。
- 本地 env 默认允许 CORS all、mock provider、unauthenticated API。
- 生产安全配置依赖人为正确设置。

### 4.3 升级动作

新增 `.env.production.example`：

```env
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=<required>
DJANGO_ALLOWED_HOSTS=api.example.com
CORS_ALLOW_ALL_ORIGINS=False
CSRF_TRUSTED_ORIGINS=https://app.example.com
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=True
SECURE_HSTS_PRELOAD=True
ALLOW_UNAUTHENTICATED_API=False
MARKETING_HUB_BOOTSTRAP_DEMO=False
AI_ALLOW_MOCK_PROVIDER=False
AI_ALLOW_MOCK_FALLBACK=False
CELERY_TASK_ALWAYS_EAGER=False
```

新增 Django startup check：

- 如果 `DEBUG=False` 且 `ALLOW_UNAUTHENTICATED_API=True`，直接 raise。
- 如果 `DEBUG=False` 且 `AI_ALLOW_MOCK_FALLBACK=True`，直接 raise 或 warning fail。
- 如果 `DEBUG=False` 且 `MARKETING_HUB_BOOTSTRAP_DEMO=True`，直接 raise。
- 如果 `DEBUG=False` 且 SESSION/CSRF secure 不为 true，直接 raise。

验收标准：

- 生产配置缺失时应用启动失败，而不是带风险启动。
- CI 增加一组“危险生产 env 会失败”的测试。

## 5. 数据安全和隐私

### 5.1 敏感数据分类

| 数据 | 敏感级别 | 存储位置 | 处理要求 |
| --- | --- | --- | --- |
| 用户邮箱 | 中 | User.email | 不写公开日志 |
| 密码 | 高 | Django hash | 使用 Django password validators |
| AI Key | 极高 | AIConfiguration | 加密、审计、最小可见 |
| 品牌 brief | 高 | Project.brand_context、GenerationTask.payload | 组织隔离、导出审计 |
| 生成结果 | 中/高 | Asset.metadata、GenerationTask.result | 可删除、可导出 |
| 社区作品 | 可公开/高 | CommunityCreation | visibility、发布确认 |
| IP/User-Agent | 中 | SecurityEvent/AuditLog | 留存期限 |
| 成本和账单 | 高 | UsageEvent/CreditLedgerEntry | admin/ops 可见 |

### 5.2 升级动作

- 增加数据删除策略：用户删除、组织删除、项目删除、资产删除。
- 删除操作默认软删或进入回收站，硬删仅 admin 或后台任务。
- 导出行为写 AuditLog action=`export`。
- 社区公开发布前显示“将公开以下字段”。
- 生成任务 payload/result 对敏感字段做 redaction preview。
- 定义日志留存周期：SecurityEvent 180 天，AuditLog 1 年，原始 provider response 不入库或短期保留。

## 6. 内容安全

### 6.1 当前缺口

已有 `review` task type，但还没有作为所有公开/导出流程的强制安全门。

### 6.2 升级动作

- 发布到 public community 前必须运行 review。
- 对高风险行业模板增加提示：医疗、金融、法律、食品功效、未成年人。
- 支持组织级禁用词。
- 支持渠道规则：小红书、抖音、公众号等平台敏感表达。
- 保存 review result 到资产 metadata。

验收标准：

- 命中禁用词时不能一键公开发布。
- review 结果可解释：字段、原因、建议改法。

## 7. 审计和安全运营

### 7.1 当前状态

已有 `AuditLog` 和 `SecurityEvent`，后台能查看部分安全事件。

### 7.2 必补事件

AuditLog action 应覆盖：

- project_create/update/delete/archive
- folder_create/update/delete
- campaign_create/update/delete
- asset_create/update/delete/export
- community_publish/unpublish
- ai_key_create/update/delete/validate
- billing_change/credit_grant
- member_invite/member_role_change/member_remove
- workflow_run/workflow_retry/workflow_template_publish

注意：当前 `AuditLog.ACTION_CHOICES` 未包含 `asset_create`、`asset_update`、`asset_delete`，但 assets view 已在使用这些 action。虽然 Django choices 不一定产生数据库约束，这会让 admin form、序列化展示和治理口径不一致，应补齐。

SecurityEvent 应覆盖：

- login_failed/login_success/admin_login_failed/admin_login_success
- password_reset_requested/password_reset_completed
- email_verified
- suspicious_rate_limit
- cross_org_access_denied
- key_validation_failed
- account_suspended/account_unsuspended

验收标准：

- 后台能按 actor、org、target、action、时间筛选。
- 高风险事件可导出给运营排查。

## 8. 安全测试清单

P0 自动化测试：

- 匿名访问所有非公开 API 返回 401/403。
- viewer 无法创建、修改、删除项目、资产、工作流。
- creator 无法管理成员、AI Key、套餐。
- ops 可查看计费，不可改套餐。
- admin 可管理组织资源，但不能访问别的组织。
- superuser 不能进入普通工作台，只能 admin console。
- CSRF 缺失时 POST/PATCH/DELETE 失败。
- AI Key 不出现在任何 API response。
- Community 私有内容不出现在其他组织搜索。
- RAG 搜索默认不跨组织。

P1 手工测试：

- 登录失败限速。
- 密码重置旧链接失效。
- 邮箱验证重复点击行为正确。
- 删除项目/资产有二次确认和审计。
- 公开发布有 review 和确认。

