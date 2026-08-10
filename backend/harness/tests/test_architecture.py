from __future__ import annotations

import ast
import json
import re
import unittest
from pathlib import Path

from harness.capabilities import build_capability_registry
from harness.prompts import get_prompt_asset
from harness.evals import load_eval_suite


BACKEND_ROOT = Path(__file__).resolve().parents[2]


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


class ArchitectureBoundaryTests(unittest.TestCase):
    def test_pure_harness_layers_do_not_import_framework_or_legacy_gateway(self):
        roots = ('contracts', 'ports', 'policies', 'runtime', 'capabilities', 'prompts', 'evals', 'knowledge', 'localization')
        violations = []
        for root in roots:
            for path in (BACKEND_ROOT / 'harness' / root).rglob('*.py'):
                for module in imported_modules(path):
                    if module == 'api' or module.startswith(('api.', 'django', 'ai_gateway')):
                        violations.append(f'{path.relative_to(BACKEND_ROOT)} -> {module}')
        self.assertEqual(violations, [])

    def test_business_services_use_only_public_harness_boundaries(self):
        allowed = {'harness.facade', 'harness.contracts', 'harness.graph'}
        violations = []
        roots = (BACKEND_ROOT / 'api' / 'service_modules', BACKEND_ROOT / 'generation')
        for root in roots:
            for path in root.rglob('*.py'):
                if path.name.startswith('test'):
                    continue
                for module in imported_modules(path):
                    if module.startswith('harness.') and not any(
                        module == item or module.startswith(item + '.') for item in allowed
                    ):
                        violations.append(f'{path.relative_to(BACKEND_ROOT)} -> {module}')
        self.assertEqual(violations, [])


class CapabilityAssetTests(unittest.TestCase):
    def test_completion_capabilities_publish_input_and_output_contracts(self):
        for spec in build_capability_registry().all():
            if spec.execution_mode.value == 'agent':
                continue
            self.assertIsNotNone(spec.input_model, spec.name)
            self.assertIsNotNone(spec.output_model, spec.name)
            self.assertIsNotNone(spec.result_model, spec.name)

    def test_every_registered_capability_owns_versioned_prompts_and_evals(self):
        registry = build_capability_registry()
        self.assertEqual(len(registry.all()), 11)
        for spec in registry.all():
            version_root = spec.prompt_root / spec.default_prompt_version
            self.assertTrue((version_root / 'manifest.yaml').is_file(), spec.name)
            self.assertTrue((version_root / 'user.md').is_file(), spec.name)
            eval_path = spec.prompt_root.parent / 'evals' / spec.default_prompt_version / 'cases.jsonl'
            self.assertTrue(eval_path.is_file(), spec.name)
            suite = load_eval_suite(spec)
            self.assertEqual(suite.capability, spec.name)
            self.assertEqual(suite.version, spec.default_prompt_version)
            self.assertTrue(suite.checksum)

    def test_authored_prompt_instructions_are_english_and_version_pinned(self):
        han = re.compile(r'[\u3400-\u9fff]')
        for spec in build_capability_registry().all():
            asset = get_prompt_asset(spec.prompt_key)
            self.assertIsNotNone(asset)
            assert asset is not None
            self.assertEqual(asset.version, spec.default_prompt_version)
            self.assertEqual(asset.locale, 'en-US')
            self.assertFalse(han.search(asset.system_prompt + asset.user_prompt), spec.name)
            self.assertTrue(asset.checksum)

    def test_prompt_schema_hints_match_provider_contract_fields(self):
        for spec in build_capability_registry().all():
            if spec.output_model is None:
                continue
            asset = get_prompt_asset(spec.prompt_key)
            self.assertIsNotNone(asset, spec.name)
            assert asset is not None
            if not asset.schema_hint:
                self.assertFalse(spec.strict_output, spec.name)
                continue
            hinted = json.loads(asset.schema_hint)
            self.assertEqual(
                set(hinted),
                set(spec.output_model.model_fields),
                f'{spec.name} prompt schema drifted from its provider output contract',
            )
