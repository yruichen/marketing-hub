from __future__ import annotations

from ai_gateway.prompt_catalog import prompt_registry_snapshot

AGNES_DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1'
AGNES_DEFAULT_MODEL = 'agnes-2.0-flash'
AGNES_DEFAULT_IMAGE_MODEL = 'agnes-image-2.0-flash'
AGNES_DEFAULT_VIDEO_MODEL = 'agnes-video-v2.0'

CAPABILITY_REGISTRY = {
    'openai': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
    'agnes': {'text', 'vision', 'image', 'video', 'function_calling'},
    'anthropic': {'text', 'vision', 'function_calling'},
    'gemini': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
    'mock': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
    'local_proxy': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
}

MODEL_CAPABILITIES = {
    'gpt-4o-mini': {'provider': 'openai', 'capabilities': CAPABILITY_REGISTRY['openai']},
    'agnes-2.0-flash': {'provider': 'agnes', 'capabilities': CAPABILITY_REGISTRY['agnes']},
    'agnes-image-2.0-flash': {'provider': 'agnes', 'capabilities': CAPABILITY_REGISTRY['agnes']},
    'claude-3-5-sonnet': {'provider': 'anthropic', 'capabilities': CAPABILITY_REGISTRY['anthropic']},
    'gemini-2.0-flash': {'provider': 'gemini', 'capabilities': CAPABILITY_REGISTRY['gemini']},
    'mock': {'provider': 'mock', 'capabilities': CAPABILITY_REGISTRY['mock']},
}

PROMPT_REGISTRY = prompt_registry_snapshot()

JSON_RESPONSE_TASK_TYPES = frozenset({
    'copy', 'storyboard', 'custom_agent', 'brainstorm', 'image_prompt', 'review', 'audio',
})

SAFETY_BLOCKLIST = {'illegal', 'copyright infringement', 'weapon instruction'}

IMAGE_RUNTIME_PROVIDERS = frozenset({'mock', 'agnes'})
VIDEO_RUNTIME_PROVIDERS = frozenset({'mock', 'agnes'})
TEXT_TASK_TYPES = frozenset({'copy', 'storyboard'})
IMAGE_TASK_TYPES = frozenset({'image'})
AUDIO_TASK_TYPES = frozenset({'audio'})
VIDEO_TASK_TYPES = frozenset({'video'})
