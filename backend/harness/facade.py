from __future__ import annotations

from typing import Any

from harness.bootstrap import capability_registry, generation_runner
from harness.contracts import GatewayResponse, RunContext, RunRequest, RunResult


def run(request: RunRequest) -> RunResult:
    """Stable provider-neutral entry point for a harness execution."""
    return generation_runner().run(request)


class HarnessFacade:
    """Compatibility bridge while Django callers migrate to ``run`` contracts."""

    @classmethod
    def execute(
        cls,
        *,
        organization: Any | None,
        role: str | None,
        task_type: str,
        payload: dict[str, Any],
        prompt_key: str,
    ) -> GatewayResponse:
        spec = capability_registry().for_prompt(prompt_key)
        if spec.task_type != task_type:
            raise ValueError(
                f'Prompt {prompt_key!r} belongs to {spec.task_type!r}, not {task_type!r}.'
            )
        request = RunRequest(
            capability=spec.name,
            input=payload,
            context=RunContext(
                organization_id=getattr(organization, 'pk', None),
                role=role,
                output_locale=str(payload.get('output_locale') or payload.get('locale') or 'zh-CN'),
            ),
            prompt_version=str(payload.get('prompt_version') or '') or None,
            prompt_locale=str(payload.get('prompt_locale') or 'en-US'),
        )
        return GatewayResponse.from_run_result(run(request))

    @staticmethod
    def render_generation_prompt(capability: str, payload: dict[str, Any]) -> str:
        """Render a model-facing media prompt through the stable harness boundary."""
        if capability == 'image':
            from harness.capabilities.image.capability import build_image_generation_prompt

            return build_image_generation_prompt(payload)
        if capability == 'video':
            from harness.capabilities.video.capability import build_video_generation_prompt

            return build_video_generation_prompt(payload)
        raise ValueError(f'Capability {capability!r} does not expose a generation prompt.')

    @staticmethod
    def normalize_locale(locale: str | None) -> str:
        from harness.localization import normalize_output_locale

        return normalize_output_locale(locale)

    @staticmethod
    def localize(key: str, locale: str | None, **values: object) -> str:
        from harness.localization import localize

        return localize(key, locale, **values)


__all__ = ['HarnessFacade', 'run']
