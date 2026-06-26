from celery import shared_task

from api.services import run_generation_task, run_workflow_run_by_id


@shared_task(bind=True)
def process_generation_task(self, task_id: int):
    from api.models import GenerationTask

    task = GenerationTask.objects.filter(pk=task_id).first()
    if not task:
        return {'status': 'missing', 'task_id': task_id}

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

    if hasattr(self.request, 'id') and self.request.id:
        workflow_run.celery_task_id = self.request.id
        workflow_run.save(update_fields=['celery_task_id', 'updated_at'])

    run_workflow_run_by_id(workflow_run.id, username=username)
    workflow_run.refresh_from_db()
    return {'status': workflow_run.status, 'workflow_run_id': workflow_run.id}
