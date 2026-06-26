# Generation Harness 自主进化分阶段计划

版本：V1  
日期：2026-06-27  
范围：`backend/ai_gateway/`、`backend/generation/`、工作流节点执行、内容包编排、生成质量评估与治理

## 0. 定位

这不是单纯的 prompt engineering。

更准确地说，这是 Marketing Hub 的生成 harness 自主进化计划：把一次生成从“拼 prompt 调模型”升级为一套可观测、可评估、可回归、可灰度、可自我改进的内容生产系统。

Prompt 只是 harness 的一个组件。完整 harness 包含：

- 输入理解：品牌、受众、平台、任务、上游节点、反馈和约束的归一化。
- 策略选择：不同平台、内容类型、风险等级、模型 lane 使用不同策略。
- Prompt/Skill 装配：system、task、context、platform skill、visual skill、schema、quality bar 分层组合。
- 模型执行：provider、model、JSON mode、fallback、重试、成本记录。
- 输出规范化：schema normalize、字段补齐、时长/标签/负面词等结构修复。
- 质量评估：规则评分、golden cases、人工反馈、失败样本归档。
- 进化闭环：基于低分样本、用户修改、审核问题和任务失败率迭代 harness，而不是只手改提示词。

## 1. Phase 总览

| Phase | 目标 | 主要产出 | 状态 |
| --- | --- | --- | --- |
| [Phase 0](./phase-0-baseline-and-diagnostics.md) | 固化当前生成链路基线 | 链路地图、指标字典、坏样本分类、归因体系 | 待做 |
| [Phase 1](./phase-1-harness-v2-foundation.md) | Harness V2 基础升级 | 共享装配层、任务级质量栏、catalog 版本化、兼容测试 | 已开始 |
| [Phase 2](./phase-2-eval-harness.md) | Eval Harness | golden cases、规则评分、回归命令、报告格式 | 待做 |
| [Phase 3](./phase-3-feedback-loop.md) | Feedback Loop | 用户改稿样本、审核失败样本、improvement candidate | 待做 |
| [Phase 4](./phase-4-adaptive-strategy.md) | Adaptive Strategy | 策略注册表、平台/内容/风险/模型 lane 选择 | 待做 |
| [Phase 5](./phase-5-self-evolution-ops.md) | Self-Evolution Ops | release manifest、灰度、回滚、质量看板、自动建议 | 待做 |

## 2. 细化文档结构

- [Phase 0：基线与问题归因](./phase-0-baseline-and-diagnostics.md)
- [Phase 1：Harness V2 基础升级](./phase-1-harness-v2-foundation.md)
- [Phase 2：Eval Harness](./phase-2-eval-harness.md)
- [Phase 3：Feedback Loop](./phase-3-feedback-loop.md)
- [Phase 4：Adaptive Strategy](./phase-4-adaptive-strategy.md)
- [Phase 5：Self-Evolution Ops](./phase-5-self-evolution-ops.md)
- [品牌记忆 2.0：超长记忆、语言风格克隆与 Harness 自动进化计划](./brand_memory_long_term_evolution_plan.md)

每个 phase 文件都必须回答四个问题：

- 行业领先 harness 通常怎么做。
- Marketing Hub 如何形成平台技术壁垒。
- 这一阶段的具体技术要求是什么。
- 任务、交付物和验收标准是什么。

## 3. 平台壁垒主线

Marketing Hub 不把 harness 做成通用 LLM 编排层，而是做成营销内容生产操作系统：

- Campaign Brief Compiler：统一编译品牌、受众、渠道、活动目标、禁用词、历史样本和工作流上游输出。
- Platform-Native Strategy：小红书、微信、抖音等平台有不同内容结构、视觉策略和 CTA，不只是替换平台名。
- Creative Chain Consistency：copy、storyboard、image_prompt、review 共享同一 campaign context，保证内容包一致。
- Brand Memory Evolution：品牌长期记忆、用户改稿和高质量资产持续进入 organization-scoped 学习闭环。
- Marketing Rubric Eval：评测平台适配、卖点层级、事实边界、CTA、视觉 prompt、分镜可拍摄性和审核建议可执行性。
- Human-in-the-Loop Autonomy：系统可以提出 harness 改进建议，但必须经 eval 和人工批准后发布。

## 4. 推荐执行顺序

1. 先完成 Phase 0，把坏样本和指标固定下来。
2. 保持 Phase 1 的 API 兼容升级，作为 V2 harness 基础。
3. 立即补 Phase 2，否则后续所有质量优化都无法客观比较。
4. Phase 3 和 Phase 4 可以并行：一个收集真实反馈，一个做策略抽象。
5. Phase 5 等测试用户量起来后再做，但 prompt/catalog 的版本字段要从现在开始保留。

## 5. 命名规范

- 避免把这个系统称为单纯 `prompt engineering`。
- 代码和文档中优先使用：
  - `generation harness`
  - `harness evolution`
  - `strategy registry`
  - `eval harness`
  - `feedback loop`
  - `prompt asset`
- 只有在讨论模型输入文本本身时，才使用 `prompt`。

## 6. 参考方向

- OpenAI Evals: https://platform.openai.com/docs/guides/evals
- LangSmith Evaluation: https://docs.smith.langchain.com/evaluation
- LangGraph / LangChain Memory Concepts: https://docs.langchain.com/oss/python/concepts/memory
