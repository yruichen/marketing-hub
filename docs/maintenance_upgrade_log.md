# Marketing-Hub 维护与升级日志

## 2026-05-29 前端稳定性与 Creative Sketchbook 视觉升级

### 修复内容

- 修复 `App.tsx` 中 `handleCopyClipboard` 未定义导致 `npm run build` 失败的问题。
- 为文案、图片、分镜、音频、AI 配置、社区作品等接口数据补充明确 TypeScript 类型，移除前端中的 `any` lint 错误。
- 调整初始化数据拉取逻辑，避免 React 19 hooks 规则报错。
- 修复未被 Tailwind 默认生成的自定义类：
  - `border-1.5`
  - `border-b-1.5`
  - `h-4.5`
  - `w-4.5`
  - `duration-250`
  - `hover:scale-103`
  - `active:scale-97`
  - `focus:border-slate-650`
- 清理输入、按钮、子菜单和列表中的图标/emoji，保留主工作区顶部的书签式图标，符合“少图标、重排版”的编辑设计方向。

### 设计升级

- 维持 Raw Oatmeal / Warm Alabaster 纸张背景、Warm Obsidian 主描边与正文低疲劳色值。
- 保留不对称纸张圆角、硬墨印阴影、错位纸页与轻微旋转，强化 open binder / loose-leaf workspace 观感。
- 输入区继续使用下划线书写空间，正文编辑区使用纯白描边纸块。
- 输出区继续以 typed manuscript / polaroid sheet 呈现，正文使用更舒适的长行高和柔和文字色。
- 滑块保留黑色手调刻度线与硬边手柄。

### 验证

- `npm run lint` 通过。
- `npm run build` 通过。
- 本地 Vite 服务启动成功。
- `curl -I http://localhost:5173/` 返回 `HTTP/1.1 200 OK`。

### 备注

- 当前环境未安装 Playwright，未执行自动浏览器截图验证。
- 后端和其他已有未提交改动未被回退，本次仅处理前端稳定性、视觉规范和文档日志。
