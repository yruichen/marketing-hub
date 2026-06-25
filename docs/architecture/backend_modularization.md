# Backend Modularization

The backend is a modular Django system. It keeps one database model layer for migration stability and splits endpoint ownership by business domain.

## Why This Structure

The project previously concentrated too much behavior in `api/views.py` and `api/services.py`. That makes concurrent development difficult because unrelated features edit the same files. The new structure separates endpoint ownership while preserving existing database tables and API paths.

## Current App Boundary

| App | Responsibility |
| --- | --- |
| `api` | Models, migrations, admin, shared contracts, serializers, compatibility imports |
| `accounts` | Login and account endpoints |
| `workspaces` | Organizations, projects, folders, campaigns, drafts, templates, dashboard |
| `generation` | Generation endpoints, task queue, workflow execution, node retry |
| `community` | Community feed, likes, brand inspiration search |
| `ai_gateway` | Provider config, BYOK, model/base URL settings |
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
4. Put reusable serialization in `api/serializers.py`.
5. Put shared constants or protocols in `api/contracts.py`.
6. Put request scope helpers in `api/scope.py`.
7. Add tests for the public API behavior.

## Anti-Patterns

- Adding new business endpoints to `api.views`.
- Copying the same response dictionary across multiple views.
- Hiding cross-domain rules inside one view.
- Changing API paths without a compatibility plan.
- Changing model ownership and table names during feature work.

## Future Split Plan

The next clean split should move business services out of `api/services.py`:

- `generation/services.py`
- `workspaces/services.py`
- `community/services.py`
- `billing/services.py`

This should be done incrementally with tests after each extraction.

