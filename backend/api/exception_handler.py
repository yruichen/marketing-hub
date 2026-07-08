from __future__ import annotations

import logging
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    Throttled,
    ValidationError,
)
from rest_framework.views import exception_handler as drf_exception_handler

from api.errors import (
    AppAPIException,
    ERROR_CATALOG,
    _catalog_for_code,
    _looks_user_facing,
    api_error_response,
    build_error_body,
    should_include_debug,
    _log_api_error,
)

logger = logging.getLogger(__name__)


def _field_errors(exc: ValidationError) -> dict[str, Any] | None:
    detail = exc.detail
    if isinstance(detail, dict):
        return {
            key: value[0] if isinstance(value, list) and value else str(value)
            for key, value in detail.items()
        }
    return None


def _validation_message(errors: dict[str, Any] | None, fallback: str) -> str:
    if not errors:
        return fallback
    parts = [f'{key}: {value}' for key, value in errors.items()]
    joined = '；'.join(parts)
    if _looks_user_facing(joined):
        return joined
    return fallback


def _throttle_code(detail: str) -> str:
    lowered = detail.lower()
    if 'running' in lowered:
        return 'GENERATION_RUNNING_LIMIT'
    if 'queued' in lowered and 'organization' in lowered:
        return 'GENERATION_QUEUED_LIMIT'
    if 'queue' in lowered:
        return 'GENERATION_QUEUE_FULL'
    if 'suspended' in lowered:
        return 'GENERATION_SUSPENDED'
    return 'RATE_LIMITED'


def _exception_to_payload(exc: Exception, context: dict[str, Any]) -> tuple[dict[str, Any], int]:
    request = context.get('request')
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    code = 'SERVER_ERROR'
    message = ERROR_CATALOG['SERVER_ERROR'].message
    action = ERROR_CATALOG['SERVER_ERROR'].action
    retryable = True
    errors: dict[str, Any] | None = None
    extra: dict[str, Any] | None = None
    debug_detail = str(exc)

    if isinstance(exc, AppAPIException):
        status_code = exc.status_code
        code = exc.error_code
        spec = _catalog_for_code(code)
        message = exc.user_message
        action = exc.user_action or (spec.action if spec else '')
        retryable = exc.retryable
        debug_detail = str(exc.detail)
    elif isinstance(exc, ValidationError):
        status_code = status.HTTP_400_BAD_REQUEST
        code = 'VALIDATION_ERROR'
        errors = _field_errors(exc)
        spec = ERROR_CATALOG['VALIDATION_ERROR']
        message = _validation_message(errors, spec.message)
        action = spec.action
        debug_detail = str(exc.detail)
    elif isinstance(exc, DjangoValidationError):
        status_code = status.HTTP_400_BAD_REQUEST
        code = 'VALIDATION_ERROR'
        spec = ERROR_CATALOG['VALIDATION_ERROR']
        message = '；'.join(exc.messages) if exc.messages else spec.message
        action = spec.action
        debug_detail = message
    elif isinstance(exc, Throttled):
        status_code = status.HTTP_429_TOO_MANY_REQUESTS
        detail = str(exc.detail)
        code = _throttle_code(detail)
        spec = _catalog_for_code(code) or ERROR_CATALOG['RATE_LIMITED']
        message = spec.message
        action = spec.action
        retryable = spec.retryable
        extra = {'retry_after': exc.wait}
        debug_detail = detail
    elif isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
        status_code = status.HTTP_401_UNAUTHORIZED
        spec = ERROR_CATALOG['AUTH_REQUIRED']
        code = spec.code
        detail = str(exc.detail)
        message = detail if _looks_user_facing(detail) else spec.message
        action = spec.action
        debug_detail = detail
    elif isinstance(exc, (PermissionDenied, DjangoPermissionDenied)):
        status_code = status.HTTP_403_FORBIDDEN
        detail = str(exc.detail) if isinstance(exc, APIException) else str(exc)
        if 'consent' in detail.lower() or 'policy' in detail.lower() or '条款' in detail:
            spec = ERROR_CATALOG['POLICY_CONSENT_REQUIRED']
        else:
            spec = ERROR_CATALOG['PERMISSION_DENIED']
        code = spec.code
        message = detail if _looks_user_facing(detail) else spec.message
        action = spec.action
        debug_detail = detail
    elif isinstance(exc, (NotFound, Http404)):
        status_code = status.HTTP_404_NOT_FOUND
        spec = ERROR_CATALOG['NOT_FOUND']
        code = spec.code
        detail = str(exc.detail) if isinstance(exc, APIException) else str(exc)
        message = detail if _looks_user_facing(detail) else spec.message
        action = spec.action
        debug_detail = detail
    elif isinstance(exc, APIException):
        status_code = exc.status_code
        detail = str(exc.detail)
        default_code = getattr(exc, 'default_code', 'api_error')
        code = str(getattr(exc, 'code', default_code) or default_code).upper()
        spec = _catalog_for_code(code)
        if code == 'PAYMENT_REQUIRED' or status_code == 402:
            if 'credit' in detail.lower():
                spec = ERROR_CATALOG['GENERATION_CREDITS_INSUFFICIENT']
            else:
                spec = ERROR_CATALOG['GENERATION_BUDGET_EXCEEDED']
            code = spec.code
        message = detail if _looks_user_facing(detail) else (spec.message if spec else detail or '操作失败。')
        action = spec.action if spec else '请稍后重试。'
        retryable = spec.retryable if spec else False
        debug_detail = detail
    else:
        logger.exception('unhandled_exception', exc_info=exc)
        debug_detail = str(exc)

    debug = None
    if should_include_debug(request):
        debug = {
            'detail': debug_detail,
            'exception': exc.__class__.__name__,
            'status': status_code,
        }
        request_id = getattr(request, 'id', None) if request is not None else None
        if request_id:
            debug['request_id'] = request_id

    body = build_error_body(
        code=code,
        message=message,
        action=action,
        retryable=retryable,
        errors=errors,
        extra=extra,
        debug=debug,
    )
    _log_api_error(code=code, message=message, status_code=status_code, debug_detail=debug_detail, exception=exc)
    return body, status_code


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        body, status_code = _exception_to_payload(exc, context)
        response.data = body
        response.status_code = status_code
        return response

    if isinstance(exc, Exception):
        body, status_code = _exception_to_payload(exc, context)
        return Response(body, status=status_code)

    return response
