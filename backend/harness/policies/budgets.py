from __future__ import annotations

from harness.contracts import RunConfig, Usage
from harness.contracts.errors import NonRetryableHarnessError


class BudgetPolicy:
    @staticmethod
    def validate(config: RunConfig, usage: Usage) -> None:
        if config.max_prompt_tokens is not None and usage.prompt_tokens > config.max_prompt_tokens:
            raise NonRetryableHarnessError('Prompt token budget exceeded.')
        if config.max_completion_tokens is not None and usage.completion_tokens > config.max_completion_tokens:
            raise NonRetryableHarnessError('Completion token budget exceeded.')
        if config.max_cost_usd is not None and usage.cost_usd > config.max_cost_usd:
            raise NonRetryableHarnessError('Run cost budget exceeded.')
