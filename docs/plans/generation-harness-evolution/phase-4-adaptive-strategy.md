# Phase 4：Adaptive Strategy

目标：让 harness 能根据品牌、平台、内容类型、风险等级、历史反馈和成本约束自动选择生成策略。

## 行业基准

行业领先 harness 会根据任务选择模型、工具、上下文和评估方式：简单任务走低成本模型，高风险任务加 guardrails，复杂任务拆成多步链路，生产环境记录策略版本。

Marketing Hub 的差异是：我们不只是选择模型，而是选择营销生产策略。

## Marketing Hub 技术壁垒

Phase 4 的壁垒是“营销策略引擎”：

- Platform-Native Strategy：不同平台不是标签差异，而是标题、正文、节奏、视觉、CTA 的结构差异。
- Campaign Chain Strategy：一份 campaign brief 同时驱动 copy、storyboard、image_prompt、review。
- Brand Memory Strategy：品牌长期记忆影响语气、禁用词、卖点优先级和 few-shot 样本。
- Risk-Aware Strategy：医疗、金融、功效承诺、极限词自动进入高风险策略。
- Cost-Aware Strategy：根据任务价值、组织 plan、历史质量和模型成本选择 lane。

## 技术要求

- 新增 Strategy Registry，建议包含：
  - `PlatformStrategy`
  - `ContentStrategy`
  - `VisualStrategy`
  - `RiskStrategy`
  - `MemoryStrategy`
  - `ModelLaneStrategy`
- 策略选择必须是可解释的，写入 logs：
  - `harness:strategy.platform=xiaohongshu_v1`
  - `harness:strategy.risk=ad_compliance_high_v1`
  - `harness:strategy.memory=brand_style_retrieval_v1`
  - `harness:strategy.model_lane=text_balanced_v1`
- 策略结果必须进入 payload 或 prompt messages。
- 策略版本必须可回滚。
- 策略不能直接绕过 RBAC、预算和安全策略。

## 任务清单

1. Strategy Registry 设计
   - 每个 strategy 有 id、version、scope、task_types、risk、owner、description。
   - 支持按 task_type、platform、project、organization、campaign_goal 选择。
   - 保持纯 Python registry 起步，后续再迁到 DB 管理。

2. Platform strategy
   - 小红书：场景钩子、种草语气、标签、收藏导向、视觉生活方式。
   - 微信：观点标题、段落论证、可信克制、阅读原文/咨询导向。
   - 抖音：前 3 秒口播钩子、短句、字幕节奏、互动导向。
   - 通用：平台未知时降级为社媒通用策略。

3. Content strategy
   - 新品上市。
   - 活动预热。
   - B2B lead generation。
   - 种草分享。
   - 品牌故事。
   - 用户复盘/案例。

4. Risk strategy
   - 识别极限词、功效承诺、医疗金融暗示、价格优惠、数据承诺。
   - 高风险任务强制 review 节点或 review task。
   - 高风险 prompt 中加强事实边界和保守措辞。

5. Memory strategy
   - semantic memory：品牌事实、受众、禁用词。
   - episodic memory：高质量历史样本和用户改稿样本。
   - procedural memory：品牌写作规则和平台 SOP。
   - 检索结果必须压缩为 evidence，不直接无限拼接上下文。

6. Model lane strategy
   - 文案草稿：低成本快速 lane。
   - 内容包/工作流：平衡 lane。
   - 高风险审核：稳定/保守 lane。
   - 视觉 prompt：结构化输出优先 lane。
   - 失败重试：换策略优先，其次换模型。

## 交付物

- Strategy registry module。
- Strategy selection logs。
- 各任务 payload builder 接入策略结果。
- 内容包统一 campaign brief compiler。
- 策略选择测试。

## 验收标准

- 同一个 brief 在小红书、微信、抖音下生成结构明显不同。
- 高风险词触发 risk strategy，并进入 review 链路。
- 图像 prompt、分镜、文案共享同一 campaign brief。
- Logs 能解释每次生成使用了哪些策略和为什么。
- 策略版本可以在不改 API 的情况下升级。

