# Marketing-Hub 前端模块架构（重构后维护指南）

> 本文档面向后期维护者，说明 2026-06 重构后的前端模块边界、数据流、扩展规范。
> 阅读本文档前请先熟悉 `CLAUDE.md` 中的项目总体说明。

---

## 1. 重构概览

`App.tsx` 原本是 2708 行的单体文件，承载 14 个 tab 的全部 state、逻辑与 UI。
本次重构把它拆成若干独立 feature 模块，让每个 tab 能独立维护、独立测试。

### 重构成果

| 指标 | 重构前 | 重构后 |
|---|---|---|
| `App.tsx` 行数 | 2708 | 594（-78%） |
| 顶层 state 数 | ~30 | ~12（其余下放 feature） |
| 模块数 | 1 单体 | 1 总入口 + 9 个 feature 模块 |
| Lint 错误 | 0 | 0 |
| Build | 通过 | 通过 |

### 不变量（重构后仍保持的约定）

1. **API 调用方式不变**：仍使用 `apiFetch`，未切换到 `shared/api/client.ts` 的 `apiClient`。
2. **CSRF / Cookie / Headers 处理不变**：完全沿用 `hooks/useApi.ts` 中的逻辑。
3. **后端接口契约不变**：所有 URL path、payload schema、response 解析未修改。
4. **路由与导航不变**：仍使用 `app/routes.ts` + `app/navigation.ts` 的 `sectionFromPath` / `pathForSection`。

---

## 2. 当前目录结构

```
src/
├── App.tsx                       # 总入口：auth guard + layout + tab 路由分发（594 行）
├── main.tsx                      # React 挂载入口（未改动）
├── index.css                     # 设计系统样式（未改动）
│
├── app/                          # 应用级配置（未改动）
│   ├── routes.ts                 # URL ↔ AppSection 映射
│   └── navigation.ts             # TAB_META（每个 tab 的标题/副标题）
│
├── components/                   # 跨 feature 通用组件（已精简）
│   ├── AppSidebar.tsx            # 左侧导航
│   ├── Toast.tsx                 # Toast 组件（注意：未在 App.tsx 使用，预留）
│   └── WorkflowBuilder.tsx       # 工作流画布（lazy load）
│
├── features/                     # 业务模块
│   ├── auth/                     # 登录态、LoginPortal
│   ├── assets/                   # 资产库（已模块化，未改动）
│   ├── projects/                 # 项目管理（已模块化，未改动）
│   ├── workflows/                # 工作流编排（已模块化，未改动）
│   ├── brainstorm/               # Brainstorm 引导（已模块化，未改动）
│   │
│   ├── onboarding/               # [本次新增] 首次使用引导
│   │   ├── OnboardingModal.tsx
│   │   ├── types.ts              # OnboardingState + 默认值 + 选项
│   │   └── index.ts
│   │
│   ├── generation/               # [本次新增] AIGC 四面板
│   │   ├── CopyPanel.tsx
│   │   ├── ImagePanel.tsx
│   │   ├── StoryboardPanel.tsx
│   │   ├── AudioPanel.tsx
│   │   ├── AgentTerminal.tsx     # 创作进度面板
│   │   ├── useGenerationTask.ts  # 共享的 submitQueuedGeneration 逻辑
│   │   ├── types.ts              # CopyOutput/ImageOutput/StoryboardOutput/AudioOutput/CreationContent
│   │   └── index.ts
│   │
│   ├── content-package/          # [本次新增] 内容包生成
│   │   ├── ContentPackagePanel.tsx
│   │   ├── hooks.ts              # buildContentPackage / buildContentPackageRequest / useContentPackageActions
│   │   ├── constants.ts          # defaultContentPackage
│   │   └── index.ts
│   │
│   ├── community/                # [本次新增] 社区面板
│   │   ├── CommunityPage.tsx
│   │   ├── useCommunity.ts       # fetchCommunity / handleLike / handleRAGSearch / shareToCommunity
│   │   ├── types.ts              # CommunityItem
│   │   └── index.ts
│   │
│   ├── dashboard/                # [本次新增] 仪表盘
│   │   ├── DashboardPage.tsx
│   │   ├── useDashboard.ts       # useWorkspaceScope / useDashboardSnapshot
│   │   ├── types.ts              # WorkspaceScope / DashboardSnapshot / formatUsd
│   │   └── index.ts
│   │
│   ├── ai-config/                # [本次新增] AI 接口配置（含计费 tab）
│   │   ├── AiConfigPage.tsx
│   │   ├── useAiConfig.ts        # fetchConfigs / fetchBillingPlans / handleSaveConfig
│   │   ├── types.ts              # AiConfig / providerDefaultScope / configScopeLabels
│   │   └── index.ts
│   │
│   ├── billing/                  # [本次新增] 计费面板
│   │   ├── BillingPage.tsx
│   │   └── index.ts
│   │
│   ├── review/                   # [本次新增] 审阅面板
│   │   ├── ReviewPage.tsx
│   │   └── index.ts
│   │
│   └── context-panel/            # [本次新增] 右侧上下文面板
│       ├── ContextPanel.tsx
│       └── index.ts
│
├── hooks/
│   └── useApi.ts                 # apiFetch + useToast（未改动）
│
├── shared/
│   ├── api/client.ts             # apiClient 封装（预留给后续迁移，本次未启用）
│   ├── stores/uiStore.ts         # Zustand: activeSection / rightPanelOpen / darkMode
│   ├── types/
│   │   ├── toast.ts              # [本次新增] ToastType
│   │   └── index.ts
│   └── utils/index.ts            # 占位
│
└── types/
    └── workspace.ts              # ProjectRecord / CampaignRecord / BillingPlanResponse / GenerationTaskRecord 等
```

---

## 3. 数据流与 state 归属

### 3.1 跨 feature 共享的 state（留在 App.tsx）

这些 state 被多个 feature 模块消费，下放给任何单一 feature 都会造成循环依赖或复杂 prop drilling。

| State | 类型 | 消费方 | 说明 |
|---|---|---|---|
| `token`, `username` | `string \| null` | 所有 feature | auth guard 与 API 调用身份 |
| `workspaceScope` | `WorkspaceScope \| null` | 所有 feature | org/project/campaign 上下文 |
| `dashboardSnapshot` | `DashboardSnapshot \| null` | DashboardPage / ContextPanel / CopyPanel(后续) | 任务计数 / Token / 成本 |
| `latestTask` | `GenerationTaskRecord \| null` | ContextPanel | 最近一次任务状态 |
| `darkMode`, `rightPanelOpen`, `sidebarToggled` | uiStore / useState | AppSidebar / 右栏 / brainstorm 沉浸 | 全局 UI 状态 |
| `loading`, `feedbackMsg` | `useState` | 所有 feature | 全局 loading 指示 / toast |
| `agentLogs` | `string[]` | 4 个 AIGC Panel / ContentPackagePanel | 创作日志展示 |
| `onboarding` | `OnboardingState` | OnboardingModal / ContentPackagePanel | 品牌记忆 |
| `contentPackage`, `contentVersion` | `ContentPackage / string` | ContentPackagePanel / ReviewPage / ContextPanel | 跨 tab 的内容包 |

### 3.2 Feature 内部 state（下放给 feature）

下表中的 state 只在对应 feature 内部使用，从 App.tsx 下放到 feature 内部 useState。

| Feature | 内部 state |
|---|---|
| `CopyPanel` | `copyInput`, `copyOutput` |
| `ImagePanel` | `imageInput`, `imageOutput` |
| `StoryboardPanel` | `storyboardInput`, `storyboardOutput` |
| `AudioPanel` | `audioInput`, `audioOutput` |
| `ContentPackagePanel` | `contentBrief`, `contentPackage`, `contentVersion` |
| `CommunityPage` | `communityItems`, `searchQuery`, `ragLogs`, `isRagActive`, `loading` |
| `AiConfigPage` | `aiConfigs`, `activeConfigForm`, `showKey`, `billingPlans`, `loading` |
| `OnboardingModal` | `onboardingStep` |

### 3.3 App.tsx 的核心函数（跨 feature 协调器）

```ts
// 通用
triggerToast(text, type)         // toast 提示
handleCopyClipboard(text)        // 剪贴板复制（带降级方案）
setActiveTab(tab)                // 路由切换（zustand + react-router）
handleLogin / handleLogout       // 认证

// 跨模块业务逻辑
fetchWorkspaceBootstrap()        // 初始化工作区 scope
selectProjectScope(project, campaign) // 切换项目 scope
fetchDashboard()                 // 刷新仪表盘快照
handleRedeemProInvite(code)      // Pro 邀请码兑换，计费页使用
handleSubmitEnterpriseRequest()  // 企业定制需求提交，计费页使用
handleShareToCommunity(...)      // 跨 AIGC 四面板的分享回调
completeOnboarding()             // 完成 Onboarding 后初始化内容包
```

这些函数被多个 feature 通过 props 下传（`onShare`、`onCopy`、`fetchDashboard`、`onWorkspaceRefresh` 等）。

---

## 4. Props 接口规范

每个 feature 的入口组件接收的 props 都有清晰边界。维护时新增 feature 请遵守以下模式：

```ts
interface FeaturePageProps {
  // 跨模块共享数据
  workspaceScope: WorkspaceScope | null;
  username: string | null;

  // 全局状态控制
  loading: boolean;
  setLoading: (loading: boolean) => void;
  agentLogs: string[];
  setAgentLogs: React.Dispatch<React.SetStateAction<string[]>>;

  // 回调
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  fetchDashboard: () => Promise<void>;
  setActiveTab: (tab: AppSection) => void;

  // 跨模块业务回调（按需）
  onShare?: (type, title, content, imageUrl?, audioUrl?) => Promise<void>;
  onCopy?: (text: string) => Promise<void>;
  onApplyContentPackage?: (pkg: ContentPackage) => void;
  onWorkspaceRefresh?: () => Promise<void>;
}
```

**原则**：
- 不要在 feature 内自己 fetch `dashboardSnapshot` / `workspaceScope`，由 App.tsx 下传。
- 不要在 feature 内调用 `triggerToast` 之外的全局副作用。
- 不要把 feature 内部 state 提升到 App.tsx（避免 prop drilling 反向膨胀）。

---

## 5. 共享 Hooks 使用规范

### 5.1 已有的 hooks

| Hook | 位置 | 用途 |
|---|---|---|
| `useGenerationTask` | `features/generation/useGenerationTask.ts` | 提交 + 轮询异步任务，复用于 4 个 AIGC Panel |
| `useContentPackageActions` | `features/content-package/hooks.ts` | 内容包生成 + 改写 |
| `useCommunity` | `features/community/useCommunity.ts` | 社区列表 / 点赞 / RAG / 分享 |
| `useAiConfig` | `features/ai-config/useAiConfig.ts` | AI 配置 / 计费方案 |
| `useWorkspaceScope` | `features/dashboard/useDashboard.ts` | 工作区 scope + bootstrap |
| `useDashboardSnapshot` | `features/dashboard/useDashboard.ts` | 仪表盘快照 + fetch |

### 5.2 新增 hook 的判断标准

当一段逻辑满足以下任一条件，应抽到 feature 内的 `useXxx.ts`：

1. 同一个 feature 内 ≥2 处使用
2. 状态生命周期与 feature 绑定，不应该被外部 React 组件管理
3. 包含网络请求 + state 更新 + 错误处理的完整流程

否则保持为组件内 `useCallback` 即可。

---

## 6. 类型定义边界

### 6.1 已有类型的位置

| 类型 | 文件 | 备注 |
|---|---|---|
| `ProjectRecord`, `CampaignRecord`, `OrganizationRecord`, `BrandContext`, `BillingPlanResponse`, `GenerationTaskRecord`, `BillingPlanRecord`, `WorkflowNode*`, `AssetRecord` | `types/workspace.ts` | **跨 feature 共享**，放在顶层 types/ |
| `ContentPackage`, `CopyOutput`, `ImageOutput`, `StoryboardOutput`, `AudioOutput`, `CreationContent`, `taskTypeLabels` | `features/generation/types.ts` | 内容生成相关 |
| `AiConfig`, `providerDefaultScope`, `providerSupportsImageConfig`, `configScopeLabels` | `features/ai-config/types.ts` | AI 配置相关 |
| `CommunityItem` | `features/community/types.ts` | 社区作品 |
| `WorkspaceScope`, `DashboardSnapshot`, `formatUsd` | `features/dashboard/types.ts` | 工作区 / 仪表盘 |
| `OnboardingState`, `onboardingDefaults`, `channelChoices`, `useCaseChoices`, `templateChoices` | `features/onboarding/types.ts` | 引导相关 |
| `ToastType` | `shared/types/toast.ts` | UI 全局 |

### 6.2 命名约定

- **接口**用 PascalCase + 后缀（`Record`, `Output`, `State`, `Response`, `Item`）。
- **常量**用 camelCase + 复数（`channelChoices`, `useCaseChoices`）。
- **类型 vs interface**：优先 `interface`，仅在需要联合/交叉类型时用 `type`。
- 跨 feature 的类型放 `types/workspace.ts`；feature 内部类型放 `features/xxx/types.ts`。

### 6.3 新增类型时的检查清单

1. 该类型是否被 ≥2 个 feature 引用？是 → `types/workspace.ts`；否 → feature 内 `types.ts`。
2. 是否与后端返回结构一一对应？是 → 加注释标注来源（`/api/xxx/`）。
3. 是否有可选字段与必填字段混淆？用 `?:` 标注可选。

---

## 7. 常见维护场景

### 7.1 新增一个 AIGC 任务类型（例如 "video"）

1. 在 `features/generation/types.ts` 新增 `VideoOutput`。
2. 在 `features/generation/` 下新建 `VideoPanel.tsx`，参考 `AudioPanel.tsx` 的结构。
3. 在 `features/generation/useGenerationTask.ts` 不需要改（已经泛型化）。
4. 在 `features/generation/index.ts` 导出。
5. 在 `App.tsx` 增加 `activeTab === 'video'` 分支：
   ```tsx
   {activeTab === 'video' && (
     <VideoPanel
       workspaceScope={workspaceScope}
       username={username}
       loading={loading}
       setLoading={setLoading}
       agentLogs={agentLogs}
       setAgentLogs={setAgentLogs}
       setLatestTask={setLatestTask}
       triggerToast={triggerToast}
       fetchDashboard={async () => { await fetchDashboard(); }}
       onShare={handleShareToCommunity}
     />
   )}
   ```
6. 在 `app/navigation.ts` 的 `TAB_META` 增加该 tab 的标题。
7. 在 `shared/stores/uiStore.ts` 的 `AppSection` 联合类型增加 `'video'`。

### 7.2 修改内容包字段（例如新增 `coverImage`）

1. `features/generation/types.ts` 的 `ContentPackage` 接口增加字段。
2. `features/content-package/constants.ts` 的 `defaultContentPackage` 补充默认值。
3. `features/content-package/ContentPackagePanel.tsx` 的 JSX 增加渲染。
4. `features/content-package/hooks.ts` 的 `buildContentPackage` 函数补上字段构造。
5. 如果后端会先返回这个字段——优先验证响应结构；如缺字段，补默认值。
6. 跑 `npm run lint && npm run build` 确认无 TS 错误。

### 7.3 新增一个全局共享函数

如果某个函数需要被 ≥2 个 feature 调用：

1. 评估是否可以变成 hook（推荐）。
2. 如果是纯函数（如 `buildContentPackage`），放在对应 feature 的 `hooks.ts` 中。
3. 如果是跨 feature 的协调函数（如 Pro 邀请码兑换、企业定制需求提交），留在 `App.tsx` 并通过 props 下传。
4. 永远不要在 feature 间循环 import。

### 7.4 修改 Dashboard 布局

直接改 `features/dashboard/DashboardPage.tsx`。无需改 App.tsx，除非：
- 新增 dashboard 上要展示的数据字段（同步更新 `features/dashboard/types.ts`）
- 新增"快捷操作"按钮调用 `setActiveTab` 之外的路由（需要 App.tsx 提供回调）

### 7.5 添加/修改 Onboarding 步骤

1. `features/onboarding/types.ts` 的 `OnboardingState` 可能需要新字段。
2. `features/onboarding/OnboardingModal.tsx` 的 `steps` 数组、step body。
3. App.tsx 的 `completeOnboarding` 回调可能需要处理新字段。
4. `features/content-package/hooks.ts` 的 `buildContentPackage` 可能需要读取新字段。

---

## 8. 已知技术债与未来工作

### 8.1 待迁移项

- **`apiFetch` → `apiClient`**：`shared/api/client.ts` 中已有更现代的封装（自动处理 headers 和 JSON 解析），但本次未切换以降低风险。后续可分批迁移。
- **`document.execCommand`**：`App.tsx` 的 `handleCopyClipboard` 使用了 deprecated API，保留是因为旧浏览器兼容。后续可换为 `navigator.clipboard.writeText` + 异常处理。
- **`Toast.tsx` 组件**：存在于 `components/Toast.tsx` 但未被 `App.tsx` 使用，可能是早期残留。可删除或整合到 toast 系统中。

### 8.2 类型改进方向

- `GenerationTaskRecord` 在 `types/workspace.ts` 已经扩展字段，但未与后端 schema 严格对齐。建议接入 OpenAPI 自动生成类型。
- `WorkspaceScope` 故意弱化了 `project`/`campaign` 字段（不强制完整 record 结构），是因为前端只关心 4 个字段。如果未来需要更多字段，建议改用 `ProjectRecord` / `CampaignRecord` 的 `Pick<>`。

### 8.3 性能优化空间

- `communityItems` 的 `handleLike` 通过本地 state 更新，但未乐观更新 UI（先请求再更新）。当前实现是请求成功后更新，可考虑乐观更新。
- AIGC 四面板的 `submitQueuedGeneration` 每次都重新创建 callback 闭包。如果性能成为瓶颈，可以 `useMemo` + ref 优化。

### 8.4 测试覆盖

- 当前 feature 模块均无单元测试（项目整体只有 e2e）。
- 建议优先为以下 hook 添加测试：
  - `useGenerationTask`（任务提交流程）
  - `buildContentPackage`（内容包构造逻辑）
  - `useCommunity`（RAG 搜索边界）

---

## 9. 故障排查速查表

| 现象 | 可能原因 | 排查方向 |
|---|---|---|
| 登录后白屏 | `token` 写入但 `workspaceScope` 未加载 | 检查 `App.tsx` 的 `useEffect(() => fetchWorkspaceBootstrap(), ...)` |
| AIGC 面板点击"生成"没反应 | `loading` state 未复位 | 检查 `useGenerationTask` 的 `finally { setLoading(false); }` |
| 内容包生成后 Review tab 没更新 | `contentPackage` 没提升到 App.tsx | 确认 `onApplyContentPackage` 回调正确传递 |
| 社区点赞后没刷新 | `onLikeUpdate` 回调缺失 | App.tsx 中 CommunityPage 的 `onLikeUpdate` 当前未使用 |
| Build 报 `tsc -b` 错误 | 类型不匹配 | 大概率是 `WorkspaceScope.project` 缺少字段，看错误信息补上 |
| Dashboard 上"项目"显示 `Core Launch` | `workspaceScope` 还未加载完 | 等 `fetchWorkspaceBootstrap()` 完成（通常 < 200ms） |

---

## 10. 修改前必读

如果你打算修改以下任何一项，请先理解当前的设计意图：

1. **App.tsx 的 state 列表** —— 删一个 state 前，确认它是否被某 feature 通过 props 接收。
2. **任何 feature 的 props 接口** —— 修改前 grep 一下 App.tsx 的调用方。
3. **`types/workspace.ts` 的 `GenerationTaskRecord`** —— 字段已扩展为兼容两套 API 调用方（同步 `/generate/...` 与异步 `/tasks/`）。
4. **`useDashboard` 的两个 hook** —— 不要把 `workspaceScope` 和 `dashboardSnapshot` 合并到一个 hook，原因是它们 fetch 频率和触发条件不同。

---

## 11. 与原始设计的差异总结

| 项目 | 原始 | 重构后 |
|---|---|---|
| AIGC 面板的 input/output state | App.tsx 顶层 | feature 内 useState（每个 panel 独立） |
| 内容包 / onboarding / copyInput 共享 | 顶层 state + 回调链 | App.tsx 保持顶层，按需下传 |
| `submitQueuedGeneration` | 内联在 App.tsx | `useGenerationTask` hook |
| `buildContentPackage` | 内联在 App.tsx | `content-package/hooks.ts` 导出函数 |
| OnboardingModal | App.tsx 内部组件 | `features/onboarding/OnboardingModal.tsx` |
| AgentTerminal | App.tsx 内部组件 | `features/generation/AgentTerminal.tsx` |
| Dashboard 的 fetchWorkspaceBootstrap / fetchDashboard | 内联 useCallback | `useWorkspaceScope` / `useDashboardSnapshot` hook |

---

## 12. 联系方式 / 修订记录

| 日期 | 修订内容 | 作者 |
|---|---|---|
| 2026-06-11 | 初版：完成 App.tsx 模块化（2708 → 594 行） | Claude (重构执行) |

如有疑问，可在 PR 中 @ 前端负责人或查阅 `CLAUDE.md`。
