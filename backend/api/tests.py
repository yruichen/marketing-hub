from django.contrib.auth.models import User
from decimal import Decimal
from django.core.cache import cache
from django.core.checks import Tags, run_checks
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from api.models import AIConfiguration, Asset, AuditLog, Campaign, CommunityCreation, ContentReport, CreditLedgerEntry, EnterpriseContactRequest, GenerationTask, Membership, Organization, PolicyDocument, ProInvite, Project, UsageEvent, UserConsent, UserFollow, UserProfile, WorkflowNodeRun, WorkflowRun, WorkflowRunEvent, WorkflowTemplate, WorkspaceDraft, hash_pro_invite_code
from api.audit import record_audit_log
from api.redaction import redact_text


def grant_required_policy_consents(user):
    for doc in PolicyDocument.objects.filter(is_active=True, policy_type__in=['terms', 'privacy']):
        UserConsent.objects.get_or_create(
            user=user,
            policy_type=doc.policy_type,
            policy_version=doc.version,
            defaults={'source': 'test'},
        )


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

    def test_admin_can_create_update_and_delete_pro_invite(self):
        self.client.post('/api/admin-auth/login/', {'username': 'ROOT', 'password': '123'}, format='json')
        response = self.client.post('/api/admin-console/pro-invites/', {
            'label': 'Seed Pro',
            'max_uses': 2,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertRegex(response.data['plain_code'], r'^PRO-[A-Z2-9]{6}$')
        invite_id = response.data['id']
        invite = ProInvite.objects.get(pk=invite_id)
        self.assertEqual(invite.label, 'Seed Pro')
        self.assertEqual(invite.max_uses, 2)

        response = self.client.patch(f'/api/admin-console/pro-invites/{invite_id}/', {
            'label': 'Edited Pro',
            'max_uses': 3,
            'is_active': False,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['label'], 'Edited Pro')
        self.assertEqual(response.data['max_uses'], 3)
        self.assertFalse(response.data['is_active'])

        response = self.client.delete(f'/api/admin-console/pro-invites/{invite_id}/')
        self.assertEqual(response.status_code, 204, response.content)
        self.assertFalse(ProInvite.objects.filter(pk=invite_id).exists())

    def test_admin_can_update_user_personal_subscription(self):
        self.client.post('/api/admin-auth/login/', {'username': 'ROOT', 'password': '123'}, format='json')
        response = self.client.patch(
            f'/api/admin-console/users/{self.member.id}/',
            {'subscription_plan': 'pro'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['profile']['subscription_plan'], 'pro')
        self.assertEqual(response.data['profile']['subscription_source'], 'admin')
        profile = UserProfile.objects.get(user=self.member)
        self.assertEqual(profile.subscription_plan, 'pro')
        self.assertEqual(profile.subscription_source, 'admin')

        response = self.client.patch(
            f'/api/admin-console/users/{self.member.id}/',
            {'subscription_plan': 'free'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['profile']['subscription_plan'], 'free')

    def test_admin_can_list_and_reject_community_creation(self):
        self.client.post('/api/admin-auth/login/', {'username': 'ROOT', 'password': '123'}, format='json')
        publisher = User.objects.create_user(username='pub-user', password='123', email='pub@example.com')
        Membership.objects.create(user=publisher, organization=self.organization, role='creator')
        project = Project.objects.create(organization=self.organization, name='Pub Project', slug='pub-project')
        creation = CommunityCreation.objects.create(
            organization=self.organization,
            project=project,
            username=publisher.username,
            creation_type='copy',
            title='Admin reject me',
            content='{"paragraphs":["hello"]}',
            visibility='public',
            review_status='approved',
            ai_generated=True,
        )

        response = self.client.get('/api/admin-console/community-creations/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(any(item['id'] == creation.id for item in response.data['results']))

        response = self.client.post(
            f'/api/admin-console/community-creations/{creation.id}/moderate/',
            {'review_status': 'rejected', 'reason': 'Root moderation test'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['review_status'], 'rejected')
        self.assertEqual(response.data['moderation_status'], 'hidden')
        self.assertTrue(CommunityCreation.objects.filter(pk=creation.id).exists())
        self.assertTrue(Asset.objects.filter(metadata__community_creation_id=creation.id).exists())
        self.assertTrue(
            AuditLog.objects.filter(action='content_moderation', metadata__source='admin_console', target_id=str(creation.id)).exists()
        )


class CreatorProfileTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='profile-user', password='123', email='profile@example.com')
        self.viewer = User.objects.create_user(username='viewer-user', password='123', email='viewer@example.com')
        self.organization = Organization.objects.create(name='Profile Org', slug='profile-org')
        Membership.objects.create(user=self.user, organization=self.organization, role='creator')
        Membership.objects.create(user=self.viewer, organization=self.organization, role='viewer')
        self.copy_creation = CommunityCreation.objects.create(
            organization=self.organization,
            username='profile-user',
            creation_type='copy',
            title='Launch Copy',
            content='{"title": "Launch Copy", "paragraphs": ["Hello"]}',
            likes=3,
            visibility='public',
        )
        self.image_creation = CommunityCreation.objects.create(
            organization=self.organization,
            username='profile-user',
            creation_type='image',
            title='Launch Visual',
            content='{"prompt": "editorial desk"}',
            likes=5,
            visibility='public',
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

    def test_profile_respects_visibility_and_private_profiles(self):
        CommunityCreation.objects.create(
            organization=self.organization,
            username='profile-user',
            creation_type='audio',
            title='Internal Voice',
            content='{"text": "team only"}',
            visibility='organization',
        )
        CommunityCreation.objects.create(
            organization=self.organization,
            username='profile-user',
            creation_type='video',
            title='Private Video',
            content='{"prompt": "private"}',
            visibility='private',
        )
        outsider = User.objects.create_user(username='outsider-user', password='123')
        other_org = Organization.objects.create(name='Other Org', slug='other-org')
        Membership.objects.create(user=outsider, organization=other_org, role='viewer')

        self.client.login(username='viewer-user', password='123')
        response = self.client.get('/api/profiles/profile-user/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({item['title'] for item in response.data['creations']}, {'Launch Copy', 'Launch Visual', 'Internal Voice'})

        self.client.logout()
        self.client.login(username='outsider-user', password='123')
        response = self.client.get('/api/profiles/profile-user/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({item['title'] for item in response.data['creations']}, {'Launch Copy', 'Launch Visual'})

        profile = UserProfile.objects.get(user=self.user)
        profile.profile_visibility = 'private'
        profile.save(update_fields=['profile_visibility'])
        response = self.client.get('/api/profiles/profile-user/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['is_private'])
        self.assertEqual(response.data['creations'], [])

    def test_owner_can_manage_featured_profile_creations(self):
        self.client.login(username='profile-user', password='123')
        response = self.client.patch(
            f'/api/profiles/me/creations/{self.copy_creation.id}/',
            {'profile_featured': True, 'profile_featured_rank': 1},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([item['id'] for item in response.data['featured_creations']], [self.copy_creation.id])

        self.copy_creation.refresh_from_db()
        self.assertTrue(self.copy_creation.metadata['profile_featured'])
        self.assertEqual(self.copy_creation.metadata['profile_featured_rank'], 1)

        response = self.client.patch(
            f'/api/profiles/me/creations/{self.copy_creation.id}/',
            {'profile_featured': False},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['featured_creations'], [])

    def test_featured_profile_creations_are_limited_to_three_and_owner_only(self):
        extra_items = [
            CommunityCreation.objects.create(
                organization=self.organization,
                username='profile-user',
                creation_type='copy',
                title=f'Extra {index}',
                content='{"title": "Extra"}',
                visibility='public',
            )
            for index in range(3)
        ]

        self.client.login(username='profile-user', password='123')
        for item in [self.copy_creation, self.image_creation, extra_items[0]]:
            response = self.client.patch(
                f'/api/profiles/me/creations/{item.id}/',
                {'profile_featured': True},
                format='json',
            )
            self.assertEqual(response.status_code, 200, response.content)

        response = self.client.patch(
            f'/api/profiles/me/creations/{extra_items[1].id}/',
            {'profile_featured': True},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

        self.client.logout()
        self.client.login(username='viewer-user', password='123')
        response = self.client.patch(
            f'/api/profiles/me/creations/{self.copy_creation.id}/',
            {'profile_featured': True},
            format='json',
        )
        self.assertEqual(response.status_code, 404)

    def test_profile_follow_and_relation_lists(self):
        self.client.login(username='viewer-user', password='123')
        response = self.client.get('/api/profiles/profile-user/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['social']['follower_count'], 0)
        self.assertFalse(response.data['social']['is_following'])

        response = self.client.post('/api/profiles/profile-user/follow/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['social']['is_following'])
        self.assertEqual(response.data['social']['follower_count'], 1)

        response = self.client.get('/api/profiles/profile-user/followers/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['username'], 'viewer-user')

        response = self.client.get('/api/profiles/viewer-user/following/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['username'], 'profile-user')

        response = self.client.get('/api/profiles/me/following/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['username'], 'profile-user')

        response = self.client.delete('/api/profiles/profile-user/follow/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['social']['is_following'])
        self.assertEqual(UserFollow.objects.count(), 0)

        response = self.client.post('/api/profiles/viewer-user/follow/')
        self.assertEqual(response.status_code, 400)

    def test_private_profile_hides_relation_lists(self):
        profile = UserProfile.objects.get(user=self.user)
        profile.profile_visibility = 'private'
        profile.save(update_fields=['profile_visibility'])

        self.client.login(username='viewer-user', password='123')
        response = self.client.get('/api/profiles/profile-user/followers/')
        self.assertEqual(response.status_code, 403)


class WorkspaceUpgradeTests(APITestCase):
    def setUp(self):
        cache.clear()
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
        grant_required_policy_consents(self.user)
        self.client.login(username='workspace-user', password='123')

    def _set_personal_plan(self, plan='pro'):
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.subscription_plan = plan
        profile.subscription_source = 'admin'
        profile.subscription_expires_at = None
        profile.save(update_fields=['subscription_plan', 'subscription_source', 'subscription_expires_at'])

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

    def test_billing_plans_include_feature_entitlements(self):
        response = self.client.get('/api/billing/plans/?organization=test-org')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['feature_entitlements']['video_render'])
        self.assertFalse(response.data['feature_entitlements']['workflow_run'])

        self._set_personal_plan('pro')
        response = self.client.get('/api/billing/plans/?organization=test-org')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['feature_entitlements']['video_render'])
        self.assertTrue(response.data['feature_entitlements']['workflow_run'])

    def test_free_user_cannot_use_pro_only_video_and_workflow_features(self):
        response = self.client.post('/api/generate/video/', {
            'organization': 'test-org',
            'project': 'spring-launch',
            'video_topic': 'Launch video',
            'prompt': 'A simple product video',
            'async': True,
        }, format='json')
        self.assertEqual(response.status_code, 403, response.content)
        self.assertTrue(response.data['upgrade_required'])
        self.assertEqual(response.data['feature'], 'video_render')

        draft = WorkspaceDraft.objects.create(
            organization=self.organization,
            project=self.project,
            campaign=self.campaign,
            name='Free Flow',
            brand_context=self.project.brand_context,
            nodes=[],
            edges=[],
        )
        response = self.client.post(f'/api/drafts/{draft.id}/run/', {'username': 'DEMO'}, format='json')
        self.assertEqual(response.status_code, 403, response.content)
        self.assertTrue(response.data['upgrade_required'])
        self.assertEqual(response.data['feature'], 'workflow_run')

        response = self.client.post(
            f'/api/drafts/{draft.id}/ai-edit/',
            {'mode': 'workflow', 'instruction': 'Add a copy node.'},
            format='json',
        )
        self.assertEqual(response.status_code, 403, response.content)
        self.assertTrue(response.data['upgrade_required'])
        self.assertEqual(response.data['feature'], 'advanced_nodes')

    def test_free_user_cannot_write_ai_config(self):
        response = self.client.post('/api/ai/config/', {
            'organization': 'test-org',
            'provider': 'agnes',
            'api_key': 'org-key',
            'model_name': 'agnes-2.0-flash',
            'billing_mode': 'byok',
        }, format='json')
        self.assertEqual(response.status_code, 403, response.content)
        self.assertTrue(response.data['upgrade_required'])
        self.assertEqual(response.data['feature'], 'ai_config_write')

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
        self._set_personal_plan('pro')
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

    def test_workflow_ai_edit_applies_safe_node_patch(self):
        self._set_personal_plan('pro')
        draft = WorkspaceDraft.objects.create(
            organization=self.organization,
            project=self.project,
            campaign=self.campaign,
            name='Editable Flow',
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

        response = self.client.post(
            f'/api/drafts/{draft.id}/ai-edit/',
            {
                'mode': 'node',
                'node_id': 'copy-1',
                'instruction': 'Make this more playful.',
                'nodes': draft.nodes,
                'edges': draft.edges,
                'brand_context': draft.brand_context,
            },
            format='json',
            HTTP_IDEMPOTENCY_KEY='ai-edit-copy-1',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(response.data['nodes']), 2)
        context_node = next(node for node in response.data['nodes'] if node['id'] == 'context-1')
        copy_node = next(node for node in response.data['nodes'] if node['id'] == 'copy-1')
        self.assertEqual(context_node['config']['summary'], 'Launchbook creator toolkit')
        self.assertEqual(copy_node['config']['ai_edit_instruction'], 'Make this more playful.')
        self.assertEqual(response.data['edges'], draft.edges)
        self.assertIn('copy-1', response.data['changed_node_ids'])

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

    def test_billing_plans_include_usage_summary_and_blocks_direct_plan_switch(self):
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
        self.assertEqual(response.status_code, 403)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.subscription_plan, 'free')

    def test_pro_invite_redeem_upgrades_personal_plan(self):
        ProInvite.objects.create(
            code_hash=hash_pro_invite_code('PRO-SEED-001'),
            label='Seed Pro',
            max_uses=1,
        )

        response = self.client.post('/api/billing/redeem-pro-invite/', {
            'organization': 'test-org',
            'code': 'pro-seed-001',
        }, format='json')

        self.assertEqual(response.status_code, 200, response.content)
        profile = UserProfile.objects.get(user=self.user)
        self.assertEqual(profile.subscription_plan, 'pro')
        self.assertEqual(profile.subscription_source, 'invite_code')
        self.assertEqual(response.data['personal_plan'], 'pro')
        self.assertEqual(response.data['effective_plan'], 'pro')

    def test_enterprise_contact_request_is_recorded(self):
        response = self.client.post('/api/billing/enterprise-requests/', {
            'organization': 'test-org',
            'company_name': 'Acme Co',
            'contact_name': 'Alice',
            'contact_email': 'alice@example.com',
            'team_size': '20',
            'requirements': 'Need SSO and private deployment.',
        }, format='json')

        self.assertEqual(response.status_code, 201, response.content)
        request_obj = EnterpriseContactRequest.objects.get(user=self.user)
        self.assertEqual(request_obj.organization, self.organization)
        self.assertEqual(request_obj.company_name, 'Acme Co')
        self.assertEqual(response.data['enterprise_request_status'], 'new')

    def test_project_limit_uses_personal_pro_entitlement(self):
        Project.objects.create(organization=self.organization, name='Second', slug='second')
        Project.objects.create(organization=self.organization, name='Third', slug='third')
        response = self.client.post('/api/projects/', {
            'organization': 'test-org',
            'name': 'Fourth',
        }, format='json')
        self.assertEqual(response.status_code, 402)

        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.subscription_plan = 'pro'
        profile.subscription_source = 'admin'
        profile.save(update_fields=['subscription_plan', 'subscription_source'])
        response = self.client.post('/api/projects/', {
            'organization': 'test-org',
            'name': 'Fourth',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)

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
        for user in [self.admin, self.creator, self.viewer, self.ops, self.other_user]:
            grant_required_policy_consents(user)
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

    @override_settings(GENERATION_DAILY_BUDGET_CENTS_DEFAULT=0)
    def test_over_budget_generation_returns_402_without_creating_task(self):
        self.client.login(username='sec-creator', password='123')
        before = GenerationTask.objects.filter(organization=self.organization).count()
        response = self.client.post(
            '/api/generate/copy/',
            {
                'organization': self.organization.slug,
                'brand_name': 'Secure',
                'product_description': 'Safe launch',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 402)
        self.assertEqual(GenerationTask.objects.filter(organization=self.organization).count(), before)

    @override_settings(GENERATION_MAX_RUNNING_TASKS_DEFAULT=1)
    def test_running_task_limit_returns_429_without_creating_task(self):
        GenerationTask.objects.create(
            organization=self.organization,
            project=self.project,
            requested_by=self.creator,
            task_type='copy',
            status='running',
        )
        self.client.login(username='sec-creator', password='123')
        before = GenerationTask.objects.filter(organization=self.organization).count()
        response = self.client.post(
            '/api/generate/copy/',
            {
                'organization': self.organization.slug,
                'brand_name': 'Secure',
                'product_description': 'Safe launch',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 429)
        self.assertEqual(GenerationTask.objects.filter(organization=self.organization).count(), before)

    @override_settings(GENERATION_MAX_PAYLOAD_BYTES=256)
    def test_oversized_payload_returns_400_without_creating_task(self):
        self.client.login(username='sec-creator', password='123')
        before = GenerationTask.objects.filter(organization=self.organization).count()
        response = self.client.post(
            '/api/generate/copy/',
            {
                'organization': self.organization.slug,
                'brand_name': 'Secure',
                'product_description': 'x' * 1000,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(GenerationTask.objects.filter(organization=self.organization).count(), before)

    @override_settings(GENERATION_QUEUE_MAX_DEPTH=1)
    def test_global_queue_limit_returns_429_without_creating_task(self):
        GenerationTask.objects.create(
            organization=self.other_org,
            project=self.other_project,
            requested_by=self.other_user,
            task_type='copy',
            status='queued',
        )
        self.client.login(username='sec-creator', password='123')
        before = GenerationTask.objects.filter(organization=self.organization).count()
        response = self.client.post(
            '/api/generate/copy/',
            {
                'organization': self.organization.slug,
                'brand_name': 'Secure',
                'product_description': 'Safe launch',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 429)
        self.assertEqual(GenerationTask.objects.filter(organization=self.organization).count(), before)

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
        self.assertEqual(response.status_code, 403)

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
        self.assertNotIn(own_private.id, result_ids)
        self.assertIn(public_item.id, result_ids)
        self.assertNotIn(other_private.id, result_ids)

    def test_asset_create_audit_action_is_valid_choice(self):
        self.client.login(username='sec-creator', password='123')
        response = self.client.post(
            '/api/workspace/assets/',
            {
                'organization': self.organization.slug,
                'title': 'Manual Asset',
                'asset_type': 'document',
                'rights_confirmed': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        audit = AuditLog.objects.filter(action='asset_create').first()
        self.assertIsNotNone(audit)
        self.assertIn(('asset_create', 'Asset Create'), AuditLog.ACTION_CHOICES)

    @override_settings(GENERATION_QUEUED_TTL_SECONDS=60, GENERATION_RUNNING_TIMEOUT_SECONDS=60)
    def test_recover_stale_generation_tasks_marks_failed(self):
        queued = GenerationTask.objects.create(
            organization=self.organization,
            project=self.project,
            requested_by=self.creator,
            task_type='copy',
            status='queued',
        )
        running = GenerationTask.objects.create(
            organization=self.organization,
            project=self.project,
            requested_by=self.creator,
            task_type='copy',
            status='running',
        )
        cutoff = timezone.now() - timezone.timedelta(minutes=5)
        GenerationTask.objects.filter(pk__in=[queued.pk, running.pk]).update(created_at=cutoff, updated_at=cutoff)

        from api.tasks import recover_stale_work

        result = recover_stale_work()
        self.assertEqual(result['queued_expired'], 1)
        self.assertEqual(result['running_timed_out'], 1)
        queued.refresh_from_db()
        running.refresh_from_db()
        self.assertEqual(queued.status, 'failed')
        self.assertEqual(running.status, 'failed')


class LegalLaunchReadinessTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='legal-user', password='123', email='legal@example.com')
        self.ops = User.objects.create_user(username='legal-ops', password='123', email='ops@example.com')
        self.organization = Organization.objects.create(name='Legal Org', slug='legal-org')
        Membership.objects.create(user=self.user, organization=self.organization, role='creator')
        Membership.objects.create(user=self.ops, organization=self.organization, role='ops')
        self.project = Project.objects.create(organization=self.organization, name='Legal Project', slug='legal-project')
        AIConfiguration.objects.filter(provider='mock').update(is_active=True)

    def test_register_requires_terms_and_privacy_flags(self):
        response = self.client.post('/api/auth/register/', {
            'email': 'new-legal@example.com',
            'username': 'new-legal',
            'password': 'StrongPass123!',
            'organization_name': 'New Legal Org',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('服务条款', response.data['error'])

    def test_policy_consent_endpoint_records_versions(self):
        self.client.login(username='legal-user', password='123')
        response = self.client.post('/api/legal/consents/', {
            'policy_types': ['terms', 'privacy'],
            'source': 'settings_modal',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.data['policy_consents']['requires_consent'])
        self.assertEqual(UserConsent.objects.filter(user=self.user).count(), 2)

    def test_generation_requires_current_policy_consent(self):
        self.client.login(username='legal-user', password='123')
        response = self.client.post('/api/generate/copy/', {
            'organization': self.organization.slug,
            'brand_name': 'Legal',
            'product_description': 'Launch readiness',
        }, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(response.data['requires_consent'])

        grant_required_policy_consents(self.user)
        response = self.client.post('/api/generate/copy/', {
            'organization': self.organization.slug,
            'brand_name': 'Legal',
            'product_description': 'Launch readiness',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        asset = Asset.objects.get(metadata__generation_task_id=response.data['task']['id'])
        self.assertTrue(asset.metadata['ai_generated'])
        self.assertEqual(asset.metadata['organization_id'], self.organization.id)
        self.assertIn('source_inputs_digest', asset.metadata)
        self.assertEqual(response.data['result']['ai_generated'], True)

    def test_asset_creation_requires_rights_confirmation(self):
        grant_required_policy_consents(self.user)
        self.client.login(username='legal-user', password='123')
        response = self.client.post('/api/workspace/assets/', {
            'organization': self.organization.slug,
            'title': 'Unconfirmed asset',
            'asset_type': 'document',
        }, format='json')
        self.assertEqual(response.status_code, 400)

        response = self.client.post('/api/workspace/assets/', {
            'organization': self.organization.slug,
            'title': 'Confirmed asset',
            'asset_type': 'document',
            'rights_confirmed': True,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data['metadata']['license_status'], 'user_confirmed')
        self.assertEqual(response.data['metadata']['rights_confirmed_by'], self.user.id)

    def test_public_community_publish_report_and_moderate(self):
        grant_required_policy_consents(self.user)
        grant_required_policy_consents(self.ops)
        self.client.login(username='legal-user', password='123')
        response = self.client.post('/api/community/creations/', {
            'organization': self.organization.slug,
            'project': self.project.slug,
            'creation_type': 'copy',
            'title': 'Public legal copy',
            'content': {'title': 'Public legal copy', 'paragraphs': ['claim']},
            'visibility': 'public',
        }, format='json')
        self.assertEqual(response.status_code, 400)

        response = self.client.post('/api/community/creations/', {
            'organization': self.organization.slug,
            'project': self.project.slug,
            'creation_type': 'copy',
            'title': 'Public legal copy',
            'content': {'title': 'Public legal copy', 'paragraphs': ['claim']},
            'visibility': 'public',
            'responsibility_confirmed': True,
            'ai_generated': True,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        creation_id = response.data['id']
        self.assertEqual(CommunityCreation.objects.get(pk=creation_id).review_status, 'approved')

        response = self.client.post(f'/api/community/creations/{creation_id}/report/', {
            'reason': 'false_advertising',
            'description': 'Unverified claim',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(ContentReport.objects.filter(target_id=str(creation_id)).count(), 1)
        self.assertEqual(CommunityCreation.objects.get(pk=creation_id).reported_count, 1)

        self.client.logout()
        self.client.login(username='legal-ops', password='123')
        response = self.client.post(f'/api/community/creations/{creation_id}/moderate/', {
            'organization': self.organization.slug,
            'review_status': 'rejected',
            'reason': 'Pending legal review',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['moderation_status'], 'hidden')
        self.assertEqual(response.data['review_status'], 'rejected')
        self.assertTrue(CommunityCreation.objects.filter(pk=creation_id).exists())
        rejected_asset = Asset.objects.filter(metadata__community_creation_id=creation_id).first()
        self.assertIsNotNone(rejected_asset)
        self.assertEqual(rejected_asset.project_id, self.project.id)
        self.assertEqual(rejected_asset.metadata['source'], 'moderation_rejected')
        self.assertEqual(response.data['rejected_asset_id'], rejected_asset.id)
        self.assertTrue(AuditLog.objects.filter(action='content_moderation', target_id=str(creation_id)).exists())


class ProductionSecurityChecksTests(APITestCase):
    @override_settings(
        DEBUG=False,
        ALLOW_UNAUTHENTICATED_API=True,
        MARKETING_HUB_BOOTSTRAP_DEMO=True,
        AI_ALLOW_MOCK_FALLBACK=True,
        CORS_ALLOW_ALL_ORIGINS=True,
        SESSION_COOKIE_SECURE=False,
        CSRF_COOKIE_SECURE=False,
        FIELD_ENCRYPTION_KEY='',
    )
    def test_deploy_check_fails_for_dangerous_production_settings(self):
        errors = run_checks(tags=[Tags.security], include_deployment_checks=True)
        ids = {error.id for error in errors}
        self.assertTrue({'api.E001', 'api.E002', 'api.E003', 'api.E004', 'api.E010', 'api.E011', 'api.E012'}.issubset(ids))


class CsrfEndpointTests(APITestCase):
    def test_auth_csrf_is_anonymous_probe(self):
        response = self.client.get('/api/auth/csrf/', HTTP_X_REQUEST_ID='test-request-id')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers.get('X-CSRFToken'))
        self.assertEqual(response.headers.get('X-Request-ID'), 'test-request-id')

    def test_ai_config_is_not_anonymous_csrf_probe(self):
        response = self.client.get('/api/ai/config/')
        self.assertIn(response.status_code, (401, 403))


class SprintCSecurityEnhancementTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='sprint-c-user', password='123')
        self.organization = Organization.objects.create(name='Sprint C Org', slug='sprint-c-org')
        Membership.objects.create(user=self.user, organization=self.organization, role='creator')
        grant_required_policy_consents(self.user)

    def test_audit_log_records_request_id_and_redacts_metadata(self):
        record = record_audit_log(
            action='asset_create',
            actor=self.user,
            organization=self.organization,
            target_type='asset',
            target_id='1',
            request_id='rid-123',
            metadata={
                'api_key': 'secret-key',
                'url': 'https://example.com/models?key=secret-key&safe=1',
                'authorization': 'Bearer abc123',
            },
        )
        self.assertEqual(record.request_id, 'rid-123')
        self.assertEqual(record.metadata['api_key'], '[redacted]')
        self.assertIn('key=%5Bredacted%5D', record.metadata['url'])
        self.assertEqual(record.metadata['authorization'], '[redacted]')

    def test_asset_source_url_rejects_non_https_and_internal_hosts(self):
        self.client.login(username='sprint-c-user', password='123')
        for url in ['http://example.com/file.png', 'https://127.0.0.1/file.png', 'data:text/plain,hello']:
            response = self.client.post(
                '/api/workspace/assets/',
                {
                    'organization': self.organization.slug,
                    'title': 'Bad URL',
                    'asset_type': 'image',
                    'source_url': url,
                    'rights_confirmed': True,
                },
                format='json',
            )
            self.assertEqual(response.status_code, 400, url)

    def test_asset_source_url_accepts_external_https(self):
        self.client.login(username='sprint-c-user', password='123')
        response = self.client.post(
            '/api/workspace/assets/',
            {
                'organization': self.organization.slug,
                'title': 'External URL',
                'asset_type': 'image',
                'source_url': 'https://cdn.example.com/file.png',
                'rights_confirmed': True,
            },
            format='json',
            HTTP_X_REQUEST_ID='asset-rid',
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.headers.get('X-Request-ID'), 'asset-rid')
        self.assertEqual(response.data['source_url'], 'https://cdn.example.com/file.png')
        self.assertEqual(AuditLog.objects.filter(action='asset_create').latest('created_at').request_id, 'asset-rid')

    def test_redact_text_removes_provider_key_query_and_bearer(self):
        text = 'failed https://generativelanguage.googleapis.com/v1/models?key=secret-key Authorization: Bearer abc123'
        redacted = redact_text(text)
        self.assertNotIn('secret-key', redacted)
        self.assertNotIn('abc123', redacted)
        self.assertIn('[redacted]', redacted)
