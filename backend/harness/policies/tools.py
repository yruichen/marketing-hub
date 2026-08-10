from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ToolDecision(StrEnum):
    ALLOW = 'allow'
    ASK = 'ask'
    DENY = 'deny'


@dataclass(frozen=True, slots=True)
class ToolRule:
    tool: str
    decision: ToolDecision
    reason: str


class ToolPolicy:
    """Default-deny tool policy independent from model instructions."""

    def __init__(self, rules: list[ToolRule] | tuple[ToolRule, ...] = ()) -> None:
        self._rules = {rule.tool: rule for rule in rules}

    def evaluate(self, tool: str) -> ToolRule:
        return self._rules.get(
            tool,
            ToolRule(tool=tool, decision=ToolDecision.DENY, reason='No tool policy grants access.'),
        )
