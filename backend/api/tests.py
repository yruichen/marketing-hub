from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from api.models import AIConfiguration, Asset, Campaign, Membership, Organization, Project, WorkflowTemplate, WorkspaceDraft


class WorkspaceUpgradeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.get(username='ROOT')
        self.organization = Organization.objects.create(name='Test Organization', slug='test-org')
        Membership.objects.create(user=self.user, organization=self.organization, role='admin')
        self.project = Project.objects.create(
            organization=self.organization,
            name='Spring Launch',
            slug='spring-launch',
            brief='Launch an editorial creator toolkit.',
            brand_context={
                'brand_name': 'Launchbook',
                'audience': 'content creators',
                'selling_points': 'fast campaign production',
            },
        )
        self.campaign = Campaign.objects.create(
            project=self.project,
            name='Wave One',
            objective='Validate the launch message',
        )
        AIConfiguration.objects.filter(provider='mock').update(is_active=True)
        self.client.login(username='ROOT', password='123')

    def test_copy_generation_returns_structured_payload(self):
        response = self.client.post('/api/generate/copy/', {
            'username': 'ROOT',
            'brand_name': 'Launchbook',
            'product_description': 'AI marketing workspace for creator teams',
            'tone': 'concise',
            'platform': 'Xiaohongshu',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        result = response.data['result']
        self.assertIn('title', result)
        self.assertIn('paragraphs', result)
        self.assertGreaterEqual(len(result['paragraphs']), 1)
        self.assertIn('tags', result)
        self.assertIn('call_to_action', result)
        self.assertEqual(result['platform'], 'Xiaohongshu')
        self.assertEqual(result['tone'], 'concise')
        self.assertEqual(response.data['task']['status'], 'succeeded')

    def test_content_package_generation_returns_structured_payload(self):
        AIConfiguration.objects.filter(provider='mock').update(is_active=True)
        response = self.client.post('/api/generate/content-package/', {
            'username': 'ROOT',
            'brief': 'Launch an AI marketing workspace for creator teams',
            'brand_name': 'Launchbook',
            'use_case': '新品上市',
            'audience': 'content creators',
            'tone': 'concise',
            'channels': ['Xiaohongshu'],
            'forbidden_words': '绝对',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        package = response.data['content_package']
        self.assertIn('title', package)
        self.assertIn('body', package)
        self.assertIn('tags', package)
        self.assertIn('storyboard', package)
        self.assertGreaterEqual(len(package['storyboard']), 1)
        self.assertIn('content_package:orchestration=copy+storyboard', response.data['logs'][0])

    def test_image_generation_returns_structured_payload(self):
        AIConfiguration.objects.filter(provider='mock').update(is_active=True)
        response = self.client.post('/api/generate/image/', {
            'username': 'ROOT',
            'prompt': 'A minimalist marketing desk setup',
            'style': 'editorial sketch',
            'aspect_ratio': '1:1',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        result = response.data['result']
        self.assertIn('image_url', result)
        self.assertTrue(result['image_url'])
        self.assertIn('revised_prompt', result)
        self.assertEqual(result['aspect_ratio'], '1:1')
        self.assertEqual(response.data['task']['status'], 'succeeded')

    def test_project_crud_updates_brand_memory(self):
        response = self.client.post('/api/projects/', {
            'organization': self.organization.slug,
            'name': 'Summer Launch',
            'brief': 'Summer product campaign',
            'brand_context': {'brand_name': 'Summerbook'},
        }, format='json')
        self.assertEqual(response.status_code, 201)
        project_id = response.data['id']

        response = self.client.patch(f'/api/projects/{project_id}/', {
            'brand_context': {
                'brand_name': 'Summerbook',
                'tone': 'bright and concise',
            },
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['brand_context']['tone'], 'bright and concise')

        response = self.client.delete(f'/api/projects/{project_id}/')
        self.assertEqual(response.status_code, 204)

    def test_workflow_run_persists_bound_assets_and_retry(self):
        draft = WorkspaceDraft.objects.create(
            organization=self.organization,
            project=self.project,
            campaign=self.campaign,
            name='Campaign Flow',
            brand_context=self.project.brand_context,
            nodes=[
                {
                    'id': 'context-1',
                    'type': 'context',
                    'label': 'Context',
                    'x': 10,
                    'y': 10,
                    'config': {'summary': 'Launchbook creator toolkit'},
                    'output': {},
                },
                {
                    'id': 'copy-1',
                    'type': 'copy',
                    'label': 'Copy',
                    'x': 200,
                    'y': 10,
                    'config': {'tone': 'concise', 'platform': 'Xiaohongshu'},
                    'output': {},
                },
            ],
            edges=[{'id': 'context-copy', 'source': 'context-1', 'target': 'copy-1'}],
        )

        response = self.client.post(f'/api/drafts/{draft.id}/run/', {'username': 'ROOT'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['draft']['status'], 'completed')
        self.assertEqual(len(response.data['tasks']), 1)
        self.assertTrue(Asset.objects.filter(project=self.project, campaign=self.campaign).exists())

        response = self.client.post(
            f'/api/drafts/{draft.id}/nodes/copy-1/retry/',
            {'username': 'ROOT', 'feedback': 'Make the opening more direct.'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['draft']['last_run_summary']['last_retry_node_id'], 'copy-1')
        self.assertEqual(response.data['task']['status'], 'succeeded')

    def test_template_can_be_forked_into_project_draft(self):
        template = WorkflowTemplate.objects.create(
            organization=self.organization,
            source_project=self.project,
            source_campaign=self.campaign,
            title='Reusable Creator Flow',
            brand_context=self.project.brand_context,
            nodes=[
                {
                    'id': 'copy-1',
                    'type': 'copy',
                    'label': 'Copy',
                    'x': 10,
                    'y': 10,
                    'config': {'platform': 'Xiaohongshu'},
                    'output': {},
                },
            ],
            edges=[],
        )

        response = self.client.post(f'/api/templates/{template.id}/fork/', {
            'project_id': self.project.id,
            'campaign_id': self.campaign.id,
            'name': 'Forked Flow',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['draft']['name'], 'Forked Flow')
        self.assertEqual(response.data['template']['fork_count'], 1)
