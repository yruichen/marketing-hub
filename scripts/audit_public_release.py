#!/usr/bin/env python3
"""Audit public repository content for common secrets and private material."""

from __future__ import annotations

import argparse
import ipaddress
import os
import re
import subprocess
import sys
from pathlib import Path


DENIED_DIRECTORY_NAMES = {
    ".agents",
    ".claude",
    ".codex",
    ".git",
    ".idea",
    ".mypy_cache",
    ".openai",
    ".pytest_cache",
    ".venv",
    ".vscode",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "tmp",
}

DENIED_FILENAMES = {".DS_Store"}

DENIED_PATHS = {
    ".github/workflows/cd.yml",
    "AGENTS.md",
    "CLAUDE.md",
    "ENGINEERING_PLAYBOOK.md",
    "docker-compose.prod.yml",
    "frontend/src/MODULE_ARCHITECTURE.md",
    "scripts/deploy.sh",
}

DENIED_PREFIXES = (
    "backend/scripts/",
    "docs/archive/",
    "docs/internal/",
    "docs/plans/",
    "docs/private/",
)

DENIED_SUFFIXES = {
    ".7z",
    ".bak",
    ".db",
    ".dump",
    ".key",
    ".log",
    ".p12",
    ".pem",
    ".pfx",
    ".rar",
    ".sqlite",
    ".sqlite3",
    ".tar",
    ".zip",
}

SECRET_PATTERNS = {
    "GitHub token": re.compile(r"\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b"),
    "OpenAI-style key": re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "Google API key": re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b"),
    "Slack token": re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b"),
    "Stripe live key": re.compile(r"\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b"),
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "credentialed service URL": re.compile(
        r"\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://"
        r"[^:/\s]+:[^@/\s]+@[^\s]+"
    ),
    "local absolute path": re.compile(
        r"(?:(?<![A-Za-z0-9._-])/Users/[^/\s]+|"
        r"(?<![A-Za-z0-9._-])/home/[^/\s]+|"
        r"[A-Za-z]:\\Users\\[^\\\s]+)"
    ),
    "Chinese mobile number": re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"),
    "Chinese identity number": re.compile(
        r"(?<!\d)[1-9]\d{5}(?:18|19|20)\d{2}"
        r"(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)"
    ),
}

EMAIL_PATTERN = re.compile(r"[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})", re.IGNORECASE)
IPV4_PATTERN = re.compile(r"(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)")

ALLOWED_EMAIL_DOMAINS = {
    "example.com",
    "example.org",
    "example.net",
    "users.noreply.github.com",
}

DOCUMENTATION_NETWORKS = (
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
)

MANUAL_REVIEW_SUFFIXES = {
    ".doc",
    ".docx",
    ".gif",
    ".jpeg",
    ".jpg",
    ".numbers",
    ".pages",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".svg",
    ".webp",
    ".xls",
    ".xlsx",
}


def relative_path(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def is_allowed_ip(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return True
    if address.is_loopback or address.is_private or address.is_link_local:
        return True
    return any(address in network for network in DOCUMENTATION_NETWORKS)


def filesystem_files(root: Path) -> tuple[list[Path], list[tuple[str, str]]]:
    files: list[Path] = []
    findings: list[tuple[str, str]] = []

    for current, directories, filenames in os.walk(root):
        current_path = Path(current)
        retained_directories = []
        for name in directories:
            directory = current_path / name
            if name in DENIED_DIRECTORY_NAMES:
                findings.append((relative_path(directory, root), "denied directory"))
            else:
                retained_directories.append(name)
        directories[:] = retained_directories
        files.extend(current_path / name for name in filenames)

    return files, findings


def tracked_files(root: Path) -> list[Path]:
    result = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-z"],
        check=True,
        capture_output=True,
    )
    return [
        root / value.decode("utf-8", errors="surrogateescape")
        for value in result.stdout.split(b"\0")
        if value
    ]


def audit(root: Path, *, tracked_only: bool = False) -> tuple[list[tuple[str, str]], list[str]]:
    findings: list[tuple[str, str]] = []
    manual_review: list[str] = []

    if tracked_only:
        files = tracked_files(root)
    else:
        files, directory_findings = filesystem_files(root)
        findings.extend(directory_findings)

    for path in sorted(files):
        relative = relative_path(path, root)

        # A tracked file can be intentionally removed in the pending change.
        if tracked_only and not path.exists() and not path.is_symlink():
            continue

        if relative in DENIED_PATHS or any(relative.startswith(prefix) for prefix in DENIED_PREFIXES):
            findings.append((relative, "internal-only path"))
            continue

        if path.name in DENIED_FILENAMES or path.suffix.lower() in DENIED_SUFFIXES:
            findings.append((relative, "denied file type"))
            continue

        if path.name.startswith(".env") and not path.name.endswith(".example"):
            findings.append((relative, "non-example environment file"))
            continue

        if path.suffix.lower() in MANUAL_REVIEW_SUFFIXES:
            manual_review.append(relative)

        try:
            raw = os.readlink(path).encode() if path.is_symlink() else path.read_bytes()
        except OSError:
            findings.append((relative, "missing or unreadable file"))
            continue

        if b"\x00" in raw:
            continue

        text = raw.decode("utf-8", errors="replace")

        # The scanner necessarily contains the signatures it detects.
        if relative == "scripts/audit_public_release.py":
            continue

        for label, pattern in SECRET_PATTERNS.items():
            if path.name in {"package-lock.json", "uv.lock"} and label in {
                "Chinese mobile number",
                "Chinese identity number",
                "local absolute path",
            }:
                continue
            if pattern.search(text):
                findings.append((relative, label))

        for match in EMAIL_PATTERN.finditer(text):
            if match.group(1).lower() not in ALLOWED_EMAIL_DOMAINS:
                findings.append((relative, "non-example email address"))
                break

        if path.name not in {"package-lock.json", "uv.lock"}:
            for value in IPV4_PATTERN.findall(text):
                if not is_allowed_ip(value):
                    findings.append((relative, "public IPv4 address"))
                    break

    return sorted(set(findings)), sorted(set(manual_review))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit public repository content before pushing it to GitHub."
    )
    parser.add_argument("root", nargs="?", type=Path, default=Path.cwd())
    parser.add_argument(
        "--tracked",
        action="store_true",
        help="scan only files tracked by the Git repository",
    )
    args = parser.parse_args()

    root = args.root.expanduser().resolve()
    if not root.is_dir():
        parser.error(f"not a directory: {root}")

    try:
        findings, manual_review = audit(root, tracked_only=args.tracked)
    except subprocess.CalledProcessError as exc:
        parser.error(f"unable to list tracked files: {exc.stderr.decode(errors='replace').strip()}")

    for relative, label in findings:
        print(f"BLOCK {relative}: {label}")

    for relative in manual_review:
        print(f"REVIEW {relative}: inspect visual or binary content manually")

    print(
        f"Audit complete: {len(findings)} blocking finding(s), "
        f"{len(manual_review)} manual-review file(s)."
    )
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
