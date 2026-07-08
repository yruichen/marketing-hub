from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response

logger = logging.getLogger(__name__)

DEBUG_HEADER = 'HTTP_X_MH_DEBUG_ERRORS'


@dataclass(frozen=True)
class ErrorSpec:
    code: str
    message: str
    action: str = ''
    retryable: bool = False


# Stable machine codes -> user-facing Chinese copy.
ERROR_CATALOG: dict[str, ErrorSpec] = {
    'VALIDATION_ERROR': ErrorSpec(
        code='VALIDATION_ERROR',
        message='提交的信息有误或缺少必填项。',
        action='请检查标红字段后重试。',
    ),
    'AUTH_REQUIRED': ErrorSpec(
        code='AUTH_REQUIRED',
        message='需要先登录才能继续。',
        action='请登录后重试。',
    ),
    'PERMISSION_DENIED': ErrorSpec(
        code='PERMISSION_DENIED',
        message='你没有权限执行此操作。',
        action='请联系管理员调整权限。',
    ),
    'NOT_FOUND': ErrorSpec(
        code='NOT_FOUND',
        message='请求的内容不存在或已被删除。',
        action='请刷新页面后重试。',
    ),
    'RATE_LIMITED': ErrorSpec(
        code='RATE_LIMITED',
        message='操作过于频繁。',
        action='请稍后再试。',
        retryable=True,
    ),
    'GENERATION_BUDGET_EXCEEDED': ErrorSpec(
        code='GENERATION_BUDGET_EXCEEDED',
        message='今日生成额度已用完。',
        action='请升级订阅、联系管理员发放额度，或明天再试。',
        retryable=False,
    ),
    'GENERATION_CREDITS_INSUFFICIENT': ErrorSpec(
        code='GENERATION_CREDITS_INSUFFICIENT',
        message='组织可用额度不足。',
        action='请查看计费页或联系管理员充值。',
    ),
    'GENERATION_SUSPENDED': ErrorSpec(
        code='GENERATION_SUSPENDED',
        message='当前组织的生成功能已被临时暂停。',
        action='请联系管理员了解原因。',
    ),
    'GENERATION_QUEUE_FULL': ErrorSpec(
        code='GENERATION_QUEUE_FULL',
        message='生成队列繁忙，暂时无法接收新任务。',
        action='请等待现有任务完成后再试。',
        retryable=True,
    ),
    'GENERATION_RUNNING_LIMIT': ErrorSpec(
        code='GENERATION_RUNNING_LIMIT',
        message='同时运行的生成任务过多。',
        action='请等待当前任务完成后再提交。',
        retryable=True,
    ),
    'GENERATION_QUEUED_LIMIT': ErrorSpec(
        code='GENERATION_QUEUED_LIMIT',
        message='排队中的生成任务过多。',
        action='请等待队列消化后再提交。',
        retryable=True,
    ),
    'PROJECT_LIMIT_REACHED': ErrorSpec(
        code='PROJECT_LIMIT_REACHED',
        message='当前方案可创建的项目数已达上限。',
        action='请升级订阅，或归档不再使用的项目。',
    ),
    'POLICY_CONSENT_REQUIRED': ErrorSpec(
        code='POLICY_CONSENT_REQUIRED',
        message='需要先同意最新服务条款和隐私政策。',
        action='点击页面顶部的「同意并继续」后重试。',
    ),
    'PAYMENT_REQUIRED': ErrorSpec(
        code='PAYMENT_REQUIRED',
        message='当前额度或订阅不足以继续。',
        action='请查看计费页或联系管理员。',
    ),
    'SERVER_ERROR': ErrorSpec(
        code='SERVER_ERROR',
        message='服务器处理请求时出错。',
        action='请稍后重试；若持续失败请联系管理员。',
        retryable=True,
    ),
}


class AppAPIException(APIException):
    """Structured API exception with stable code and user-facing copy."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'bad_request'
    default_detail = '请求无效。'
    default_action = '请检查输入后重试。'
    retryable = False

    def __init__(
        self,
        detail: str | None = None,
        *,
        code: str | None = None,
        message: str | None = None,
        action: str | None = None,
        retryable: bool | None = None,
        status_code: int | None = None,
    ):
        spec = ERROR_CATALOG.get(code or '')
        resolved_message = message or (detail if detail and _looks_user_facing(str(detail)) else None) or (spec.message if spec else None)
        resolved_action = action or (spec.action if spec else None) or self.default_action
        resolved_code = code or self.default_code
        if status_code is not None:
            self.status_code = status_code
        if retryable is not None:
            self.retryable = retryable
        elif spec:
            self.retryable = spec.retryable

        self.error_code = resolved_code
        self.user_message = resolved_message or str(detail or self.default_detail)
        self.user_action = resolved_action
        super().__init__(detail=detail or self.user_message, code=resolved_code)


def _looks_user_facing(text: str) -> bool:
    stripped = (text or '').strip()
    if not stripped:
        return False
    if re.search(r'[\u4e00-\u9fff]', stripped):
        return True
    if re.match(r'^(GET|POST|PATCH|PUT|DELETE)\s+/', stripped):
        return False
    return len(stripped) <= 240 and not stripped.startswith('Traceback')


def _catalog_for_code(code: str | None) -> ErrorSpec | None:
    if not code:
        return None
    normalized = code.upper().replace('-', '_')
    if normalized in ERROR_CATALOG:
        return ERROR_CATALOG[normalized]
    for key, spec in ERROR_CATALOG.items():
        if key in normalized or normalized in key:
            return spec
    return None


def _infer_code_from_message(message: str, http_status: int) -> str | None:
    lowered = (message or '').lower()
    if http_status == 402 or '额度' in message or 'upgrade' in lowered or 'budget' in lowered or 'credit' in lowered:
        if '项目' in message:
            return 'PROJECT_LIMIT_REACHED'
        if 'credit' in lowered or '额度' in message:
            return 'GENERATION_CREDITS_INSUFFICIENT'
        return 'GENERATION_BUDGET_EXCEEDED'
    if http_status == 429 or 'too many' in lowered or 'rate' in lowered or '频繁' in message:
        return 'RATE_LIMITED'
    if http_status == 403 and ('条款' in message or 'consent' in lowered or 'policy' in lowered):
        return 'POLICY_CONSENT_REQUIRED'
    if http_status == 403:
        return 'PERMISSION_DENIED'
    if http_status == 401:
        return 'AUTH_REQUIRED'
    if http_status == 404:
        return 'NOT_FOUND'
    if http_status >= 500:
        return 'SERVER_ERROR'
    return None


def should_include_debug(request=None) -> bool:
    if getattr(settings, 'DEBUG', False):
        return True
    if getattr(settings, 'API_ERROR_DEBUG', False):
        return True
    if request is not None and str(request.META.get(DEBUG_HEADER) or '').strip() == '1':
        return True
    return False


def build_error_body(
    *,
    code: str,
    message: str,
    action: str = '',
    retryable: bool = False,
    errors: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
    debug: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        'code': code,
        'message': message,
        'action': action,
        'retryable': retryable,
        # Legacy compatibility for existing clients/tests.
        'error': message,
    }
    if errors:
        body['errors'] = errors
    if extra:
        body.update(extra)
    if debug:
        body['debug'] = debug
    return body


def api_error_response(
    *,
    code: str,
    message: str,
    action: str = '',
    retryable: bool = False,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    errors: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
    request=None,
    debug_detail: str | None = None,
    exception: BaseException | None = None,
) -> Response:
    spec = _catalog_for_code(code)
    resolved_message = message or (spec.message if spec else '操作失败。')
    resolved_action = action or (spec.action if spec else '')
    resolved_retryable = retryable or (spec.retryable if spec else False)

    debug: dict[str, Any] | None = None
    if should_include_debug(request):
        debug = {
            'detail': debug_detail or resolved_message,
            'exception': exception.__class__.__name__ if exception else None,
            'status': status_code,
        }
        request_id = getattr(request, 'id', None) if request is not None else None
        if request_id:
            debug['request_id'] = request_id

    body = build_error_body(
        code=code,
        message=resolved_message,
        action=resolved_action,
        retryable=resolved_retryable,
        errors=errors,
        extra=extra,
        debug=debug,
    )
    _log_api_error(code=code, message=resolved_message, status_code=status_code, debug_detail=debug_detail, exception=exception)
    return Response(body, status=status_code)


def normalize_legacy_error_payload(data: dict[str, Any], http_status: int, request=None) -> dict[str, Any]:
    if not isinstance(data, dict) or data.get('code'):
        return data

    legacy_message = ''
    if isinstance(data.get('message'), str):
        legacy_message = data['message']
    elif isinstance(data.get('error'), str):
        legacy_message = data['error']
    elif isinstance(data.get('detail'), str):
        legacy_message = data['detail']
    elif isinstance(data.get('detail'), list):
        legacy_message = '；'.join(str(item) for item in data['detail'])

    code = _infer_code_from_message(legacy_message, http_status) or f'HTTP_{http_status}'
    spec = _catalog_for_code(code)
    message = legacy_message or (spec.message if spec else '操作失败。')
    if spec and not _looks_user_facing(legacy_message):
        message = spec.message

    action = spec.action if spec else ''
    retryable = spec.retryable if spec else http_status in {429, 502, 503}

    extra = {
        key: value
        for key, value in data.items()
        if key not in {'error', 'detail', 'message', 'errors'}
    }

    debug = None
    if should_include_debug(request):
        debug = {
            'legacy': data,
            'status': http_status,
        }
        request_id = getattr(request, 'id', None) if request is not None else None
        if request_id:
            debug['request_id'] = request_id

    normalized = build_error_body(
        code=code,
        message=message,
        action=action,
        retryable=retryable,
        errors=data.get('errors') if isinstance(data.get('errors'), dict) else None,
        extra=extra or None,
        debug=debug,
    )
    return normalized


def _log_api_error(
    *,
    code: str,
    message: str,
    status_code: int,
    debug_detail: str | None = None,
    exception: BaseException | None = None,
) -> None:
    payload = {
        'error_code': code,
        'error_message': message,
        'http_status': status_code,
        'error_detail': debug_detail or message,
        'exception_type': exception.__class__.__name__ if exception else None,
    }
    if status_code >= 500:
        logger.error('api_error', extra=payload, exc_info=exception)
    else:
        logger.warning('api_error', extra=payload)
