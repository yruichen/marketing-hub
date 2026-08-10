from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Protocol

from harness.evals.contracts import EvalCase, EvalSuite


class EvalCapability(Protocol):
    name: str
    prompt_root: Path
    default_prompt_version: str


def load_eval_suite(capability: EvalCapability, version: str | None = None) -> EvalSuite:
    selected_version = version or capability.default_prompt_version
    path = capability.prompt_root.parent / 'evals' / selected_version / 'cases.jsonl'
    if not path.is_file():
        raise FileNotFoundError(
            f'Evaluation suite not found for {capability.name!r} at version {selected_version!r}.'
        )
    raw = path.read_bytes()
    cases = [
        EvalCase.model_validate(json.loads(line))
        for line in raw.decode('utf-8').splitlines()
        if line.strip()
    ]
    return EvalSuite(
        capability=capability.name,
        version=selected_version,
        cases=cases,
        checksum=hashlib.sha256(raw).hexdigest(),
    )
