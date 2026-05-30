from django.core.management.base import BaseCommand

from api.models import GenerationTask
from api.services import run_generation_task


class Command(BaseCommand):
    help = 'Process queued Marketing-Hub generation tasks.'

    def handle(self, *args, **options):
        queued = GenerationTask.objects.filter(status='queued').order_by('created_at')
        count = 0
        for task in queued:
            run_generation_task(task)
            count += 1
            self.stdout.write(self.style.SUCCESS(f'Processed task #{task.id} ({task.task_type})'))

        if count == 0:
            self.stdout.write('No queued tasks found.')
