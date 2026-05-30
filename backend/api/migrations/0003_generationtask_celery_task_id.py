# Generated for Celery task tracking.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_workspace_assets_tasks'),
    ]

    operations = [
        migrations.AddField(
            model_name='generationtask',
            name='celery_task_id',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
    ]
