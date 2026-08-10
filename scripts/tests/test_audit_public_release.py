from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.audit_public_release import audit


class PublicRepositoryAuditTests(unittest.TestCase):
    def audit_files(self, files: dict[str, str]) -> tuple[list[tuple[str, str]], list[str]]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative, content in files.items():
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")
            return audit(root)

    def test_allows_example_environment_file(self) -> None:
        findings, _ = self.audit_files({".env.example": "TOKEN=replace-me\n"})
        self.assertEqual(findings, [])

    def test_blocks_non_example_environment_file(self) -> None:
        findings, _ = self.audit_files({".env.production": "TOKEN=replace-me\n"})
        self.assertIn((".env.production", "non-example environment file"), findings)

    def test_blocks_internal_only_path(self) -> None:
        findings, _ = self.audit_files({"docs/internal/roadmap.md": "private plan\n"})
        self.assertIn(("docs/internal/roadmap.md", "internal-only path"), findings)

    def test_blocks_secret_signature_without_echoing_value(self) -> None:
        token = "ghp" + "_" + ("a" * 36)
        findings, _ = self.audit_files({"config.txt": token})
        self.assertEqual(findings, [("config.txt", "GitHub token")])

    def test_blocks_private_contact_and_workstation_path(self) -> None:
        email = "developer" + "@company.invalid"
        workstation = "/" + "Users/alice/project"
        findings, _ = self.audit_files({"notes.txt": f"{email}\n{workstation}\n"})
        self.assertIn(("notes.txt", "local absolute path"), findings)
        self.assertIn(("notes.txt", "non-example email address"), findings)

    def test_marks_binary_document_for_manual_review(self) -> None:
        findings, manual_review = self.audit_files({"docs/guide.pdf": "review me"})
        self.assertEqual(findings, [])
        self.assertEqual(manual_review, ["docs/guide.pdf"])


if __name__ == "__main__":
    unittest.main()
