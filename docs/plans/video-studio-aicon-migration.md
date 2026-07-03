# Video Studio AICON Migration

## 已落地重点

- 将 `ai-moive-studio` 的 Movie Studio 主链路迁入本项目“做视频”板块的交互模型：角色管理、场景提取、分镜提取、场景图、关键帧、过渡视频、最终合成。
- `VideoPanel` 不再只是单 prompt 表单，已升级为 Studio 工作区：剧本/brief、角色一致性、关键帧/参考图、镜头计划、素材完备度、阶段导航。
- 后端视频任务 payload 已支持 `creative_mode`、`script`、`characters`、`keyframes`、`reference_images`、`scenes`、`visual_style`、`camera_style`、`negative_prompt`。
- Agnes 视频 prompt 组装已从单镜头描述升级为电影工作流简报，保留剧本、角色一致性、镜头计划、平台节奏和参考图意图。
- 视频结果归一化会返回 `creative_mode` 和 `scenes`，便于前端回显渲染时使用的拍摄计划。

## 与参考项目的映射

- `MovieStudio.vue` / `WorkflowStepper.vue` -> `frontend/src/features/generation/VideoPanel.tsx` 的 7 阶段 Studio 导航。
- `CharacterPanel` / `ScenePanel` / `ShotPanel` / `KeyframePanel` / `TransitionPanel` -> 当前先合并为一个可编辑视频工作台，避免一次性引入大量新页面和状态。
- `movie.js` 的拆分 API -> 当前先映射到本项目已有 `GenerationTask(video)` payload，后续再拆成持久化子任务。
- `TransitionService` 的“基于前后分镜生成过渡视频 prompt” -> 当前以 `scenes` + `keyframes/reference_images` 传入视频 prompt，后续需要独立过渡任务。

## 后续重点

1. 新增 Django 持久化模型或复用 `WorkspaceDraft`，保存 Video Studio 的角色、场景、分镜、关键帧、过渡视频版本历史。
2. 增加独立接口：提取角色、提取场景、提取分镜、生成关键帧、生成过渡视频、最终合成。
3. 把当前“从剧本生成拍摄计划”的本地草稿改为 LLM 结构化任务，并支持进度轮询和失败重试。
4. 接入资产库选择器，允许直接引用项目图片/视频/音频资产，而不是只输入 URL。
5. 为过渡视频增加首尾关键帧、单条重试、批量生成和状态同步。
