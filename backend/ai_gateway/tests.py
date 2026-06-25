import asyncio
import json

from django.contrib.auth.models import User
from django.test import Client, SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from ai_gateway.content_package import assemble_content_package
from ai_gateway.prompt_catalog import PROMPT_ASSETS, get_prompt_asset, prompt_registry_snapshot
from ai_gateway.services import AIModelGateway, ModelPolicy, NonRetryableGatewayError
from api.models import AIConfiguration, AssistantMessage, AssistantSession, Membership, Organization, Project
from ai_gateway.prompts import (
    aspect_ratio_to_size,
    aspect_ratio_to_video_dimensions,
    build_copy_messages,
    build_image_generation_prompt,
    build_image_prompt_messages,
    build_review_messages,
    build_storyboard_messages,
    build_video_generation_prompt,
    extract_agnes_video_url,
    normalize_copy_result,
    normalize_image_prompt_result,
    normalize_image_result,
    normalize_review_result,
    normalize_storyboard_result,
    snap_agnes_num_frames,
)


class CopyPromptTests(SimpleTestCase):
    def test_build_copy_messages_includes_platform_and_feedback(self):
        messages = build_copy_messages({
            'brand_name': 'Launchbook',
            'product_description': 'AI marketing workspace',
            'tone': 'concise',
            'platform': 'Xiaohongshu',
            'feedback': 'Make the hook sharper.',
        })
        self.assertEqual(messages[0]['role'], 'system')
        self.assertIn('Make the hook sharper.', messages[1]['content'])

    def test_normalize_copy_result_fills_defaults(self):
        normalized = normalize_copy_result(
            {'title': 'Test Title', 'paragraphs': ['Line 1'], 'tags': ['a'], 'call_to_action': 'Buy now'},
            {'brand_name': 'Brand', 'tone': 'warm', 'platform': 'WeChat'},
        )
        self.assertEqual(normalized['title'], 'Test Title')
        self.assertEqual(normalized['platform'], 'WeChat')


class PromptCatalogTests(SimpleTestCase):
    def test_prompt_catalog_tracks_required_metadata(self):
        asset = get_prompt_asset('marketing.copy.system')
        self.assertIsNotNone(asset)
        self.assertEqual(asset.task_type, 'copy')
        self.assertTrue(asset.version.startswith('2026-06-25'))
        self.assertGreaterEqual(len(asset.quality_bar), 3)
        self.assertIn('marketing.review.system', prompt_registry_snapshot())

    def test_prompt_catalog_covers_content_generation_prompts(self):
        required_keys = {
            'marketing.copy.system',
            'marketing.storyboard.system',
            'marketing.image.system',
            'marketing.image_prompt.system',
            'marketing.review.system',
            'marketing.audio.system',
            'marketing.video.system',
            'marketing.custom_agent.system',
            'marketing.brainstorm.system',
        }
        self.assertTrue(required_keys.issubset(set(PROMPT_ASSETS)))


class StoryboardPromptTests(SimpleTestCase):
    def test_build_storyboard_messages_includes_duration_and_feedback(self):
        messages = build_storyboard_messages({
            'video_topic': 'Coffee shop morning',
            'duration': 30,
            'target_audience': 'Young creators',
            'feedback': 'Make the opening hook stronger.',
        })
        self.assertEqual(messages[0]['role'], 'system')
        self.assertIn('30 秒', messages[1]['content'])
        self.assertIn('Make the opening hook stronger.', messages[1]['content'])

    def test_normalize_storyboard_result_balances_scene_durations(self):
        normalized = normalize_storyboard_result(
            {
                'video_topic': 'Launch video',
                'total_duration_seconds': 30,
                'target_audience': 'Marketers',
                'scenes': [
                    {'scene_number': 1, 'visual_description': 'Wide shot', 'audio_narration': 'Intro', 'duration_seconds': 5},
                    {'scene_number': 2, 'visual_description': 'Close-up', 'audio_narration': 'Value', 'duration_seconds': 5},
                    {'scene_number': 3, 'visual_description': 'End card', 'audio_narration': 'CTA', 'duration_seconds': 5},
                ],
            },
            {'video_topic': 'Launch video', 'duration': 30, 'target_audience': 'Marketers'},
        )
        self.assertEqual(normalized['total_duration_seconds'], 30)
        self.assertEqual(len(normalized['scenes']), 3)
        self.assertEqual(sum(scene['duration_seconds'] for scene in normalized['scenes']), 30)


class ContentPackageTests(SimpleTestCase):
    def test_assemble_content_package_maps_copy_and_storyboard(self):
        package = assemble_content_package(
            {
                'title': 'Launch Title',
                'paragraphs': ['Paragraph one', 'Paragraph two'],
                'tags': ['tag-a', 'tag-b'],
                'platform': '小红书',
            },
            {
                'scenes': [
                    {
                        'scene_number': 1,
                        'visual_description': 'Wide shot',
                        'audio_narration': 'Intro line',
                        'duration_seconds': 10,
                    }
                ],
            },
            {
                'brand_name': 'Launchbook',
                'use_case': '新品上市',
                'audience': 'Creators',
                'tone': '清晰专业',
                'forbidden_words': '绝对',
            },
        )
        self.assertEqual(package['title'], 'Launch Title')
        self.assertIn('Paragraph one', package['body'])
        self.assertEqual(package['tags'], ['tag-a', 'tag-b'])
        self.assertTrue(package['storyboard'][0].startswith('镜头 1'))
        self.assertIn('Intro line', package['voiceover'])
        self.assertTrue(any('绝对' in item for item in package['reviewAdvice']))


class ModelPolicyTests(APITestCase):
    def test_select_configuration_picks_lane_specific_active_config(self):
        AIConfiguration.objects.filter(is_active=True).update(is_active=False)
        AIConfiguration.objects.create(
            provider='openai',
            api_key='test-key',
            model_name='gpt-4o-mini',
            config_scope='text',
            is_active=True,
        )
        AIConfiguration.objects.create(
            provider='agnes',
            api_key='test-key',
            model_name='',
            image_model_name='agnes-image-2.0-flash',
            config_scope='image',
            is_active=True,
        )

        text_config = ModelPolicy.select_configuration(organization=None, task_type='copy', role='admin')
        image_config = ModelPolicy.select_configuration(organization=None, task_type='image', role='admin')

        self.assertEqual(text_config.provider, 'openai')
        self.assertEqual(image_config.provider, 'agnes')
        self.assertEqual(image_config.image_model_name, 'agnes-image-2.0-flash')

    def test_gateway_logs_prompt_catalog_metadata(self):
        AIConfiguration.objects.filter(is_active=True).update(is_active=False)
        response = AIModelGateway.execute(
            organization=None,
            role='admin',
            task_type='copy',
            payload={
                'brand_name': 'Launchbook',
                'product_description': 'AI marketing workspace',
                'tone': 'concise',
                'platform': 'Xiaohongshu',
            },
            prompt_key='marketing.copy.system',
        )
        self.assertIn('gateway:prompt_version=2026-06-25.v1', response.logs)
        self.assertIn('gateway:prompt_owner=content-generation', response.logs)
        self.assertIn('gateway:prompt_risk=medium', response.logs)

    @override_settings(AI_ALLOW_MOCK_PROVIDER=False)
    def test_gateway_rejects_mock_provider_when_disabled(self):
        AIConfiguration.objects.filter(is_active=True).update(is_active=False)

        with self.assertRaises(NonRetryableGatewayError):
            AIModelGateway.execute(
                organization=None,
                role='admin',
                task_type='copy',
                payload={
                    'brand_name': 'Launchbook',
                    'product_description': 'AI marketing workspace',
                    'tone': 'concise',
                    'platform': 'Xiaohongshu',
                },
                prompt_key='marketing.copy.system',
            )


class ImagePromptEngineTests(SimpleTestCase):
    def test_build_image_prompt_messages_includes_style_skill(self):
        messages = build_image_prompt_messages({
            'brand_name': 'Launchbook',
            'subject': '夏季新品护肤套装',
            'style': '明亮通透的桌面场景',
            'style_skill': 'xiaohongshu_lifestyle',
            'aspect_ratio': '4:5',
            'platform': '小红书',
        })
        self.assertEqual(messages[0]['role'], 'system')
        self.assertIn('xiaohongshu_lifestyle', messages[1]['content'])
        self.assertIn('夏季新品护肤套装', messages[1]['content'])

    def test_normalize_image_prompt_result_fills_defaults(self):
        normalized = normalize_image_prompt_result(
            {'prompt': 'A product hero shot on marble desk', 'prompt_zh': '大理石桌面产品主视觉'},
            {'style_skill': 'product_studio', 'style': '产品棚拍', 'aspect_ratio': '1:1'},
        )
        self.assertIn('product hero shot', normalized['prompt'])
        self.assertEqual(normalized['style_skill'], 'product_studio')


class ReviewPromptTests(SimpleTestCase):
    def test_build_review_messages_includes_forbidden_words(self):
        messages = build_review_messages({
            'content_title': '测试标题',
            'content_body': '正文内容',
            'forbidden_words': '绝对,第一',
            'platform': '小红书',
        })
        self.assertIn('绝对,第一', messages[1]['content'])

    def test_normalize_review_result_coerces_issues(self):
        normalized = normalize_review_result(
            {
                'passed': False,
                'brand_consistency_score': 60,
                'sensitive_word_issues': ['绝对'],
                'channel_rule_issues': [{'rule': '标题过长', 'context': '标题', 'suggestion': '缩短'}],
                'summary': '需修改',
            },
            {},
        )
        self.assertFalse(normalized['passed'])
        self.assertEqual(normalized['sensitive_word_issues'][0]['word'], '绝对')


class ImageGenerationPromptTests(SimpleTestCase):
    def test_build_image_generation_prompt_uses_style_skill(self):
        prompt = build_image_generation_prompt({
            'prompt': '品牌主视觉',
            'style_skill': 'minimal_flat',
            'aspect_ratio': '1:1',
        })
        self.assertIn('品牌主视觉', prompt)
        self.assertIn('极简构图', prompt)


class VideoPromptTests(SimpleTestCase):
    def test_snap_agnes_num_frames_uses_allowed_values(self):
        self.assertEqual(snap_agnes_num_frames(5), 121)
        self.assertEqual(snap_agnes_num_frames(18), 441)

    def test_aspect_ratio_to_video_dimensions_vertical(self):
        width, height = aspect_ratio_to_video_dimensions('9:16')
        self.assertLess(width, height)

    def test_build_video_generation_prompt_from_storyboard_scenes(self):
        prompt = build_video_generation_prompt({
            'video_topic': '新品发布',
            'scenes': [
                {'visual_description': '产品特写', 'audio_narration': '开场介绍'},
            ],
        })
        self.assertIn('Shot 1', prompt)
        self.assertIn('产品特写', prompt)

    def test_extract_agnes_video_url_supports_remixed_field(self):
        url = extract_agnes_video_url({'status': 'completed', 'remixed_from_video_id': 'https://cdn.example.com/a.mp4'})
        self.assertEqual(url, 'https://cdn.example.com/a.mp4')


class ImagePromptHelperTests(SimpleTestCase):
    def test_aspect_ratio_to_size_mapping(self):
        self.assertEqual(aspect_ratio_to_size('16:9'), '1024x768')
        self.assertEqual(aspect_ratio_to_size('4:5'), '768x1024')

    def test_build_image_generation_prompt_includes_style(self):
        prompt = build_image_generation_prompt({
            'prompt': 'A product hero shot',
            'style_skill': 'minimal_flat',
            'aspect_ratio': '1:1',
        })
        self.assertIn('A product hero shot', prompt)
        self.assertIn('极简构图', prompt)

    def test_normalize_image_result_supports_openai_style_response(self):
        normalized = normalize_image_result(
            {'data': [{'url': 'https://example.com/image.png'}], 'generated_images': 1},
            {'prompt': 'Test', 'style': 'minimalist', 'aspect_ratio': '1:1'},
        )
        self.assertEqual(normalized['image_url'], 'https://example.com/image.png')
        self.assertEqual(normalized['aspectRatio'], '1:1')


class AIConfigPermissionTests(APITestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.user = User.objects.get(username='ROOT')

    def test_post_ai_config_allows_demo_username_without_session(self):
        csrf_response = self.client.get('/api/ai/config/')
        csrf_token = csrf_response.headers.get('X-CSRFToken') or self.client.cookies['csrftoken'].value
        response = self.client.post(
            '/api/ai/config/',
            {
                'provider': 'mock',
                'api_key': '',
                'model_name': 'gpt-mock-agent',
                'billing_mode': 'platform',
                'username': 'ROOT',
            },
            content_type='application/json',
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(response.status_code, 200, response.content)


class AssistantAgentTests(APITestCase):
    def setUp(self):
        self.user = User.objects.get(username='ROOT')
        self.organization = Organization.objects.create(
            name='Agent Test Org', slug='agent-test-org'
        )
        Membership.objects.create(user=self.user, organization=self.organization, role='admin')
        self.project = Project.objects.create(
            organization=self.organization,
            name='Agent Test Project',
            slug='agent-test-project',
        )
        from ai_gateway.tools import ToolContext
        self.ctx = ToolContext(organization=self.organization, user=self.user, session_id=1)

    def _collect(self, agent, messages):
        async def _run():
            out = []
            async for step in agent.run_streaming(messages=messages, ctx=self.ctx):
                out.append(step)
            return out
        return asyncio.run(_run())

    def test_plain_text_terminates_with_done(self):
        from ai_gateway.agent import AssistantAgent
        agent = AssistantAgent(llm=_PlainEchoLlm())
        msgs = agent.build_messages(
            history=[], page_context=None, user_message='hello'
        )
        steps = self._collect(agent, msgs)
        self.assertEqual(steps[-1].type, 'done')
        self.assertTrue(any(s.type == 'text' for s in steps))

    def test_tool_call_round_trip_executes_and_appends(self):
        from ai_gateway.agent import AssistantAgent
        from ai_gateway.tools import ToolRegistry, ToolSpec, ToolContext
        # Register a single in-memory tool that doesn't touch the DB.
        # Avoids SQLite-threading issues with sync_to_async under tests.
        async def _echo(ctx, args):
            return {'echoed': args}

        registry = ToolRegistry()
        registry.register(ToolSpec(
            name='list_projects',
            description='test stub',
            parameters={'type': 'object', 'properties': {}},
            handler=_echo,
        ))
        agent = AssistantAgent(registry=registry, llm=_ToolCallLlm(tool_name='list_projects'))
        msgs = agent.build_messages(
            history=[], page_context=None, user_message='列出我最近的项目'
        )
        steps = self._collect(agent, msgs)
        types = [s.type for s in steps]
        self.assertIn('tool_call', types)
        self.assertIn('tool_result', types)
        self.assertEqual(steps[-1].type, 'done')
        # The stub echoed the args we passed (empty dict).
        result_step = next(s for s in steps if s.type == 'tool_result')
        self.assertEqual(result_step.name, 'list_projects')
        self.assertEqual(result_step.result, {'echoed': {}})

    def test_max_steps_caps_loop(self):
        from ai_gateway.agent import AssistantAgent
        # LLM that always wants a different tool, never converging
        agent = AssistantAgent(
            llm=_ToolCallLlm(tool_name='list_projects'), max_steps=2
        )
        msgs = agent.build_messages(
            history=[], page_context=None, user_message='ping'
        )
        steps = self._collect(agent, msgs)
        # 2 steps → 2 tool_call + 2 tool_result + final 'done'
        self.assertEqual(steps[-1].type, 'done')
        self.assertLessEqual(
            sum(1 for s in steps if s.type == 'tool_call'),
            2,
        )

    def test_history_messages_pass_through(self):
        from ai_gateway.agent import AssistantAgent
        agent = AssistantAgent(llm=_PlainEchoLlm())
        history = [
            {'role': 'user', 'content': 'first'},
            {'role': 'assistant', 'content': 'hi'},
        ]
        msgs = agent.build_messages(
            history=history, page_context={'tab': 'projects'}, user_message='second'
        )
        # system + page context + history × 2 + new user
        self.assertEqual(msgs[0]['role'], 'system')
        self.assertEqual(msgs[1]['role'], 'system')
        self.assertEqual(msgs[2]['content'], 'first')
        self.assertEqual(msgs[-1]['content'], 'second')


class _PlainEchoLlm:
    """Test LLM that returns plain text only."""

    async def chat(self, *, messages, tools=None, tool_choice='auto'):
        user_msg = next(
            (m['content'] for m in reversed(messages) if m.get('role') == 'user'),
            '',
        )
        return {
            'choices': [{'message': {'role': 'assistant', 'content': f'echo: {user_msg}'}}],
            'usage': {'prompt_tokens': 5, 'completion_tokens': 5},
        }


class _ToolCallLlm:
    """Test LLM that always emits a single tool_call to the given name."""

    def __init__(self, tool_name: str) -> None:
        self.tool_name = tool_name

    async def chat(self, *, messages, tools=None, tool_choice='auto'):
        return {
            'choices': [
                {
                    'message': {
                        'role': 'assistant',
                        'content': None,
                        'tool_calls': [
                            {
                                'id': 'call_test_1',
                                'type': 'function',
                                'function': {
                                    'name': self.tool_name,
                                    'arguments': '{}',
                                },
                            }
                        ],
                    }
                }
            ],
            'usage': {'prompt_tokens': 10, 'completion_tokens': 5},
        }


def _parse_sse(body: str) -> list[dict]:
    """Tiny SSE parser for tests. Each `data: {...}` line → one dict."""
    out = []
    for line in body.splitlines():
        line = line.strip()
        if line.startswith('data: '):
            try:
                out.append(json.loads(line[len('data: '):]))
            except json.JSONDecodeError:
                pass
    return out


class AssistantSessionCrudTests(APITestCase):
    def setUp(self):
        self.client_ = Client(enforce_csrf_checks=True)
        self.user = User.objects.get(username='ROOT')
        self.organization = Organization.objects.create(
            name='Assistant View Test', slug='asst-view-test'
        )
        Membership.objects.create(
            user=self.user, organization=self.organization, role='admin'
        )
        # Authenticate via demo session cookie
        self.client_.login(username='ROOT', password='123')

    def _csrf(self):
        resp = self.client_.get('/api/ai/config/')
        return resp.headers.get('X-CSRFToken') or self.client_.cookies['csrftoken'].value

    def test_create_session_returns_serialized_payload(self):
        csrf = self._csrf()
        resp = self.client_.post(
            '/api/assistant/sessions',
            {'title': '我的第一个会话'},
            content_type='application/json',
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertEqual(body['title'], '我的第一个会话')
        self.assertIn('id', body)

    def test_list_sessions_returns_recent(self):
        for i in range(3):
            AssistantSession.objects.create(
                organization=self.organization, user=self.user,
                title=f'session {i}',
            )
        csrf = self._csrf()
        resp = self.client_.get(
            '/api/assistant/sessions',
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(len(body['sessions']), 3)

    def test_patch_renames_session(self):
        session = AssistantSession.objects.create(
            organization=self.organization, user=self.user,
        )
        csrf = self._csrf()
        resp = self.client_.patch(
            f'/api/assistant/sessions/{session.id}',
            {'title': '重命名后的会话'},
            content_type='application/json',
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(resp.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.title, '重命名后的会话')

    def test_delete_removes_session(self):
        session = AssistantSession.objects.create(
            organization=self.organization, user=self.user,
        )
        csrf = self._csrf()
        resp = self.client_.delete(
            f'/api/assistant/sessions/{session.id}',
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(
            AssistantSession.objects.filter(pk=session.id).exists()
        )

    def test_get_messages_returns_history(self):
        session = AssistantSession.objects.create(
            organization=self.organization, user=self.user,
        )
        AssistantMessage.objects.create(
            session=session, role='user', content='hi'
        )
        AssistantMessage.objects.create(
            session=session, role='assistant', content='hello'
        )
        csrf = self._csrf()
        resp = self.client_.get(
            f'/api/assistant/sessions/{session.id}/messages',
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(len(body['messages']), 2)

    def test_sessions_isolated_by_organization(self):
        # Other org session must not be visible
        other = Organization.objects.create(name='Other', slug='other-org-1')
        other_session = AssistantSession.objects.create(
            organization=other, user=self.user, title='foreign'
        )
        csrf = self._csrf()
        resp = self.client_.patch(
            f'/api/assistant/sessions/{other_session.id}',
            {'title': 'hack'},
            content_type='application/json',
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(resp.status_code, 404)


class AssistantChatStreamingTests(APITestCase):
    def setUp(self):
        from ai_gateway.agent import AssistantAgent
        self.user = User.objects.get(username='ROOT')
        self.organization = Organization.objects.create(
            name='Chat Stream Test', slug='chat-stream-test'
        )
        Membership.objects.create(
            user=self.user, organization=self.organization, role='admin'
        )
        # Monkey-patch the default agent with a plain-text LLM.
        from ai_gateway import agent as agent_mod
        from ai_gateway.tests import _PlainEchoLlm
        self._orig_agent_cls = agent_mod.AssistantAgent
        agent_mod.AssistantAgent = lambda **kw: AssistantAgent(llm=_PlainEchoLlm())
        self.addCleanup(lambda: setattr(agent_mod, 'AssistantAgent', self._orig_agent_cls))
        self.client_ = Client(enforce_csrf_checks=True)
        self.client_.login(username='ROOT', password='123')

    def _csrf(self):
        resp = self.client_.get('/api/ai/config/')
        return resp.headers.get('X-CSRFToken') or self.client_.cookies['csrftoken'].value

    def _body(self, resp) -> str:
        """Streaming responses need streaming_content; concat into a string."""
        return b''.join(resp.streaming_content).decode('utf-8')

    def test_chat_stream_emits_text_then_done(self):
        from ai_gateway.views import AssistantChatView
        from django.test import RequestFactory
        rf = RequestFactory()
        factory_req = rf.post(
            '/api/assistant/chat',
            {'message': '你好助手', 'page_context': {'tab': 'projects'}},
            content_type='application/json',
        )
        factory_req.session = self.client_.session
        view = AssistantChatView.as_view()
        view_resp = view(factory_req)
        # Django's StreamingHttpResponse: drain by iterating streaming_content
        body = b''.join(chunk for chunk in view_resp.streaming_content).decode('utf-8')
        self.assertEqual(view_resp['Content-Type'], 'text/event-stream')
        events = _parse_sse(body)
        types = [e['type'] for e in events]
        self.assertIn('text', types, f'no text event in: {events}')
        self.assertEqual(types[-1], 'done')
        self.assertIn('session_id', events[-1])

    def test_chat_persists_user_and_assistant_messages(self):
        from ai_gateway.views import AssistantChatView
        from django.test import RequestFactory
        rf = RequestFactory()
        factory_req = rf.post(
            '/api/assistant/chat',
            {'message': '测试持久化'},
            content_type='application/json',
        )
        factory_req.session = self.client_.session
        view = AssistantChatView.as_view()
        view_resp = view(factory_req)
        body = b''.join(chunk for chunk in view_resp.streaming_content).decode('utf-8')
        events = _parse_sse(body)
        done = events[-1]
        session_id = done['session_id']
        session = AssistantSession.objects.get(pk=session_id)
        roles = list(session.messages.values_list('role', flat=True))
        self.assertEqual(roles[0], 'user')
        self.assertIn('assistant', roles)
        user_msg = session.messages.filter(role='user').first()
        self.assertEqual(user_msg.content, '测试持久化')

    def test_chat_rejects_empty_message(self):
        csrf = self._csrf()
        resp = self.client_.post(
            '/api/assistant/chat',
            {'message': '   '},
            content_type='application/json',
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(resp.status_code, 400)
