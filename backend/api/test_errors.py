from django.contrib.auth.models import User
from django.test import RequestFactory, override_settings
from rest_framework.test import APITestCase

from api.errors import AppAPIException, _log_api_error, api_error_response, normalize_legacy_error_payload
from api.exception_handler import api_exception_handler
from api.models import Membership, Organization, PolicyDocument, UserConsent


def grant_required_policy_consents(user):
    for doc in PolicyDocument.objects.filter(is_active=True, policy_type__in=['terms', 'privacy']):
        UserConsent.objects.get_or_create(
            user=user,
            policy_type=doc.policy_type,
            policy_version=doc.version,
            defaults={'source': 'test'},
        )


class StructuredApiErrorTests(APITestCase):
    def test_log_api_error_does_not_use_reserved_logrecord_fields(self):
        # Regression: logging.extra must not include reserved keys like "message".
        _log_api_error(
            code='GENERATION_BUDGET_EXCEEDED',
            message='今日生成额度已用完。',
            status_code=402,
            debug_detail='budget exceeded',
            exception=AppAPIException(code='GENERATION_BUDGET_EXCEEDED'),
        )

    def test_legacy_error_payload_is_normalized(self):
        payload = normalize_legacy_error_payload(
            {'error': '该邮箱已注册。'},
            400,
        )
        self.assertEqual(payload['code'], 'HTTP_400')
        self.assertEqual(payload['message'], '该邮箱已注册。')
        self.assertEqual(payload['error'], '该邮箱已注册。')
        self.assertIn('action', payload)

    def test_project_limit_error_has_structured_fields(self):
        response = api_error_response(
            code='PROJECT_LIMIT_REACHED',
            message='当前方案最多可创建 3 个项目。',
            action='请升级订阅，或归档不再使用的项目。',
            status_code=402,
        )
        self.assertEqual(response.status_code, 402)
        self.assertEqual(response.data['code'], 'PROJECT_LIMIT_REACHED')
        self.assertIn('升级订阅', response.data['message'])
        self.assertEqual(response.data['error'], response.data['message'])

    @override_settings(DEBUG=True)
    def test_exception_handler_includes_debug_in_developer_mode(self):
        request = RequestFactory().get('/api/generate/copy/')
        request.id = 'req-test-1'
        exc = AppAPIException(code='GENERATION_BUDGET_EXCEEDED')
        response = api_exception_handler(exc, {'request': request, 'view': None})
        self.assertEqual(response.status_code, 402)
        self.assertEqual(response.data['code'], 'GENERATION_BUDGET_EXCEEDED')
        self.assertIn('debug', response.data)
        self.assertEqual(response.data['debug']['request_id'], 'req-test-1')

    @override_settings(GENERATION_DAILY_BUDGET_CENTS_DEFAULT=0)
    def test_generation_budget_endpoint_returns_structured_error(self):
        user = User.objects.create_user(username='budget-user', password='123', email='budget@example.com')
        org = Organization.objects.create(name='Budget Org', slug='budget-org')
        Membership.objects.create(user=user, organization=org, role='creator')
        grant_required_policy_consents(user)
        self.client.login(username='budget-user', password='123')
        response = self.client.post(
            '/api/generate/copy/',
            {
                'organization': org.slug,
                'brand_name': 'Budget',
                'product_description': 'Test',
            },
            format='json',
            HTTP_X_MH_DEBUG_ERRORS='1',
        )
        self.assertEqual(response.status_code, 402)
        self.assertEqual(response.data['code'], 'GENERATION_BUDGET_EXCEEDED')
        self.assertIn('额度', response.data['message'])
        self.assertIn('error', response.data)
        self.assertIn('debug', response.data)
