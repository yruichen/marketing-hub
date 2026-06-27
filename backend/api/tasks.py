from celery import shared_task
from django.conf import settings
from django.utils import timezone

from api.services import run_generation_task, run_workflow_run_by_id


@shared_task(bind=True)
def process_generation_task(self, task_id: int):
    from api.models import GenerationTask

    task = GenerationTask.objects.filter(pk=task_id).first()
    if not task:
        return {'status': 'missing', 'task_id': task_id}
    queued_ttl_seconds = int(getattr(settings, 'GENERATION_QUEUED_TTL_SECONDS', 30 * 60))
    if task.status == 'queued' and task.created_at < timezone.now() - timezone.timedelta(seconds=queued_ttl_seconds):
        task.status = 'failed'
        task.error_message = 'Generation task expired before a worker picked it up.'
        task.completed_at = timezone.now()
        task.save(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
        return {'status': task.status, 'task_id': task.id, 'expired': True}

    if hasattr(self.request, 'id') and self.request.id:
        task.celery_task_id = self.request.id
        task.save(update_fields=['celery_task_id', 'updated_at'])

    run_generation_task(task)
    return {'status': task.status, 'task_id': task.id}


@shared_task(bind=True)
def process_workflow_run(self, workflow_run_id: int, username: str | None = None):
    from api.models import WorkflowRun

    workflow_run = WorkflowRun.objects.filter(pk=workflow_run_id).first()
    if not workflow_run:
        return {'status': 'missing', 'workflow_run_id': workflow_run_id}
    queued_ttl_seconds = int(getattr(settings, 'WORKFLOW_RUN_QUEUED_TTL_SECONDS', 30 * 60))
    if workflow_run.status == 'queued' and workflow_run.created_at < timezone.now() - timezone.timedelta(seconds=queued_ttl_seconds):
        workflow_run.status = 'failed'
        workflow_run.summary = {
            **(workflow_run.summary or {}),
            'error_message': 'Workflow run expired before a worker picked it up.',
        }
        workflow_run.completed_at = timezone.now()
        workflow_run.save(update_fields=['status', 'summary', 'completed_at', 'updated_at'])
        return {'status': workflow_run.status, 'workflow_run_id': workflow_run.id, 'expired': True}

    if hasattr(self.request, 'id') and self.request.id:
        workflow_run.celery_task_id = self.request.id
        workflow_run.save(update_fields=['celery_task_id', 'updated_at'])

    run_workflow_run_by_id(workflow_run.id, username=username)
    workflow_run.refresh_from_db()
    return {'status': workflow_run.status, 'workflow_run_id': workflow_run.id}


@shared_task
def recover_stale_work():
    from api.models import WorkflowRun
    from api.service_modules.budget import expire_stale_generation_tasks

    generation_counts = expire_stale_generation_tasks()
    now = timezone.now()
    queued_cutoff = now - timezone.timedelta(seconds=int(getattr(settings, 'WORKFLOW_RUN_QUEUED_TTL_SECONDS', 30 * 60)))
    running_cutoff = now - timezone.timedelta(seconds=int(getattr(settings, 'WORKFLOW_RUN_RUNNING_TIMEOUT_SECONDS', 60 * 60)))

    queued_workflows = WorkflowRun.objects.filter(status='queued', created_at__lt=queued_cutoff).update(
        status='failed',
        summary={'error_message': 'Workflow run expired before a worker picked it up.'},
        completed_at=now,
    )
    running_workflows = WorkflowRun.objects.filter(status='running', updated_at__lt=running_cutoff).update(
        status='failed',
        summary={'error_message': 'Workflow run timed out while running.'},
        completed_at=now,
    )
    return {
        **generation_counts,
        'queued_workflows_expired': queued_workflows,
        'running_workflows_timed_out': running_workflows,
    }
