# Backend Modularization

The backend is a modular Django system. It keeps one database model layer for migration stability and splits endpoint ownership by business domain.

## Why This Structure

The project previously concentrated too much behavior in `api/views.py` and `api/services.py`. That makes concurrent development difficult because unrelated features edit the same files. The new structure separates endpoint ownership while preserving existing database tables and API paths.

## Current App Boundary

| App | Responsibility |
| --- | --- |
| `harness` | Provider-neutral AI contracts, capabilities, prompts, policy, runtime, ports, and adapters |
| `api` | Models, migrations, admin, shared domain contracts, serializers, compatibility imports |
| `accounts` | Login and account endpoints |
| `workspaces` | Organizations, projects, folders, campaigns, drafts, templates, dashboard |
| `generation` | Generation endpoints, task queue, workflow execution, node retry |
| `community` | Community feed, likes, brand inspiration search |
| `ai_gateway` | Provider configuration and compatibility entry points while integrations migrate to harness adapters |
| `billing` | Subscription plans and quota policy |

## Routing

`core.urls` includes `api.urls` under `/api/`.

`api.urls` composes domain URLs:

```python
urlpatterns = [
    path('', include('accounts.urls')),
    path('', include('workspaces.urls')),
    path('', include('generation.urls')),
    path('', include('community.urls')),
    path('', include('ai_gateway.urls')),
    path('', include('billing.urls')),
]
```

This preserves existing frontend paths such as:

- `/api/projects/`
- `/api/drafts/<id>/run/`
- `/api/tasks/`
- `/api/community/creations/`
- `/api/ai/config/`
- `/api/billing/plans/`

## Extension Rules

When adding a feature:

1. Choose the owning app first.
2. Add or update views in that app.
3. Add URL routes in that app's `urls.py`.
4. Put reusable domain serialization in `api/serializers.py`.
5. Put AI execution contracts, prompts, and provider/tool ports in `harness/`.
6. Put request scope helpers in `api/scope.py`.
7. Add tests for the public API behavior.

## Anti-Patterns

- Adding new business endpoints to `api.views`.
- Copying the same response dictionary across multiple views.
- Hiding cross-domain rules inside one view.
- Changing API paths without a compatibility plan.
- Changing model ownership and table names during feature work.
- Calling provider SDKs from views or business services.
- Embedding model-facing prompt prose in Python or TypeScript.
- Returning mock output when a provider is missing or fails.

## Service Layout

Business services are split under `api/service_modules/` while `api/services.py` preserves compatibility imports. New work belongs in the owning module:

- `service_modules/generation.py`
- `service_modules/workspace.py`
- `service_modules/workflow_parts/`

See [AI Harness Architecture](./ai_harness.md) for AI-specific dependency and extension rules.
