from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_folder_project_folder'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='aiconfiguration',
            name='organization',
            field=models.ForeignKey(
                blank=True,
                help_text='Blank means platform-managed configuration. BYOK keys must be organization-scoped.',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='ai_configurations',
                to='api.organization',
            ),
        ),
        migrations.AlterField(
            model_name='aiconfiguration',
            name='provider',
            field=models.CharField(
                choices=[
                    ('mock', 'Mock Sandbox Simulator'),
                    ('gemini', 'Google Gemini API'),
                    ('openai', 'OpenAI API'),
                    ('anthropic', 'Anthropic API'),
                    ('local_proxy', 'Local Model Proxy'),
                ],
                default='mock',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='IdempotencyKey',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=128)),
                ('request_hash', models.CharField(max_length=64)),
                ('request_path', models.CharField(blank=True, default='', max_length=255)),
                ('status', models.CharField(choices=[('processing', 'Processing'), ('completed', 'Completed'), ('failed', 'Failed')], default='processing', max_length=20)),
                ('response_status', models.IntegerField(blank=True, null=True)),
                ('response_body', models.JSONField(blank=True, default=dict)),
                ('resource_type', models.CharField(blank=True, default='', max_length=80)),
                ('resource_id', models.CharField(blank=True, default='', max_length=80)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='idempotency_keys', to='api.organization')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='idempotency_keys', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
                'unique_together': {('organization', 'key')},
            },
        ),
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('login', 'Login'), ('member_change', 'Member Change'), ('key_change', 'Key Change'), ('export', 'Export'), ('delete', 'Delete'), ('billing_change', 'Billing Change'), ('generation_create', 'Generation Create'), ('workflow_run', 'Workflow Run')], max_length=40)),
                ('target_type', models.CharField(blank=True, default='', max_length=80)),
                ('target_id', models.CharField(blank=True, default='', max_length=80)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, default='', max_length=255)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to=settings.AUTH_USER_MODEL)),
                ('organization', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to='api.organization')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
