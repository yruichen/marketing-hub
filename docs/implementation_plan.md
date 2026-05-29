# Implementation Plan - Marketing-Hub MVP Upgrade

We have performed a comprehensive upgrade of the Marketing-Hub MVP, turning the hardcoded placeholders into an active, database-backed, agentic application with a premium, professional "Creative Draftbook" design.

---

## 🛠️ Architecture Upgrade Overview

```mermaid
graph TD
    subgraph Frontend (React + Vite + Tailwind)
        A[Sleek Draftbook Workspace UI] -->|Auth Token| B[API Client]
        A --> C[AI Configuration Panel]
        A --> D[Community & RAG Search]
        A --> E[AI Agent Workflow Output]
    end

    subgraph Backend (Django REST Framework)
        B --> F[Auth Views]
        C --> G[AI Configuration Manager]
        D --> H[Community views & RAG Search Endpoint]
        E --> I[AI Agent / LangChain-style Workflow]

        G -->|Read API Keys| I
        I -->|Execute Prompt Chain| J[LLM APIs: Gemini / OpenAI]
        H -->|Save / Search Creations| K[(SQLite Database)]
        G -->|Save API Config| K
    end
```

---

## 📋 Step-by-Step Task List

### 1. Database & Models (`backend/api/models.py`)
- [x] **User & Authentication**: Use standard Django User model. Configured a mechanism to auto-create the demo user `ROOT` with password `123` on startup.
- [x] **AI Configuration Table**: Added `AIConfiguration` to store provider (`gemini` | `openai` | `mock`), API key, base URL, and preferred model name.
- [x] **Community Creations Table**: Added `CommunityCreation` to store generated copywriting, images, storyboards, and audio records, with fields for tags, user, likes, and a `rag_indexed` boolean flag.

### 2. Authentication, API Keys & Community Endpoints (`backend/api/views.py` & `urls.py`)
- [x] **`LoginView`**: Authenticates credentials (`ROOT` / `123`) and returns a simple session token or custom JSON response.
- [x] **`AIConfigView`**: Allows listing, saving, and updating the active AI API keys. Masks keys for security in output.
- [x] **`CommunityView`**: Allows users to post their creations to the community feed and list all shared creations.
- [x] **`RAGSearchView`**: Provides a RAG semantic search placeholder endpoint, showing how vector database retrieval and BM25 index filtering operate in production.

### 3. AI Agent Workflow Framework (`backend/api/agent.py`)
- [x] Implemented a **LangChain-style AI Agent Framework**:
  - `PromptTemplate` parser for platform-specific copywriting, image prompts, video scripts, and TTS tags.
  - `AIAgent` runner that reads the active `AIConfiguration` from the database.
  - Supported `Google Gemini API` (via standard library/SDK) and `OpenAI API`.
  - Seamless fallback to `High-Fidelity MockAgent` if no API key is saved, printing detailed "Agent Execution Logs" to the frontend.

### 4. Frontend Premium UI/UX Design (`frontend/src/`)
- [x] **Revamped App Style** (`index.css` & `App.tsx`):
  - Ditch the flashing high-saturation colors for a **sleek, premium "Creative Draftbook" handdrawn theme** with clean card layouts, physical pushpin yellow sticky notes, geometric sliders, rectangular toggles, and rotated Polaroid gallery frames.
  - Implemented dual modes: Warm Bio-paper (`#FAF9F6`) Light Mode and Chalkboard Slate (`#121212`) Dark Mode.
- [x] **Added Logo Placeholder**: Added an elegant SVG logo in the header with comments showing where the user can swap it out.
- [x] **Added User Login Screen**: Standard ROOT/123 login interface, persisting login state locally.
- [x] **Added Config Panel**: UI to save API Keys & choose AI Provider, linking it to the backend.
- [x] **Added Community Grid**: Beautiful view of shared items with likes, search bar, and tags.
- [x] **RAG Search Integration**: Search query input that fires semantic search requests to the backend.
- [x] **Live Agent Execution Log Window**: Displays step-by-step reasoning logs (e.g., "Formatting prompt for Xiaohongshu...", "Invoking model gemini-1.5-flash...", "Extracting structured JSON outcome...") during generations.

---

## ⚡ Technical Standards
- **Maintainability**: Unified AI services in `agent.py` decouple the Django views from LLM-specific parameters.
- **Security**: Database-stored API keys are encrypted or masked when sent to the frontend.
- **Experience**: The sandbox simulator runs out-of-the-box so the application functions flawlessly even if the user hasn't configured an API key.
