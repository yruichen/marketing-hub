# Public Repository Security

Status: maintainer guidance

Last reviewed: 2026-08-10

Marketing Hub is a public source-available repository. Assume that every pushed commit, branch, tag, workflow log, artifact, and pull-request attachment can be copied permanently.

## Repository Baseline

Maintain these GitHub settings:

- Secret Scanning and Push Protection enabled
- Private vulnerability reporting enabled
- Dependabot alerts and security updates enabled
- CodeQL checks required before merging
- `main` protected from force pushes and direct changes, with pull-request approval and required CI checks
- Automatic deletion of merged branches enabled

Review this baseline after changing repository visibility, ownership, GitHub plan, Actions permissions, or deployment workflows.

## Before Every Push

- Keep real credentials and production configuration only in an approved secret manager.
- Commit environment templates as `.env.example`; never commit a populated `.env` variant.
- Use reserved example domains and IP ranges in documentation and fixtures.
- Remove customer data, account identifiers, private hostnames, and workstation paths.
- Keep agent instructions, internal roadmaps, legal drafts, deployment details, and private operations notes outside the repository.
- Inspect images, PDFs, archives, logs, database files, and generated assets manually before adding them.
- Use a GitHub `users.noreply.github.com` commit email when author-email privacy matters.
- Run `python3 scripts/audit_public_release.py --tracked .` before opening a pull request.

The repository audit is a guardrail, not proof that content is safe to publish.

## Credential Incident Response

If a secret is committed:

1. Revoke or rotate it immediately. Do not wait for code cleanup.
2. Check GitHub Secret Scanning alerts and affected environments.
3. Remove the value from the current tree and stop any workflow that can still use it.
4. Determine whether coordinated history rewriting is warranted. A normal deletion commit does not remove earlier copies.
5. Review forks, clones, caches, releases, pull-request refs, Actions logs, and artifacts as separate exposure paths.
6. Record the incident and the rotation evidence without copying the secret into an issue.

History rewriting is disruptive and cannot retract copies already fetched by others. Coordinate it as an incident-response operation rather than a routine pull request.

## Binary and Deployment Review

Text scanning cannot reliably inspect screenshots, PDFs, archives, compiled output, or database files. Review those assets visually or with a format-aware tool before committing them.

Public deployment workflows may reference GitHub secret names, but must never contain secret values, production host details, or credentials. Production environments should require approval and use least-privilege credentials that can be rotated independently.
