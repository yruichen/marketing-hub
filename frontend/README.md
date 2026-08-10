# Marketing Hub Frontend

The frontend is a React 19 and TypeScript single-page application for campaign ideation, multimodal generation, workflow orchestration, project assets, and community templates.

## Local Development

Requirements: Node.js 22 and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The development server runs at `http://localhost:5173`. By default it connects to `http://localhost:8000/api`; change `VITE_API_BASE_URL` in `.env.local` when the Django API uses a different origin.

## Commands

```bash
npm run dev        # Start Vite development server
npm run lint       # Run ESLint
npm run test       # Run Vitest once
npm run test:watch # Run Vitest in watch mode
npm run build      # Type-check and create a production build
npm run test:e2e   # Run Playwright end-to-end tests
```

## Structure

```text
src/
  app/         providers, navigation, and route mapping
  components/  shared application-level components
  features/    domain-focused product modules
  hooks/       API, CSRF, toast, and shared React hooks
  shared/      API client, stores, utilities, and reusable UI
  types/       cross-feature TypeScript contracts
```

TanStack Query owns server state, Zustand owns cross-screen UI state, and `apiFetch` in `src/hooks/useApi.ts` is the shared session-authenticated API boundary.

## Contribution Boundaries

- Put new product work under `src/features/<domain>/`.
- Reuse the shared API client instead of creating independent fetch wrappers.
- Keep organization and project scope explicit in API calls.
- Add or update Vitest coverage for behavior changes.
- Run lint, tests, and the production build before opening a pull request.

See the root [contribution guide](../CONTRIBUTING.md) for the full pull-request workflow.
