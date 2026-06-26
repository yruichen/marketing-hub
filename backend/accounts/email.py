import json
import urllib.error
import urllib.request

from django.conf import settings


class EmailDeliveryError(RuntimeError):
    pass


def send_transactional_email(*, to_email: str, subject: str, text: str, html: str = '') -> None:
    if settings.EMAIL_PROVIDER == 'resend':
        _send_resend_email(to_email=to_email, subject=subject, text=text, html=html)
        return

    print('\n--- Marketing Hub email (console provider) ---')
    print(f'To: {to_email}')
    print(f'Subject: {subject}')
    print(text)
    print('--- end email ---\n')


def _send_resend_email(*, to_email: str, subject: str, text: str, html: str = '') -> None:
    if not settings.RESEND_API_KEY:
        raise EmailDeliveryError('RESEND_API_KEY is required when EMAIL_PROVIDER=resend.')

    payload = {
        'from': settings.DEFAULT_FROM_EMAIL,
        'to': [to_email],
        'subject': subject,
        'text': text,
    }
    if html:
        payload['html'] = html

    request = urllib.request.Request(
        'https://api.resend.com/emails',
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {settings.RESEND_API_KEY}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'MarketingHub/1.0 (+https://yruichen.tech)',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            if response.status >= 300:
                raise EmailDeliveryError(f'Resend email failed with status {response.status}.')
    except urllib.error.HTTPError as exc:
        body = exc.read().decode('utf-8', errors='replace')[:600]
        raise EmailDeliveryError(f'Resend email failed with status {exc.code}: {body}') from exc
    except urllib.error.URLError as exc:
        raise EmailDeliveryError(f'Resend email failed: {exc.reason}') from exc
