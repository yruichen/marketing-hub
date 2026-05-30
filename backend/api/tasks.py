from celery import shared_task

from api.services import run_generation_task


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
