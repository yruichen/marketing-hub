# Phase 0：基线与问题归因

目标：建立 Marketing Hub 生成 harness 的真实基线，明确“质量差”具体发生在哪个环节，避免后续只凭感觉改 prompt。

## 行业基准

领先 harness 系统一般不会直接进入“改提示词”阶段，而是先做三件事：

- 追踪：记录每次生成的输入、上下文、模型、版本、成本、延迟、fallback 和输出。
- 归因：把失败归因到 context、retrieval、strategy、prompt、model、parser、normalizer、UI 或用户输入。
- 样本化：把失败样本变成 regression cases，后续每次升级都能复测。

参考方向：

- OpenAI Evals 将 eval 流程拆成 task description、test inputs、analyze results、iterate。
- LangSmith Evaluation 区分 offline evaluation 和 online evaluation，并强调从生产 traces 回流到 dataset。
- LangGraph memory 文档强调 long-term memory 需要 semantic、episodic、procedural 分类，而不是把所有上下文塞进模型。

## Marketing Hub 技术壁垒

Phase 0 要建立的是平台专属的“营销生成链路指纹”，不是通用 LLM trace：

- 多租户营销上下文指纹：organization、project、campaign、brand_context、workflow node lineage 必须进入 trace。
- 内容资产闭环：生成结果要关联 Asset、CommunityCreation、WorkspaceDraft 和 UsageEvent。
- 节点级归因：工作流里每个 node 的输入、输出、上游摘要、retry、feedback 都要可定位。
- 平台语境归因：小红书、微信、抖音等渠道策略要能单独计分，不能只看 JSON 是否正确。
- 品牌一致性归因：把品牌事实、语气、禁用词、历史样本使用情况拆开判断。

## 技术要求

- 建立 `GenerationTrace` 设计，不一定第一阶段建表，但文档必须定义字段。
- 所有生成入口必须能映射到唯一 `trace_id` 或 `generation_task_id`。
- 每个 trace 至少包含：
  - `task_type`
  - `prompt_key`
  - `prompt_version`
  - `harness_version`
  - `provider`
  - `model_name`
  - `fallback_used`
  - `organization_id`
  - `project_id`
  - `campaign_id`
  - `workflow_run_id`
  - `workflow_node_id`
  - `input_digest`
  - `context_digest`
  - `output_digest`
  - `latency_ms`
  - `prompt_tokens`
  - `completion_tokens`
  - `cost_usd`
  - `quality_flags`
- `input_digest` 和 `context_digest` 必须脱敏，不保存原始 API key、敏感 URL、用户邮箱、手机号。
- 归因标签必须使用枚举，避免自由文本不可统计。

## 任务清单

1. 生成链路地图
   - 梳理 copy、content-package、image、image_prompt、storyboard、audio、video、review、brainstorm、workflow run。
   - 标注入口 view、task_type、payload builder、prompt builder、adapter、normalizer、asset persistence。
   - 输出链路表：入口、输入、上下文来源、输出、失败点、日志字段。

2. 指标定义
   - 定义结构指标：JSON 可解析率、必填字段完整率、normalizer fallback 率。
   - 定义内容指标：平台适配度、品牌一致性、事实幻觉率、CTA 可执行性。
   - 定义视觉指标：subject/composition/lighting/style/negative prompt 完整度。
   - 定义分镜指标：时长一致率、开头钩子、镜头可拍摄性、旁白可念读性。
   - 定义运营指标：fallback 率、重试率、用户改写率、任务失败率、单次成本。

3. 坏样本分类
   - 收集 20-50 条人工发现的低质量输出。
   - 按问题类型分类：泛泛而谈、硬广、幻觉、平台不适配、空字段、JSON 错误、视觉不可生成、分镜不可拍、审核建议空泛。
   - 每条坏样本记录 expected behavior 和 suspected failure stage。

4. 基线报告
   - 形成当前版本质量基线。
   - 写明下一阶段优先解决哪些失败类型。

## 交付物

- `docs/plans/generation-harness-evolution/baseline.md`
- 生成链路表。
- 质量指标字典。
- 坏样本分类表。
- `harness_version` 命名规范。

## 验收标准

- 每个生成入口都有清晰链路说明。
- 每类失败至少能归因到一个 harness 环节。
- 所有后续 phase 都能引用 Phase 0 的指标和样本。
- 不要求此阶段上线新功能，但必须能指导 Phase 1 和 Phase 2 的实现优先级。

