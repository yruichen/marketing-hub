# Security Policy

Marketing Hub handles multi-tenant workspace data, session authentication, provider credentials, generated assets, and usage records. Please report security problems privately and responsibly.

## Supported Versions

Security fixes are applied to the latest commit on `main` and, when applicable, the latest tagged release. Older tags are not guaranteed to receive fixes.

## Report a Vulnerability

Do not open a public issue for a suspected vulnerability.

Use [GitHub private vulnerability reporting](https://github.com/yruichen/marketing-hub/security/advisories/new) and include:

- A clear description of the issue and affected component
- Reproduction steps or a minimal proof of concept
- Expected impact and any known preconditions
- Suggested remediation, if available

Avoid accessing data that does not belong to you, disrupting production services, or publishing details before a fix is available.

## Response Targets

The maintainers aim to:

- Acknowledge a report within 3 business days
- Confirm severity and next steps within 7 business days
- Coordinate disclosure after a fix or mitigation is ready

These are targets rather than guarantees. Complex provider, infrastructure, or supply-chain issues may take longer.

## Deployment Safety

Production deployments must disable demo bootstrap and mock fallback behavior. Never commit `.env` files, provider keys, deployment keys, database credentials, or session secrets.

If a credential is committed, revoke or rotate it immediately before removing it from the current tree. Treat Git history, forks, clones, caches, and Actions artifacts as potentially retaining the exposed value; a follow-up commit alone is not sufficient incident response.
