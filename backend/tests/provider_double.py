from __future__ import annotations

from typing import Any

from api.models import AIConfiguration, Organization
from harness.adapters.providers import ProviderAdapter


class DeterministicProviderAdapter(ProviderAdapter):
    """Network-free provider double; never imported by production modules."""

    provider_name = 'local_proxy'

    def invoke(
        self,
        prompt: str,
        *,
        model_name: str,
        task_type: str,
        payload: dict[str, Any],
        messages: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        if task_type == 'copy':
            return {
                'title': 'Verified test title',
                'paragraphs': ['Verified test paragraph.'],
                'tags': ['test'],
                'call_to_action': 'Review the test result.',
            }
        if task_type == 'image':
            return {
                'prompt': str(payload.get('prompt') or 'test image'),
                'aspect_ratio': str(payload.get('aspect_ratio') or '1:1'),
                'image_url': 'https://assets.test.invalid/image.png',
                'generated_images': 1,
            }
        if task_type == 'storyboard':
            return {
                'video_topic': str(payload.get('video_topic') or 'Test video'),
                'total_duration_seconds': int(payload.get('duration') or 30),
                'target_audience': str(payload.get('target_audience') or 'Test audience'),
                'scenes': [{
                    'scene_number': 1,
                    'visual_description': 'A testable wide shot.',
                    'audio_narration': 'A test narration line.',
                    'duration_seconds': int(payload.get('duration') or 30),
                }],
            }
        if task_type == 'image_prompt':
            return {
                'prompt': 'A test-ready product image prompt.',
                'prompt_localized': 'Test image prompt',
                'negative_prompt': '',
                'composition_notes': 'Centered composition.',
            }
        if task_type == 'review':
            return {
                'passed': True,
                'brand_consistency_score': 90,
                'sensitive_word_issues': [],
                'channel_rule_issues': [],
                'summary': 'The test content satisfies the supplied rules.',
                'revised_suggestions': [],
            }
        if task_type == 'audio':
            return {
                'optimized_text': str(payload.get('text') or ''),
                'voice_direction': 'Read clearly at the requested pace.',
                'estimated_duration_seconds': 5,
                'pause_markers': [],
            }
        if task_type == 'video':
            return {
                'video_topic': str(payload.get('video_topic') or 'Test video'),
                'video_url': 'https://assets.test.invalid/video.mp4',
                'duration_seconds': int(payload.get('duration') or 5),
                'aspect_ratio': str(payload.get('aspect_ratio') or '16:9'),
                'id': 'test-video-task',
            }
        if task_type == 'custom_agent':
            return {
                'response': 'Deterministic agent result.',
                'metadata': {'notes': 'Test-only response.', 'limitations': []},
            }
        if task_type == 'brainstorm':
            return {
                'workflow_name': 'Test workflow',
                'brand_context': {},
                'nodes': [{
                    'id': 'context-1', 'type': 'context', 'label': 'Test context',
                    'x': 0, 'y': 0, 'width': 260, 'height': 166,
                    'config': {'summary': str(payload.get('idea') or 'Test input')},
                }],
                'edges': [],
                'summary': 'Deterministic workflow.',
            }
        if task_type == 'workflow_edit':
            workflow = payload.get('workflow') if isinstance(payload.get('workflow'), dict) else {}
            nodes = [dict(node) for node in workflow.get('nodes') or []]
            changed_node_ids: list[str] = []
            target_id = str(payload.get('node_id') or '')
            if payload.get('mode') == 'node' and target_id:
                for node in nodes:
                    if str(node.get('id') or '') != target_id:
                        continue
                    config = dict(node.get('config') or {})
                    config['ai_edit_instruction'] = str(payload.get('instruction') or '')
                    node['config'] = config
                    changed_node_ids.append(target_id)
                    break
            return {
                'nodes': nodes,
                'edges': list(workflow.get('edges') or []),
                'summary': 'Deterministic workflow edit.',
                'changed_node_ids': changed_node_ids,
            }
        return {'response': 'Deterministic response.'}


def configure_test_provider(organization: Organization | None = None) -> AIConfiguration:
    return AIConfiguration.objects.create(
        provider='local_proxy',
        organization=organization,
        base_url='http://provider.test.invalid/v1',
        model_name='deterministic-test-model',
        config_scope='all',
        billing_mode='platform' if organization is None else 'byok',
        is_active=True,
    )
