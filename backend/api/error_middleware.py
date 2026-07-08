from __future__ import annotations

import json
import logging

from api.errors import normalize_legacy_error_payload

logger = logging.getLogger(__name__)


class ErrorResponseNormalizationMiddleware:
    """Normalize legacy `{error: ...}` JSON responses into structured API errors."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if response.status_code < 400:
            return response

        content_type = response.get('Content-Type', '')
        if 'application/json' not in content_type:
            return response

        try:
            raw = getattr(response, 'content', b'')
            if not raw:
                return response
            data = json.loads(raw.decode(response.charset or 'utf-8'))
            if not isinstance(data, dict) or data.get('code'):
                return response
            normalized = normalize_legacy_error_payload(data, response.status_code, request)
            response.content = json.dumps(normalized, ensure_ascii=False).encode('utf-8')
            if response.get('Content-Length'):
                response['Content-Length'] = str(len(response.content))
        except Exception:
            logger.debug('error_response_normalization_skipped', exc_info=True)
        return response
