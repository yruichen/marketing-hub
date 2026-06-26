# Phase 5：Self-Evolution Ops

目标：让 harness 具备运营级自我进化能力：可灰度、可回滚、可解释、可建议下一版，但不能未经评测和人工批准自动上线。

## 行业基准

领先平台通常会有版本化 prompt、dataset、offline/online eval、实验对比、人工反馈、生产监控和回滚机制。真正成熟的 harness 会把失败 trace 回流为数据集，并用实验结果决定是否发布新版本。

Marketing Hub 要进一步形成“营销生产飞轮”：品牌记忆、用户改稿、资产复用、平台策略和评测结果一起驱动 harness 进化。

## Marketing Hub 技术壁垒

Phase 5 的壁垒是“平台级内容生产操作系统”：

- Harness Release System：prompt、strategy、rubric、normalizer、memory retrieval 一起版本化。
- Brand-Specific Evolution：不同品牌可有自己的 style profile 和策略偏好。
- Quality-Cost Governance：用质量、成本、延迟、fallback、用户改稿率共同决定发布。
- Human-in-the-Loop Autonomy：系统生成改进建议，人工审核发布，避免自动污染生产。
- Marketplace Flywheel：高质量 workflow/template 可成为平台社区资产，反向增强 eval 和 strategy。

## 技术要求

- 新增 harness release 概念：
  - `harness_version`
  - `prompt_asset_versions`
  - `strategy_versions`
  - `rubric_versions`
  - `normalizer_versions`
  - `memory_policy_version`
- 支持灰度规则：
  - organization allowlist
  - user allowlist
  - task_type
  - traffic percentage
  - risk level
- 支持回滚：
  - 回滚 prompt asset。
  - 回滚 strategy registry。
  - 回滚 rubric threshold。
  - 回滚 memory retrieval policy。
- 指标看板至少包含：
  - success rate
  - JSON parse fail rate
  - fallback rate
  - retry rate
  - edit rate
  - publish/save/reuse rate
  - eval score
  - cost per successful asset
  - latency p50/p95

## 任务清单

1. Harness release registry
   - 定义 release manifest。
   - 记录每个 release 的组成：prompt、strategy、rubric、normalizer、memory policy。
   - 保存 changelog、owner、risk、status。

2. 灰度发布
   - 按组织、用户、任务类型和流量比例灰度。
   - 高风险 task 默认不参与自动灰度。
   - 灰度期间强制记录对照组和实验组。

3. 自动建议系统
   - 输入：低分 eval、用户 edit delta、review failed、fallback、重试。
   - 输出：ImprovementProposal。
   - Proposal 包含证据样本、建议变更、预期收益、风险、需要跑的 eval set。
   - Proposal 不直接改生产配置。

4. 质量看板
   - 按 harness version 展示质量和成本。
   - 按 task_type、platform、organization、provider 过滤。
   - 标出质量回退、成本异常、fallback 异常。

5. 回滚 runbook
   - 明确触发条件：eval score 下降、fallback 升高、用户 edit rate 升高、成本异常。
   - 明确回滚步骤。
   - 明确回滚后的样本收集和复盘流程。

6. 平台特色沉淀
   - 将高质量 workflow 变成 template。
   - 将高质量品牌样本变成 organization-scoped style profile。
   - 将复用率高的策略沉淀为 platform strategy。
   - 将社区优质内容转化为公开 eval inspiration，但不得泄露私有品牌数据。

## 交付物

- Harness release manifest schema。
- 灰度规则。
- ImprovementProposal schema。
- Ops dashboard 需求文档。
- 回滚 runbook。
- Release review checklist。

## 验收标准

- 每个 harness release 都能复现其 prompt、strategy、rubric 和 memory policy。
- 新 release 上线前必须有 eval report。
- 灰度期间能区分 control/treatment。
- 质量回退时 10 分钟内能回滚。
- 自动建议只能创建 proposal，不能直接发布生产变更。

