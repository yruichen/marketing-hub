# Marketing-Hub Upgraded "Creative Draftbook" Walkthrough

Welcome to the newly designed **Marketing-Hub**! We have completely rewritten the frontend application to follow the high-contrast, physical **"Creative Draftbook (创意草稿本)"** design system, delivering an authentic "handdrawn sketchbook" visual signature while providing low eye strain for long-term creative usage.

---

## 🎨 1. The Brand DNA & Core Styling

The visual identity is modeled after an interactive physical sketchbook. We strictly restrict generic color gradients and translucent glass, utilizing high-contrast ink boundaries and a precise color hierarchy.

- **Dual-Mode Canvas (纸张/黑板明暗模式)**:
  - **Light Mode (温暖纸张)**: A warm, unreflective bionic paper backdrop (`#FAF9F6`) with solid ink lines (`#1A1A1A`).
  - **Dark Mode (粉笔黑板)**: A dark chalkboard background (`#121212`) with solid chalk-white boundaries (`#FFFFFF`) and dark-slate panels (`#1E1E1E`).
  - *How to switch*: Simply click the rectangular switch in the left sidebar marked **"黑板草稿模式"** to slide and toggle the theme instantly!
- **Solid Ink Contours (单线墨描)**: All boundaries use absolute single solid outlines (`1.5px` and `2px` black/white solid borders).
- **Physical Hard Shadows (重力硬阴影)**: We strictly avoid box-shadow blurs. Hover and active click states are rendered via 3D physical translations and hard solid shadows:
  - **Static shadow**: `box-shadow: 4px 4px 0px #border;`
  - **Hover shadow**: `box-shadow: 6px 6px 0px #border; transform: translate(-2px, -2px);`
  - **Active push**: `box-shadow: 1px 1px 0px #border; transform: translate(3px, 3px);`
- **Minimalist Highlight Colors (稀缺强调色)**:
  - 💛 **Highlighter Yellow (#FDE047 / #FACC15)**: Used exclusively for active highlight selectors, status indicators, and slider values.
  - 💙 **Pencil Lead Blue (#2563EB / #3B82F6)**: Used for primary AIGC action buttons to signify critical activation triggers.
- **Emoji Accents**: Sections are equipped with high-fidelity native emojis (📝, 🎨, 🎬, 🔊, 📦, ⚙️) instead of standard corporate vector symbols, adding a warm, human touch to the creative canvas.

---

## 📋 2. Core Specialized Components & Layouts

We have restructured the interface to resemble an interactive physical drafting desk.

```
+-------------------------------------------------------------+
|  [🌞/🌚 Toggle]                                            |
|                                                             |
|  +--------------+  [📝 Copy] [🎨 Image] [🎬 Story] [📦 Feed] |
|  |  FLOATING    |  +-------------------------------------+  |
|  |  TOOLBELT    |  |                                     |  |
|  |  (SIDEBAR)   |  |   MAIN CONTENT PANEL                |  |
|  |              |  |   (DOT MATRIX GRID)                 |  |
|  |              |  |                                     |  |
|  |  [Logo Tag]  |  |   +--------------------------+      |  |
|  |              |  |   | [Pushpin] Sticky Note     |      |  |
|  |  [User Tag]  |  |   | Prompt Input TextArea    |      |  |
|  +--------------+  |   +--------------------------+      |  |
|                    |                                     |  |
|                    +-------------------------------------+  |
+-------------------------------------------------------------+
```

### A. Floating Toolbelt (悬浮工具夹板)
The sidebar does not clip awkwardly to the viewport borders. It behaves like a rigid wooden clipboard floating over the drawing desk, with uniform margins and flat hard shadows.

### B. Index Divider Folder Tabs (文件夹索引卡)
We avoid traditional dropdown menus. The workspace views are managed by rounded folder tab labels. The active folder tab aligns and merges seamlessly with the 2px border of the main canvas panel, giving a satisfying geometric feel.

### C. Dot Matrix Grid Canvas (网格点阵画板)
The workspace container renders a high-fidelity sketchbook dot grid (`radial-gradient`), simulating real grid papers. (Dots change from light gray `#D4D4D4` in Light mode to graphite slate `#374151` in Dark mode).

### D. The Pinned Sticky Prompt Note (大头针便签框)
All user text prompts are structured inside an interactive yellow sticky note (`#FEF08A` in Light, `#3E3B1E` in Dark). The note features two solid circular pushpins at the top. On input focus, the box renders a corner-fold curling drop shadow.

### E. Physical Toggles & Slider Knobs (实体滑块与矩形开关)
- **Sliders**: The parameter slider tracks are clean single solid lines (`border-bottom`). The thumb slider is a white circular knob with a black outline and a flat drop shadow.
- **Toggles**: Replaced pill-shaped sliders with crisp rectangular switches. Clicking the switch toggles binary states `0` or `1` with highlighter yellow highlight overlays.

### F. Polaroid Gallery Card (拍立得写照卡片)
All generated assets (copy summaries, image previews, storyboard stages, audio player widgets) are generated inside Polaroid snapshots.
- **Snapshot Spacings**: 12px borders on top/left/right, with an extended 36px blank area at the bottom.
- **Monospace Tags**: The bottom margin outputs equal-spaced metadata in monospace fonts: `SEED: 827419-COPY` and the designated model tags.
- **Micro-Angles Rotation**: Cards are rotated by minor random offsets (e.g. `rotate-[0.6deg]`, `rotate-[-0.5deg]`) to represent snapshots organically scattered on the drawing table.

---

## 🛠️ App Logo custom Instructions

We have designated a dedicated app logo placeholder inside [App.tsx:L360-384](file:///Users/chenyingrui/Desktop/marketing-hub/frontend/src/App.tsx#L360-L384). 

If you want to swap the hand-drawn SVG logo with a production image file:
1. Copy your logo (e.g., `logo.png` or `logo.svg`) to your frontend public folder or asset directory.
2. Edit [App.tsx](file:///Users/chenyingrui/Desktop/marketing-hub/frontend/src/App.tsx) and find the comment block `APP LOGO PLACEHOLDER`.
3. Replace the SVG structure with your target image tag:
   ```tsx
   <img src="/logo.png" className="h-8 w-auto" alt="Brand Logo" />
   ```

---

## 🚀 How to Launch the Upgrade

### 1. Launch the Backend Django Server
```bash
cd backend
.venv/bin/python manage.py runserver
```
*Note: Django will boot, migrating the config structures and programmatically ensuring the demo superuser `ROOT` (password `123`) is ready.*

### 2. Launch the Frontend React Client
```bash
cd frontend
npm run dev
```
*Note: Vite will spin up the environment. Open the address to log in as ROOT / 123 and experience the ultimate premium Draftbook work environment!*
