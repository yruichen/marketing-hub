from django.contrib.auth.models import User
from django.test import Client, SimpleTestCase
from rest_framework.test import APITestCase

from ai_gateway.content_package import assemble_content_package
from ai_gateway.services import ModelPolicy
from api.models import AIConfiguration
from ai_gateway.prompts import (
    aspect_ratio_to_size,
    build_copy_messages,
    build_image_generation_prompt,
    build_storyboard_messages,
    normalize_copy_result,
    normalize_image_result,
    normalize_storyboard_result,
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


class StoryboardPromptTests(SimpleTestCase):
    def test_build_storyboard_messages_includes_duration_and_feedback(self):
        messages = build_storyboard_messages({
            'video_topic': 'Coffee shop morning',
            'duration': 30,
            'target_audience': 'Young creators',
            'feedback': 'Make the opening hook stronger.',
        })
        self.assertEqual(messages[0]['role'], 'system')
        self.assertIn('30 seconds', messages[1]['content'])
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


class ImagePromptTests(SimpleTestCase):
    def test_aspect_ratio_to_size_mapping(self):
        self.assertEqual(aspect_ratio_to_size('16:9'), '1024x768')
        self.assertEqual(aspect_ratio_to_size('4:5'), '768x1024')

    def test_build_image_generation_prompt_includes_style(self):
        prompt = build_image_generation_prompt({
            'prompt': 'A product hero shot',
            'style': 'neo-brutalism',
            'aspect_ratio': '1:1',
        })
        self.assertIn('A product hero shot', prompt)
        self.assertIn('neo-brutalism', prompt)

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
