# 工作流体验优化计划

版本：V1
日期：2026-06-25
范围：前端工作流画布、灵感风暴到工作流的跳转体验、工作流运行反馈

## 1. 背景

当前工作流模块已经具备可用基础：节点拖拽、缩放、连接、右键菜单、自定义智能体、撤销重做、自动保存、运行、节点重试、只读分享和右侧运行面板都已存在。

主要体验问题不在“有没有功能”，而在“用户是否理解自己处在流程中的哪一步，以及系统是否在关键状态变化时给出足够平滑的承接”。

当前最明显的问题：

- 灵感风暴完成后直接 `navigate('/workflows?draft=...')`，用户从沉浸式输入页突然切到复杂画布，过渡生硬。
- 工作流页独立加载 draft，灵感页的生成完成状态没有延续到画布首屏。
- 头脑风暴自动生成 workflow 后，节点排版有时显得拥挤、错位或分支关系不清晰，用户第一眼难以理解执行路径。
- 工作流工具栏信息密度高，新增节点、编辑、运行、只读、分享、状态图例混在一起。
- 画布空状态、加载状态、首次进入状态不够明确。
- 节点配置、运行预览、结果反馈分布在节点卡片、浮层和右侧面板中，信息层级需要进一步梳理。

涉及文件：

- `frontend/src/features/brainstorm/BrainstormPage.tsx`
- `frontend/src/features/brainstorm/BrainstormProgress.tsx`
- `frontend/src/features/brainstorm/brainstorm.css`
- `frontend/src/App.tsx`
- `frontend/src/components/WorkflowBuilder.tsx`
- `frontend/src/features/workflows/WorkflowNodeComponent.tsx`
- `frontend/src/features/workflows/PropertyPanel.tsx`
- `backend/ai_gateway/prompts.py`
- `backend/api/services.py`

## 2. 目标体验

用户从“输入一个想法”到“看到一张可运行工作流”的过程应该像同一个连续任务，而不是两个页面之间的硬切换。

目标：

- 灵感风暴完成后，先展示“正在装配工作流”的短过渡，再进入工作流页。
- 工作流页首屏明确告诉用户：这是刚刚由灵感生成的草稿、包含哪些节点、下一步可以运行或调整。
- 自动生成的 workflow 默认就应该有清晰排版：主链路从左到右，分支上下展开，节点不重叠，首屏能看到完整结构。
- 画布操作更像编辑器：主要操作固定、次要操作收纳、状态提示稳定。
- 运行过程更可解释：当前执行到哪个节点、成功/失败原因、可重试入口清晰。
- 保持现有 editorial 视觉语言，不额外引入重型动效库，优先用 CSS transition 和 React 状态完成。

## 3. 灵感风暴到工作流的过渡方案

### 3.1 新增过渡阶段

把 `BrainstormPage` 的状态从：

```ts
'idle' | 'brainstorming'
```

扩展为：

```ts
'idle' | 'brainstorming' | 'handoff'
```

流程：

1. 用户提交 idea，进入 `brainstorming`。
2. API 返回 draft 后，进度推进到 `Ready to launch!`。
3. 进入 `handoff`，展示 900-1200ms 的装配动画。
4. 调用 `onComplete(draftId)`，进入 `/workflows?draft=...&from=brainstorm`。

### 3.2 过渡视觉

过渡不要做大面积花哨动画，重点是把“灵感”变成“节点”的关系表达清楚：

- 中央保留用户输入的 idea 摘要。
- 下面出现 3-5 个小节点胶囊，依次浮入：Brief、Copy、Image、Storyboard、Review。
- 节点之间用细线轻微延展，暗示正在形成 DAG。
- 最后一帧出现短文案：`Workflow assembled` 或 `工作流已装配`。
- 整体使用 220-320ms 的 staggered transition，不使用强烈缩放和闪烁。

可新增组件：

- `frontend/src/features/brainstorm/BrainstormHandoff.tsx`

可新增样式：

- `.brainstorm-handoff`
- `.brainstorm-handoff__node`
- `.brainstorm-handoff__edge`

### 3.3 路由承接参数

从 brainstorm 跳转时带上来源参数：

```ts
navigate(`/workflows?draft=${draftId}&from=brainstorm`, { replace: true });
```

`WorkflowBuilder` 读取：

- `draft`：加载指定草稿。
- `from=brainstorm`：触发首屏欢迎层和 fitView 动画。

加载完成后保留现有 `window.history.replaceState` 清理 query 的行为，避免刷新后重复触发欢迎层。

### 3.4 工作流首屏承接

当 `from=brainstorm` 且 draft 加载成功：

- 自动 `fitView({ padding: 0.22, duration: 420 })`。
- 在画布上方显示一个轻量横幅，持续到用户关闭或 5 秒后淡出。
- 横幅文案：`已根据你的灵感生成工作流草稿，可先检查节点，再运行。`
- 横幅提供两个按钮：`运行工作流`、`检查第一个节点`。

## 4. 工作流体验优化

### 4.1 工具栏重组

当前工具栏把节点预设、编辑操作、运行操作、状态图例放在两个横排里，信息密度偏高。

建议改为三组：

- 左侧：项目名、活动名、保存状态、只读状态。
- 中间：节点添加入口，优先保留常用节点，更多节点放入 `+ 节点` 菜单。
- 右侧：保存、运行、分享、属性面板开关。

具体调整：

- 把 `复制`、`粘贴` 改为图标按钮或放入编辑菜单。
- 状态图例默认移入右侧面板，主工具栏只保留当前 draft 状态。
- `适配视图` 使用图标按钮，保留 title。
- `只读预览` 降级为分享菜单内选项，避免和 `只读分享` 并列造成理解负担。

### 4.2 画布加载和空状态

新增三类状态：

- `loading`：显示骨架节点，不只显示空画布。
- `empty`：没有节点时展示添加节点入口和模板入口。
- `handoff-ready`：从灵感风暴进入时展示承接横幅。

空状态建议文案：

```text
还没有工作流节点
从模板开始，或添加第一个内容节点。
```

操作：

- `添加文案节点`
- `添加图像节点`
- `从模板开始`

### 4.3 节点卡片优化

当前节点标题字号大、结果区固定，适合展示但编辑信息略少。

建议：

- 节点顶部增加小型类型标签，例如 `COPY`、`IMAGE`、`STORYBOARD`。
- 状态点旁边增加运行耗时或任务 ID 的 hover tooltip，默认不占据主视觉。
- 失败节点增加明显但克制的边框和 `重试` 快捷入口。
- 对刚从灵感风暴生成的节点做一次轻微 `fade-up` 入场，不对日常拖拽重复播放。
- 长标题继续 `line-clamp`，但 hover title 保留完整文本。

### 4.4 连接体验优化

现有连接方式支持 React Flow 拖线和右键/按钮开始连接，但提示较临时。

建议：

- 进入连接模式时，画布顶部提示改为编辑器内浮条，避免圆角胶囊和整体视觉不一致。
- 高亮可连接目标节点，灰化不兼容节点。
- 类型不兼容时，在目标节点旁显示短提示，而不仅是 toast。
- 成功连接后边线短暂高亮 600ms，让用户确认动作完成。

### 4.5 右侧属性面板

`PropertyPanel` 当前承担运行预览、进度、错误和节点列表，建议改成 tabs：

- `运行`：运行预览、进度、错误、最近任务。
- `节点`：执行顺序、选中节点摘要、快速定位。
- `检查`：schema warning、孤立节点、循环风险、缺少配置项。

第一阶段可以不引入真正 tab 组件，先用分区标题和更清晰的视觉层级改造。

### 4.6 运行反馈

运行工作流时，用户应该知道系统正在做什么。

建议：

- 运行按钮进入 loading 后保持按钮宽度稳定。
- 右侧面板显示当前节点：`正在生成：小红书标题变体`。
- 节点状态更新时，画布自动轻微定位到当前 running 节点，但不要强制频繁跳动。
- 失败后保留成功节点结果，失败节点显示 `查看原因` 和 `带意见重试`。
- 运行完成后显示小结：成功节点数、失败节点数、生成资产数、预计成本。

### 4.7 保存状态

自动保存已经存在，但用户感知不足。

建议新增保存状态枚举：

```ts
'clean' | 'dirty' | 'saving' | 'saved' | 'failed'
```

在工具栏项目名旁显示：

- `已保存`
- `正在保存...`
- `有未保存更改`
- `保存失败，点击重试`

这比只在 toast 中反馈更适合编辑器场景。

### 4.8 自动生成工作流排版

当前后端已经在 `backend/ai_gateway/prompts.py` 的 `_layout_brainstorm_nodes` 中做了基础拓扑层排版，但实际体验仍可能混乱。原因通常不是单一 bug，而是几个问题叠加：

- 布局方向现在更接近“按层向下排”，而用户更容易理解“从左到右”的生产链路。
- 同层节点只按队列顺序排列，没有根据分支父节点、节点类型和执行语义排序。
- 间距固定，未充分考虑节点真实高度、长标题、右侧面板挤压后的可视区域。
- 多根节点、孤立节点、循环 fallback、模型返回异常边时，布局没有明确降级策略。
- 前端加载 draft 时直接信任后端坐标，缺少布局质量检查和“重新整理布局”按钮。

建议把自动排版作为 brainstorm 生成链路的一等能力，而不是只靠模型返回坐标。

后端布局规则：

- 模型只负责返回节点语义和边关系，坐标统一由系统计算。
- 主方向改为从左到右：`context/retrieval -> copy/storyboard -> image/audio/video -> review`。
- 用拓扑排序计算 `column`，同列节点按父节点 y 坐标、节点类型优先级和原始顺序稳定排序。
- 节点默认尺寸统一为 `260 x 200`，布局间距建议 `xGap=340`、`yGap=260`，避免节点结果区和标题造成视觉贴边。
- 单主链路居中；多分支围绕父节点上下展开；孤立节点放到最后一列的 `未连接` 区域。
- 如果检测到循环，保留节点但打断异常边或把循环节点放到最后一列，并在 draft summary 中记录 warning。
- 计算完成后做一次 bounding-box overlap 检查；如果重叠，按列递增 y 偏移直到不重叠。

前端加载规则：

- `WorkflowBuilder` 加载 `from=brainstorm` 的 draft 后，先执行布局质量检查。
- 如果发现节点坐标缺失、全部接近 `(0,0)`、节点重叠、边线过度交叉，调用前端 `autoLayoutWorkflow(nodes, edges)` 重新排一次。
- 重排只在首次从 brainstorm 进入时自动触发，避免覆盖用户后续手动拖拽。
- 提供 `整理布局` 按钮，用户任何时候都可以手动重新排版；点击前先 `markHistory('整理布局')`，保证可撤销。
- `fitView` 在重排之后执行，确保首屏看到完整工作流。

建议新增工具函数：

- `frontend/src/features/workflows/layout.ts`
  - `autoLayoutWorkflow(nodes, edges, options)`
  - `hasLayoutProblems(nodes, edges)`
  - `getWorkflowBounds(nodes)`
- `backend/ai_gateway/prompts.py`
  - 将 `_layout_brainstorm_nodes` 升级为稳定 layout helper，或后续移动到更明确的 workflow layout service。

布局验收标准：

- 5 个以内节点：1440px 宽度下首屏可完整看到主结构。
- 6-10 个节点：首屏能看到主链路，分支节点不重叠，`fitView` 后节点文字可读。
- 任意两个节点 bounding box 不重叠，至少保留 48px 间距。
- 主链路边线大致从左到右，不出现大面积反向连线。
- 从 brainstorm 首次进入工作流时，不需要用户手动拖节点才能理解流程。

## 5. 分阶段实施

### Phase 1：过渡体验修复

目标：解决灵感风暴到工作流跳转生硬、自动生成 workflow 首屏排版混乱的问题。

改动：

- `BrainstormPage` 增加 `handoff` phase。
- 新增 `BrainstormHandoff` 组件。
- `BrainstormProgress` 在完成后切换到 handoff，而不是直接跳路由。
- `App.tsx` 跳转加 `from=brainstorm`。
- `WorkflowBuilder` 识别 `from=brainstorm`，加载完成后展示承接横幅并执行 `fitView`。
- 升级 `_layout_brainstorm_nodes`，让 brainstorm draft 默认按左到右拓扑布局生成。
- 前端新增 layout quality check：首次从 brainstorm 进入时发现重叠或坐标异常，自动重排一次。

验收：

- API 返回后不会立刻硬切到画布。
- 用户能看到“灵感变成节点”的过渡。
- 工作流页首屏能明确说明草稿已生成。
- 自动生成的节点不重叠，主链路方向清晰。
- `fitView` 后用户能看到完整或接近完整的工作流结构。
- 刷新工作流页不会重复播放承接动画。

### Phase 2：工作流编辑器信息层级

目标：降低工具栏和右侧面板的信息噪音。

改动：

- 重组 `WorkflowBuilder` 顶部 toolbar。
- 将状态图例从主工具栏移入右侧面板。
- 保存状态从 toast 升级为 toolbar 持续状态。
- 增加 loading、empty、handoff-ready 三类画布状态。
- 增加 `整理布局` 操作，并确保可撤销。

验收：

- 新用户可以在 10 秒内找到“添加节点”和“运行工作流”。
- 主工具栏不再横向拥挤。
- 没有项目、没有节点、加载中都有明确状态。
- 用户手动拖乱节点后，可以一键恢复清晰布局。

### Phase 3：节点和连接操作优化

目标：让画布操作更可理解、错误更可恢复。

改动：

- 节点增加类型标签、失败快捷入口、入场动效。
- 连接模式高亮可连接节点，弱化不可连接节点。
- 类型不兼容提示从纯 toast 扩展为节点旁局部反馈。
- 新连线短暂高亮。

验收：

- 用户能区分节点类型和运行状态。
- 连接失败原因能在发生位置附近看到。
- 失败节点可直接进入重试路径。

### Phase 4：运行可观测性

目标：让工作流运行过程不再像黑盒。

改动：

- 右侧面板显示当前运行节点。
- 运行完成后显示小结。
- 失败节点保留原因、反馈输入和重试入口。
- 后续如果后端支持异步运行，再接入轮询或任务流更新。

验收：

- 运行中能看到当前进度。
- 运行完成后能看到成功、失败、资产沉淀结果。
- 失败后不需要重新跑完整工作流即可理解下一步。

## 6. 技术注意事项

- 不引入新的动画库，优先 CSS transition、`animate-in` 和局部 state。
- 尊重 `prefers-reduced-motion`，在系统减少动态效果时关闭 handoff 节点飞入和画布入场动画。
- 不改变 draft API 结构；过渡所需状态只放在前端 query 和局部 state。
- brainstorm 坐标应由系统布局函数计算，不依赖模型输出坐标；模型返回坐标只作为可选参考或直接忽略。
- 自动重排必须只在首次 brainstorm handoff 或用户点击 `整理布局` 时发生，不能在普通加载和自动保存后覆盖用户手动布局。
- 不破坏现有自动保存、撤销重做、只读分享、节点重试逻辑。
- `WorkflowBuilder` 已经较大，Phase 2 后应考虑把 toolbar、canvas state overlay、handoff banner 拆成小组件。

## 7. 建议新增组件

- `frontend/src/features/brainstorm/BrainstormHandoff.tsx`
- `frontend/src/features/workflows/WorkflowHandoffBanner.tsx`
- `frontend/src/features/workflows/WorkflowToolbar.tsx`
- `frontend/src/features/workflows/WorkflowCanvasState.tsx`
- `frontend/src/features/workflows/WorkflowSaveStatus.tsx`
- `frontend/src/features/workflows/layout.ts`

## 8. 测试建议

单元测试：

- `BrainstormPage`：API 成功后进入 handoff，再调用 `onComplete`。
- `WorkflowBuilder`：识别 `from=brainstorm` 后加载 draft 并清理 query。
- `autoLayoutWorkflow`：线性链路、多分支、多根节点、孤立节点都能生成不重叠坐标。
- `hasLayoutProblems`：能识别全部节点堆在原点、bounding box 重叠、坐标缺失。
- 保存状态：dirty、saving、saved、failed 状态切换。

组件测试：

- brainstorm handoff 节点逐步出现。
- workflow empty state 按钮可添加节点。
- failed node 显示重试入口。
- brainstorm draft 首次进入工作流时，承接横幅出现且节点已自动整理。

E2E：

- 输入 idea。
- 等待 brainstorm API 返回。
- 看到 handoff 动画。
- 自动进入 `/workflows`。
- 看到承接横幅。
- 画布中的自动生成节点不重叠，主链路从左到右。
- 点击运行工作流。

视觉验收：

- 桌面宽度 1440px：工具栏不换行失控，右侧面板可读。
- 笔记本宽度 1280px：节点按钮和运行按钮仍可访问。
- 移动宽度暂不作为画布主场景，但不能出现文本严重重叠。

## 9. 优先级结论

第一优先级先做 Phase 1。它成本最低、用户感知最强，能直接解决“灵感风暴跳转到工作流动画太生硬”的问题。

同时 Phase 1 必须包含自动生成 workflow 的默认排版修复。否则过渡动画变顺了，但用户落到工作流页后仍然看到混乱节点，首次体验仍会断裂。

第二优先级做 Phase 2。它会让工作流模块从“功能堆叠”更接近“生产编辑器”。

Phase 3 和 Phase 4 可以根据后续演示、内测反馈和后端任务运行方式逐步推进。
