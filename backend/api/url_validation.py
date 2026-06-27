from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

from rest_framework.exceptions import ValidationError


def validate_external_https_url(value: str) -> str:
    url = (value or '').strip()
    if not url:
        return ''
    if len(url) > 600:
        raise ValidationError({'source_url': 'source_url must be 600 characters or fewer.'})
    parsed = urlparse(url)
    if parsed.scheme.lower() != 'https':
        raise ValidationError({'source_url': 'source_url must use https://.'})
    if not parsed.hostname:
        raise ValidationError({'source_url': 'source_url must include a hostname.'})
    host = parsed.hostname.lower()
    if host in {'localhost'} or host.endswith('.localhost') or host.endswith('.local'):
        raise ValidationError({'source_url': 'source_url cannot target local hosts.'})
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return url
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
        raise ValidationError({'source_url': 'source_url cannot target private or internal addresses.'})
    return url
