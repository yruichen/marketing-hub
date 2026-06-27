# Phase 1：Harness V2 基础升级

目标：把生成系统从“散落 prompt + provider 调用”升级为统一的 harness 装配层，在保持 API 兼容的前提下，建立平台后续自主进化的底座。

## 行业基准

领先应用通常已经具备：

- prompt asset 版本化。
- system/task/context/schema/quality bar 分层。
- 输出 JSON contract 和 parser/normalizer。
- provider/model/fallback 日志。
- 基础 regression tests。

这些能力是起点，不是壁垒。单纯做到这些只能追平通用 AI 应用。

## Marketing Hub 技术壁垒

Phase 1 的壁垒是“营销生产语义 harness”，重点不在 prompt 文案，而在营销业务对象与生成链路的深度耦合：

- Campaign Brief Compiler：把品牌、受众、渠道、项目、活动、禁用词、工作流上游输出编译成统一 brief。
- Platform Strategy Layer：中国社媒平台策略变成可复用 skill，而不是散落在 prompt 字符串。
- Creative Chain Consistency：文案、分镜、图像 prompt、审核共享同一 campaign context。
- Workflow Node Contract：每个节点的 input/output schema 和 prompt contract 一致，能被 eval 和 retry 复用。
- Quality Bar as Runtime Metadata：质量栏不仅写进 prompt，也进入日志、测试和后续 eval rubric。

## 技术要求

- 新增或扩展共享 helper：
  - `compact_text`
  - `compact_json`
  - `platform_strategy`
  - `fact_guardrail_block`
  - `json_contract_block`
  - `quality_bar_block`
  - `append_context_lines`
  - `append_feedback_line`
- 每个 task builder 必须输出 structured messages，而不是只返回拼接字符串。
- 所有 JSON task 必须声明 schema hint，并使用 adapter 的 JSON response mode。
- `prompt_catalog.py` 必须记录：
  - `key`
  - `version`
  - `kind`
  - `owner`
  - `task_type`
  - `output_contract`
  - `quality_bar`
  - `risk`
- `GatewayResponse.logs` 必须包含 prompt key、version、owner、risk。
- Normalizer 必须兼容旧字段，不允许破坏现有前端。

## 任务清单

1. Harness common layer
   - 将上下文压缩、平台策略、质量栏、事实边界、JSON contract 抽到公共模块。
   - 添加统一的反馈优先级规则：用户反馈高于默认风格，但不得覆盖事实和合规边界。

2. Copy harness
   - 强制包含用户场景、差异化卖点、信任理由、CTA。
   - 小红书、微信、抖音分别使用不同结构策略。
   - 禁止编造销量、价格、认证、疗效和用户评价。

3. Visual harness
   - `image_prompt` 输出英文模型友好 prompt 和中文摘要。
   - prompt 必须包含 subject、scene、composition、camera/framing、lighting、material/detail、style、quality constraints。
   - negative prompt 必须合并用户排除项和常见生成缺陷。

4. Storyboard/video/audio harness
   - 分镜必须有前 3 秒钩子、可拍摄动作、口播旁白和时长一致性。
   - video prompt 必须保留主体连续性、画幅、社媒裁切和广告级构图。
   - audio prompt 必须优化 TTS 可读性，不改变事实。

5. Review harness
   - 审核必须定位具体片段。
   - 建议必须可执行。
   - 未配置明确规则时只能输出风险提示，不得伪造平台政策。

6. Brainstorm/custom agent harness
   - 工作流 brainstorm 必须产出可运行 DAG。
   - 自定义 agent 必须遵守任务边界，并在冲突时给替代方案。

7. Tests
   - 每个 builder 至少有一条质量断言。
   - 测试 prompt catalog 版本和日志。
   - 测试核心生成接口 API 兼容。

## 交付物

- `backend/ai_gateway/prompt_modules/common.py`
- 升级后的 task prompt modules。
- `backend/ai_gateway/prompt_catalog.py`
- `backend/ai_gateway/tests.py`
- Phase 1 变更报告。

## 验收标准

- `uv run python manage.py test ai_gateway.tests` 通过。
- `uv run python manage.py test api.tests.WorkspaceUpgradeTests` 通过。
- API 返回字段不减少、不改名。
- 生成日志包含 `gateway:prompt_version=<new version>`。
- 每个生成 task 的模型输入都包含任务目标、上下文、策略、质量栏、JSON contract。

