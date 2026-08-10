from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0032_execution_claims'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='HarnessRun',
            fields=[
                ('run_id', models.UUIDField(editable=False, primary_key=True, serialize=False)),
                ('capability', models.CharField(db_index=True, max_length=80)),
                ('status', models.CharField(choices=[('queued', 'Queued'), ('running', 'Running'), ('waiting_approval', 'Waiting Approval'), ('succeeded', 'Succeeded'), ('failed', 'Failed'), ('cancelled', 'Cancelled')], db_index=True, max_length=24)),
                ('trace_id', models.CharField(blank=True, db_index=True, default='', max_length=120)),
                ('state', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='harness_runs', to=settings.AUTH_USER_MODEL)),
                ('organization', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='harness_runs', to='api.organization')),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
