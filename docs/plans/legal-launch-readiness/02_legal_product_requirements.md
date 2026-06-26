# 02 产品与技术法律要求

版本：V1  
日期：2026-06-27

## 1. 法律文本和同意记录

产品要求：

- 注册页必须展示服务条款和隐私政策链接。
- 用户必须主动勾选同意，不得默认勾选。
- 重大条款更新必须要求用户重新同意。
- 首次使用 AI 生成、社区发布、素材上传、BYOK 时必须展示专项提示。

技术要求：

- 新增或扩展 `PolicyDocument`：
  - `policy_type`
  - `version`
  - `title`
  - `content_url`
  - `effective_at`
  - `is_active`
- 新增或扩展 `UserConsent`：
  - `user`
  - `policy_type`
  - `policy_version`
  - `consented_at`
  - `ip_address`
  - `user_agent`
  - `source`
- 登录态接口返回是否需要重新同意。
- 后端对关键操作检查必要同意版本。

## 2. 隐私与数据主体权利

产品要求：

- 用户可以请求导出个人数据。
- 用户可以请求删除账号。
- 用户可以请求删除项目、资产和生成历史。
- 隐私政策必须说明第三方模型 provider 和数据处理目的。

技术要求：

- 数据地图覆盖：
  - User/Profile
  - Organization/Membership
  - Project/Campaign/WorkspaceDraft
  - GenerationTask/WorkflowRun/WorkflowNodeRun
  - Asset/CommunityCreation
  - AIConfiguration
  - UsageEvent/CreditLedgerEntry
  - AuditLog/SecurityEvent
- 删除策略必须区分：
  - 用户主动删除。
  - 组织 admin 删除。
  - 法律保留。
  - 审计日志保留。
- 日志和错误追踪必须脱敏。
- API key、provider secrets、敏感 URL 不得进入普通日志。

## 3. AI 生成内容标识

产品要求：

- 生成结果页显示“AI 生成初稿，发布前需人工审核”。
- 资产详情显示生成来源：AI/manual/imported。
- 社区发布页必须提醒用户确认内容合法、真实、不侵权。
- 图片、音频、视频导出应尽可能保留生成标识或元数据。

技术要求：

- Asset 增加或使用 metadata：
  - `ai_generated`
  - `generation_task_id`
  - `provider`
  - `model_name`
  - `prompt_key`
  - `prompt_version`
  - `harness_version`
  - `generated_at`
- CommunityCreation 增加或使用 metadata：
  - `ai_generated`
  - `source_asset_id`
  - `source_task_id`
  - `review_status`
  - `reported_count`
- 导出内容时带上 AI 生成声明。
- 管理后台支持按 AI generated 过滤内容。

## 4. 广告合规与高风险行业

产品要求：

- 默认显示“AI 生成内容不能替代法律、广告、医疗、金融等专业审核”。
- 高风险行业生成前给出额外提示。
- 用户发布前确认其对广告真实性和合法性负责。

技术要求：

- 建立 `LEGAL_RISK_KEYWORDS` 或规则库：
  - 绝对化用语。
  - 功效承诺。
  - 排名/第一/唯一。
  - 医疗、药品、保健、金融、投资、教育升学、未成年人。
- review task 输出：
  - risk_level
  - legal_risk_categories
  - problematic_claims
  - replacement_suggestions
- 高风险任务：
  - 禁止自动发布。
  - 默认进入人工确认。
  - 写入 audit log。

## 5. 知识产权与素材授权

产品要求：

- 上传素材时用户必须确认拥有权利或授权。
- 模板/社区发布时用户授予平台展示、分发、推荐、复用所需许可。
- 提供侵权投诉邮箱和表单。
- 被投诉内容可先隐藏再复核。

技术要求：

- Asset metadata 增加：
  - `license_status`
  - `source_type`
  - `rights_confirmed_at`
  - `rights_confirmed_by`
- CommunityCreation 增加：
  - `visibility`
  - `moderation_status`
  - `takedown_reason`
  - `takedown_at`
- 新增举报/投诉数据结构：
  - `target_type`
  - `target_id`
  - `reporter`
  - `reason`
  - `description`
  - `status`
  - `handled_by`
  - `handled_at`

## 6. 社区和模板市场

产品要求：

- 社区规则必须禁止违法、侵权、虚假广告、未授权素材、个人敏感信息泄露。
- 用户可以举报内容。
- 作者可以申诉。
- 平台可以下架、隐藏、冻结账号。

技术要求：

- 默认 private 内容不得进入社区和 RAG。
- 社区搜索仅索引 public/community 可见内容。
- 管理后台支持：
  - 内容隐藏。
  - 用户冻结。
  - 举报处理。
  - 处理记录导出。
- 所有 moderation action 进入 AuditLog。

## 7. BYOK 与第三方 Provider

产品要求：

- 用户必须知道 BYOK 会调用其配置的第三方 provider。
- 用户必须确认其遵守第三方 provider 服务条款。
- 平台说明 key 的加密存储、使用范围和删除方式。

技术要求：

- API key 必须加密存储。
- 不在日志、错误、响应中输出明文 key。
- 支持 key 删除和轮换。
- 保存最后使用时间和 provider 调用失败日志。
- BYOK 调用要区分组织级配置和平台配置。

## 8. 计费和额度

产品要求：

- 用户能看到额度消耗逻辑。
- 收费前展示价格、扣费规则、退款规则。
- 企业订阅条款和普通用户条款区分。

技术要求：

- UsageEvent 和 CreditLedgerEntry 必须可追溯。
- 任务提交前做额度检查。
- 超额策略明确：拒绝、降级、排队或需要升级。
- 账单导出保留必要字段，但不得泄露其他成员敏感输入。

## 9. 安全事故响应

产品要求：

- 用户有安全联系邮箱。
- 平台有数据泄露和违法内容应急流程。

技术要求：

- 所有 request 关联 request_id。
- AuditLog 记录管理动作。
- SecurityEvent 记录异常登录、冻结、敏感操作。
- 数据泄露响应至少包含：
  - 发现。
  - 分级。
  - 止血。
  - 取证。
  - 通知。
  - 复盘。

