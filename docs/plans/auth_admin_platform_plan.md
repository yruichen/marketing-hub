# 登录注册与管理员后台建设计划

版本：V1  
日期：2026-06-26  
范围：用户登录注册、邮箱验证、测试账号保留、反恶意注册、管理员后台、后台日志、额度发放、审计与上线验收

## 1. 背景

Marketing Hub 当前为了演示保留了简化认证：前端默认填入 `ROOT / 123`，后端通过 Django session 登录，`api.apps` 在本地或 demo bootstrap 时自动创建 ROOT 超级用户。这个方案适合演示，但不适合进入小范围测试。

进入真实测试前，必须补齐一套完整的账号系统和运营后台能力。目标不是一开始就做复杂企业级 IAM，而是建立一条安全、可运营、可审计、可扩展的基础线：

- 用户可以注册、登录、退出、找回密码。
- 注册必须绑定邮箱，并具备基本反滥用机制。
- ROOT / 123 测试账号继续保留，但只能用于受控测试环境。
- 管理员可以查看用户、组织、任务、用量、审计日志。
- 管理员可以给测试用户发放额度、调整套餐、冻结异常账号。
- 所有敏感操作必须有审计记录。

## 2. 当前现状

### 2.1 已有基础

后端已有：

- Django `auth.User`。
- SessionAuthentication 和 CSRF 基础。
- `accounts.views.LoginView`，支持用户名密码登录。
- `api.apps.create_demo_user_and_config`，可创建 `ROOT / 123` demo superuser。
- `Organization`、`Membership`、`RBAC` 和权限类。
- `AuditLog`，可记录 login、member_change、billing_change、generation_create、workflow_run 等事件。
- `UsageEvent` 和 `GenerationTask`，可统计 token、成本、任务状态。
- Django admin 已注册 Organization、Membership、Project、GenerationTask、UsageEvent、AIConfiguration、AuditLog 等模型。
- `BillingPlansView` 能查看套餐和用量，并能切换组织 plan。

前端已有：

- `LoginPortal` 和登录表单。
- 默认登录表单值 `ROOT / 123`。
- `apiFetch` 处理 session 和 CSRF。
- Billing 页面展示套餐和用量。

### 2.2 主要缺口

上线测试前必须补齐：

- 没有注册接口。
- 没有邮箱验证。
- 没有密码重置。
- 没有登录失败限流。
- 没有注册限流、邮箱域名策略、验证码或邀请机制。
- 没有用户状态管理，例如待验证、已冻结、已删除。
- 没有组织创建流程。
- 没有运营后台页面，只依赖 Django admin。
- 没有额度发放模型，当前套餐限制是静态计划。
- 没有管理员可读的后台日志聚合页。
- 没有明确区分 demo/test/prod 的 ROOT 账号策略。

## 3. 产品目标

### 3.1 用户侧目标

用户应该可以完成：

- 邮箱注册。
- 邮箱验证后登录。
- 使用邮箱或用户名登录。
- 忘记密码并通过邮箱重置。
- 查看自己所属组织。
- 退出登录。
- 测试阶段可使用 ROOT / 123 快速进入演示环境。

### 3.2 管理员侧目标

管理员应该可以完成：

- 查看用户列表、组织列表和成员关系。
- 查看用户注册来源、邮箱验证状态、最近登录时间和账号状态。
- 冻结或解冻账号。
- 查看组织套餐、额度、用量和任务成功率。
- 给组织或用户发放测试额度。
- 调整套餐和额度有效期。
- 查看生成任务、失败原因、模型调用日志和审计日志。
- 导出测试期数据摘要。
- 标记异常账号或恶意注册来源。

### 3.3 安全目标

基础安全要求：

- 注册必须验证邮箱。
- 密码使用 Django password hasher，不自定义明文存储。
- 登录、注册、重置密码必须限流。
- 所有管理员操作必须记录 AuditLog。
- 生产环境默认禁止自动创建 ROOT / 123。
- ROOT / 123 只能在测试或 demo 环境开启。
- 管理员后台只能 staff/superuser 访问。
- 额度发放、套餐调整、账号冻结必须具备权限检查和审计。

## 4. 账号体系设计

### 4.1 用户模型策略

第一阶段继续使用 Django 内置 `auth.User`，通过扩展 Profile 模型承载产品字段，避免在上线前切换自定义 User 模型带来迁移风险。

新增模型建议：

```py
class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    email_verified = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=[
        ('pending', 'Pending'),
        ('active', 'Active'),
        ('suspended', 'Suspended'),
        ('deleted', 'Deleted'),
    ], default='pending')
    signup_source = models.CharField(max_length=60, blank=True, default='')
    signup_ip = models.GenericIPAddressField(null=True, blank=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    last_login_user_agent = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

后续企业级阶段再评估是否切换自定义 `AUTH_USER_MODEL`。如果现在直接切换，迁移成本和回归风险较高。

### 4.2 注册流程

注册字段：

- 邮箱。
- 密码。
- 用户名或昵称。
- 组织名称。
- 邀请码或测试资格码，测试期建议必填。

流程：

1. 用户提交注册表单。
2. 后端校验邮箱格式、密码强度、邮箱唯一性、IP 限流、邀请码。
3. 创建 inactive user 或 pending profile。
4. 创建默认 organization。
5. 创建 Membership，注册者为 organization admin。
6. 发送邮箱验证链接。
7. 用户点击验证链接后，账号变为 active。
8. 首次登录进入 onboarding。

测试期建议：

- 使用邀请码控制注册规模。
- 每个邀请码可限制使用次数和过期时间。
- 同一 IP、同一邮箱域名、同一设备指纹超过阈值进入人工审核。

### 4.3 登录流程

登录支持：

- 邮箱 + 密码。
- 用户名 + 密码，保留 ROOT 测试账号兼容。

登录校验：

- 用户存在。
- 密码正确。
- 账号未冻结。
- 邮箱已验证，ROOT 和受控测试账号可豁免。
- 登录失败次数未超过限制。

登录成功后：

- Django session login。
- 返回 CSRF token。
- 记录 AuditLog action=`login`。
- 更新 UserProfile 最近登录 IP 和 UA。
- 返回用户、组织、角色、是否 staff、是否需要 onboarding。

### 4.4 退出登录

新增接口：

- `POST /api/auth/logout/`

行为：

- 调用 Django logout。
- 清理 session。
- 前端清理 localStorage 中的 `mh_token`、`mh_username`。
- 返回 204 或 success payload。

### 4.5 密码重置

新增流程：

- `POST /api/auth/password-reset/request/`
- `POST /api/auth/password-reset/confirm/`

要求：

- 重置邮件不暴露邮箱是否存在。
- token 有效期建议 30-60 分钟。
- 同一邮箱和同一 IP 限流。
- 重置成功后失效旧 session。
- 记录 AuditLog 或 SecurityEvent。

### 4.6 ROOT / 123 测试账号策略

必须保留 ROOT / 123，但要隔离环境。

规则：

- `MARKETING_HUB_BOOTSTRAP_DEMO=true` 时才自动创建 ROOT。
- 生产环境默认 `MARKETING_HUB_BOOTSTRAP_DEMO=false`。
- ROOT 必须是 staff/superuser，但只用于测试环境。
- 小范围测试可以保留 ROOT，但需要在运营后台标记为 `demo_account=true`。
- ROOT 登录可以绕过邮箱验证，但必须记录审计日志。
- 正式公开上线前必须禁用 ROOT / 123 或更换强密码并移除前端默认填充。

前端策略：

- 测试环境继续展示“演示账号 ROOT / 123”快捷填充。
- 生产环境不展示默认账号。
- 通过 `VITE_ENABLE_DEMO_LOGIN=true` 控制。

## 5. 反恶意注册设计

### 5.1 测试期优先方案

小范围测试阶段推荐采用“邀请码 + 邮箱验证 + 限流”的组合，而不是一开始接入复杂验证码。

必须做：

- 邀请码。
- 邮箱验证。
- IP 注册限流。
- 邮箱注册限流。
- 登录失败限流。
- 密码重置限流。
- 管理员冻结账号。

可选做：

- Cloudflare Turnstile 或 hCaptcha。
- 邮箱域名黑名单。
- 一次性邮箱检测。
- 用户代理和 IP 风险评分。

### 5.2 限流策略

建议阈值：

- 注册：同 IP 每小时最多 5 次。
- 邮箱验证邮件：同邮箱每小时最多 3 次。
- 登录失败：同账号 10 分钟 5 次后短暂锁定。
- 密码重置：同邮箱每小时 3 次。
- 邀请码尝试：同 IP 每小时 10 次。

实现方式：

- 第一阶段使用 Django cache + Redis。
- 中长期增加 `SecurityEvent` 持久化记录。

### 5.3 邀请码模型

新增模型建议：

```py
class SignupInvite(models.Model):
    code_hash = models.CharField(max_length=128, unique=True)
    label = models.CharField(max_length=100, blank=True, default='')
    max_uses = models.PositiveIntegerField(default=1)
    used_count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
```

注意：

- 邀请码不要明文存储，存 hash。
- 使用时记录使用者、IP、时间。
- 管理后台可生成、禁用、查看使用次数。

## 6. 管理员后台设计

### 6.1 后台形态选择

Phase 1 使用 Django admin 快速补齐运营能力。  
Phase 2 增加产品内运营后台页面。  
Phase 3 做更完整的运营控制台和报表。

理由：

- Django admin 已存在且适合内部测试期。
- 小范围测试最需要的是“能查、能改、能审计”，不是完整漂亮的后台产品。
- 产品内运营后台适合后续给非技术运营使用。

### 6.2 Django Admin 增强项

需要增强：

- UserAdmin 增加 email、is_active、is_staff、last_login、profile status、email_verified。
- UserProfileAdmin。
- SignupInviteAdmin。
- OrganizationAdmin 增加 subscription_plan、额度余额、成员数、任务数。
- MembershipAdmin 增加组织和角色筛选。
- GenerationTaskAdmin 增加 status、task_type、organization、created_at、错误信息搜索。
- UsageEventAdmin 增加 provider、model、organization、时间范围筛选。
- AuditLogAdmin 增加 actor、action、IP、target_type、metadata 展示。
- CreditGrantAdmin，用于额度发放记录。
- SecurityEventAdmin，用于注册、登录失败、限流、冻结记录。

### 6.3 产品内运营后台

路径建议：

- `/admin-console`

访问权限：

- 仅 staff 或 superuser。
- 后续可加 platform_admin 角色。

页面结构：

- 总览：用户数、组织数、今日注册、今日任务、失败任务、用量成本。
- 用户：搜索邮箱/用户名，查看状态，冻结/解冻，重发验证邮件。
- 组织：查看套餐、成员、项目、用量，调整 plan。
- 额度：发放测试额度，查看发放记录和消耗记录。
- 任务：查看生成任务、失败原因、重试入口。
- 审计：查看管理员操作、登录、成员变更、计费变更。
- 风控：查看注册失败、登录失败、限流命中、可疑 IP。

### 6.4 后台日志

后台日志分三类：

- AuditLog：业务和管理员操作。
- SecurityEvent：认证、安全和风控事件。
- SystemLog 或外部日志：服务异常、队列异常、provider 调用异常。

建议先落地：

```py
class SecurityEvent(models.Model):
    event_type = models.CharField(max_length=40)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    email = models.EmailField(blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default='')
    risk_level = models.CharField(max_length=20, default='low')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

事件类型：

- register_attempt
- register_success
- email_verify_success
- login_failed
- login_success
- password_reset_requested
- password_reset_success
- rate_limited
- account_suspended
- account_unsuspended

## 7. 额度发放设计

### 7.1 当前问题

当前 Billing 主要是 plan limit 和 UsageEvent 统计，没有“额度余额”和“运营发放记录”。测试期需要给种子用户手动发额度，并追踪为什么发、谁发的、什么时候过期。

### 7.2 额度模型

新增模型建议：

```py
class CreditGrant(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='credit_grants')
    granted_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    amount_cents = models.PositiveIntegerField(default=0)
    reason = models.CharField(max_length=160)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

```py
class CreditLedgerEntry(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='credit_ledger')
    source = models.CharField(max_length=40)
    delta_cents = models.IntegerField()
    balance_after_cents = models.IntegerField()
    usage_event = models.ForeignKey(UsageEvent, null=True, blank=True, on_delete=models.SET_NULL)
    credit_grant = models.ForeignKey(CreditGrant, null=True, blank=True, on_delete=models.SET_NULL)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

### 7.3 额度消耗

第一阶段：

- 仍保留 PLAN_LIMITS。
- 新增测试额度只做展示和软限制。
- UsageEvent 生成后写 ledger debit。
- 余额不足时先 warning，不立即硬拦截。

第二阶段：

- 按 organization 做硬限制。
- 支持平台额度和 BYOK 模式差异。
- 支持超额审批或自动降级到 mock。

### 7.4 管理员发放流程

流程：

1. 管理员进入组织详情。
2. 点击发放测试额度。
3. 输入金额、原因、过期时间。
4. 系统创建 CreditGrant 和 CreditLedgerEntry。
5. 记录 AuditLog action=`billing_change` 或新增 `credit_grant`。
6. 用户在计费页看到测试额度余额和有效期。

## 8. API 规划

### 8.1 用户认证 API

新增：

- `POST /api/auth/register/`
- `POST /api/auth/email/verify/`
- `POST /api/auth/email/resend/`
- `POST /api/auth/login/`
- `POST /api/auth/logout/`
- `GET /api/auth/me/`
- `POST /api/auth/password-reset/request/`
- `POST /api/auth/password-reset/confirm/`

保留：

- 当前 `POST /api/auth/login/`，但扩展为支持 email 和 username。

### 8.2 管理员 API

新增：

- `GET /api/admin-console/summary/`
- `GET /api/admin-console/users/`
- `PATCH /api/admin-console/users/<id>/`
- `POST /api/admin-console/users/<id>/resend-verification/`
- `GET /api/admin-console/organizations/`
- `PATCH /api/admin-console/organizations/<id>/plan/`
- `POST /api/admin-console/organizations/<id>/credits/`
- `GET /api/admin-console/tasks/`
- `GET /api/admin-console/audit-logs/`
- `GET /api/admin-console/security-events/`
- `POST /api/admin-console/invites/`

权限：

- 统一 `IsPlatformAdmin`。
- 第一阶段映射为 `request.user.is_staff or request.user.is_superuser`。

## 9. 前端页面规划

### 9.1 登录注册页

当前 LoginPortal 需要扩展为 auth flow：

- 登录。
- 注册。
- 邮箱验证提示。
- 忘记密码。
- 重置密码。
- ROOT / 123 快速填充，仅测试环境展示。

前端状态：

```ts
type AuthMode =
  | 'login'
  | 'register'
  | 'verify-email'
  | 'forgot-password'
  | 'reset-password';
```

注册表单字段：

- email
- username
- organizationName
- password
- inviteCode

### 9.2 管理员后台

新增 feature：

- `frontend/src/features/admin-console/`

页面：

- `AdminConsolePage.tsx`
- `AdminUsersPage.tsx`
- `AdminOrganizationsPage.tsx`
- `AdminCreditsPage.tsx`
- `AdminTasksPage.tsx`
- `AdminAuditLogsPage.tsx`
- `AdminSecurityEventsPage.tsx`

导航：

- 只对 staff/superuser 展示后台入口。
- 不和普通用户主导航混在一起，建议放账号菜单或设置区。

## 10. Phase 规划

### Phase 0：测试账号和环境开关

目标：保留 demo 便利性，但避免进入生产。

后端：

- 明确 `MARKETING_HUB_BOOTSTRAP_DEMO` 默认值。
- 生产环境强制不自动创建 ROOT。
- ROOT 登录审计标记 `demo_account=true`。
- `GET /api/auth/me/` 返回当前用户、角色、staff 状态。

前端：

- 增加 `VITE_ENABLE_DEMO_LOGIN`。
- 只有开启时才展示 ROOT / 123 快捷登录。
- 登录成功后使用 `/auth/me/` 初始化用户状态。

验收：

- 本地测试仍可 ROOT / 123 登录。
- 生产配置不会自动创建 ROOT / 123。

### Phase 1：注册、邮箱验证和密码重置

目标：让真实测试用户可以自助进入系统。

后端：

- 新增 UserProfile。
- 新增注册接口。
- 新增邮箱验证 token。
- 新增重发验证邮件。
- 新增忘记密码和重置密码。
- 注册后自动创建 organization 和 admin membership。
- 登录检查 email_verified 和 profile.status。

前端：

- 登录页增加注册、验证提示、忘记密码。
- 注册成功后进入“检查邮箱”状态。
- 登录错误文案明确区分未验证、被冻结、密码错误。

验收：

- 新用户可通过邮箱注册并验证后登录。
- 未验证邮箱不能进入主产品。
- 忘记密码可完成重置。
- ROOT / 123 仍可在测试环境登录。

### Phase 2：反恶意注册和邀请机制

目标：小范围测试可控，不被恶意注册污染。

后端：

- 新增 SignupInvite。
- 注册必须校验邀请码。
- Django cache + Redis 实现注册、登录、重置密码限流。
- 新增 SecurityEvent。
- 登录失败、注册失败、限流命中写 SecurityEvent。
- 管理员可冻结用户。

前端：

- 注册表单增加邀请码。
- 限流提示使用明确业务文案。
- 冻结账号提示联系管理员。

验收：

- 无邀请码不能注册。
- 同 IP 高频注册会被限制。
- 登录失败多次会被短暂限制。
- 管理员可在后台看到 SecurityEvent。

### Phase 3：Django Admin 运营后台增强

目标：先让内部团队能运营测试用户。

后端：

- 增强 UserAdmin、OrganizationAdmin、GenerationTaskAdmin、UsageEventAdmin、AuditLogAdmin。
- 新增 UserProfileAdmin、SignupInviteAdmin、SecurityEventAdmin。
- 新增 CreditGrant 和 CreditLedgerEntry。
- 管理员可以在 Django admin 发放测试额度。
- 所有额度和账号状态变更写 AuditLog。

验收：

- 管理员能查用户、组织、任务、用量、日志。
- 管理员能发放额度。
- 管理员能冻结账号。
- 所有后台修改可审计。

### Phase 4：产品内管理员后台

目标：让非技术运营也能管理测试。

后端：

- 新增 admin-console API。
- 加 `IsPlatformAdmin` 权限。
- 支持用户搜索、组织搜索、任务筛选、日志筛选、额度发放。

前端：

- 新增 Admin Console 页面。
- 总览页展示注册、任务、失败率、成本、异常。
- 用户页支持冻结、解冻、重发验证邮件。
- 组织页支持调套餐、发额度。
- 日志页支持按用户、组织、动作、时间筛选。

验收：

- staff 用户可以不用 Django admin 完成日常运营。
- 普通用户看不到后台入口，也不能访问后台 API。

### Phase 5：生产级安全和合规加固

目标：为更大范围上线做准备。

任务：

- 接入邮件服务商，例如 SES、Resend、SendGrid。
- 接入 Turnstile 或 hCaptcha。
- 强化 session cookie：Secure、HttpOnly、SameSite。
- 增加 Sentry 和结构化日志。
- 增加导出审计日志。
- 增加数据删除和账号注销流程。
- 增加管理员二次确认和高风险操作确认。
- 后续评估 SSO、OAuth、企业域名白名单。

验收：

- 生产环境安全配置通过 checklist。
- 管理员操作可追踪。
- 用户数据删除路径明确。

## 11. 数据迁移和兼容策略

### 11.1 ROOT 账号兼容

- 保留现有 ROOT 用户。
- 创建 UserProfile 时为 ROOT 设置 `email_verified=true`、`status=active`。
- ROOT 所属 demo organization 保持不变。

### 11.2 现有用户兼容

迁移时：

- 为所有 User 创建 UserProfile。
- 有 email 的用户默认 `email_verified=false`，但 staff/superuser 可默认 true。
- 无 email 的用户标记需要补全邮箱。
- 现有 Membership 不变。

### 11.3 前端兼容

- localStorage 中旧 `mh_token=session` 暂时保留兼容。
- 登录成功后用 `/auth/me/` 刷新用户信息。
- 后续移除对 `mh_username` 的强依赖，改用 auth user context。

## 12. 验收清单

上线小范围测试前至少完成：

- ROOT / 123 在测试环境可用。
- 生产环境不会自动创建 ROOT / 123。
- 新用户可邮箱注册。
- 注册必须邮箱验证。
- 用户可忘记密码并重置。
- 注册有邀请码或等价测试资格控制。
- 登录、注册、重置密码有限流。
- 管理员能查看用户和组织。
- 管理员能冻结账号。
- 管理员能查看 AuditLog 和 SecurityEvent。
- 管理员能发放测试额度。
- 额度发放有记录、有原因、有操作者。
- 普通用户不能访问后台 API。
- `uv run python manage.py check` 通过。
- 后端认证相关测试通过。
- 前端登录、注册、忘记密码、后台入口基础流程通过。

## 13. 风险和取舍

### 13.1 不建议立刻自定义 User 模型

现在已经有数据模型依赖 `auth.User`。上线前直接切换 `AUTH_USER_MODEL` 风险较高。建议通过 UserProfile 扩展，等产品进入更稳定阶段再评估。

### 13.2 不建议一开始重做复杂后台

小范围测试期最重要的是运营可用。Django admin 增强能最快解决查日志、冻结账号、发额度的问题。产品内 Admin Console 放到 Phase 4。

### 13.3 不建议公开注册

测试期开放注册容易引入恶意账号、垃圾数据和成本风险。建议邀请码制，等反滥用和额度硬限制稳定后再开放。

### 13.4 不建议过早承诺企业级 SSO

SSO、SCIM、企业域名绑定属于企业级销售阶段能力。当前先补齐邮箱、密码、session、安全日志和后台运营。

## 14. 成功标准

第一阶段上线测试成功标准：

- 测试用户可以自助注册并完成邮箱验证。
- 运营可以在 1 分钟内查到某个用户、组织和最近失败任务。
- 运营可以给组织发放测试额度并留下审计记录。
- 恶意注册可以被邀请码和限流挡住。
- ROOT / 123 不影响正式测试用户路径。
- 账号、额度和后台操作的核心事件都有日志可查。
