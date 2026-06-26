from __future__ import annotations

import base64
import hashlib
import hmac

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def _raw_key_material() -> str:
    configured = getattr(settings, 'FIELD_ENCRYPTION_KEY', '') or ''
    if configured:
        return configured.strip()
    if not getattr(settings, 'DEBUG', False) and not getattr(settings, 'RUNNING_TESTS', False):
        raise ImproperlyConfigured('FIELD_ENCRYPTION_KEY must be set when DEBUG=False.')
    return getattr(settings, 'SECRET_KEY', '')


def _fernet_key() -> bytes:
    material = _raw_key_material().encode('utf-8')
    if len(material) == 44:
        try:
            base64.urlsafe_b64decode(material)
            return material
        except Exception:
            pass
    digest = hashlib.sha256(material).digest()
    return base64.urlsafe_b64encode(digest)


def _fernet() -> Fernet:
    return Fernet(_fernet_key())


def encrypt_secret(value: str) -> str:
    raw = (value or '').strip()
    if not raw:
        return ''
    return _fernet().encrypt(raw.encode('utf-8')).decode('utf-8')


def decrypt_secret(value: str) -> str:
    encrypted = (value or '').strip()
    if not encrypted:
        return ''
    try:
        return _fernet().decrypt(encrypted.encode('utf-8')).decode('utf-8')
    except InvalidToken:
        return ''


def fingerprint_secret(value: str) -> str:
    raw = (value or '').strip()
    if not raw:
        return ''
    return hmac.new(_raw_key_material().encode('utf-8'), raw.encode('utf-8'), hashlib.sha256).hexdigest()
