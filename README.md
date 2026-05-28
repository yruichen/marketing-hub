# Marketing Hub

这是一个基于 Django (Backend) 和 React (Frontend) 的全栈营销中心（Marketing Hub）项目。

## 项目结构

- `backend/` - Django 后端项目，包含数据模型和 API 接口
- `frontend/` - React + Vite 前端项目，使用 TypeScript 和 Tailwind CSS 开发

## 技术栈

### 后端 (Backend)
- [Python](https://www.python.org/) 3.12+
- [Django](https://www.djangoproject.com/) 6.0+
- [Django REST Framework](https://www.django-rest-framework.org/) 3.17+
- Django CORS Headers

### 前端 (Frontend)
- [React](https://react.dev/) 19
- [Vite](https://vitejs.dev/) 8
- [TypeScript](https://www.typescriptlang.org/) 6.0
- [Tailwind CSS](https://tailwindcss.com/) 3.4
- ESLint + PostCSS

## 快速开始

### 1. 后端设置

进入后端目录并安装依赖（建议使用虚拟环境，支持 `uv` 或 `pip`）：

```bash
cd backend
# 假设你已经激活了虚拟环境
pip install -r requirements.txt # 或者如果有其他包管理器，请按需执行
```

运行数据库迁移（SQLite 默认）：

```bash
python manage.py migrate
```

启动开发服务器：

```bash
python manage.py runserver
```
后端服务默认将在 `http://localhost:8000` 运行。

### 2. 前端设置

进入前端目录并安装依赖包：

```bash
cd frontend
npm install # 或 yarn, pnpm 等
```

启动开发服务器：

```bash
npm run dev
```

前端应用通常在 `http://localhost:5173` 运行，具体端口请参考命令行输出。

## 开发脚本 (前端)

在 `frontend` 目录下，你可以使用以下命令：

- `npm run dev`: 启动 Vite 开发服务器。
- `npm run build`: 使用 TypeScript 进行类型检查，并构建生产环境版本。
- `npm run lint`: 运行 ESLint 检查代码。
- `npm run preview`: 在本地预览生产版本构建。
