# Phase 2：Eval Harness

目标：建立可重复、可比较、可扩展的评测系统，让 harness 进化有客观依据。

## 行业基准

OpenAI Evals 的基本流程是描述任务、用测试输入运行 eval、分析结果并迭代；eval 需要 data source 和 testing criteria。LangSmith Evaluation 将评测拆为 offline evaluation 和 online evaluation，支持 dataset、evaluator、experiment、human review、code rules、LLM-as-judge、pairwise comparison。

Marketing Hub 应吸收这些行业模式，但不能停留在通用问答评测。我们的 eval 必须评估“营销内容生产质量”。

## Marketing Hub 技术壁垒

Phase 2 的壁垒是“营销领域 rubric + 多模态链路 eval”：

- Marketing Rubric：平台适配、品牌一致性、CTA、卖点层级、事实边界、审核风险。
- Chain Eval：内容包不是单点输出，要评估 copy -> storyboard -> image_prompt -> review 的一致性。
- Workflow Node Eval：每个节点既可单测，也可在 DAG 里评估上下游传递质量。
- Bilingual Visual Eval：图像 prompt 英文结构完整度和中文运营摘要同时评估。
- Cost Quality Frontier：同一个 case 记录质量、延迟、token、成本，为模型 lane 选择提供依据。

## 技术要求

- 新增 eval fixtures：
  - `backend/ai_gateway/evals/copy_cases.json`
  - `backend/ai_gateway/evals/image_prompt_cases.json`
  - `backend/ai_gateway/evals/storyboard_cases.json`
  - `backend/ai_gateway/evals/review_cases.json`
  - `backend/ai_gateway/evals/content_package_cases.json`
  - `backend/ai_gateway/evals/workflow_cases.json`
- 每条 case 必须包含：
  - `id`
  - `task_type`
  - `payload`
  - `expected_schema`
  - `required_signals`
  - `forbidden_signals`
  - `rubric`
  - `min_score`
  - `risk_level`
  - `tags`
- 评分器必须分层：
  - schema grader
  - rule grader
  - domain rubric grader
  - optional LLM judge grader
- 本地命令必须支持：
  - 单 task eval
  - 全量 eval
  - 指定 harness version 对比
  - JSON/Markdown report 输出
- CI 默认只跑 deterministic graders，不跑真实 provider。

## 任务清单

1. Fixture 设计
   - 为每个核心 task 建 5-10 条 golden cases。
   - 加入坏样本回归用例。
   - 标注平台、行业、风险等级、内容类型。

2. Eval runner
   - 复用 `AIModelGateway.execute` 或直接调用 builder + mock output。
   - 支持 `--task copy`、`--case-id`、`--provider mock`、`--harness-version`。
   - 输出每条 case 的 pass/fail、score、failed checks、logs。

3. Graders
   - Schema grader：字段存在、类型正确、JSON 可解析。
   - Copy grader：标题具体、场景、卖点、CTA、标签质量、禁用词。
   - Image prompt grader：英文 prompt 结构、negative prompt、画幅、风格 skill。
   - Storyboard grader：场景数量、时长总和、前 3 秒钩子、旁白可读。
   - Review grader：问题定位、建议可执行、未编造规则。
   - Content package grader：多资产一致性、平台一致性、voiceover 来源。

4. Report
   - 生成 `eval_report.json` 和 `eval_report.md`。
   - 包含总分、分项分、成本、延迟、失败原因。
   - 记录和上一版本的差异。

5. CI 接入
   - 新增 lightweight eval 命令。
   - 低于阈值时 CI fail。
   - 真实模型 eval 暂不进 PR 必跑，作为 nightly 或手动任务。

## 交付物

- Eval fixtures。
- Eval runner。
- Grader modules。
- Markdown/JSON 报告。
- CI lightweight eval job。

## 验收标准

- 每个核心 task 至少 5 条 cases。
- 任意 harness 改动能在本地跑出可比较报告。
- 规则评分器不依赖网络和真实模型。
- 一个失败 case 能明确显示失败字段、失败规则和建议归因。

