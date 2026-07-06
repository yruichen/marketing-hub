# 生成结果保存逻辑优化计划

## 1. 背景与问题

### 当前流程（问题）

```
用户填写表单 → 点击生成 → 后端创建任务 → 任务完成 → 自动创建 Asset（无用户选择）
```

- 每次生成**自动**在资产库创建一条资产记录，用户没有"是否保存"的选择权
- 资产自动关联到当前项目，用户不能选择保存到哪个文件夹
- 没有统一的"保存目标"设置入口

### 目标流程

```
用户填写表单 → 点击生成 → 结果直接在面板中显示
                            ↓
                 面板底部出现保存控制栏（内联嵌入面板中）：
                 ┌──────────────────────────────────────┐
                 │  保存到项目: [当前项目名        ▼]    │
                 │  保存到文件夹: [默认文件夹      ▼]    │
                 │                      [丢弃]  [保存]  │
                 └──────────────────────────────────────┘
```

---

## 2. 总体架构变化

```
┌──────────────────────────────────────────────────────┐
│                   生成面板                              │
│  Copy / Image / Storyboard / Audio / Video / Content  │
│                                                        │
│  ┌─ 输入表单 ─────────────────────────────────────┐   │
│  │  ... (品牌、卖点、平台等)                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                        │
│  ┌─ 生成结果（生成后出现） ────────────────────────┐   │
│  │  ... (生成的文案/图片/视频等，只读预览)          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                        │
│  ┌─ 保存控制栏（生成后出现） ─────────────────────┐   │
│  │  保存到项目:   [当前项目名              ▼]       │   │
│  │  保存到文件夹: [默认文件夹            ▼]       │   │
│  │                          [丢弃]   [保存到资产库] │   │
│  └─────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

**关键区别：** 不再是弹窗，而是面板内联展开的保存控制栏。用户看到结果后，直接在面板下方选择保存或丢弃，无需额外弹窗打断工作流。

---

## 3. 分步实施计划

### 阶段一：后端改造（先做）

#### 3.1 后端：添加 `auto_save` 参数

在 `api/service_modules/generation.py` 的 `run_generation_task()` 中：

```python
def run_generation_task(task, run_now=True, auto_save=True):
    # ... 现有执行逻辑 ...

    # 只在 auto_save=True 时自动创建资产
    if auto_save:
        asset = create_asset_from_task_result(task, result, ...)

    return result
```

#### 3.2 后端：新增 Asset 创建端点（按需保存）

```
POST /api/assets/create-from-task/
```

接收参数：
```json
{
  "task_id": 123,
  "project_slug": "my-project",
  "campaign_id": 1,
  "folder_id": 5 (可选)
}
```

功能：读取已完成的 `GenerationTask` 的 `result`，创建 `Asset` 记录。

#### 3.3 后端：生成接口默认关闭自动保存

修改 `generation/views.py` 中的生成端点，传入 `auto_save=False`：

```python
result = run_generation_task(task, run_now=True, auto_save=False)
```

这样任务完成后**不再自动创建 Asset**，而是等前端调用保存接口。

---

### 阶段二：前端——面板内联保存控制栏

#### 4.1 通用「保存控制栏」组件

新建 `frontend/src/features/generation/SaveControlBar.tsx`：

这个组件嵌入在每个生成面板的底部，**只在生成完成后显示**。

```
┌─────────────────────────────────────────────┐
│  保存到项目:   [当前项目：Marketing Hub  ▼]  │
│  保存到文件夹: [默认文件夹              ▼]  │
│                              [丢弃]  [保存]  │
└─────────────────────────────────────────────┘
```

**Props：**
```typescript
interface SaveControlBarProps {
  visible: boolean;          // 生成完成后设为 true
  taskId: number;            // 关联的任务 ID
  projectSlug: string;       // 默认保存到的项目
  campaignId: number;        // 默认保存到的活动
  onSaved: () => void;       // 保存成功后的回调
  onDiscard: () => void;     // 丢弃后的回调
}
```

**行为：**
- **保存按钮** → 调用 `POST /api/assets/create-from-task/` → 成功后回调
- **丢弃按钮** → 确认后关闭控制栏，不保存
- **项目选择器** → 下拉列出所有项目（调用 `/api/projects/`）
- **文件夹选择器** → 下拉列出所选项目的文件夹

#### 4.2 在各生成面板中集成

每个面板在**生成完成后**：

1. 在面板底部渲染 `<SaveControlBar visible={true} ... />`
2. 结果展示区域和保存控制栏同时出现
3. 用户选择"保存"或"丢弃"后，控制栏消失
4. 如果用户继续修改输入并再次生成，控制栏重置

#### 4.3 修改 useGenerationTask

在 `useGenerationTask.ts` 中，生成完成后：
- 不再自动调用 `fetchDashboard()`
- 设置 `showSaveBar = true`，让面板显示保存控制栏
- 保存成功后调用 `fetchDashboard()` 刷新数据

---

### 阶段三：保存目标持久化（后续）

#### 5.1 保存默认目标

- 用户选择保存项目/文件夹后，保存到 localStorage
- 下次打开面板时自动填充上次的选择

#### 5.2 当前项目同步

- 当用户在"我的项目"中切换当前项目时，保存控制栏的默认选择自动更新
- 资产保存到当前选择的目标

---

## 4. 涉及修改的文件

| 文件 | 修改内容 | 优先级 |
|:----|:---------|:------:|
| `backend/api/service_modules/generation.py` | `run_generation_task()` 加 `auto_save` 参数 | P0 |
| `backend/generation/views.py` | 各生成端点传 `auto_save=False` | P0 |
| `backend/workspaces/view_modules/assets.py` | 新增 `AssetCreateFromTaskView` | P0 |
| `backend/workspaces/urls.py` | 新增保存接口路由 | P0 |
| `frontend/src/features/generation/SaveControlBar.tsx` | **新建**保存控制栏组件 | P0 |
| `frontend/src/features/generation/CopyPanel.tsx` | 集成保存控制栏 | P0 |
| `frontend/src/features/generation/ImagePanel.tsx` | 集成保存控制栏 | P0 |
| `frontend/src/features/generation/StoryboardPanel.tsx` | 集成保存控制栏 | P0 |
| `frontend/src/features/generation/AudioPanel.tsx` | 集成保存控制栏 | P0 |
| `frontend/src/features/generation/VideoPanel.tsx` | 集成保存控制栏 | P0 |
| `frontend/src/features/content-package/ContentPackagePanel.tsx` | 集成保存控制栏 | P0 |
| `frontend/src/features/generation/useGenerationTask.ts` | 修改生成完成后的回调逻辑 | P0 |

---

## 5. 数据流对比

### 当前（自动保存）

```
Frontend                         Backend
  │                                │
  ├── POST /api/tasks/ ──────────► │
  │                                ├── create GenerationTask
  │                                ├── run_generation_task()
  │                                ├── create Asset (AUTO)
  │                                └── return result
  │◄──── response ─────────────── │
  │                                │
  ├── fetchDashboard()            │
```

### 优化后（面板内联保存控制栏）

```
Frontend                         Backend
  │                                │
  ├── POST /api/tasks/ ──────────► │
  │                                ├── create GenerationTask
  │                                ├── run_generation_task(auto_save=False)
  │                                ├── 不创建 Asset
  │                                └── return result
  │◄──── response ─────────────── │
  │                                │
  ├── 展开结果区域 + 保存控制栏     │
  │    ↓                            │
  │  用户选择项目/文件夹             │
  │    ↓                            │
  │  用户点击「保存」                │
  │    ↓                            │
  ├── POST /api/assets/create-from-task/ ──► │
  │  { task_id, project_slug,      │
  │    campaign_id, folder_id }     │
  │                                ├── create Asset
  │                                └── return asset
  │◄──── response ─────────────── │
  │                                │
  ├── 控制栏收起，显示「已保存」     │
  ├── fetchDashboard()            │
```

---

## 6. 工作量预估

| 阶段 | 内容 | 预估时间 |
|:----|:-----|:--------:|
| 阶段一 | 后端改造（auto_save + 保存接口） | 2-3 小时 |
| 阶段二 | 前端 SaveControlBar 组件 + 6个面板集成 | 3-4 小时 |
| 阶段三 | 保存目标持久化 + 项目选择器增强 | 1-2 小时 |
| **合计** | | **6-9 小时** |

---

## 7. MVP 建议

先做**最小可行版本**：

1. 后端加 `auto_save=False` + 保存 API
2. 前端 SaveControlBar 组件（包含项目下拉选择 + 保存/丢弃按钮）
3. 先在 CopyPanel 中集成测试
4. 验证无误后扩展到其他面板

**MVP 不包含：** 文件夹选择器（仅保存到项目）、持久化设置。这些后续迭代。
