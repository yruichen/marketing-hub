from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel

from harness.contracts import ExecutionMode
from harness.contracts.errors import UnknownCapabilityError


@dataclass(frozen=True, slots=True)
class CapabilitySpec:
    name: str
    task_type: str
    prompt_key: str
    prompt_root: Path
    default_prompt_version: str
    execution_mode: ExecutionMode = ExecutionMode.COMPLETION
    input_model: type[BaseModel] | None = None
    output_model: type[BaseModel] | None = None
    result_model: type[BaseModel] | None = None
    strict_output: bool = True


class CapabilityRegistry:
    """Explicit capability registration; importing files never mutates the registry."""

    def __init__(self) -> None:
        self._by_name: dict[str, CapabilitySpec] = {}
        self._by_prompt_key: dict[str, CapabilitySpec] = {}

    def register(self, spec: CapabilitySpec) -> None:
        if spec.name in self._by_name:
            raise ValueError(f'Duplicate capability name: {spec.name}')
        if spec.prompt_key in self._by_prompt_key:
            raise ValueError(f'Duplicate prompt key: {spec.prompt_key}')
        self._by_name[spec.name] = spec
        self._by_prompt_key[spec.prompt_key] = spec

    def get(self, name: str) -> CapabilitySpec:
        try:
            return self._by_name[name]
        except KeyError as exc:
            raise UnknownCapabilityError(f'Unknown capability: {name}') from exc

    def for_prompt(self, prompt_key: str) -> CapabilitySpec:
        try:
            return self._by_prompt_key[prompt_key]
        except KeyError as exc:
            raise UnknownCapabilityError(f'Unknown prompt key: {prompt_key}') from exc

    def all(self) -> tuple[CapabilitySpec, ...]:
        return tuple(self._by_name.values())


def build_capability_registry() -> CapabilityRegistry:
    from harness.capabilities.audio.contract import AudioInput, AudioOutput, AudioResult
    from harness.capabilities.brainstorm.contract import BrainstormInput, BrainstormOutput
    from harness.capabilities.copy.contract import CopyInput, CopyOutput, CopyResult
    from harness.capabilities.custom_agent.contract import CustomAgentInput, CustomAgentOutput
    from harness.capabilities.image.contract import ImageInput, ImageOutput
    from harness.capabilities.image_prompt.contract import ImagePromptInput, ImagePromptOutput, ImagePromptResult
    from harness.capabilities.review.contract import ReviewInput, ReviewOutput
    from harness.capabilities.storyboard.contract import StoryboardInput, StoryboardOutput
    from harness.capabilities.video.contract import VideoInput, VideoOutput
    from harness.capabilities.workflow_edit.contract import WorkflowEditInput, WorkflowEditOutput

    root = Path(__file__).resolve().parent
    version = '2026-08-10.v3'
    specs = (
        ('assistant', 'assistant', 'assistant.global.system', ExecutionMode.AGENT, None, None, None, False),
        ('audio', 'audio', 'marketing.audio.system', ExecutionMode.COMPLETION, AudioInput, AudioOutput, AudioResult, True),
        ('brainstorm', 'brainstorm', 'marketing.brainstorm.system', ExecutionMode.COMPLETION, BrainstormInput, BrainstormOutput, BrainstormOutput, False),
        ('copy', 'copy', 'marketing.copy.system', ExecutionMode.COMPLETION, CopyInput, CopyOutput, CopyResult, True),
        ('custom_agent', 'custom_agent', 'marketing.custom_agent.system', ExecutionMode.COMPLETION, CustomAgentInput, CustomAgentOutput, CustomAgentOutput, True),
        ('image', 'image', 'marketing.image.system', ExecutionMode.COMPLETION, ImageInput, ImageOutput, ImageOutput, False),
        ('image_prompt', 'image_prompt', 'marketing.image_prompt.system', ExecutionMode.COMPLETION, ImagePromptInput, ImagePromptOutput, ImagePromptResult, True),
        ('review', 'review', 'marketing.review.system', ExecutionMode.COMPLETION, ReviewInput, ReviewOutput, ReviewOutput, True),
        ('storyboard', 'storyboard', 'marketing.storyboard.system', ExecutionMode.COMPLETION, StoryboardInput, StoryboardOutput, StoryboardOutput, True),
        ('video', 'video', 'marketing.video.system', ExecutionMode.COMPLETION, VideoInput, VideoOutput, VideoOutput, False),
        ('workflow_edit', 'workflow_edit', 'marketing.workflow_edit.system', ExecutionMode.COMPLETION, WorkflowEditInput, WorkflowEditOutput, WorkflowEditOutput, False),
    )
    registry = CapabilityRegistry()
    for name, task_type, prompt_key, mode, input_model, output_model, result_model, strict_output in specs:
        registry.register(
            CapabilitySpec(
                name=name,
                task_type=task_type,
                prompt_key=prompt_key,
                prompt_root=root / name / 'prompts',
                default_prompt_version=version,
                execution_mode=mode,
                input_model=input_model,
                output_model=output_model,
                result_model=result_model,
                strict_output=strict_output,
            )
        )
    return registry
