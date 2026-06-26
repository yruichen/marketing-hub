# 品牌记忆 2.0：超长记忆、语言风格克隆与 Harness 自动进化计划

版本：V1
日期：2026-06-25
范围：品牌记忆、语义检索、历史内容学习、语言风格克隆、生成质量评测、自动进化闭环

## 1. 背景与结论

当前 Marketing Hub 已经有“品牌记忆”的产品概念，但实现上仍是项目级 `brand_context` 的 6 个结构化字段：

- `brand_name`
- `audience`
- `tone`
- `selling_points`
- `visual_style`
- `campaign_goal`

这些字段适合 MVP，但不够支撑长期生产系统。真正的品牌记忆需要解决三件事：

- 超长记忆：从品牌资料、历史内容、生成结果、人工反馈、项目复盘中持续沉淀可检索记忆。
- 语言风格克隆：从高质量历史样本中提炼可解释、可控、可评测的写作风格，而不是简单拼接“品牌语调”。
- Harness 自动进化：用 eval harness 持续评测 prompt、memory retrieval、style profile 和生成策略，在人工确认后推进版本。

核心结论：

1. 不建议马上引入重型向量数据库。项目已经使用 Django + PostgreSQL/SQLite fallback，短中期优先用 PostgreSQL + pgvector；SQLite 本地开发保留关键词 fallback。
2. 不建议把“风格克隆”做成不可解释的模型微调。第一阶段应做 `StyleProfile + Few-shot retrieval + Rubric eval`，等样本和 eval 足够稳定后再考虑 fine-tuning。
3. 不建议让自动进化直接改生产 prompt。Harness 自动进化必须输出 `ImprovementProposal`，经过评测阈值、回归检查和人工批准后才能发布。
4. 品牌记忆要拆成 semantic / episodic / procedural 三类，分别服务事实、案例和操作规则。

## 2. 调研摘要

### 2.1 pgvector

pgvector 官方定位是 Postgres 的开源向量相似度检索扩展，支持精确和近似最近邻搜索、cosine/L2/inner product 等距离函数，并支持 HNSW 和 IVFFlat 索引。它的最大优势是可以把向量和现有多租户业务数据放在同一个事务数据库中，继续使用 PostgreSQL 的权限、备份、JOIN 和迁移体系。

对本项目的含义：

- 短中期优先选 pgvector，而不是新引入 Qdrant/Milvus/Weaviate。
- 组织、项目、素材、任务、记忆 chunk、embedding 可以保持同库关联。
- PostgreSQL 环境启用 HNSW；SQLite 开发环境走关键词 fallback 和小样本内存 cosine。

参考：https://github.com/pgvector/pgvector

### 2.2 长期记忆分类

LangGraph/LangChain 的长期记忆文档把记忆拆成 semantic、episodic、procedural：

- semantic memory：事实、偏好、品牌知识。
- episodic memory：过去任务和样例，可用于 few-shot。
- procedural memory：规则、流程、prompt、策略。

对本项目的含义：

- 品牌基础资料和禁用词属于 semantic。
- 历史爆款文案、人工改稿、成功内容包属于 episodic。
- 平台 SOP、审核规则、品牌写作准则属于 procedural。

参考：https://docs.langchain.com/oss/python/concepts/memory

### 2.3 Embedding 与检索

OpenAI 官方 Embeddings 文档强调 embedding 可以把文本转成向量，用于 search 等场景；也提醒把所有上下文直接塞进模型窗口会提高 token 成本，embedding-based search 是权衡方案。

对本项目的含义：

- 不追求把品牌所有历史内容放进 prompt。
- 先做 ingestion、chunk、embedding、retrieve、rerank、compress，再把最相关的记忆注入 AI Gateway。
- embedding provider 应接入现有 `AIConfiguration` 和 `AIModelGateway` 的 provider/lane 思路，不把 OpenAI 写死。

参考：https://platform.openai.com/docs/guides/embeddings

### 2.4 Eval Harness

OpenAI Evals 文档把 eval 拆成 task description、test inputs、testing criteria/graders、run、analyze、iterate。Ragas 生态覆盖 RAG evaluation、prompt evaluation、agent evaluation、rubric scoring、testset generation 等方向。

对本项目的含义：

- 自动进化必须先有固定 eval cases 和 graders。
- RAG 质量要单独评测 retrieval precision、context relevance、faithfulness、answer/style adherence。
- 生成质量要评测品牌一致性、平台适配、禁用词、事实边界、结构完整度。

参考：

- https://platform.openai.com/docs/guides/evals
- https://docs.ragas.io/en/stable/concepts/metrics/

### 2.5 Agent Harness Engineering

`Agent Harness Engineering: A Survey` 把 agent 可靠性从“模型能力”转向“模型外层基础设施”。论文提出 ETCLOVG 七层分类：

- Execution environment
- Tool interface
- Context management
- Lifecycle / Orchestration
- Observability
- Verification
- Governance

对本项目的含义：

- 品牌记忆 2.0 不能只做 RAG 和 prompt。它必须成为一个 harness：能管理上下文、工具、执行轨迹、评测、治理和回滚。
- 自动进化不能只比较最终文案分数，还要记录完整 trajectory：检索了哪些记忆、注入了哪些上下文、调用了哪个 prompt 版本、用了哪些 grader、花了多少成本。
- 失败归因要落到 harness 层：是 memory chunk 错、retrieval policy 错、prompt 错、style profile 错、模型错，还是 evaluator 错。

参考：https://picrew.github.io/LLM-Harness/main.pdf

### 2.6 Phistory 与 Hermes Prompt Diff

Phistory 是一个 agent CLI system prompt 版本归档和 diff 查看工具。它会记录不同 agent、不同版本的 prompt、trace、fingerprint 和变更行数。用户给定的 Hermes Agent diff 范围是：

- from：`v2026.5.7`
- to：`v2026.5.16`
- 变更规模：新增 216 行、删除 24 行、总变更 240 行。
- 主要变化：新增 browser toolset；强化长期记忆的 stale-data 边界；把 host/home/cwd 等运行环境显式注入；将 delegation 的并发、嵌套深度、toolset 可用性改成用户/配置感知；继续保留 memory、session search、skill、patch、process、terminal 等工具的细粒度说明。

对本项目的含义：

- Prompt 本身要版本化、可 diff、可 fingerprint，而不是只存在代码字符串里。
- Prompt 变更要能按 section 归因，例如 memory policy、tool policy、context policy、governance policy。
- Trace 要能回放 prompt + memory + tool + model 的完整请求，而不是只保存最终生成结果。
- “长期记忆”必须明确哪些内容不能写入，例如短期任务进度、易过期编号、临时产物和会覆盖当前请求的命令式记忆。

参考：https://phistory.cc/?agent=hermes&from=v2026.5.7&to=v2026.5.16

## 3. 目标体验

### 3.1 品牌记忆

用户应该能在项目或组织层看到一个可解释的品牌记忆档案：

- 基础档案：品牌名称、行业、受众、卖点、竞品、禁用词、合规边界。
- 语言风格：句长、节奏、常用表达、禁用表达、标题偏好、CTA 偏好、emoji/标点偏好。
- 视觉风格：主色、构图、图片风格 skill、禁用视觉元素、参考图。
- 渠道规则：小红书、抖音、公众号、B 站、LinkedIn 等平台偏好。
- 历史样本：人工确认的优秀内容、失败内容、改稿记录。
- 来源与置信度：每条记忆来自哪里、何时更新、是否人工确认。

### 3.2 语言风格克隆

用户可以上传或选择历史内容样本，让系统生成一个可编辑的 `VoiceStyleProfile`：

- “像这个品牌写”，但不复制原文。
- 每次生成显示本次命中的风格规则和 few-shot 样例。
- 用户可以禁用某条风格规则，例如“不要使用反问句”。
- 风格克隆结果必须经过版权、隐私和品牌授权提示。

### 3.3 Harness 自动进化

系统持续收集生成结果和反馈，自动提出改进建议：

- 某个品牌的标题常被用户重写，建议更新 title pattern。
- 某个平台内容审核常失败，建议增强 review skill。
- 某类 retrieval context 经常无用，建议调整 chunk/rerank。
- 某 prompt 新版本在 eval 中显著胜出，建议灰度发布。

自动进化不是自动上线。它只产生 proposal，经 eval、回归和人工批准后进入生产。

## 4. 目标技术栈

### 4.1 后端

继续沿用：

- Django 6 + Django REST Framework
- PostgreSQL 生产库，SQLite 本地 fallback
- Celery + Redis 处理 ingestion、embedding、eval、profile extraction
- 现有 `AIModelGateway` provider adapter pattern
- 现有 `Prompt Catalog` / `Prompt Governance` 方向

新增建议：

- `pgvector` PostgreSQL extension
- Python package `pgvector`，用于 Django 字段和查询集集成
- 可选 `numpy`，用于 SQLite fallback 的小规模 cosine 计算
- 可选 `pydantic` schema，规范 memory extraction / eval result 输出
- 可选 `ragas`，第二阶段引入，用于 RAG 指标和测试集生成

不建议第一阶段引入：

- 独立向量数据库：运维成本高，当前项目规模还不需要。
- 全量 LangChain 重构：现有 AI Gateway 已经是清晰边界，应该局部吸收 memory/eval 思路。
- 直接 fine-tuning：样本、授权、eval 都还不够成熟。

### 4.2 前端

继续沿用：

- React + TypeScript
- Zustand UI state
- TanStack Query server state
- Tailwind + 当前 editorial design system

新增建议：

- `features/brand-memory/`：品牌记忆主页、来源管理、风格画像、记忆审阅。
- `features/evals/` 或 `features/ai-governance/`：eval run、proposal、版本对比。
- 生成结果页展示 “本次使用的记忆”：memory chunks、style profile、few-shot examples、prompt/skill version。

### 4.3 AI Provider 策略

Embedding、rerank、extract、generate 应该拆成不同 lane：

- `embedding`：生成向量。
- `rerank`：候选记忆重排，可先用轻量 LLM 或规则分。
- `extract`：从原始资料抽取记忆。
- `generate`：文案、图片 prompt、分镜等原有任务。
- `judge`：eval grading。

现有 `AIConfiguration.config_scope` 已有 lane 思路，可扩展为更多 scope，避免所有任务共用一个模型配置。

## 5. 目标数据模型

所有 Django model 仍放在 `backend/api/models.py`，符合当前项目约束。

### 5.1 BrandMemoryProfile

组织或项目级的品牌记忆主档。

字段建议：

- `organization`
- `project` nullable：为空表示组织级共享记忆。
- `name`
- `scope`: `organization | project | campaign`
- `status`: `draft | active | archived`
- `summary`
- `profile_json`: 当前聚合后的品牌档案。
- `confidence_score`
- `version`
- `created_by`
- `created_at`
- `updated_at`

用途：

- 替代单薄的 `Project.brand_context`，但保留兼容。
- `Project.brand_context` 在迁移期作为 profile 的快照字段。

### 5.2 MemorySource

记忆来源。

字段建议：

- `organization`
- `project`
- `campaign`
- `source_type`: `manual | asset | generation_task | upload | url | feedback | audit`
- `title`
- `raw_text`
- `source_url`
- `source_object_type`
- `source_object_id`
- `metadata`
- `permission_scope`
- `status`: `pending | processed | rejected | archived`
- `created_by`
- `created_at`

用途：

- 记录“这条记忆从哪里来”。
- 支持用户删除来源后级联禁用相关 chunk。

### 5.3 MemoryChunk

可检索的记忆单元。

字段建议：

- `profile`
- `source`
- `memory_type`: `semantic | episodic | procedural`
- `category`: `brand_fact | audience | selling_point | taboo | voice_rule | visual_rule | platform_rule | example | review_rule`
- `content`
- `content_hash`
- `language`
- `importance`
- `confidence`
- `valid_from`
- `valid_until`
- `is_active`
- `created_at`
- `updated_at`

用途：

- 检索层的最小文本单位。
- 支持过期、禁用、去重、版本对比。

### 5.4 MemoryEmbedding

chunk 对应的向量。

字段建议：

- `chunk`
- `provider`
- `model_name`
- `dimension`
- `embedding`
- `embedding_hash`
- `created_at`

PostgreSQL：

- `embedding` 使用 pgvector 的 `VectorField`。
- cosine HNSW index。

SQLite fallback：

- `embedding` 可以先存 JSON list，或者不存向量，只走关键词检索。

### 5.5 VoiceStyleProfile

语言风格画像。

字段建议：

- `profile`
- `name`
- `language`
- `source_sample_count`
- `style_json`
- `positive_examples`
- `negative_examples`
- `rubric_json`
- `version`
- `status`: `draft | active | archived`
- `created_at`
- `updated_at`

`style_json` 建议结构：

```json
{
  "tone": ["克制", "具体", "有运营视角"],
  "sentence_rhythm": "短句为主，关键解释使用中长句",
  "title_patterns": ["场景痛点 + 结果", "反差观点 + 方法"],
  "lexicon": {
    "preferred": ["复盘", "链路", "稳定产出"],
    "avoid": ["颠覆", "躺赚", "全网第一"]
  },
  "cta_style": "轻提示，不强压迫",
  "punctuation": "少用感叹号",
  "platform_overrides": {
    "小红书": {"opening": "更生活化", "tags": "保留 3-5 个"}
  }
}
```

### 5.6 EvalCase / EvalRun / EvalResult

用于 harness。

`EvalCase`：

- `suite`
- `task_type`: `copy | image_prompt | storyboard | review | retrieval | style_clone | workflow`
- `input_payload`
- `expected_contract`
- `rubric`
- `required_memory_ids`
- `forbidden_terms`
- `baseline_output`
- `is_active`

`EvalRun`：

- `suite`
- `candidate_type`: `prompt | style_profile | retrieval_policy | model_policy`
- `candidate_version`
- `status`
- `started_at`
- `completed_at`
- `summary`

`EvalResult`：

- `run`
- `case`
- `score`
- `grader_breakdown`
- `output`
- `failure_reason`
- `cost_usd`
- `latency_ms`

### 5.7 ImprovementProposal

自动进化建议。

字段建议：

- `organization`
- `project`
- `proposal_type`: `prompt_update | memory_update | style_update | retrieval_policy_update | model_policy_update`
- `title`
- `rationale`
- `before_snapshot`
- `after_snapshot`
- `eval_summary`
- `risk_level`
- `status`: `draft | needs_review | approved | rejected | applied | rolled_back`
- `created_by_agent`
- `approved_by`
- `created_at`
- `updated_at`

### 5.8 HarnessPromptSnapshot

记录 prompt、memory policy、tool policy、style policy 的版本快照。

字段建议：

- `organization` nullable：为空表示系统默认版本。
- `asset_type`: `system_prompt | task_prompt | memory_policy | style_policy | tool_policy | eval_grader | constitution`
- `asset_key`
- `version`
- `content`
- `content_hash`
- `parent_version`
- `change_summary`
- `added_lines`
- `removed_lines`
- `changed_lines`
- `risk_level`
- `status`: `draft | active | deprecated | rolled_back`
- `created_by`
- `created_at`

用途：

- 支持类似 Phistory 的 prompt diff。
- 每次生成记录使用的 prompt/hash，后续可以回放。
- ImprovementProposal 的 before/after 不再是松散 JSON，而是指向具体 snapshot。

### 5.9 HarnessTrace

记录一次 memory-aware generation 或 eval run 的完整可回放轨迹。

字段建议：

- `organization`
- `project`
- `campaign`
- `generation_task`
- `eval_run`
- `trace_id`
- `trace_type`: `generation | eval | proposal_shadow | workflow_run`
- `input_payload`
- `memory_context`
- `prompt_snapshot_ids`
- `tool_calls`
- `model_calls`
- `grader_calls`
- `outputs`
- `policy_decisions`
- `token_count`
- `cost_usd`
- `latency_ms`
- `status`
- `failure_attribution`
- `created_at`

用途：

- 将 eval 从“最终分数”升级为可诊断轨迹。
- 支持失败归因、成本分析、权限审计和 rollback。
- 支持 trajectory-level grader，例如“是否用了错误记忆”“是否过度调用检索”“是否违反品牌禁用规则”。

### 5.10 HarnessConstitution

声明式治理规则。

字段建议：

- `organization`
- `name`
- `version`
- `scope`: `global | organization | project | campaign`
- `policy_json`
- `status`
- `created_by`
- `approved_by`
- `created_at`
- `updated_at`

`policy_json` 需要覆盖：

- 哪些记忆类型可以自动写入。
- 哪些 proposal 必须人工批准。
- 不同任务的 token/cost/latency budget。
- 哪些工具或生成动作属于高风险。
- 哪些品牌规则不能被 prompt 或模型覆盖。
- 哪些 evaluator 可以作为发布闸门。

## 6. 核心服务设计

### 6.1 Ingestion Service

入口：

- 手动录入品牌资料。
- 从 `Asset` 提取文本。
- 从 `GenerationTask.result` 提取成功内容。
- 从用户反馈和人工改稿提取偏好。
- 从 URL 或上传文档导入。

流程：

1. 创建 `MemorySource`。
2. 清洗文本，去除重复、模板噪声、敏感信息。
3. chunk 切分。
4. LLM 抽取 structured memory candidate。
5. 规则校验和敏感信息检查。
6. 生成 `MemoryChunk`。
7. 异步生成 embedding。
8. 更新 `BrandMemoryProfile.profile_json` 聚合摘要。

### 6.2 Retrieval Service

接口建议：

```python
retrieve_brand_memory(
    organization,
    project=None,
    campaign=None,
    query="",
    task_type="copy",
    platform=None,
    memory_types=None,
    limit=8,
)
```

检索策略：

1. Scope filter：同组织，优先项目，其次组织级。
2. Metadata filter：平台、任务类型、category、active、valid_until。
3. Dense retrieval：pgvector cosine。
4. Keyword retrieval：标题、禁用词、品牌名、卖点字段。
5. Rerank：按相似度、重要性、人工确认、时间衰减、任务匹配度加权。
6. Context compression：合并同类记忆，去重，限制 token。

返回结构：

```json
{
  "profile_summary": "...",
  "chunks": [
    {
      "id": 12,
      "memory_type": "semantic",
      "category": "voice_rule",
      "content": "...",
      "source_title": "...",
      "confidence": 0.92
    }
  ],
  "style_profile": {},
  "retrieval_logs": []
}
```

### 6.3 Style Clone Service

目标不是复制历史文本，而是提炼风格规则和选择 few-shot 样例。

流程：

1. 用户选择 5-50 条授权样本。
2. 系统抽取标题模式、句式、语气、词汇、结构、CTA、平台差异。
3. 生成 `VoiceStyleProfile` draft。
4. 用户审阅并编辑。
5. 对固定 style eval cases 运行评分。
6. 达标后激活。

生成时注入：

- 风格规则摘要。
- 2-4 条最相似 few-shot 样例。
- 禁用表达和版权约束。
- 输出后用 style grader 检查相似度和原创性边界。

注意：

- 不做“模仿某个公众人物”的人格克隆。
- 不允许绕过版权授权。
- 不输出训练样本原文。
- 对外部样本必须记录授权来源。

### 6.4 Memory-aware AI Gateway

现有生成链路：

`GenerationTask.payload -> AIModelGateway.execute -> build_*_messages -> provider -> normalize -> task.result`

升级后：

`payload -> MemoryResolver -> PromptBuilder -> AIModelGateway -> OutputValidator -> EvalLogger`

新增 `MemoryResolver`：

- 根据 `project_id`、`campaign_id`、`task_type`、`platform`、`brief` 检索品牌记忆。
- 将结果写入 payload 的 `brand_memory_context`。
- 记录 memory ids 和 retrieval logs。

新增 prompt 段：

- `Brand Facts`
- `Voice Style`
- `Do / Don't`
- `Relevant Examples`
- `Platform Rules`
- `Source Boundaries`

生成日志必须追加：

- `memory:profile_id`
- `memory:chunk_ids`
- `memory:style_profile_id`
- `memory:retrieval_policy_version`
- `memory:context_tokens`

新增 `HarnessTraceRecorder`：

- 在 prompt 构建前记录原始 payload。
- 在 memory retrieval 后记录候选、rerank、最终注入内容。
- 在 provider 调用前记录 prompt snapshot hash。
- 在 provider 返回后记录 normalize、validator、review grader 结果。
- 对失败任务记录 failure attribution 初判。

新增 `PromptSnapshotResolver`：

- 根据 task_type、organization、project、experiment flag 选择 prompt snapshot。
- 支持 baseline/candidate 双跑。
- 支持 prompt diff、fingerprint 和 rollback。

### 6.5 Feedback Service

用户行为应进入记忆闭环：

- 用户复制：弱正反馈。
- 用户保存为资产：中等正反馈。
- 用户人工编辑：高价值偏好信号。
- 用户点踩或重新生成：负反馈。
- 审核失败：规则信号。

不要把所有行为直接写成记忆。先写入 `MemoryFeedbackEvent` 或 `AuditLog.metadata`，再由 consolidation job 生成 proposal。

## 7. Harness 自动进化设计

### 7.1 Harness 分层

品牌记忆 2.0 的 harness 按 ETCLOVG 映射到产品架构：

| Harness 层 | Marketing Hub 落点 |
|---|---|
| Execution environment | Celery worker、同步 dev runner、SQLite/Postgres fallback |
| Tool interface | AI Gateway、retrieval service、asset ingest、workflow tools |
| Context management | BrandMemoryProfile、MemoryChunk、VoiceStyleProfile、PromptSnapshotResolver |
| Lifecycle / Orchestration | GenerationTask、WorkspaceDraft DAG、EvalRun、ImprovementProposal |
| Observability | HarnessTrace、UsageEvent、AuditLog、cost/latency/token 指标 |
| Verification | rule grader、LLM judge、RAG eval、style eval、schema validator |
| Governance | RBAC、HarnessConstitution、approval、rollback、policy decisions |

评测分层：

第一层：规则评测，CI 可跑。

- JSON schema 是否符合契约。
- 必填字段是否存在。
- 禁用词是否出现。
- 平台字段是否使用。
- 是否引用不存在的事实。
- 输出长度是否合规。

第二层：LLM judge，定时或手动跑。

- 品牌一致性。
- 语言风格匹配。
- 内容具体度。
- 平台适配。
- 审核风险。
- 记忆引用是否忠实。

第三层：RAG eval。

- 检索结果是否相关。
- 是否漏掉必要记忆。
- 是否引入过期或冲突记忆。
- 生成是否忠实使用 retrieved context。

第四层：线上指标。

- 重新生成率。
- 人工编辑距离。
- 保存率。
- 审核通过率。
- 复制率。
- 成本和延迟。

第五层：trajectory eval。

- 是否检索了正确范围的品牌记忆。
- 是否注入了过多、过期或冲突上下文。
- 是否选择了正确 prompt/style 版本。
- 是否违反 constitution 中的 cost、tool、approval 规则。
- 是否出现“结果正确但路径不可接受”的情况，例如过度调用、绕过审核、忽略禁用词。

### 7.2 Eval Suites

建议目录：

```text
backend/ai_gateway/evals/
  brand_memory/
    copy_style_cases.jsonl
    retrieval_cases.jsonl
    review_cases.jsonl
    style_clone_cases.jsonl
    workflow_cases.jsonl
  graders/
    schema.py
    rules.py
    style.py
    retrieval.py
    trajectory.py
    constitution.py
  run_eval.py
```

每条 eval case 应该记录：

- `input_payload`
- `expected_output_contract`
- `expected_memory_categories`
- `forbidden_memory_categories`
- `expected_prompt_snapshot`
- `max_context_tokens`
- `max_tool_calls`
- `max_cost_usd`
- `rubric`

### 7.3 自动进化循环

每日或每周任务：

1. 汇总低分 eval cases 和线上失败信号。
2. 归因到 prompt、memory chunk、style profile、retrieval policy 或 model policy。
3. 生成候选 `HarnessPromptSnapshot`、`VoiceStyleProfile` 或 retrieval policy。
4. 生成 `ImprovementProposal`，绑定 before/after snapshot。
5. 在 shadow eval 中比较 baseline 与 candidate。
6. 写入 `HarnessTrace`，支持失败归因。
7. 达到阈值才进入 `needs_review`。
8. admin/creator 审核。
9. 灰度到少量项目或单组织。
10. 监控线上指标。
11. 达标后全量启用；失败则 rollback。

### 7.4 发布阈值

建议默认阈值：

- 总分至少提升 5%。
- 禁用词和 schema 错误不能回退。
- 品牌一致性不能下降超过 2%。
- 平均成本不能上升超过 20%，除非人工确认。
- P95 延迟不能上升超过 30%，除非只用于后台任务。
- 高风险任务必须人工批准。

### 7.5 Prompt Diff 与版本治理

Prompt 和 memory policy 要按产品资产治理：

- 每个 prompt/policy 都有 `asset_key`、`version`、`content_hash`。
- 每次变更生成 section-level diff。
- diff 必须归类：memory、tool、context、style、eval、governance、output contract。
- 大变更必须触发完整 eval suite。
- 小变更可以只跑相关 suite，但仍要记录 fingerprint。
- 上线后保留 baseline 至少 30 天，支持回放和 rollback。

建议新增管理命令：

```bash
uv run python manage.py snapshot_prompts
uv run python manage.py diff_prompt_snapshots --from <version> --to <version>
uv run python manage.py run_ai_evals --suite brand_memory --candidate <snapshot_id>
```

### 7.6 记忆写入 Constitution

长期记忆必须有明确写入宪法：

- 可以写入：稳定品牌事实、长期偏好、禁用词、风格规则、已确认 SOP、长期有效的渠道规则。
- 不应写入：任务进度、一次性活动状态、临时编号、短期链接、会在一周内过期的事实、未经确认的模型猜测。
- 写入格式：声明式事实，不写命令式自我指令。
- 程序化经验：进入 `VoiceStyleProfile`、`WorkflowTemplate` 或 Skill/Prompt asset，不进入普通 semantic memory。
- 用户反馈：先进入 feedback event，再由 consolidation job 生成 proposal，不直接污染 active memory。

这条 constitution 要作为 grader 的输入，自动检查 memory extraction 是否越界。

## 8. API 设计

新增后端路由建议放在 `workspaces/urls.py` 或新建 `memory/` domain app。考虑当前项目 domain modularization，建议新建 `brand_memory/` app，但模型仍留在 `api/models.py`。

### 8.1 Profile

- `GET /api/brand-memory/profiles/?organization=&project=`
- `POST /api/brand-memory/profiles/`
- `GET /api/brand-memory/profiles/<id>/`
- `PATCH /api/brand-memory/profiles/<id>/`
- `POST /api/brand-memory/profiles/<id>/activate/`

### 8.2 Sources

- `GET /api/brand-memory/sources/?profile=`
- `POST /api/brand-memory/sources/`
- `POST /api/brand-memory/sources/<id>/process/`
- `DELETE /api/brand-memory/sources/<id>/`

### 8.3 Retrieval

- `POST /api/brand-memory/retrieve/`

Request:

```json
{
  "project_id": 1,
  "campaign_id": 2,
  "query": "为新品发布写小红书文案",
  "task_type": "copy",
  "platform": "小红书",
  "limit": 8
}
```

### 8.4 Style

- `GET /api/brand-memory/style-profiles/?profile=`
- `POST /api/brand-memory/style-profiles/extract/`
- `PATCH /api/brand-memory/style-profiles/<id>/`
- `POST /api/brand-memory/style-profiles/<id>/activate/`
- `POST /api/brand-memory/style-profiles/<id>/eval/`

### 8.5 Harness

- `GET /api/ai-governance/eval-suites/`
- `POST /api/ai-governance/eval-runs/`
- `GET /api/ai-governance/eval-runs/<id>/`
- `GET /api/ai-governance/prompt-snapshots/`
- `POST /api/ai-governance/prompt-snapshots/`
- `GET /api/ai-governance/prompt-snapshots/<id>/diff/?from=<id>`
- `GET /api/ai-governance/traces/<trace_id>/`
- `GET /api/ai-governance/constitutions/`
- `POST /api/ai-governance/constitutions/`
- `GET /api/ai-governance/proposals/`
- `POST /api/ai-governance/proposals/<id>/approve/`
- `POST /api/ai-governance/proposals/<id>/reject/`
- `POST /api/ai-governance/proposals/<id>/apply/`
- `POST /api/ai-governance/proposals/<id>/rollback/`

## 9. 前端信息架构

### 9.1 项目检查器升级

当前项目检查器显示“品牌记忆（6 字段）”。升级后：

- 保留 6 字段快速编辑。
- 增加“打开品牌记忆”入口。
- 显示记忆完整度、样本数、最近更新、active style profile。

### 9.2 品牌记忆主页

建议视图：

- Overview：品牌档案摘要、完整度、风险、最近更新。
- Sources：资料来源、处理状态、授权、删除。
- Memory：按 semantic/episodic/procedural 分类查看 chunk。
- Voice Style：语言风格画像、样本、rubric、版本。
- Usage：最近哪些生成任务使用了哪些记忆。
- Proposals：自动进化建议。

### 9.3 生成链路展示

在内容生成结果里增加可展开区域：

- 本次使用的品牌记忆。
- 本次使用的语言风格。
- 本次命中的 few-shot。
- 本次触发的禁用词/审核规则。
- prompt/skill/memory 版本。

这能让用户信任系统，也方便排查“为什么生成成这样”。

### 9.4 AI Governance / Harness 控制台

建议新增治理控制台：

- Prompt Snapshots：查看 prompt/policy 版本、fingerprint、diff、风险等级。
- Harness Traces：按任务查看 memory、prompt、tool、model、grader 的完整轨迹。
- Eval Runs：查看 suite、case、分项评分、失败归因、成本和延迟。
- Constitutions：查看组织/项目级治理规则。
- Proposals：查看自动进化建议、before/after、shadow eval、灰度状态和 rollback。

普通用户只看“本次使用的记忆”和结果解释；admin/creator 才进入治理控制台。

## 10. 权限、隐私与安全

必须遵守：

- 记忆可见、可编辑、可删除。
- 重要记忆写入需要用户确认。
- 上传外部样本必须要求用户确认拥有使用权。
- 生成时不得输出历史样本原文的大段复制。
- 删除 source 后相关 chunk 和 embedding 应禁用或删除。
- 多租户检索必须强制 organization filter。
- 项目级私有记忆不能泄露到组织公共 profile。
- 高风险 proposal 需要 admin 批准。

建议新增审计事件：

- `memory_source_created`
- `memory_source_processed`
- `memory_chunk_disabled`
- `style_profile_extracted`
- `style_profile_activated`
- `eval_run_completed`
- `improvement_proposal_applied`
- `improvement_proposal_rolled_back`

## 11. 分阶段实施计划

### Phase 0：设计冻结与兼容层

目标：不破坏现有 `Project.brand_context`。

改动：

- 确认数据模型和 API。
- 新建 `brand_memory/` app。
- 增加 serializers/services，但暂不改生成链路。
- 写迁移脚本，把现有 `Project.brand_context` 映射成 `BrandMemoryProfile.profile_json`。

验收：

- 老页面仍能保存 6 字段。
- 新 profile 可以从旧字段生成。
- 测试覆盖迁移和序列化。

### Phase 1：记忆来源与手动记忆

目标：把品牌记忆从 JSON 字段升级为可管理资产。

改动：

- 实现 `BrandMemoryProfile`、`MemorySource`、`MemoryChunk`。
- 实现手动新增、编辑、禁用记忆。
- 前端增加品牌记忆主页基础版。
- 生成链路暂时只读取 profile summary，不做向量检索。

验收：

- 用户能看到来源和记忆条目。
- 用户能禁用一条记忆。
- 生成任务 logs 记录 profile id。

### Phase 2：Embedding 与语义检索

目标：让 retrieval 节点和生成任务真正使用语义品牌记忆。

改动：

- PostgreSQL 启用 pgvector。
- 新增 `MemoryEmbedding`。
- Celery 异步 embedding job。
- `retrieve_brand_memory` 支持 pgvector + keyword hybrid。
- SQLite 保留 keyword fallback。
- workflow `retrieval` 节点接入新 retrieval service。

验收：

- `rag_search` 不再只查 community creations。
- 生成文案能引用项目级品牌记忆。
- 检索 logs 展示 chunk ids 和分数。

### Phase 3：语言风格克隆

目标：从历史内容样本生成可控 style profile。

改动：

- 新增 `VoiceStyleProfile`。
- 从 `Asset`、`GenerationTask`、手动样本抽取风格。
- 生成 style rubric。
- 生成链路注入 style profile 和 few-shot。
- 前端可编辑 style profile。

验收：

- 用户选择样本后得到可编辑风格画像。
- 文案生成能稳定遵循 style profile。
- style eval 能指出“不符合品牌语气”的原因。

### Phase 4：Eval Harness

目标：让品牌记忆、风格克隆、prompt 和 trajectory 质量可度量。

改动：

- 新增 eval models 和 fixtures。
- 实现 schema/rule graders。
- 接入 LLM judge 作为可选后台任务。
- 新增 eval run CLI：`uv run python manage.py run_ai_evals --suite brand_memory`
- CI 先跑轻量规则 eval。
- 新增 `HarnessTrace`，记录 memory、prompt、tool、model、grader 轨迹。
- 新增 trajectory grader 和 constitution grader。

验收：

- 每次 prompt/memory policy 变更可跑回归。
- eval result 记录成本、延迟、分项评分。
- 至少覆盖 copy、retrieval、style_clone、review 四类 suite。
- 失败能归因到 memory、retrieval、prompt、style、model、tool、evaluator 中的至少一类。

### Phase 4.5：Prompt Snapshot 与 Constitution

目标：让系统提示词和治理规则像代码一样版本化、可 diff、可回滚。

改动：

- 新增 `HarnessPromptSnapshot`。
- 新增 `HarnessConstitution`。
- Prompt Catalog 关联 snapshot hash。
- AI Gateway 每次调用记录 prompt snapshot ids。
- 治理控制台展示 prompt diff。

验收：

- 可以查看任意两个 prompt 版本的 diff。
- eval run 能绑定 candidate snapshot。
- constitution 能阻止未批准的高风险 proposal 发布。

### Phase 5：Harness 自动进化

目标：系统能提出可审阅、可回滚的改进建议。

改动：

- 新增 `ImprovementProposal`。
- consolidation job 汇总反馈和 eval 失败。
- proposal 生成 before/after。
- proposal shadow eval。
- 前端 AI governance 页面支持 approve/reject/apply/rollback。
- proposal 必须绑定 prompt/style/retrieval snapshot 或 memory chunk 变更。

验收：

- 系统能提出“更新某品牌 title pattern”的建议。
- proposal 必须附 eval summary。
- 未批准 proposal 不影响生产。
- applied proposal 可回滚。
- proposal 页面能打开对应 harness trace。

### Phase 6：线上学习与灰度

目标：把真实用户反馈纳入持续优化。

改动：

- 记录复制、保存、编辑、重生成、审核失败等反馈事件。
- 建立项目级和组织级指标面板。
- 支持按组织/项目灰度新 style profile 或 prompt。
- 增加异常回滚策略。

验收：

- 能看到某 profile 的使用次数、保存率、编辑距离趋势。
- 新策略可只对单项目生效。
- 指标回退时自动标记 proposal 风险。

## 12. 关键文件影响

后端：

- `backend/api/models.py`：新增 memory/eval/proposal models。
- `backend/api/serializers.py`：新增 serializers。
- `backend/brand_memory/`：新增 views、urls、services、tasks。
- `backend/ai_gateway/services.py`：新增 embedding lane、judge lane、memory resolver hook。
- `backend/ai_gateway/prompts.py`：prompt builder 增加 memory/style 段。
- `backend/api/services.py`：`rag_search` 和 workflow retrieval 接入 retrieval service。
- `backend/core/settings.py`：新增 memory/eval 配置项。
- `backend/ai_gateway/prompt_catalog.py`：关联 prompt snapshot、hash、risk、owner。
- `backend/ai_gateway/evals/`：新增 trajectory/constitution graders。
- `backend/ai_governance/`：建议新增治理 domain app，承载 prompt snapshots、traces、constitutions、proposals。

前端：

- `frontend/src/features/projects/InspectorPanels.tsx`：项目检查器增加品牌记忆入口。
- `frontend/src/features/brand-memory/`：新增品牌记忆管理。
- `frontend/src/features/ai-governance/`：新增 eval/proposal 管理。
- `frontend/src/types/workspace.ts`：新增 memory/profile/eval 类型。
- `frontend/src/hooks/useApi.ts`：补充 API 调用。
- `frontend/src/features/ai-governance/PromptDiffView.tsx`：展示 prompt/policy diff。
- `frontend/src/features/ai-governance/HarnessTraceView.tsx`：展示 memory/prompt/tool/model/grader 轨迹。

文档：

- `docs/architecture/ai_content_generation_prompt_governance.md`：后续补充 memory-aware prompt 规范。
- `docs/architecture/global_ai_assistant_upgrade_plan.md`：后续补充可控记忆与 proposal 交互。

## 13. 风险与控制

### 13.1 质量风险

风险：记忆检索错误会让生成更差。

控制：

- retrieval eval 必须独立于生成 eval。
- 每次生成展示 memory ids。
- 支持用户一键禁用错误记忆。

### 13.2 成本风险

风险：embedding、rerank、judge 增加模型调用成本。

控制：

- embedding 异步批处理。
- retrieval 默认不调用 LLM rerank。
- judge 只在后台 eval 或高价值任务运行。
- 记录 memory/context token 成本。

### 13.3 隐私与版权风险

风险：用户上传的历史内容可能没有授权，或生成时过度复用原句。

控制：

- source 记录授权状态。
- style clone 只提炼规则，不直接复制样本。
- 输出后做 overlap 检查。
- source 删除后禁用相关 chunk。

### 13.4 产品复杂度风险

风险：用户被大量记忆和 eval 概念压垮。

控制：

- 默认只展示品牌档案摘要和完整度。
- chunk、eval、proposal 放高级模式。
- 生成结果只展示“本次使用的记忆”，不展示内部细节。

### 13.5 Harness 耦合风险

风险：prompt、memory、tools、workflow、eval 互相耦合，导致任一层升级都引发不可预测回归。

控制：

- prompt snapshot 和 constitution 独立版本化。
- memory retrieval policy 独立版本化。
- eval run 永远记录所有版本 hash。
- 大版本升级先 shadow eval，再 project-level 灰度。
- failure attribution 不只给总分，要定位到 harness 层。

## 14. 推荐优先级

第一优先级：

- Phase 0-2：把品牌记忆资产化，并接入语义检索。

第二优先级：

- Phase 3-4.5：语言风格克隆、eval harness、prompt snapshot 和 constitution。

第三优先级：

- Phase 5-6：自动进化、灰度和线上学习。

最小可交付版本：

1. `BrandMemoryProfile + MemorySource + MemoryChunk`
2. 从旧 `Project.brand_context` 自动迁移 profile
3. 手动新增/禁用记忆
4. 生成任务读取 profile summary
5. retrieval 节点返回品牌记忆结果

这个版本能先把“品牌记忆”从概念升级成真实数据资产，再逐步叠加向量检索、风格克隆和自动进化。
