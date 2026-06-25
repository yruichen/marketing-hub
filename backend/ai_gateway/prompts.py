"""Compatibility facade for prompt builders and normalizers.

Task-specific implementations live in ``ai_gateway.prompt_modules`` so prompt
engineering changes can evolve without growing one catch-all module.
"""

from ai_gateway.prompt_modules.audio import (
    AUDIO_JSON_SCHEMA_HINT,
    AUDIO_SYSTEM_PROMPT,
    build_audio_messages,
    normalize_audio_result,
)
from ai_gateway.prompt_modules.brainstorm import (
    BRAINSTORM_JSON_SCHEMA_HINT,
    BRAINSTORM_SYSTEM_PROMPT,
    _BRAINSTORM_NODE_CONFIG_HINTS,
    _layout_brainstorm_nodes,
    build_brainstorm_messages,
    normalize_brainstorm_result,
)
from ai_gateway.prompt_modules.copy import (
    COPY_JSON_SCHEMA_HINT,
    COPY_SYSTEM_PROMPT,
    PLATFORM_FEW_SHOT,
    PLATFORM_GUIDANCE,
    _platform_hint,
    build_copy_messages,
    normalize_copy_result,
)
from ai_gateway.prompt_modules.custom_agent import (
    CUSTOM_AGENT_JSON_SCHEMA_HINT,
    CUSTOM_AGENT_SYSTEM_PROMPT,
    build_custom_agent_messages,
    normalize_custom_agent_result,
)
from ai_gateway.prompt_modules.image import (
    ASPECT_RATIO_SIZE_MAP,
    IMAGE_PROMPT_JSON_SCHEMA_HINT,
    IMAGE_PROMPT_SYSTEM_PROMPT,
    aspect_ratio_to_size,
    build_image_generation_prompt,
    build_image_prompt_messages,
    normalize_image_prompt_result,
    normalize_image_result,
)
from ai_gateway.prompt_modules.review import (
    REVIEW_JSON_SCHEMA_HINT,
    REVIEW_SYSTEM_PROMPT,
    build_review_messages,
    normalize_review_result,
)
from ai_gateway.prompt_modules.storyboard import (
    STORYBOARD_JSON_SCHEMA_HINT,
    STORYBOARD_SYSTEM_PROMPT,
    build_storyboard_messages,
    normalize_storyboard_result,
)
from ai_gateway.prompt_modules.video import (
    AGNES_VIDEO_ALLOWED_FRAMES,
    AGNES_VIDEO_DEFAULT_FRAME_RATE,
    MOCK_VIDEO_THUMBNAIL,
    MOCK_VIDEO_URL,
    aspect_ratio_to_video_dimensions,
    build_video_generation_prompt,
    extract_agnes_video_url,
    normalize_video_result,
    snap_agnes_num_frames,
)

__all__ = [
    'AGNES_VIDEO_ALLOWED_FRAMES',
    'AGNES_VIDEO_DEFAULT_FRAME_RATE',
    'ASPECT_RATIO_SIZE_MAP',
    'AUDIO_JSON_SCHEMA_HINT',
    'AUDIO_SYSTEM_PROMPT',
    'BRAINSTORM_JSON_SCHEMA_HINT',
    'BRAINSTORM_SYSTEM_PROMPT',
    'COPY_JSON_SCHEMA_HINT',
    'COPY_SYSTEM_PROMPT',
    'CUSTOM_AGENT_JSON_SCHEMA_HINT',
    'CUSTOM_AGENT_SYSTEM_PROMPT',
    'IMAGE_PROMPT_JSON_SCHEMA_HINT',
    'IMAGE_PROMPT_SYSTEM_PROMPT',
    'MOCK_VIDEO_THUMBNAIL',
    'MOCK_VIDEO_URL',
    'PLATFORM_FEW_SHOT',
    'PLATFORM_GUIDANCE',
    'REVIEW_JSON_SCHEMA_HINT',
    'REVIEW_SYSTEM_PROMPT',
    'STORYBOARD_JSON_SCHEMA_HINT',
    'STORYBOARD_SYSTEM_PROMPT',
    '_BRAINSTORM_NODE_CONFIG_HINTS',
    '_layout_brainstorm_nodes',
    '_platform_hint',
    'aspect_ratio_to_size',
    'aspect_ratio_to_video_dimensions',
    'build_audio_messages',
    'build_brainstorm_messages',
    'build_copy_messages',
    'build_custom_agent_messages',
    'build_image_generation_prompt',
    'build_image_prompt_messages',
    'build_review_messages',
    'build_storyboard_messages',
    'build_video_generation_prompt',
    'extract_agnes_video_url',
    'normalize_audio_result',
    'normalize_brainstorm_result',
    'normalize_copy_result',
    'normalize_custom_agent_result',
    'normalize_image_prompt_result',
    'normalize_image_result',
    'normalize_review_result',
    'normalize_storyboard_result',
    'normalize_video_result',
    'snap_agnes_num_frames',
]
