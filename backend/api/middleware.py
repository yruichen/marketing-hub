from __future__ import annotations

import uuid

from api.request_context import request_id_var


class RequestIDMiddleware:
    header_name = 'HTTP_X_REQUEST_ID'
    response_header = 'X-Request-ID'

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        incoming = str(request.META.get(self.header_name) or '').strip()
        request_id = incoming[:128] if incoming else uuid.uuid4().hex
        request.id = request_id
        token = request_id_var.set(request_id)
        try:
            response = self.get_response(request)
            response[self.response_header] = request_id
            return response
        finally:
            request_id_var.reset(token)
