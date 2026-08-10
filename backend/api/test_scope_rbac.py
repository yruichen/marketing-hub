from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from api.models import Campaign, Membership, Organization, Project
from api.rbac import permissions_for_role, role_at_least, role_rank


class TenantScopeBoundaryTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='scope-user', password='test-pass')
        self.organization = Organization.objects.create(name='Scope Org', slug='scope-org')
        Membership.objects.create(user=self.user, organization=self.organization, role='admin')
        self.client.login(username='scope-user', password='test-pass')

    def test_bootstrap_get_does_not_create_missing_workspace_records(self):
        response = self.client.get('/api/workspace/bootstrap/?organization=scope-org')

        self.assertEqual(response.status_code, 404)
        self.assertEqual(Project.objects.filter(organization=self.organization).count(), 0)
        self.assertEqual(Campaign.objects.filter(project__organization=self.organization).count(), 0)

    def test_explicit_foreign_project_does_not_fall_back_to_owned_project(self):
        owned = Project.objects.create(organization=self.organization, name='Owned', slug='owned')
        Campaign.objects.create(project=owned, name='Owned Campaign')
        other_org = Organization.objects.create(name='Other', slug='other')
        Project.objects.create(organization=other_org, name='Foreign', slug='foreign')

        response = self.client.get(
            '/api/workspace/bootstrap/?organization=scope-org&project=foreign'
        )

        self.assertEqual(response.status_code, 404)


class RoleBoundaryTests(APITestCase):
    def test_missing_or_unknown_role_has_no_viewer_permissions(self):
        self.assertEqual(role_rank(None), -1)
        self.assertEqual(permissions_for_role(None), set())
        self.assertEqual(permissions_for_role('unknown'), set())
        self.assertFalse(role_at_least(None, 'viewer'))
        self.assertFalse(role_at_least('unknown', 'viewer'))

    def test_known_role_order_is_preserved(self):
        self.assertTrue(role_at_least('creator', 'viewer'))
        self.assertFalse(role_at_least('viewer', 'creator'))
