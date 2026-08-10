from django.conf import settings
from django.test import SimpleTestCase


class CorsSettingsTests(SimpleTestCase):
    def test_frontend_debug_header_is_allowed(self):
        self.assertIn('x-mh-debug-errors', settings.CORS_ALLOW_HEADERS)
