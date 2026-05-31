from __future__ import annotations

ROLE_ORDER = {
    'viewer': 0,
    'ops': 1,
    'creator': 2,
    'admin': 3,
}

ROLE_MATRIX = {
    'viewer': {'read'},
    'ops': {'read', 'export', 'retry', 'billing_read'},
    'creator': {'read', 'write', 'generate', 'export'},
    'admin': {'read', 'write', 'generate', 'export', 'billing_write', 'member_write', 'key_write', 'delete'},
}


def role_rank(role: str | None) -> int:
    return ROLE_ORDER.get((role or 'viewer').lower(), 0)


def role_at_least(role: str | None, minimum: str) -> bool:
    return role_rank(role) >= role_rank(minimum)


def permissions_for_role(role: str | None) -> set[str]:
    return set(ROLE_MATRIX.get((role or 'viewer').lower(), ROLE_MATRIX['viewer']))

