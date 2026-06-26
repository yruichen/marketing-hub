from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


SENSITIVE_KEYS = {
    'api_key',
    'apikey',
    'key',
    'token',
    'access_token',
    'refresh_token',
    'authorization',
    'password',
    'secret',
}

SECRET_PATTERNS = [
    re.compile(r'(Bearer\s+)[A-Za-z0-9._\-~+/]+=*', re.IGNORECASE),
    re.compile(r'((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|key)=)([^&\s]+)', re.IGNORECASE),
    re.compile(r'(sk-[A-Za-z0-9_\-]{8,})'),
]


def redact_text(value: str) -> str:
    redacted = str(value or '')
    for pattern in SECRET_PATTERNS:
        redacted = pattern.sub(lambda match: f'{match.group(1)}[redacted]' if len(match.groups()) > 1 else '[redacted]', redacted)
    return redacted


def redact_url(value: str) -> str:
    try:
        parts = urlsplit(value)
    except ValueError:
        return redact_text(value)
    if not parts.scheme or not parts.netloc:
        return redact_text(value)
    query = []
    for key, item in parse_qsl(parts.query, keep_blank_values=True):
        query.append((key, '[redacted]' if key.lower() in SENSITIVE_KEYS else item))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def redact_value(value: Any) -> Any:
    if isinstance(value, dict):
        return redact_mapping(value)
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_value(item) for item in value)
    if isinstance(value, str):
        if '://' in value:
            return redact_url(value)
        return redact_text(value)
    return value


def redact_mapping(value: dict[str, Any]) -> dict[str, Any]:
    redacted = {}
    for key, item in (value or {}).items():
        key_text = str(key)
        if key_text.lower() in SENSITIVE_KEYS:
            redacted[key_text] = '[redacted]'
        else:
            redacted[key_text] = redact_value(item)
    return redacted
