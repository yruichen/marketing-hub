import json
import os
import sys
import time
import urllib.request

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from api.models import AIConfiguration
from ai_gateway.prompts import aspect_ratio_to_video_dimensions, extract_agnes_video_url, snap_agnes_num_frames


def main() -> None:
    key = (
        AIConfiguration.objects.filter(provider='agnes', is_active=True, config_scope='video').first()
        or AIConfiguration.objects.filter(provider='agnes', is_active=True).first()
    )
    api_key = (key.api_key or '').strip()
    base = (key.base_url or 'https://apihub.agnes-ai.com/v1').rstrip('/')
    headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}

    def request_json(method: str, url: str, payload: dict | None = None) -> dict:
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())

    cases = [
        ('landscape_81', 1152, 768, 81),
        ('portrait_81', 768, 1365, 81),
        ('portrait_121', 768, 1365, 121),
        ('portrait_241', 768, 1365, 241),
    ]

    for label, width, height, num_frames in cases:
        print(f'\n=== {label}: {width}x{height}, frames={num_frames} ===')
        try:
            created = request_json(
                'POST',
                f'{base}/videos',
                {
                    'model': 'agnes-video-v2.0',
                    'prompt': 'A cinematic marketing brand shot with smooth camera motion',
                    'width': width,
                    'height': height,
                    'num_frames': num_frames,
                    'frame_rate': 24,
                },
            )
        except Exception as exc:
            print('CREATE ERR', type(exc).__name__, str(exc)[:200])
            continue

        print('create:', {k: created.get(k) for k in ('id', 'status', 'video_id')})
        task_id = str(created.get('id') or '')
        if not task_id:
            print('no task id', created)
            continue

        for attempt in range(6):
            time.sleep(10)
            try:
                poll = request_json('GET', f'{base}/videos/{task_id}')
            except Exception as exc:
                print(f'poll {attempt + 1} ERR', type(exc).__name__, str(exc)[:160])
                continue
            status = poll.get('status')
            url = extract_agnes_video_url(poll)
            print(f'poll {attempt + 1}: status={status} url={url[:80] if url else ""}')
            if status in {'completed', 'succeeded', 'success'}:
                print('DONE', url)
                break
            if status in {'failed', 'error', 'cancelled', 'canceled'}:
                print('FAILED', poll)
                break


if __name__ == '__main__':
    main()
