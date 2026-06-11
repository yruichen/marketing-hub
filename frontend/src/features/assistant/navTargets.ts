/**
 * Map of NAV target id → user-facing label. Mirrors the backend
 * `NAV_TARGETS` set in `ai_gateway/tools/navigate.py`; keep in sync
 * when adding new tabs.
 */
export const NAV_TAB_LABELS: Record<string, string> = {
  brainstorm: '灵感工作流',
  dashboard: '仪表盘',
  projects: '项目',
  content: '内容',
  builder: '工作流编排',
  assets: '资产库',
  review: '审核',
  community: '社区',
  billing: '订阅',
  config: '配置',
  copy: '文案生成',
  image: '图像生成',
  storyboard: '分镜生成',
  audio: '音频生成',
};
