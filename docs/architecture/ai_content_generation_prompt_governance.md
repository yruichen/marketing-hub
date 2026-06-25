# AI 内容生成 Prompt / Skill 治理规范

版本：V1
日期：2026-06-25
范围：文案、图片、图片提示词、分镜、配音、视频、内容包、审核、自定义智能体、灵感风暴

## 1. 现状判断

当前 AI 内容生成能力已经覆盖多个细分场景，但提示词体系还没有达到产品级标准：

- 提示词正文、schema hint、平台规则、fallback、normalize 逻辑混在 `backend/ai_gateway/prompts.py`。
- Prompt 只有 key，没有 owner、版本、风险等级、输出契约、质量标准和变更记录。
- 图片风格 skill 单独在 `api/image_style_skills.py`，但没有和 prompt registry 使用同一套治理口径。
- 内容包编排散落在 `ai_gateway/content_package.py`，没有明确记录它依赖哪些 prompt asset。
- 前端生成页只展示输入表单，不展示当前使用的 prompt/skill 版本、输出标准或质量检查项。
- 缺少 prompt eval。当前测试更多是结构兜底，不足以判断“生成质量是否变好”。

结论：不要继续在现有 prompt 字符串上做零散文案优化。第一步应该建立 Prompt/Skill 资产管理层，再逐步重写高质量提示词。

## 2. 行业级目标

AI 内容生成应该从“几个硬编码 prompt”升级为“可管理、可评估、可灰度、可审计的内容生成系统”。

目标能力：

- Prompt 资产化：每个 prompt/skill 有 key、版本、owner、风险等级、输出契约、质量标准。
- 模板模块化：system、task、brand context、platform rules、output schema、negative constraints 分层管理。
- 输出契约稳定：所有模型输出必须经过 schema normalize 和质量检查。
- Skill 可组合：图片风格、平台风格、品牌语气、审核规则是可复用 skill，不散落在字符串里。
- 可观测：每次生成日志都能追踪 prompt key、版本、模型、provider、成本和 fallback。
- 可评测：每个核心任务都有 golden cases，升级 prompt 前后可以对比质量。
- 可运营：后续可以做后台 UI，让非工程人员查看、编辑、灰度和回滚 prompt。

## 3. 目标架构

建议把 AI 内容生成拆成 5 层。

### 3.1 Prompt Catalog

代码入口：

- `backend/ai_gateway/prompt_catalog.py`

每个资产必须包含：

- `key`：稳定标识，例如 `marketing.copy.system`
- `version`：语义化版本或日期版本，例如 `2026-06-25.v1`
- `kind`：`system_prompt`、`generation_prompt`、`style_skill`、`workflow_skill`
- `owner`：内容生成、工作流、审核等责任域
- `task_type`：copy、image、storyboard 等
- `title` / `description`
- `output_contract`
- `quality_bar`
- `risk`：low / medium / high

生成日志必须写入：

- `gateway:prompt_key`
- `gateway:prompt_version`
- `gateway:prompt_owner`
- `gateway:prompt_risk`

### 3.2 Prompt Templates

后续建议从 `prompts.py` 继续拆到：

```text
backend/ai_gateway/prompt_templates/
  copy.v1.md
  storyboard.v1.md
  image_prompt.v1.md
  review.v1.md
  audio.v1.md
  brainstorm.v1.md
```

模板建议分段：

- Role：模型扮演什么专家。
- Task：这次要完成什么。
- Context：品牌、产品、平台、受众、工作流上游输入。
- Constraints：事实边界、合规边界、风格边界。
- Process：建议模型内部遵循的思考顺序，但不要要求输出 chain-of-thought。
- Output Contract：严格 JSON schema。
- Quality Bar：优秀答案应满足什么。
- Failure Policy：信息不足时如何处理。

### 3.3 Skill Library

Skill 不应只限图片风格。建议分为：

- Platform Skill：小红书、抖音、微信、B 站、LinkedIn 等平台规则。
- Tone Skill：专业克制、年轻活泼、专家型、故事型、转化型。
- Visual Skill：杂志风、产品棚拍、小红书生活方式、B2B 商务等。
- Review Skill：广告法、禁用词、平台审核、品牌一致性。
- Workflow Skill：内容包、短视频链路、种草链路、B2B lead-gen 链路。

短期做法：

- 先把现有 `image_style_skills.py` 的数据结构升级为 Skill Registry。
- 再把 `PLATFORM_GUIDANCE` 和 `PLATFORM_FEW_SHOT` 迁进去。

### 3.4 Evaluations

Prompt 质量不能只靠肉眼看。

建议每个核心任务建立 eval fixture：

```text
backend/ai_gateway/evals/
  copy_cases.json
  storyboard_cases.json
  image_prompt_cases.json
  review_cases.json
```

每条 case 包含：

- input payload
- expected schema
- required phrases / forbidden phrases
- scoring rubric
- known bad output examples

第一阶段可以用规则评分：

- JSON 是否可解析。
- 必填字段是否存在。
- 是否使用平台要求。
- 是否触犯禁用词。
- 文案是否包含场景、卖点、CTA。
- 分镜时长是否一致。
- 图片 prompt 是否包含 subject、composition、lighting、style、negative constraints。

### 3.5 Management UI

后续可在 AI 设置或独立“Prompt 管理”中展示：

- 当前启用 prompt 版本。
- 每个 prompt 的 owner、风险、输出契约。
- 关联 skill。
- 最近使用次数、失败率、fallback 率、成本。
- 变更历史和回滚入口。

写操作必须限制 admin / creator 权限，高风险 prompt 需要审核发布。

## 4. 内容生成 Prompt 重写标准

### 4.1 文案 Copy

必须解决：

- 不再只生成“标题 + 几段正文”，而要明确平台、受众阶段、卖点层级和转化目标。
- 不编造功效、权威背书、销量、价格、限时优惠。
- 需要给出 hook 类型，例如问题钩子、场景钩子、反差钩子、利益钩子。

输出建议升级：

```json
{
  "title": "...",
  "hook_type": "scenario|problem|contrast|benefit",
  "paragraphs": ["..."],
  "selling_points_used": ["..."],
  "tags": ["..."],
  "call_to_action": "...",
  "risk_notes": []
}
```

### 4.2 图片 Prompt

必须解决：

- 用户输入和风格 skill 要分层，不要拼成一段松散中文。
- 生成模型更适合英文结构化 prompt，运营需要中文摘要。
- 必须显式包含 negative prompt。

输出建议升级：

```json
{
  "prompt": "...",
  "prompt_zh": "...",
  "negative_prompt": "...",
  "composition_notes": "...",
  "platform_fit": "..."
}
```

### 4.3 分镜 Storyboard

必须解决：

- 每个镜头都要有画面动作、镜头景别、旁白、屏幕文字建议和时长。
- 总时长必须严格等于输入时长。
- 开头、承接、价值证明、CTA 要完整。

输出建议升级：

```json
{
  "video_topic": "...",
  "total_duration_seconds": 30,
  "scenes": [
    {
      "scene_number": 1,
      "duration_seconds": 5,
      "shot_type": "close-up",
      "visual_description": "...",
      "audio_narration": "...",
      "on_screen_text": "...",
      "transition": "cut"
    }
  ]
}
```

### 4.4 内容审核 Review

必须解决：

- 合规和品牌一致性是高风险 prompt，必须可解释。
- 每个 issue 必须有问题片段、规则、严重程度、建议修改。
- 不能把“不确定的平台规则”当确定事实。

输出建议升级：

```json
{
  "passed": true,
  "risk_level": "low|medium|high",
  "brand_consistency_score": 85,
  "issues": [
    {
      "type": "sensitive_word|platform_rule|brand_voice|factual_claim",
      "severity": "low|medium|high",
      "context": "...",
      "suggestion": "..."
    }
  ],
  "summary": "..."
}
```

### 4.5 内容包 Content Package

必须解决：

- 内容包不是单独 prompt，而是 orchestration。
- 需要记录依赖的 prompt assets：copy、storyboard、image_prompt、review。
- 输出应包含发布准备度和缺失项。

建议新增：

- `package_readiness_score`
- `missing_inputs`
- `channel_variants`
- `review_summary`

## 5. 分阶段实施

### Phase 1：资产登记与审计

已开始：

- 新增 `backend/ai_gateway/prompt_catalog.py`。
- `AIModelGateway.execute` 记录 prompt 版本、owner、risk。

下一步：

- 把 `image_style_skills.py` 升级为统一 skill catalog。
- 在前端 AI 设置页展示当前 prompt catalog。
- 为每个生成结果展示 prompt version。

验收：

- 任意生成任务 logs 中能看到 prompt key 和 version。
- 后端测试能保证 catalog 覆盖所有生成任务。

### Phase 2：模板拆分

改动：

- 从 `prompts.py` 拆出 markdown prompt templates。
- `prompts.py` 只保留 builder、normalizer 和 schema validation。
- 每个模板有独立版本和 changelog。

验收：

- 改 prompt 不需要进入 normalize 逻辑。
- 每个 prompt 版本可对比、可回滚。

### Phase 3：顶级 Prompt 重写

优先顺序：

1. Copy
2. Image Prompt
3. Storyboard
4. Review
5. Content Package orchestration
6. Audio / Video / Custom Agent / Brainstorm

验收：

- 输出字段更完整。
- 内容更贴合平台。
- 不再编造未提供事实。
- 失败和缺失输入有明确降级策略。

### Phase 4：Eval 与质量门禁

改动：

- 增加 eval fixtures。
- 增加规则评分脚本。
- CI 中先运行轻量 eval，不调用真实模型。
- 可选增加人工评审表。

验收：

- Prompt 修改必须通过结构与规则评测。
- 能对比两个 prompt 版本的质量变化。

### Phase 5：管理后台与灰度

改动：

- Prompt catalog API。
- Prompt 管理 UI。
- 版本发布、灰度、回滚。
- 使用统计和失败率展示。

验收：

- admin 可以查看 prompt 资产。
- 高风险 prompt 有明确发布流程。
- 线上问题可以快速定位到 prompt 版本。

## 6. 当前工程落点

短期不要一次性把所有 prompt 重写完。正确顺序是：

1. 建 catalog 和日志追踪。
2. 建 skill catalog。
3. 给 copy / image_prompt / storyboard 写新版模板和 eval。
4. 接入前端展示 prompt version。
5. 再逐步把生成质量提升到稳定标准。

这样做的原因很直接：没有版本和评测，任何“更好的提示词”都无法证明更好，也无法安全回滚。
