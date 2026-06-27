# Phase 3：Feedback Loop

目标：把真实用户修改、审核失败、重试行为和低分输出转化为 harness 进化样本。

## 行业基准

领先系统会把线上交互纳入在线评测和反馈闭环：生产 trace 被采样、打分、人工标注，失败样本回流到 offline dataset，再用于回归测试和版本对比。

但通用反馈闭环通常只记录 thumbs up/down 或 trace。Marketing Hub 必须记录营销生产过程中的“人工改稿”和“资产复用”。

## Marketing Hub 技术壁垒

Phase 3 的壁垒是“创作者改稿即训练信号”：

- Edit Delta Mining：用户怎么改标题、正文、CTA、标签、分镜和视觉 prompt，都是高价值信号。
- Brand Style Learning：从同一组织反复接受的改稿中提炼品牌风格规则。
- Asset Outcome Signal：被保存、分享、发布、复用、点赞的内容比单次评分更有价值。
- Review-to-Strategy Loop：审核失败不是终点，要回写 risk strategy 和 forbidden signals。
- Organization-Scoped Learning：不同品牌的进化隔离，避免跨组织污染。

## 技术要求

- 设计反馈数据结构：
  - `GenerationFeedback`
  - `GenerationEditDelta`
  - `GenerationQualityEvent`
  - `HarnessImprovementCandidate`
- 每条反馈必须关联：
  - `generation_task_id`
  - `prompt_key`
  - `prompt_version`
  - `harness_version`
  - `organization_id`
  - `project_id`
  - `campaign_id`
  - `asset_id`
  - `workflow_run_id`
  - `workflow_node_id`
- 用户修改必须保存结构化 diff，而不是只保存最终文本。
- 反馈样本必须脱敏和组织隔离。
- 默认不自动修改生产 harness，只生成 candidate。

## 任务清单

1. 反馈事件定义
   - `accepted`: 用户保存资产。
   - `edited`: 用户修改生成内容。
   - `retried`: 用户重试生成。
   - `rejected`: 用户丢弃或覆盖输出。
   - `review_failed`: 审核节点未通过。
   - `published`: 内容发布到社区或外部渠道。
   - `reused`: 内容被复用到新项目或模板。

2. Edit delta 结构化
   - copy：title、paragraphs、tags、CTA 逐字段 diff。
   - image_prompt：prompt、negative_prompt、composition_notes diff。
   - storyboard：scene 增删改、duration 改动、narration 改动。
   - review：用户是否采纳建议。

3. 样本池
   - high_quality_samples：保存、发布、复用的样本。
   - low_quality_samples：重试、丢弃、低分 eval 的样本。
   - compliance_samples：审核失败和人工合规修改样本。
   - style_samples：同一组织反复保留的语气和表达样本。

4. 自动候选生成
   - 从 edit delta 聚类出常见修改。
   - 输出 `HarnessImprovementCandidate`：问题、证据样本、影响任务、建议修改、风险等级。
   - candidate 必须进入人工审核，不自动上线。

5. 隐私和权限
   - 只有组织 admin 可查看本组织原始样本。
   - 平台 ops 只能看脱敏聚合。
   - 高风险行业样本不能被跨组织 few-shot 使用。

## 交付物

- 反馈事件 schema。
- Edit delta 解析器。
- 样本池导出命令。
- Improvement candidate 生成逻辑。
- 反馈闭环权限说明。

## 验收标准

- 用户对生成结果的一次修改能被追溯到原始输出和 harness version。
- 审核失败能进入 compliance sample pool。
- 至少能从 20 条真实/模拟修改中生成一份 candidate report。
- 没有任何反馈样本会默认跨组织进入其他品牌生成上下文。

