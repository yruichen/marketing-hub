from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase

from api.models import (
    Asset,
    Campaign,
    GenerationTask,
    HarnessRun,
    Membership,
    Organization,
    Project,
    UsageEvent,
    WorkflowRunEvent,
    WorkspaceDraft,
)
from api.services import (
    create_generation_task,
    create_workflow_run,
    run_generation_task,
    run_workflow_run_by_id,
    schedule_generation_task,
)
from harness.adapters.django.generation import DjangoGenerationGateway
from tests.provider_double import DeterministicProviderAdapter, configure_test_provider


class ExecutionClaimTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='execution-user', password='123')
        self.organization = Organization.objects.create(name='Execution Org', slug='execution-org')
        Membership.objects.create(user=self.user, organization=self.organization, role='creator')
        self.project = Project.objects.create(
            organization=self.organization,
            name='Execution Project',
            slug='execution-project',
        )
        self.campaign = Campaign.objects.create(project=self.project, name='Execution Campaign')
        configure_test_provider(self.organization)
        provider_patch = patch.dict(
            DjangoGenerationGateway.ADAPTERS,
            {'local_proxy': DeterministicProviderAdapter},
        )
        provider_patch.start()
        self.addCleanup(provider_patch.stop)

    def create_task(self):
        return create_generation_task(
            task_type='copy',
            payload={'brand_name': 'Acme', 'product_description': 'A test product'},
            username=self.user.username,
            organization=self.organization,
            project=self.project,
            campaign=self.campaign,
            run_now=False,
        )

    def test_succeeded_task_is_not_executed_twice(self):
        task = self.create_task()

        run_generation_task(task)
        first_result = task.result
        first_asset_count = Asset.objects.filter(organization=self.organization).count()
        first_usage_count = UsageEvent.objects.filter(generation_task=task).count()

        run_generation_task(task)
        task.refresh_from_db()

        self.assertEqual(task.attempt_count, 1)
        self.assertEqual(task.result, first_result)
        self.assertEqual(Asset.objects.filter(organization=self.organization).count(), first_asset_count)
        self.assertEqual(UsageEvent.objects.filter(generation_task=task).count(), first_usage_count)

    def test_harness_run_is_durably_checkpointed(self):
        task = self.create_task()

        run_generation_task(task)

        checkpoint = HarnessRun.objects.get(organization=self.organization, capability='copy')
        self.assertEqual(checkpoint.status, 'succeeded')
        self.assertEqual(checkpoint.state['schema_version'], 2)
        self.assertEqual(checkpoint.state['result']['status'], 'succeeded')
        self.assertEqual(checkpoint.state['prompt']['version'], '2026-08-10.v3')

    def test_scheduler_always_uses_celery_submission(self):
        task = self.create_task()
        async_result = SimpleNamespace(id='celery-result-id')

        with patch('api.tasks.process_generation_task.delay', return_value=async_result) as delay:
            result = schedule_generation_task(task)

        self.assertIs(result, async_result)
        delay.assert_called_once_with(task.id)
        task.refresh_from_db()
        self.assertEqual(task.celery_task_id, 'celery-result-id')

    def test_workflow_run_redelivery_does_not_execute_graph_twice(self):
        draft = WorkspaceDraft.objects.create(
            organization=self.organization,
            project=self.project,
            campaign=self.campaign,
            name='Idempotent Workflow',
            nodes=[{
                'id': 'context-1',
                'type': 'context',
                'label': 'Context',
                'config': {'summary': 'Stable context'},
            }],
            edges=[],
        )
        workflow_run = create_workflow_run(draft, username=self.user.username)

        run_workflow_run_by_id(workflow_run.id, username=self.user.username)
        run_workflow_run_by_id(workflow_run.id, username=self.user.username)
        workflow_run.refresh_from_db()

        self.assertEqual(workflow_run.attempt_count, 1)
        self.assertEqual(workflow_run.status, 'succeeded')
        self.assertEqual(
            WorkflowRunEvent.objects.filter(workflow_run=workflow_run, event_type='run_started').count(),
            1,
        )
