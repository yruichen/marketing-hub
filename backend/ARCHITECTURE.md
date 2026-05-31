# Backend Architecture

Marketing Hub 后端现在按领域拆分 Django app。为避免破坏既有数据库表名和迁移历史，`api` 暂时保留为模型、迁移和兼容层；新接口和新业务逻辑应优先放入领域 app。

## App 边界

- `api`
  - 数据模型、迁移历史、admin、Celery task 入口。
  - `api.views` 只保留兼容导入，不再写新视图。
  - `api.contracts` 放跨模块共享的领域契约，例如订阅方案、节点 I/O schema。
  - `api.scope` 放请求作用域解析、布尔值解析、slug 生成等通用请求工具。
  - `api.serializers` 放模型序列化结构。

- `accounts`
  - 登录、账号、成员关系相关接口。

- `workspaces`
  - 组织、项目、文件夹、活动、草稿、模板、看板统计。

- `generation`
  - 文案、图片、分镜、配音生成接口。
  - 任务队列查询、工作流运行、节点重试。

- `community`
  - 作品发布、点赞、品牌灵感搜索。

- `ai_gateway`
  - 模型提供商、自有密钥、Base URL、模型名等配置。

- `billing`
  - 订阅方案、项目额度、BYOK 抵扣规则。

## 新功能放在哪里

1. 新接口先判断业务归属，放到对应 app 的 `views.py` 和 `urls.py`。
2. 共享常量和跨 app 协议放 `api.contracts`。
3. 请求作用域、轻量解析工具放 `api.scope`。
4. 模型返回结构优先补 `api.serializers`，不要在 view 里手写重复字典。
5. 需要新增数据库表时，优先评估是否可以建到领域 app；如果涉及旧表迁移，再单独设计迁移计划。

## 路由规则

`core.urls` 只挂载 `/api/` 到 `api.urls`。`api.urls` 再组合各领域 app 的 URL，保持前端现有路径不变。

示例：

```python
urlpatterns = [
    path('', include('workspaces.urls')),
    path('', include('generation.urls')),
]
```

这样 `/api/projects/`、`/api/tasks/` 等路径保持兼容，但代码所有权已经拆开。

## 禁止继续扩大的文件

- 不要继续往 `api.views` 写新视图。
- 不要在视图里复制大段序列化字典。
- 不要在一个接口文件里同时处理项目、生成、社区、计费等多个领域。

## 安全与交付底座

- 认证默认走 Django session，`/api/auth/login/` 不再返回 demo token。
- RBAC 基于 `Membership.role`，角色矩阵集中在 `api.rbac`，DRF permission class 集中在 `api.permissions`。
- 组织级请求作用域由 `api.scope.get_scope` 解析；涉及任务队列、AI 配置、成员管理时必须按组织过滤 queryset。
- 生成、工作流重跑等写操作支持 `Idempotency-Key`，记录在 `IdempotencyKey`。
- 登录、成员变更、密钥变更、删除、计费变更、生成任务、工作流运行写入 `AuditLog`。
- `/api/schema/` 提供 OpenAPI schema，前端类型应从 schema 派生，而不是手写漂移的接口类型。

## AI 网关边界

- 业务 view 不直接调用模型。生成业务进入 service 层，再由 `ai_gateway.services.AIModelGateway` 统一调度。
- Provider adapter 覆盖 `mock`、`openai`、`anthropic`、`gemini`、`local_proxy`。
- Capability registry、prompt registry、model policy、cost calculator、retry/fallback policy、safety policy 都集中在 `ai_gateway.services`。
- BYOK 配置通过 `AIConfiguration.organization` 隔离；组织专属配置优先，缺省才回退平台配置。
- 主模型失败时网关回退 mock/provider fallback，并在日志里标注 fallback 信息，避免静默切换。
