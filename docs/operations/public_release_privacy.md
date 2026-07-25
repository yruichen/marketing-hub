# Public Release Privacy Runbook

Status: internal release guidance
Last reviewed: 2026-07-25

## Non-Negotiable Rule

Do not change the visibility of the existing `yruichen/marketing-hub` repository to Public.

The private repository contains internal material in both its current tree and Git history. Deleting a file from the latest commit does not remove it from earlier commits, tags, pull-request refs, cached clones, or Actions artifacts.

Create a separate public repository from a reviewed, history-free export instead.

## Confirmed Private-Release Risks

The July 2026 audit found:

- Deleted roadshow, pitch, presentation-outline, and speech-script files still reachable in Git history.
- Multiple commit-author identities using personal email domains.
- A production-facing public IP repeated in environment examples and deployment documentation. The current branch replaces it with the documentation-only address `203.0.113.10`.
- Local absolute filesystem links containing a workstation username. The current branch replaces them with relative links.
- Internal planning, legal readiness, security readiness, deployment, and product strategy documents in the current tree.
- Production deployment workflow and server deployment scripts in the current tree.
- Binary planning documents that cannot be reliably reviewed with a text-only secret scan.

GitHub Secret Scanning is not available for the repository under its current private-repository configuration. Local and export-time checks are therefore required.

## Default-Deny Export Scope

Start with an empty directory and copy only reviewed files. Do not clone or archive the private repository into the public repository.

Candidate public content:

- Product source under `backend/` and `frontend/`, after scanning
- Development Dockerfiles and `docker-compose.yml`
- Root README files and community policies
- `.github` issue forms, pull request template, Dependabot config, release config, and CI workflow
- Explicitly reviewed screenshots and selected architecture documentation

Exclude by default:

- `.git/`, every old branch, tag, pull-request ref, and commit
- `AGENTS.md`
- `ENGINEERING_PLAYBOOK.md`
- `.github/workflows/cd.yml`
- `docker-compose.prod.yml`
- `scripts/deploy.sh`
- `backend/scripts/`
- `docs/plans/`
- `docs/archive/`
- `docs/operations/cicd.md`
- `docs/operations/public_release_privacy.md`
- PDFs, office documents, archives, database files, logs, uploads, and generated assets
- Real `.env` files, credentials, provider keys, server addresses, internal domains, and customer data

Items may move from the exclude list only after a deliberate content review.

## Clean Public Repository Procedure

1. Confirm the public product scope, PolyForm license notice, commercial-license positioning, and contributor acceptance records.
2. Create a new empty export directory outside this repository.
3. Copy only approved current files. Do not copy `.git`.
4. Replace private infrastructure and account details with RFC example domains and documentation IP ranges.
5. Manually review screenshots for names, avatars, email addresses, workspace names, customer content, billing details, and browser chrome.
6. Run:

   ```bash
   python scripts/audit_public_release.py /absolute/path/to/public-export
   ```

7. Resolve every finding. A zero exit code is necessary but not sufficient; complete a human review.
8. Initialize a new Git repository in the clean export.
9. Configure a GitHub `users.noreply.github.com` commit email before the first commit.
10. Create a single initial commit. Do not import private tags, branches, PR refs, releases, Actions artifacts, or commit history.
11. Create a new GitHub repository as Private first, push the clean commit, and review the rendered README and file tree.
12. Enable Secret Scanning and Push Protection when the target repository supports them.
13. Change only the new sanitized repository to Public after the final checklist passes.

## Final Human Checklist

- [ ] Public scope is explicitly approved.
- [ ] The PolyForm Noncommercial license and commercial-license notice are present and intentional.
- [ ] Every included contributor has explicitly accepted the contributor terms.
- [ ] No private Git history or author email history is included.
- [ ] No internal plans, deployment files, provider probes, or legal working documents are included.
- [ ] No public server IP, internal hostname, account identifier, or local absolute path is present.
- [ ] Environment examples contain placeholders only.
- [ ] All images and binary files were manually inspected.
- [ ] Test fixtures use reserved example identities and domains.
- [ ] The export scanner passes.
- [ ] CI passes in the new repository.
- [ ] Repository description, Topics, links, support policy, and security policy match the public scope.
