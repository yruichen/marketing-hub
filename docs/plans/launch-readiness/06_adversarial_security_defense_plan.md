# 06 全功能上线代码级安全改进计划

版本：V2 代码审计版  
日期：2026-06-27  
目标：在 Marketing Hub 全部功能上线测试的前提下，把“世界级黑客测试用户”带来的风险转化为可执行的代码改造、测试用例和验收标准。  
范围：`backend/` Django + DRF、`frontend/` React、CI、全功能上线测试配置。

## 0. 结论

当前代码已经有基础安全意识：session auth、CSRF、`Membership`、`ROLE_MATRIX`、`AuditLog`、`SecurityEvent`、AI config 脱敏序列化、任务幂等键、部分 workflow 权限检查。

本计划不建议通过砍功能、隐藏模块或只开放部分路径来降低风险。产品要全量上线测试，就应该让账号、组织、项目、工作流、生成、资产、社区、RAG、计费、AI 配置、管理后台全部可用；对应的代码改进目标是：每个功能入口都有对象级权限、角色能力、预算/频率约束、输入边界、审计和回归测试。

如果邀请顶尖黑客做全功能测试，主要风险不是“有没有防火墙”，而是代码层面仍有几类可直接被打的洞：

| 风险 | 当前代码证据 | 影响 | 优先级 |
| --- | --- | --- | --- |
| 组织资源 API 没有统一 membership guard | `ProjectCollectionView`、`FolderCollectionView`、`CommunityCreationView`、`BillingPlansView` 等直接按 slug/pk 查数据 | 跨租户读写 | P0 |
| `get_scope()` 会为未认证或无组织用户回落到 demo workspace | `backend/api/scope.py:get_scope()` 调用 `ensure_demo_workspace(username)` | 生产误配时匿名用户进入共享空间 | P0 |
| AI 配置权限类安全方法直接放行 | `CanManageAIConfiguration.has_permission()` 对 `SAFE_METHODS` 返回 True | 非 admin 可读 AI 配置摘要和 CSRF 探针路径 | P0 |
| `resolve_staff_user_from_request()` 支持从 query/body username 解析 staff | `backend/api/permissions.py` | 如果被误用会形成“声明式管理员”授权 | P0 |
| AI Key 明文存储 | `AIConfiguration.api_key = models.CharField(...)` | DB/备份/日志泄露时直接暴露客户 key | P0 |
| 生成 async 分支调用未导入函数 | `generation/views.py` 多处 `queue_generation_task(task)`，但 import 只有 `schedule_generation_task` | async 生成 500，测试期会被快速触发 | P0 |
| 任务创建前没有预算/并发拦截 | `create_generation_task()` 后才执行或入队，账本主要是事后记录 | AI 成本可被刷爆 | P0 |
| 高并发和重复请求防护不完整 | DRF throttle 只有基础 `anon/user/generation`；生产 Docker 仍是 `runserver`；Celery/DB/API 缺少统一背压 | 服务器、数据库、Redis、worker 或 provider 被打爆 | P0 |
| Community/RAG 默认全表 | `CommunityCreation.objects.all()` | 私有素材进入公共检索 | P0 |
| Billing POST 未限制 admin | `BillingPlansView.post()` 只通过 `get_scope()` 得到 org | creator/viewer 可能改套餐 | P0 |
| AuditLog action choices 与实际写入不一致 | assets view 写 `asset_create/update/delete`，`AuditLog.ACTION_CHOICES` 没有这些值 | 审计口径失真 | P1 |

本计划按代码修改顺序组织。每一节都包含：要改的文件、建议改法、测试用例和验收标准。所有建议默认保留功能能力，只把访问边界和执行条件补齐。

全功能上线约束：

- 不通过删除路由、隐藏主导航、关闭模块来达成上线。
- 账号、项目、工作流、内容包、单项生成、资产、社区、RAG、计费、AI 配置、后台运营都要保留完整入口。
- 风控逻辑只阻断非法身份、越权对象、超出套餐/额度/频率/输入边界的请求。
- Kill switch 或冻结能力只作为事故处置工具，不作为正常上线策略。

## 1. P0：把组织级访问收口到统一 Access Layer

### 1.1 问题

现在很多 view 自己解析 `organization`、`project`、`pk`：

- `backend/workspaces/view_modules/projects.py`
  - `FolderCollectionView.get()` 按 `organization` slug 过滤，没有确认当前用户是否属于该组织。
  - `ProjectCollectionView.get()` 同样按 slug 返回项目列表。
  - `ProjectDetailView.get/patch/delete()` 通过 pk 查询项目，再直接返回或修改。
- `backend/workspaces/view_modules/assets.py`
  - Asset detail 已经通过 `get_scope()` 的 org 过滤，但仍依赖 `get_scope()` 的 demo fallback。
- `backend/community/views.py`
  - `CommunityCreationView.get()` 和 `RAGSearchView.get()` 默认全表。
- `backend/billing/views.py`
  - `BillingPlansView.post()` 没有角色判断。
- `backend/generation/views.py`
  - 任务接口按 `get_scope()` 得到 org，依赖该函数正确隔离。

核心问题：权限检查散落在各 view 中，且 `get_scope()` 同时承担“选择工作区”和“授权”的职责，容易误用。

### 1.2 建议新增文件

新增 `backend/api/access.py`：

```python
from rest_framework.exceptions import NotFound, PermissionDenied

from api.models import Asset, Campaign, Folder, GenerationTask, Membership, Organization, Project, WorkspaceDraft
from api.rbac import permissions_for_role, role_at_least


def role_for(user, organization):
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    membership = Membership.objects.filter(user=user, organization=organization).only('role').first()
    return membership.role if membership else None


def require_member(user, organization):
    role = role_for(user, organization)
    if not role:
        raise PermissionDenied('Organization membership required.')
    return role


def require_role(user, organization, minimum_role):
    role = require_member(user, organization)
    if not role_at_least(role, minimum_role):
        raise PermissionDenied('Insufficient organization role.')
    return role


def require_capability(user, organization, capability):
    role = require_member(user, organization)
    if capability not in permissions_for_role(role):
        raise PermissionDenied('Insufficient organization capability.')
    return role


def get_organization_for_member(user, *, slug=None, pk=None):
    qs = Organization.objects.filter(memberships__user=user).distinct()
    if slug:
        qs = qs.filter(slug=slug)
    if pk:
        qs = qs.filter(pk=pk)
    org = qs.first()
    if not org:
        raise NotFound('Organization not found.')
    return org


def get_project_for_member(user, pk):
    project = Project.objects.select_related('organization', 'folder').filter(
        pk=pk,
        organization__memberships__user=user,
    ).first()
    if not project:
        raise NotFound('Project not found.')
    return project


def get_asset_for_member(user, pk):
    asset = Asset.objects.select_related('organization', 'project', 'campaign').filter(
        pk=pk,
        organization__memberships__user=user,
    ).first()
    if not asset:
        raise NotFound('Asset not found.')
    return asset


def get_task_for_member(user, pk):
    task = GenerationTask.objects.select_related('organization', 'project', 'campaign').filter(
        pk=pk,
        organization__memberships__user=user,
    ).first()
    if not task:
        raise NotFound('Task not found.')
    return task
```

说明：

- 对外返回建议用 404 而不是 403，避免通过 pk 枚举确认其他组织资源存在。
- `require_role()` 用于粗粒度角色，例如 billing/admin。
- `require_capability()` 用于匹配 `api/rbac.py` 已有能力矩阵。

### 1.3 改造 `get_scope()`

文件：`backend/api/scope.py`

建议拆成两个函数：

1. `get_request_workspace(request)`：只给已经认证的普通用户选择默认组织/项目/活动。
2. `get_demo_scope(request)`：仅开发和 demo bootstrap 显式调用。

P0 修改原则：

```python
def get_scope(request):
    user = authenticated_user(request)
    if not user:
        raise PermissionDenied('Authentication required.')
    if user.is_superuser:
        raise PermissionDenied('超级管理员只能使用独立后台，不能访问普通工作台。')

    org_slug = request.query_params.get('organization') or request.data.get('organization')
    org_query = Organization.objects.filter(memberships__user=user).distinct()
    org = org_query.filter(slug=org_slug).first() if org_slug else org_query.order_by('name').first()
    if not org:
        raise PermissionDenied('Organization membership required.')
    ...
```

只有在 `settings.DEBUG and settings.MARKETING_HUB_BOOTSTRAP_DEMO` 时，才允许 demo fallback。不要在 `get_scope()` 主路径里自动 `ensure_demo_workspace()`。

### 1.4 需要改的 view

| 文件 | 当前问题 | 改法 |
| --- | --- | --- |
| `backend/workspaces/view_modules/projects.py` | list/detail/create/update/delete 缺少统一成员检查 | `permission_classes=[IsAuthenticated]`；list 用 `Organization.objects.filter(memberships__user=request.user)`；detail 用 `get_project_for_member()`；写操作 `require_capability(..., 'project:write')` 或 `require_role(..., 'creator')` |
| `backend/workspaces/view_modules/assets.py` | 依赖 `get_scope()` fallback | `permission_classes=[IsAuthenticated]`；detail 改 `get_asset_for_member()`；post/patch/delete 加 creator/admin 能力判断 |
| `backend/workspaces/view_modules/campaigns.py` | draft/template/campaign 按 pk 查 | 对 campaign/draft/template 全部按 `organization__memberships__user=request.user` 过滤 |
| `backend/generation/views.py` | task/detail 依赖 scope | `TaskDetailView` 改 `get_task_for_member()`；生成类 view 写前 `require_role(user, org, 'creator')` |
| `backend/billing/views.py` | POST 未限制 admin | GET 要 `require_role(user, org, 'ops')`；POST 要 `require_role(user, org, 'admin')` |
| `backend/community/views.py` | 全表查询 | 见第 6 节 visibility 改造 |
| `backend/ai_gateway/views.py` | AI config 权限类有放行 | 见第 3 节 |

### 1.5 测试

新增 `backend/api/tests_security_access.py` 或并入 `backend/api/tests.py`：

- `test_project_list_does_not_return_other_org_projects`
- `test_project_detail_other_org_returns_404`
- `test_folder_list_requires_org_membership`
- `test_asset_detail_other_org_returns_404`
- `test_task_detail_other_org_returns_404`
- `test_viewer_cannot_create_project`
- `test_creator_cannot_update_billing_plan`
- `test_ops_can_read_billing_but_cannot_write`
- `test_admin_can_update_billing_plan`
- `test_superuser_cannot_use_workspace_scope`
- `test_anonymous_workspace_api_returns_401_or_403`

验收标准：所有组织级资源都必须有跨组织负例测试。

## 2. P0：修复权限类默认放行和 username 授权

### 2.1 当前代码

文件：`backend/api/permissions.py`

问题 1：

```python
class OrganizationRolePermission(BasePermission):
    required_role = 'viewer'
    allow_safe_without_membership = True

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS and self.allow_safe_without_membership:
            return True
```

问题 2：

```python
class CanManageAIConfiguration(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return resolve_staff_user_from_request(request) is not None
```

问题 3：

```python
def resolve_staff_user_from_request(request):
    ...
    username = request.data.get('username') or request.query_params.get('username')
```

### 2.2 建议改法

- `OrganizationRolePermission.allow_safe_without_membership` 默认改为 `False`。
- 如果确实存在公开 GET 接口，单独使用 `AllowAny` 或 `IsAuthenticatedOrReadOnly`，不要让组织权限类隐式放行。
- `CanManageAIConfiguration` 的 GET/POST 都要求：
  - 用户已登录。
  - 平台级配置：`user.is_staff or user.is_superuser`。
  - BYOK 组织级配置：用户是该组织 admin。
- 删除 `resolve_staff_user_from_request()` 里通过 `username` 参数解析 staff 的逻辑。真实 actor 只能来自 `request.user`。

建议实现：

```python
def resolve_staff_user_from_request(request) -> User | None:
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    if user.is_staff or user.is_superuser:
        return user
    organization = organization_from_request(request)
    if organization and role_at_least(organization_for_user(user, organization), 'admin'):
        return user
    return None
```

`CanManageAIConfiguration` 不要 safe method 放行：

```python
class CanManageAIConfiguration(BasePermission):
    def has_permission(self, request, view):
        return resolve_staff_user_from_request(request) is not None
```

### 2.3 测试

新增/调整 `backend/ai_gateway/tests.py`：

- `test_ai_config_get_requires_login`
- `test_ai_config_get_requires_org_admin_or_staff`
- `test_ai_config_post_ignores_username_staff_claim`
- `test_creator_cannot_read_ai_config`
- `test_admin_can_manage_org_byok_config`
- `test_platform_config_requires_staff`

验收标准：任何请求中传 `username=ROOT` 都不能获得管理员能力。

## 3. P0：AI Key 明文存储改为加密字段

### 3.1 当前代码

文件：`backend/api/models.py`

```python
api_key = models.CharField(max_length=255, blank=True, default='')
```

文件：`backend/api/serializers.py`

```python
def get_api_key_masked(self, obj):
    return f'{obj.api_key[:4]}...{obj.api_key[-4:]}'
```

当前只是 API 输出脱敏，DB 内仍是明文。

### 3.2 建议改法

新增字段和属性，避免迁移时立刻破坏旧代码：

```python
class AIConfiguration(models.Model):
    api_key_encrypted = models.TextField(blank=True, default='')
    api_key_fingerprint = models.CharField(max_length=64, blank=True, default='')
    api_key_last4 = models.CharField(max_length=8, blank=True, default='')
    key_updated_at = models.DateTimeField(null=True, blank=True)
```

新增 `backend/api/crypto.py`：

- 使用 `cryptography.fernet.Fernet` 或 KMS envelope encryption。
- env：`FIELD_ENCRYPTION_KEY`。
- `encrypt_secret(value: str) -> str`
- `decrypt_secret(value: str) -> str`
- `fingerprint_secret(value: str) -> str`，用 HMAC-SHA256，不要直接 hash key。

模型上提供方法：

```python
def set_api_key(self, raw_key: str):
    self.api_key_encrypted = encrypt_secret(raw_key)
    self.api_key_fingerprint = fingerprint_secret(raw_key)
    self.api_key_last4 = raw_key[-4:]
    self.key_updated_at = timezone.now()

def get_api_key(self) -> str:
    return decrypt_secret(self.api_key_encrypted) if self.api_key_encrypted else ''
```

迁移步骤：

1. 新增加密字段，保留旧 `api_key`。
2. data migration：把旧 `api_key` 加密写入 `api_key_encrypted`，填 last4/fingerprint。
3. 代码改为只读写 `set_api_key()` / `get_api_key()`。
4. 二次迁移删除旧 `api_key` 或保留为空字段。

### 3.3 需要同步改的调用点

| 文件 | 改法 |
| --- | --- |
| `backend/ai_gateway/views.py` | 保存时 `config.set_api_key(api_key)`；模型列表拉取时用 `saved_config.get_api_key()` |
| `backend/ai_gateway/gateway_modules/gateway.py` | adapter config 使用解密后的 key，不在日志输出 |
| `backend/ai_gateway/gateway_modules/adapters.py` | Gemini URL 不要在日志里出现 `?key=` 完整值 |
| `backend/ai_gateway/agent.py` | `HttpLlmClient` 构造参数不进入 repr/log |
| `backend/api/serializers.py` | `api_key_masked` 使用 `api_key_last4`，不读取明文 |

### 3.4 测试

- `test_ai_config_does_not_store_plain_api_key`
- `test_ai_config_serializer_never_returns_plain_key`
- `test_ai_config_key_rotation_changes_fingerprint`
- `test_provider_error_redacts_api_key`
- `test_missing_field_encryption_key_fails_in_production`

验收标准：数据库中搜索原始 key 字符串找不到。

## 4. P0：生成任务入口统一异步、预算和并发前置拦截

### 4.1 当前代码问题

文件：`backend/generation/views.py`

- `MarketingCopyView`、`ImageGenerateView`、`StoryboardView`、`AudioVoiceoverView`、`VideoGenerateView` 的 async 分支调用 `queue_generation_task(task)`，但 import 中没有该函数。
- 同文件已导入 `schedule_generation_task()`，`TaskQueueView.post()` 也用它。
- `request_username = request.data.get('username') or ...` 允许客户端声明 username，审计和任务归属应只使用 `request.user.username`。
- 没有任务创建前预算/并发检查。

### 4.2 立即修复

把所有 `queue_generation_task(task)` 改为 `schedule_generation_task(task)`，或显式 import `queue_generation_task`。建议统一用 `schedule_generation_task()`，因为它已经封装 eager/Celery 差异。

把：

```python
request_username = request.data.get('username') or (user.username if user else None)
```

改为：

```python
request_username = user.username
```

所有生成 view 增加：

```python
permission_classes = [IsAuthenticated]
throttle_classes = [GenerationRateThrottle]
```

并在 `get_scope()` 返回 org 后：

```python
require_role(user, org, 'creator')
```

### 4.3 新增预算服务

新增 `backend/api/service_modules/budget.py`：

```python
class BudgetDecision:
    allowed: bool
    reason: str
    retry_after_seconds: int | None = None


def assert_generation_allowed(*, organization, user, task_type, estimated_units):
    # 1. 组织余额或 grant 是否足够
    # 2. 今日成本是否超过 organization daily cap
    # 3. running 任务是否超过并发上限
    # 4. queued 任务是否超过积压上限
    # 5. task_type 是否符合组织套餐、额度和上线策略
    # 不允许时 raise Throttled / PermissionDenied / ValidationError
```

在 `create_generation_task()` 前调用，而不是任务已经创建后再失败。

建议新增模型字段或配置：

- `Organization.daily_generation_budget_cents`
- `Organization.max_running_tasks`
- `Organization.generation_suspended_until`
- `Organization.generation_policy`

如果不想改模型，先用 settings + plan limits：

- `GENERATION_DAILY_BUDGET_CENTS_DEFAULT`
- `GENERATION_MAX_RUNNING_TASKS_DEFAULT`
- `GENERATION_MAX_QUEUED_TASKS_DEFAULT`

### 4.4 输入限制

在 `generation/views.py` 或 serializer 中加硬限制：

| task_type | 字段 | 限制 |
| --- | --- | --- |
| copy | `product_description` | 8000 chars |
| image | `prompt` | 3000 chars |
| storyboard | `duration` | 1-180 seconds |
| audio | `text` | 5000 chars |
| video | `duration` | 按产品规格和套餐配置硬上限 |
| all | payload JSON | 64KB |

### 4.5 测试

- `test_async_generation_uses_schedule_generation_task`
- `test_generation_ignores_request_username`
- `test_viewer_cannot_create_generation_task`
- `test_over_budget_generation_returns_402_without_creating_task`
- `test_running_task_limit_returns_429`
- `test_oversized_payload_returns_400`
- `test_task_replay_idempotency_does_not_double_charge`

验收标准：超预算、超并发、超 payload 的请求都不会创建 `GenerationTask`，更不会调用 provider。

## 5. P0：Billing 改为只读/写分权

### 5.1 当前代码

文件：`backend/billing/views.py`

```python
def get(self, request):
    _, org, _, _ = get_scope(request)
    return Response(self._payload(org))

def post(self, request):
    user, org, _, _ = get_scope(request)
    plan = request.data.get('plan', 'free')
    ...
    org.subscription_plan = plan
```

### 5.2 建议改法

```python
from rest_framework.permissions import IsAuthenticated
from api.access import require_role

class BillingPlansView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user, org, _, _ = get_scope(request)
        require_role(user, org, 'ops')
        return Response(self._payload(org))

    def post(self, request):
        user, org, _, _ = get_scope(request)
        require_role(user, org, 'admin')
        ...
```

如果产品包含用户自助升级，`post()` 不应直接信任前端提交的 `plan`，而应改为创建 checkout / subscription change intent，并由支付回调或后台确认后修改 `org.subscription_plan`。管理后台仍可保留人工改套餐入口，但必须是 platform admin 权限。

### 5.3 测试

- viewer GET billing 403。
- creator GET billing 403 或按产品策略返回精简摘要。
- ops GET billing 200。
- ops POST billing 403。
- admin POST billing 200。
- 跨组织 billing query 404/403。

## 6. P0：Community/RAG 增加 visibility 和组织隔离

### 6.1 当前代码

文件：`backend/community/views.py`

```python
query = CommunityCreation.objects.all()
creations = CommunityCreation.objects.all()
```

模型 `CommunityCreation` 没有 `visibility` 字段。

### 6.2 建议模型迁移

文件：`backend/api/models.py`

```python
class CommunityCreation(models.Model):
    VISIBILITY_CHOICES = [
        ('private', 'Private'),
        ('organization', 'Organization'),
        ('public', 'Public'),
    ]
    visibility = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default='private')
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='published_creations')
```

数据迁移建议：现有数据先设为 `organization`，不要默认 public。

### 6.3 View 改法

`CommunityCreationView.get()`：

- 未登录：只返回 `visibility='public'`。
- 已登录：返回 `public` + 当前用户所属组织的 `organization/private`，private 只返回自己或本组织策略允许内容。
- 必须分页，默认 30，最大 100。

`RAGSearchView.get()`：

- 必须先确定 scope。
- 默认搜索范围是当前用户可见集合：`public` + 当前用户所属组织的 `organization/private` 内容；不允许无过滤全表。
- 如果未来要向量检索，embedding index 也要包含 `organization_id` 和 `visibility` filter。

`LikeCreationView.post()`：

- 只能 like 可见内容。
- 对同一用户同一 creation 应幂等，建议新增 through table，而不是整数自增。

### 6.4 测试

- `test_public_user_only_sees_public_creations`
- `test_member_does_not_see_other_org_private_or_org_creations`
- `test_rag_search_does_not_cross_organization`
- `test_private_creation_not_returned_by_community_list`
- `test_like_requires_visible_creation`

验收标准：任何搜索结果都不能出现其他组织的 private/organization 内容。

## 7. P0：生产危险配置从 warning 改为启动失败

### 7.1 当前代码

文件：`backend/core/settings.py`

已有开关：

- `ALLOW_UNAUTHENTICATED_API`
- `MARKETING_HUB_BOOTSTRAP_DEMO`
- `AI_ALLOW_MOCK_PROVIDER`
- `AI_ALLOW_MOCK_FALLBACK`
- `CORS_ALLOW_ALL_ORIGINS`
- `SESSION_COOKIE_SECURE`
- `CSRF_COOKIE_SECURE`
- `SECURE_SSL_REDIRECT`

但危险组合主要靠人为正确配置。

### 7.2 建议新增 system check

新增 `backend/core/checks.py`，并在 app ready 中注册或使用 Django system checks。

检查：

```python
if not settings.DEBUG:
    if settings.ALLOW_UNAUTHENTICATED_API:
        Error('ALLOW_UNAUTHENTICATED_API cannot be true when DEBUG=False')
    if settings.MARKETING_HUB_BOOTSTRAP_DEMO:
        Error('MARKETING_HUB_BOOTSTRAP_DEMO cannot be true when DEBUG=False')
    if settings.AI_ALLOW_MOCK_FALLBACK:
        Error('AI_ALLOW_MOCK_FALLBACK cannot be true when DEBUG=False')
    if settings.CORS_ALLOW_ALL_ORIGINS:
        Error('CORS_ALLOW_ALL_ORIGINS cannot be true when DEBUG=False')
    if not settings.SESSION_COOKIE_SECURE or not settings.CSRF_COOKIE_SECURE:
        Error('Secure cookies are required when DEBUG=False')
```

CI 已有 deploy check 的基础，应增加“危险 env 必须失败”的测试。

### 7.3 测试

- `test_deploy_check_fails_when_unauthenticated_api_enabled`
- `test_deploy_check_fails_when_demo_bootstrap_enabled`
- `test_deploy_check_fails_when_mock_fallback_enabled`
- `test_deploy_check_fails_when_cors_all_enabled`

验收标准：危险生产配置不能启动服务。

## 8. P0：高并发、重复请求和资源耗尽防护

### 8.1 当前代码状态

已有基础：

- `backend/core/settings.py` 配了 DRF throttle：
  - `anon = 120/min`
  - `user = 600/min`
  - `generation = 60/min`
- `backend/generation/views.py` 的生成类接口使用 `GenerationRateThrottle`。
- `backend/api/idempotency.py` 已有 `Idempotency-Key`，可拦截同 key 不同 payload 和 processing 中的重复请求。
- `WorkspaceAssetsView` 已有分页，`MAX_PAGE_SIZE = 200`。

缺口：

- `backend/Dockerfile` 仍用 `manage.py runserver`，高并发下不适合生产。
- throttle 是每用户/匿名级别，没有按 IP、组织、路由、任务类型、登录失败、AI provider 调用做组合限流。
- DRF 默认 throttle 使用 cache，当前 settings 没有显式配置 Redis cache；多进程/多实例下限流可能不一致。
- `TaskQueueView.post()`、`ContentPackageView.post()`、`AIConfigModelsView.post()`、assistant chat 等高成本接口没有统一预算和并发闸门。
- Celery worker 没有明确 `--concurrency`、`--prefetch-multiplier`、任务队列拆分和队列长度拒绝策略。
- 部分列表接口仍无分页或聚合较重，高并发 GET 也可能拖垮 DB。
- 前端 `REQUEST_TIMEOUT_MS = 120_000`，但后端/provider 也需要自己的 timeout，不能只靠浏览器中断。

### 8.2 生产运行方式必须先改

文件：`backend/Dockerfile`

把：

```dockerfile
CMD ["uv", "run", "python", "manage.py", "runserver", "0.0.0.0:8000"]
```

改为：

```dockerfile
CMD ["uv", "run", "gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "4", "--timeout", "120", "--graceful-timeout", "30", "--max-requests", "1000", "--max-requests-jitter", "100"]
```

`docker-compose.prod.yml` 或部署平台配置：

- backend web 和 celery worker 分离扩缩。
- web 容器设置 CPU/memory limit。
- worker 容器设置 CPU/memory limit。
- 增加 `/api/health/`，区分 web healthy、DB healthy、Redis healthy、worker queue healthy。

验收标准：

- 全功能测试环境不能出现 `runserver`。
- web 进程重启不会丢 queued task。
- 单 worker OOM 不影响 web 进程响应。

### 8.3 Redis 作为统一限流后端

文件：`backend/core/settings.py`

新增 Django cache：

```python
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': os.getenv('REDIS_CACHE_URL', REDIS_URL),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            'SOCKET_CONNECT_TIMEOUT': 2,
            'SOCKET_TIMEOUT': 2,
        },
    }
}
```

如果不想引入 `django-redis`，需要使用等价 Redis cache backend。重点是限流状态必须跨 gunicorn worker、跨容器一致。

### 8.4 自定义组合限流

新增 `backend/api/throttles.py`：

```python
from rest_framework.throttling import SimpleRateThrottle


class OrgRateThrottle(SimpleRateThrottle):
    scope = 'org'

    def get_cache_key(self, request, view):
        org = getattr(request, 'organization', None)
        if not org:
            org_slug = request.query_params.get('organization') or request.data.get('organization')
            org_id = org_slug or 'unknown'
        else:
            org_id = org.id
        ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': f'{org_id}:{ident}'}


class GenerationBurstThrottle(SimpleRateThrottle):
    scope = 'generation_burst'

    def get_cache_key(self, request, view):
        user_id = getattr(request.user, 'id', None) or self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': user_id}


class ExpensiveEndpointThrottle(SimpleRateThrottle):
    scope = 'expensive'

    def get_cache_key(self, request, view):
        user_id = getattr(request.user, 'id', None) or self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': f'{request.path}:{user_id}'}
```

settings 建议：

```python
'DEFAULT_THROTTLE_RATES': {
    'anon': os.getenv('DRF_THROTTLE_ANON', '60/min'),
    'user': os.getenv('DRF_THROTTLE_USER', '300/min'),
    'org': os.getenv('DRF_THROTTLE_ORG', '1200/min'),
    'generation': os.getenv('DRF_THROTTLE_GENERATION', '30/min'),
    'generation_burst': os.getenv('DRF_THROTTLE_GENERATION_BURST', '10/min'),
    'expensive': os.getenv('DRF_THROTTLE_EXPENSIVE', '20/min'),
    'login': os.getenv('DRF_THROTTLE_LOGIN', '10/min'),
}
```

需要挂载的接口：

| 接口 | 限流 |
| --- | --- |
| `/auth/login/`、`/admin-auth/login/` | IP + username login throttle |
| `/auth/password-reset/request/` | IP + email throttle |
| `/generate/*` | user + org + generation burst + budget |
| `/tasks/` POST 和 retry | user + org + generation burst + idempotency |
| `/drafts/<id>/run/`、node retry | user + org + generation burst |
| `/ai/config/models/` | expensive throttle，避免 provider model list 被刷 |
| assistant chat | expensive throttle + per-session in-flight lock |
| community search / RAG | search throttle + pagination/top-k |
| dashboard / project list | user throttle + server-side cache |

### 8.5 请求体和输入大小硬限制

文件：`backend/core/settings.py`

建议新增：

```python
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv('DATA_UPLOAD_MAX_MEMORY_SIZE', str(2 * 1024 * 1024)))
FILE_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv('FILE_UPLOAD_MAX_MEMORY_SIZE', str(5 * 1024 * 1024)))
```

在 DRF parser 前或 view serializer 中检查：

- JSON body 最大 2MB。
- 生成 payload 最大 64KB。
- 单字段长度按第 4 节限制。
- tags/list 数量限制，例如 tags <= 30。
- workflow DAG nodes <= 100，edges <= 200。
- assistant 单次 message <= 8000 chars。
- RAG query <= 512 chars。

验收标准：超限请求返回 400/413，不进入业务逻辑，不创建 task，不访问 provider。

### 8.6 Celery 队列背压

文件：`docker-compose.yml` / `docker-compose.prod.yml` / worker 启动命令

建议 worker 命令：

```bash
celery -A core worker --loglevel=info --concurrency=4 --prefetch-multiplier=1 --max-tasks-per-child=100
```

按任务类型拆队列：

- `generation.text`
- `generation.image`
- `generation.audio`
- `generation.video`
- `workflow`
- `maintenance`

在 `schedule_generation_task()` 前检查队列长度和组织 running/queued 数：

```python
def assert_queue_capacity(organization, task_type):
    if org_running_count >= org.max_running_tasks:
        raise Throttled('Too many running generation tasks.')
    if org_queued_count >= org.max_queued_tasks:
        raise Throttled('Too many queued generation tasks.')
    if global_queue_depth(task_type) >= settings.GENERATION_QUEUE_MAX_DEPTH:
        raise Throttled('Generation queue is temporarily full.')
```

任务状态策略：

- queued 超过 TTL 未执行，标记 `failed` 或 `expired`，给用户可重试。
- running 超过任务类型 timeout，标记 failed，释放并发槽。
- provider timeout 必须短于 worker hard time limit。
- 任务 retry 要有最大次数和指数退避，不允许无限重试。

### 8.7 数据库抗高并发

必须避免“高并发 GET 比 POST 更容易打垮 DB”：

- 所有列表接口强制分页，最大 page_size。
- Dashboard 默认近 30 天，并缓存 30-60 秒。
- Project list 的 count/exists 聚合改 annotate，避免 N+1。
- Community/RAG 必须 top-k + scope filter，不扫全表。
- `IdempotencyKey` 增加清理任务，避免表无限增长。
- 给第 03 文档里的索引全部落迁移。

新增数据库连接配置：

```python
DATABASES['default']['CONN_MAX_AGE'] = int(os.getenv('DB_CONN_MAX_AGE', '60'))
DATABASES['default']['CONN_HEALTH_CHECKS'] = True
```

生产建议使用 PgBouncer 或托管数据库连接池。

### 8.8 幂等和重复点击

当前 `Idempotency-Key` 是可选。对高成本写接口应强制：

- 生成任务 POST。
- workflow run。
- workflow node retry。
- assistant tool create/copy/image 类调用。
- billing checkout/change intent。
- AI key validate。

如果缺少 `Idempotency-Key`：

- 对普通低成本写操作允许。
- 对高成本写操作返回 400：`Idempotency-Key required for this endpoint.`

前端需要统一封装：

- 每次用户点击“生成/运行/重试/提交付款”时生成稳定 key。
- 按按钮禁用 in-flight 状态。
- 请求失败后复用同一 key 重试，而不是每次生成新 key。

### 8.9 压测和破坏性并发测试验收

新增脚本目录：`backend/scripts/load_tests/` 或 `tests/load/`。

建议用 `k6` 或 `locust` 覆盖：

| 场景 | 目标 |
| --- | --- |
| 登录爆破模拟 | 429 生效，SecurityEvent 记录 |
| 生成任务突发 | 超过 generation burst 后 429，任务数不超过阈值 |
| workflow run 重复提交 | 同 idempotency key 不重复创建 run |
| project list 高并发 | P95 < 800ms，DB CPU 不飙升 |
| dashboard 高并发 | 缓存命中，P95 < 1.2s |
| RAG search 高并发 | top-k + scope filter，不能全表拖垮 |
| AI models fetch 高并发 | provider 不被重复刷爆，429/缓存生效 |
| assistant streaming 并发 | 每 session 只允许一个 in-flight stream |
| 大 body 攻击 | 400/413，内存稳定 |
| Celery 队列堆积 | 队列满后拒绝新任务，web 仍可响应 |

全功能测试前最低门槛：

- 100 并发普通 API 读请求持续 10 分钟，错误率 < 1%。
- 30 并发生成任务提交持续 5 分钟，429/402 按预期出现，web P95 < 1s。
- 超大 payload 和重复提交不能让 worker、DB 或 Redis OOM。
- provider timeout / failure 不会拖垮 web 进程。

## 9. P1：前端会话真相改为 `/auth/me/`

### 9.1 当前代码

文件：`frontend/src/App.tsx`

- `token` 初始值来自 `localStorage.getItem('mh_token')`。
- `/auth/me/` 会修正状态，但 UI 仍可能短暂根据 localStorage 进入工作台。

文件：`frontend/src/hooks/useApi.ts`

- `ensureCsrfToken()` 当前通过 GET `/ai/config/` 获取 CSRF token。
- 如果修复 AI config 权限后，这个接口不应再作为通用 CSRF 探针。

### 9.2 建议改法

后端新增轻量 endpoint：

- `GET /api/auth/csrf/`
- `permission_classes=[AllowAny]`
- 只设置 CSRF cookie 和返回 `X-CSRFToken`，不返回业务数据。

前端改：

- `ensureCsrfToken()` 调用 `/auth/csrf/`，不要调用 `/ai/config/`。
- App 启动时使用三态：`authStatus = 'checking' | 'authenticated' | 'anonymous'`。
- `localStorage.mh_token` 只做“上次登录过”的提示，不驱动受保护页面渲染。
- 任意 API 返回 401/403 且路径不是 login/register/csrf 时，统一清理 auth state 并回登录页。

### 9.3 测试

前端 Vitest：

- cookie 失效但 localStorage 有 `mh_token` 时，不渲染受保护工作台。
- 401 response 会清理 localStorage 并进入登录态。
- CSRF token 获取不依赖 `/ai/config/`。

后端测试：

- `/api/auth/csrf/` 匿名可访问。
- `/api/ai/config/` 匿名不可访问。

## 10. P1：审计日志动作和安全事件补齐

### 10.1 当前代码问题

`backend/workspaces/view_modules/assets.py` 写入：

- `asset_create`
- `asset_update`
- `asset_delete`

但 `backend/api/models.py:AuditLog.ACTION_CHOICES` 没有这些值。

### 10.2 建议改法

补齐 `AuditLog.ACTION_CHOICES`：

- `project_create`
- `project_update`
- `project_delete`
- `folder_create`
- `folder_update`
- `folder_delete`
- `asset_create`
- `asset_update`
- `asset_delete`
- `community_publish`
- `community_unpublish`
- `ai_key_create`
- `ai_key_update`
- `ai_key_delete`
- `ai_key_validate`
- `billing_change`
- `credit_grant`
- `cross_org_access_denied`

敏感操作必须记录：

- actor
- organization
- target_type
- target_id
- request_id
- ip
- user_agent
- metadata，但不得包含 key、prompt 全文、provider 原始响应。

### 10.3 测试

- `test_asset_create_audit_action_is_valid_choice`
- `test_billing_change_audit_has_actor_and_org`
- `test_ai_key_change_audit_redacts_secret`
- `test_cross_org_denied_records_security_event`

## 11. P1：对象存储和外链安全

### 11.1 当前代码风险

`Asset.source_url` 是字符串，手动创建资产允许客户端提交 URL。测试用户可以提交：

- 内网 URL。
- 超长 URL。
- data URL。
- 伪造对象存储 URL。
- 可追踪外链。

### 11.2 建议改法

先做最低成本加固：

- `source_url` 只允许 `https://`。
- 如果是用户上传，必须走后端签名上传流程，不允许直接 POST 任意 URL。
- 对 provider 生成的外链，后端 worker 下载到对象存储，再保存内部 object key。
- 展示时返回短期 signed URL。

新增字段：

- `Asset.storage_key`
- `Asset.source_url_origin`
- `Asset.file_size_bytes`
- `Asset.content_type`
- `Asset.checksum_sha256`

测试：

- `test_manual_asset_rejects_internal_source_url`
- `test_manual_asset_rejects_non_https_source_url`
- `test_asset_download_requires_membership`

## 12. 推荐实施顺序

### Sprint A：2-3 天，必须先做

1. `get_scope()` 禁止生产 demo fallback。
2. 新增 `api/access.py`。
3. 修复 `CanManageAIConfiguration` 和 `resolve_staff_user_from_request()`。
4. 修复 generation async 的 `queue_generation_task` 调用。
5. Billing POST 加 admin 限制。
6. Community/RAG 按 visibility + membership 返回完整可见集合，禁止无过滤全表。
7. 替换生产 `runserver`，接入 Redis cache 限流，给高成本接口加组合 throttle。
8. 增加跨组织和高并发 P0 测试。

### Sprint B：3-5 天，全功能测试前完成

1. AI Key 加密字段和迁移。
2. 任务预算、并发、payload size 拦截。
3. Community visibility 模型迁移。
4. 生产危险配置 system checks。
5. 前端 CSRF endpoint 和 auth 三态。
6. 审计 action choices 补齐。
7. Celery 队列背压、worker timeout、任务 TTL 和队列满拒绝。

### Sprint C：测试期持续增强

1. 对象存储签名 URL。
2. provider error redaction 全链路测试。
3. request id/task id/provider call id 串联。
4. Admin console 增加异常组织处置、生成风控状态查看、追加额度和恢复操作。
5. k6/locust 压测脚本纳入发布前检查。

## 13. Go/No-Go 代码验收

全功能开放给顶尖黑客测试前，必须全部通过：

- `uv run python manage.py check --deploy`
- `uv run python manage.py test`
- 匿名访问所有非公开 API 401/403。
- user A 不能读写 user B 组织的 project/folder/asset/task/billing/community private 数据。
- viewer 不能创建项目、资产、生成任务、发布社区内容。
- creator 不能改 billing、AI config、membership。
- ops 只能读 billing，不能写 billing。
- admin 只能管理本组织。
- superuser 不能进入普通 workspace API。
- AI Key 不以明文出现在 DB、API response、日志、AuditLog。
- 超预算/超并发/超 payload 请求不会创建任务。
- 高并发生成、workflow、assistant、RAG、AI models fetch 会触发 429/402/413，而不是拖垮 web/DB/Redis/worker。
- 生产测试环境不使用 Django `runserver`。
- Redis 限流跨 gunicorn worker 和多容器一致。
- Celery 队列满时拒绝新高成本任务，已有任务状态可恢复。
- Community/RAG 不会跨组织返回 private/organization 内容。
- `/api/auth/csrf/` 是唯一通用 CSRF 探针，`/api/ai/config/` 不再匿名可读。
