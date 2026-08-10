# AI Harness Architecture

Marketing Hub routes AI work through a provider-neutral harness. The harness owns capability contracts, prompt assets, execution lifecycle, policy, graph planning, localization, and integration ports. Django owns persistence and business workflows; provider SDKs remain adapters at the edge.

## Design Goals

- Keep model providers replaceable without changing business services.
- Give every capability an explicit input, provider-output, and public-result contract.
- Version prompts and evaluations independently by capability.
- Make runs traceable, budget-aware, idempotent, and safe to retry at delivery boundaries.
- Keep model-facing instructions in English while treating output locale as runtime data.
- Reject missing configuration and invalid model output instead of fabricating success.
- Allow future tools, agents, providers, and locales without creating new dependency cycles.

## Directory Map

```text
backend/harness/
  contracts/       Stable run, event, state, and error models
  capabilities/    One module per capability, with contracts and normalizers
    <capability>/
      prompts/<version>/
      evals/<version>/
  runtime/         Completion lifecycle, agent loop, and pure DAG planning
  ports/           Provider, execution, checkpoint, event, and tool protocols
  policies/        Budget and tool-approval policy
  prompts/         Versioned prompt repository and integrity metadata
  evals/           Typed evaluation-suite loader and integrity metadata
  knowledge/       Versioned channel, assistant, and visual-style knowledge
  localization/    Versioned backend output catalogs
  adapters/
    providers/     External model and media provider implementations
    tools/         Tenant-scoped tool implementations
    telemetry/     Event sinks
    django/        Persistence and application integration
  facade.py        Stable boundary used by business services
  graph.py         Stable public DAG-planning boundary
```

The frontend mirrors the locale boundary under `frontend/src/shared/i18n/`. Base shell copy and feature copy use separate catalogs, which are composed by locale. Stable state and API values remain language-neutral; labels are resolved at render time.

## Dependency Direction

```text
business features
      |
      v
facade / public contracts / graph
      |
      v
runtime + capabilities + policies
      |
      v
ports  <---------------- adapters
                              |
                              v
                    Django / providers / tools
```

Rules enforced by tests:

- Pure harness layers cannot import Django, `api`, or the legacy gateway.
- Business services may import only `harness.facade`, `harness.contracts`, or `harness.graph`.
- Capability registration is explicit; importing a module cannot mutate a global registry.
- Every completion capability publishes input, provider-output, and normalized-result contracts.

## Capability and Prompt Ownership

Each capability owns its contract and its own prompt directory. Prompts are not combined into a shared marketing prompt.

```text
capabilities/copy/
  contract.py
  capability.py
  prompts/2026-08-10.v3/
    manifest.yaml
    system.md
    user.md
    schema.json
  evals/2026-08-10.v3/
    cases.jsonl
```

The manifest pins owner, risk, evaluation profile, quality gates, locale, and prompt version. A checksum is recorded with every run. Prompt schema hints are checked against the provider-output Pydantic model so a prompt cannot silently drift from its parser.

Authored instructions use English. `output_locale` is part of `RunContext` and is rendered into the prompt explicitly. Adding a UI language means adding a complete typed frontend catalog and, where backend-authored product text is needed, a versioned backend locale catalog. It must not require editing capability logic.

## Execution Semantics

`Runner` wraps a provider-neutral execution port and emits a stable lifecycle:

```text
queued -> running -> succeeded | failed
```

Checkpoint schema v2 persists the pinned prompt, usage, events, terminal result, and sanitized failure type. The Django checkpoint adapter atomically claims a `run_id`. A repeated identical successful request replays its durable result without executing the provider again. Reusing the ID for another request, or redelivering a nonterminal/failed completion, is rejected and requires a new run ID.

The pure agent loop already enforces allow/deny/ask tool policy before side effects. Durable approval continuation is intentionally not exposed through the completion runner yet; introducing it requires an explicit stateful agent-session runtime rather than pretending a failed completion can resume.

## Workflow Graphs

`harness.runtime.graph` validates node IDs and edges, rejects cycles and self-links, produces a stable topological plan, resolves direct upstream outputs, and calculates descendants. Django workflow services adapt persisted models to this pure planner. Node retry reruns only actual descendants, not unrelated branches.

## Failure and Test-Double Policy

Production execution has no mock provider and no automatic mock fallback. Missing credentials, provider failures, malformed output, and empty media URLs are explicit errors.

Network-free deterministic provider doubles live only in `backend/tests/`. They are installed explicitly by tests and are never imported by production modules. Empty product states guide users to create real input or configure a provider; they do not display synthetic results.

## Adding an Extension

For a capability:

1. Create a capability directory with input, provider-output, and public-result contracts.
2. Add an English, versioned prompt asset and matching eval cases.
3. Register the capability explicitly.
4. Add the provider post-processing adapter only when the public result differs from provider output.
5. Add contract, prompt-integrity, failure-path, and application-boundary tests.

For a provider or tool:

1. Implement the relevant port under `adapters/`.
2. Keep credentials and framework objects out of contracts and checkpoints.
3. Register it in the application composition layer.
4. Define explicit error, timeout, cost, and approval behavior.

Do not add provider SDK calls to business services, embed prompt prose in Python/TypeScript, introduce language-specific state identifiers, or return placeholders when an integration is unavailable.
