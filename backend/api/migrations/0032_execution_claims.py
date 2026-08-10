from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0031_userfollow'),
    ]

    operations = [
        migrations.AddField(
            model_name='generationtask',
            name='attempt_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='generationtask',
            name='execution_id',
            field=models.UUIDField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name='generationtask',
            name='started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='workflowrun',
            name='attempt_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='workflowrun',
            name='execution_id',
            field=models.UUIDField(blank=True, editable=False, null=True),
        ),
    ]
