from django.contrib.auth.models import User
from decimal import Decimal
from rest_framework.test import APITestCase

from api.models import AIConfiguration, Asset, Campaign, CommunityCreation, CreditLedgerEntry, GenerationTask, Membership, Organization, Project, UsageEvent, UserProfile, WorkflowNodeRun, WorkflowRun, WorkflowRunEvent, WorkflowTemplate, WorkspaceDraft


class AdminConsoleSeparationTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.get(username='ROOT')
        self.demo = User.objects.get(username='DEMO')
        self.member = User.objects.create_user(username='member-user', password='123', email='member@example.com')
        self.organization = Organization.objects.create(name='Member Org', slug='member-org')
        Membership.objects.create(user=self.member, organization=self.organization, role='admin')

    def test_superuser_must_use_admin_login(self):
        org_count = Organization.objects.count()
        response = self.client.post('/api/auth/login/', {'username': 'ROOT', 'password': '123'}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(response.data['admin_login_required'])
        self.assertEqual(Organization.objects.count(), org_count)

    def test_admin_login_sets_admin_mode_without_workspace_payload(self):
        response = self.client.post('/api/admin-auth/login/', {'username': 'ROOT', 'password': '123'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['admin_mode'])
        self.assertNotIn('organization', response.data)

        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['admin_mode'])
        self.assertNotIn('project', response.data)

    def test_non_superuser_cannot_use_admin_console(self):
        self.client.login(username='member-user', password='123')
        response = self.client.get('/api/admin-console/users/')
        self.assertEqual(response.status_code, 403)

    def test_user_credit_grant_targets_user_organization_ledger(self):
        self.client.post('/api/admin-auth/login/', {'username': 'ROOT', 'password': '123'}, format='json')
        response = self.client.post(
            f'/api/admin-console/users/{self.member.id}/credit-grants/',
            {'organization_id': self.organization.id, 'amount_cents': 2500, 'reason': 'seed credits'},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        entry = CreditLedgerEntry.objects.get(organization=self.organization, source='grant')
        self.assertEqual(entry.delta_cents, 2500)
        self.assertEqual(entry.balance_after_cents, 2500)
        self.assertEqual(entry.metadata['target_user_id'], self.member.id)
        self.assertEqual(entry.metadata['source'], 'admin_console_user_grant')

    def test_admin_action_prevents_self_lock(self):
        self.client.post('/api/admin-auth/login/', {'username': 'ROOT', 'password': '123'}, format='json')
        response = self.client.post(f'/api/admin-console/users/{self.admin.id}/actions/freeze/', {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_demo_account_is_not_admin(self):
        self.assertFalse(self.demo.is_superuser)
        self.assertFalse(self.demo.is_staff)
        response = self.client.post('/api/auth/login/', {'username': 'DEMO', 'password': '123'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['demo_account'])
        self.assertFalse(response.data['is_superuser'])


class CreatorProfileTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='profile-user', password='123', email='profile@example.com')
        self.viewer = User.objects.create_user(username='viewer-user', password='123', email='viewer@example.com')
        self.organization = Organization.objects.create(name='Profile Org', slug='profile-org')
        Membership.objects.create(user=self.user, organization=self.organization, role='creator')
        Membership.objects.create(user=self.viewer, organization=self.organization, role='viewer')
        CommunityCreation.objects.create(
            organization=self.organization,
            username='profile-user',
            creation_type='copy',
            title='Launch Copy',
            content='{"title": "Launch Copy", "paragraphs": ["Hello"]}',
            likes=3,
        )
        CommunityCreation.objects.create(
            organization=self.organization,
            username='profile-user',
            creation_type='image',
            title='Launch Visual',
            content='{"prompt": "editorial desk"}',
            likes=5,
        )

    def test_profile_me_requires_login(self):
        response = self.client.get('/api/profiles/me/')
        self.assertIn(response.status_code, (401, 403))

    def test_profile_me_returns_profile_stats_and_creations(self):
        self.client.login(username='profile-user', password='123')
        response = self.client.get('/api/profiles/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['profile']['username'], 'profile-user')
        self.assertEqual(response.data['profile']['display_name'], 'profile-user')
        self.assertTrue(response.data['is_owner'])
        self.assertEqual(response.data['stats']['creation_count'], 2)
        self.assertEqual(response.data['stats']['total_likes'], 8)
        self.assertEqual(len(response.data['creations']), 2)

    def test_profile_patch_validates_urls_lengths_and_lists(self):
        self.client.login(username='profile-user', password='123')
        response = self.client.patch('/api/profiles/me/', {
            'display_name': 'Creator One',
            'headline': 'Brand workflow strategist',
            'bio': 'Makes launch kits.',
            'location': 'Shanghai',
            'website_url': 'https://example.com',
            'avatar_url': 'https://example.com/avatar.png',
            'banner_url': 'https://example.com/banner.png',
            'specialties': ['Launch', 'Copy'],
            'social_links': [{'label': 'LinkedIn', 'url': 'https://linkedin.com/in/creator'}],
            'profile_visibility': 'workspace',
            'status': 'suspended',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        profile = UserProfile.objects.get(user=self.user)
        self.assertEqual(profile.display_name, 'Creator One')
        self.assertEqual(profile.status, 'pending')

        response = self.client.patch('/api/profiles/me/', {
            'website_url': 'not-a-url',
            'bio': 'x' * 501,
            'specialties': [str(index) for index in range(9)],
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('website_url', response.data['errors'])
        self.assertIn('bio', response.data['errors'])
        self.assertIn('specialties', response.data['errors'])

    def test_public_profile_lookup(self):
        self.client.login(username='viewer-user', password='123')
        response = self.client.get('/api/profiles/profile-user/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_owner'])
        self.assertEqual(response.data['profile']['username'], 'profile-user')

        response = self.client.get('/api/profiles/missing-user/')
        self.assertEqual(response.status_code, 404)


class WorkspaceUpgradeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='workspace-user', password='123')
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
        self.client.login(username='workspace-user', password='123')

    def test_copy_generation_returns_structured_payload(self):
        response = self.client.post('/api/generate/copy/', {
            'username': 'DEMO',
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
            'username': 'DEMO',
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
            'username': 'DEMO',
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

        response = self.client.post(f'/api/drafts/{draft.id}/run/', {'username': 'DEMO'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('workflow_run', response.data)
        self.assertEqual(response.data['draft']['status'], 'completed')
        self.assertEqual(response.data['workflow_run']['status'], 'succeeded')
        self.assertEqual(response.data['workflow_run']['total_nodes'], 2)
        self.assertEqual(response.data['workflow_run']['completed_nodes'], 2)
        self.assertEqual(len(response.data['tasks']), 1)
        self.assertTrue(Asset.objects.filter(project=self.project, campaign=self.campaign).exists())
        workflow_run_id = response.data['workflow_run']['id']
        workflow_asset = Asset.objects.get(metadata__generation_task_id=response.data['tasks'][0]['id'])
        self.assertEqual(workflow_asset.metadata['source'], 'workflow')
        self.assertEqual(workflow_asset.metadata['workflow_run_id'], workflow_run_id)
        self.assertEqual(workflow_asset.metadata['workflow_node_id'], 'copy-1')
        self.assertIn(workflow_asset.id, response.data['workflow_run']['summary']['asset_ids'])
        self.assertTrue(WorkflowRun.objects.filter(pk=workflow_run_id, draft=draft).exists())
        self.assertEqual(WorkflowNodeRun.objects.filter(workflow_run_id=workflow_run_id).count(), 2)
        self.assertTrue(WorkflowRunEvent.objects.filter(workflow_run_id=workflow_run_id, event_type='asset_saved').exists())
        self.assertTrue(WorkflowRunEvent.objects.filter(workflow_run_id=workflow_run_id, event_type='run_completed').exists())

        detail = self.client.get(f'/api/workflow-runs/{workflow_run_id}/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['id'], workflow_run_id)
        self.assertEqual(len(detail.data['node_runs']), 2)

        assets_response = self.client.get(
            f'/api/workspace/assets/?organization=test-org&source=workflow&workflow_run={workflow_run_id}'
        )
        self.assertEqual(assets_response.status_code, 200)
        self.assertEqual(assets_response.data['total'], 1)
        self.assertEqual(assets_response.data['source_counts']['workflow'], 1)
        self.assertEqual(assets_response.data['items'][0]['metadata']['workflow_node_id'], 'copy-1')

        response = self.client.post(
            f'/api/drafts/{draft.id}/nodes/copy-1/retry/',
            {'username': 'DEMO', 'feedback': 'Make the opening more direct.'},
            format='json',
            HTTP_IDEMPOTENCY_KEY='retry-copy-1',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['draft']['last_run_summary']['last_retry_node_id'], 'copy-1')
        self.assertIn('last_retry_workflow_run_id', response.data['draft']['last_run_summary'])
        self.assertEqual(response.data['workflow_run']['idempotency_key'], 'retry-copy-1')
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

    def test_billing_plans_include_usage_summary_and_project_count_after_update(self):
        UsageEvent.objects.create(
            organization=self.organization,
            project=self.project,
            campaign=self.campaign,
            provider='mock',
            model_name='mock-copy',
            prompt_tokens=80,
            completion_tokens=20,
            total_tokens=100,
            cost_usd=Decimal('0.0123'),
        )

        response = self.client.get('/api/billing/plans/?organization=test-org')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['project_count'], 1)
        self.assertIn('usage_summary', response.data)
        self.assertEqual(response.data['usage_summary']['total_tokens'], 100)
        self.assertEqual(response.data['recent_usage'][0]['provider'], 'mock')

        response = self.client.post('/api/billing/plans/', {
            'organization': 'test-org',
            'plan': 'pro',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['current_plan'], 'pro')
        self.assertEqual(response.data['project_count'], 1)
        self.assertIn('usage_by_provider', response.data)

    def test_dashboard_includes_visualization_snapshot(self):
        task = GenerationTask.objects.create(
            organization=self.organization,
            project=self.project,
            campaign=self.campaign,
            requested_by=self.user,
            task_type='copy',
            status='succeeded',
            token_count=100,
            cost_usd=Decimal('0.0123'),
        )
        UsageEvent.objects.create(
            organization=self.organization,
            project=self.project,
            campaign=self.campaign,
            generation_task=task,
            provider='mock',
            model_name='mock-copy',
            prompt_tokens=80,
            completion_tokens=20,
            total_tokens=100,
            cost_usd=Decimal('0.0123'),
        )
        Asset.objects.create(
            organization=self.organization,
            project=self.project,
            campaign=self.campaign,
            asset_type='document',
            title='Launch Copy',
        )
        WorkspaceDraft.objects.create(
            organization=self.organization,
            project=self.project,
            campaign=self.campaign,
            name='Dashboard Flow',
            nodes=[],
            edges=[],
            status='completed',
        )

        response = self.client.get('/api/dashboard/?organization=test-org')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['metrics']['task_count'], 1)
        self.assertEqual(response.data['metrics']['success_rate'], 100)
        self.assertEqual(response.data['tasks_by_status']['succeeded'], 1)
        self.assertEqual(response.data['asset_type_counts']['document'], 1)
        self.assertEqual(response.data['usage_by_provider'][0]['provider'], 'mock')
        self.assertEqual(len(response.data['usage_trend']), 7)
        self.assertEqual(response.data['workspace_health']['completed_drafts'], 1)
        self.assertEqual(response.data['recent_tasks'][0]['id'], task.id)


class SecurityAccessLayerTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='sec-admin', password='123')
        self.creator = User.objects.create_user(username='sec-creator', password='123')
        self.viewer = User.objects.create_user(username='sec-viewer', password='123')
        self.ops = User.objects.create_user(username='sec-ops', password='123')
        self.other_user = User.objects.create_user(username='sec-other', password='123')
        self.organization = Organization.objects.create(name='Security Org', slug='security-org')
        self.other_org = Organization.objects.create(name='Other Security Org', slug='other-security-org')
        Membership.objects.create(user=self.admin, organization=self.organization, role='admin')
        Membership.objects.create(user=self.creator, organization=self.organization, role='creator')
        Membership.objects.create(user=self.viewer, organization=self.organization, role='viewer')
        Membership.objects.create(user=self.ops, organization=self.organization, role='ops')
        Membership.objects.create(user=self.other_user, organization=self.other_org, role='admin')
        self.project = Project.objects.create(organization=self.organization, name='Owned Project', slug='owned-project')
        self.other_project = Project.objects.create(organization=self.other_org, name='Other Project', slug='other-project')
        self.campaign = Campaign.objects.create(project=self.project, name='Owned Campaign')
        self.task = GenerationTask.objects.create(
            organization=self.organization,
            project=self.project,
            campaign=self.campaign,
            requested_by=self.creator,
            task_type='copy',
            status='queued',
        )
        self.other_task = GenerationTask.objects.create(
            organization=self.other_org,
            project=self.other_project,
            requested_by=self.other_user,
            task_type='copy',
            status='queued',
        )

    def test_project_list_does_not_return_other_org_projects(self):
        self.client.login(username='sec-admin', password='123')
        response = self.client.get('/api/projects/')
        self.assertEqual(response.status_code, 200)
        ids = {item['id'] for item in response.data}
        self.assertIn(self.project.id, ids)
        self.assertNotIn(self.other_project.id, ids)

    def test_project_detail_other_org_returns_404(self):
        self.client.login(username='sec-admin', password='123')
        response = self.client.get(f'/api/projects/{self.other_project.id}/')
        self.assertEqual(response.status_code, 404)

    def test_viewer_cannot_create_project(self):
        self.client.login(username='sec-viewer', password='123')
        response = self.client.post(
            '/api/projects/',
            {'organization': self.organization.slug, 'name': 'Blocked'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_task_detail_other_org_returns_404(self):
        self.client.login(username='sec-admin', password='123')
        response = self.client.get(f'/api/tasks/{self.other_task.id}/')
        self.assertEqual(response.status_code, 404)

    def test_generation_ignores_request_username(self):
        AIConfiguration.objects.filter(provider='mock').update(is_active=True)
        self.client.login(username='sec-creator', password='123')
        response = self.client.post(
            '/api/generate/copy/',
            {
                'organization': self.organization.slug,
                'username': 'ROOT',
                'brand_name': 'Secure',
                'product_description': 'Safe launch',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        task = GenerationTask.objects.get(pk=response.data['task']['id'])
        self.assertEqual(task.requested_by, self.creator)

    def test_billing_read_write_roles(self):
        self.client.login(username='sec-viewer', password='123')
        response = self.client.get(f'/api/billing/plans/?organization={self.organization.slug}')
        self.assertEqual(response.status_code, 403)

        self.client.logout()
        self.client.login(username='sec-creator', password='123')
        response = self.client.get(f'/api/billing/plans/?organization={self.organization.slug}')
        self.assertEqual(response.status_code, 403)

        self.client.logout()
        self.client.login(username='sec-ops', password='123')
        response = self.client.get(f'/api/billing/plans/?organization={self.organization.slug}')
        self.assertEqual(response.status_code, 200)
        response = self.client.post(
            '/api/billing/plans/',
            {'organization': self.organization.slug, 'plan': 'pro'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

        self.client.logout()
        self.client.login(username='sec-admin', password='123')
        response = self.client.post(
            '/api/billing/plans/',
            {'organization': self.organization.slug, 'plan': 'pro'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)

    def test_community_and_rag_do_not_cross_organization(self):
        own_private = CommunityCreation.objects.create(
            organization=self.organization,
            username='sec-creator',
            creation_type='copy',
            title='Private Launch',
            content='{"body": "alpha insight"}',
            visibility='private',
        )
        public_item = CommunityCreation.objects.create(
            organization=self.other_org,
            username='sec-other',
            creation_type='copy',
            title='Public Launch',
            content='{"body": "alpha public"}',
            visibility='public',
        )
        other_private = CommunityCreation.objects.create(
            organization=self.other_org,
            username='sec-other',
            creation_type='copy',
            title='Other Private',
            content='{"body": "alpha secret"}',
            visibility='private',
        )

        response = self.client.get('/api/community/creations/')
        self.assertEqual(response.status_code, 200)
        ids = {item['id'] for item in response.data}
        self.assertEqual(ids, {public_item.id})

        self.client.login(username='sec-creator', password='123')
        response = self.client.get('/api/community/creations/')
        self.assertEqual(response.status_code, 200)
        ids = {item['id'] for item in response.data}
        self.assertIn(own_private.id, ids)
        self.assertIn(public_item.id, ids)
        self.assertNotIn(other_private.id, ids)

        response = self.client.get('/api/community/search/?q=alpha')
        self.assertEqual(response.status_code, 200)
        result_ids = {item['id'] for item in response.data['results']}
        self.assertIn(own_private.id, result_ids)
        self.assertIn(public_item.id, result_ids)
        self.assertNotIn(other_private.id, result_ids)
