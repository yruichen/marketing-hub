# Generated for the Marketing-Hub workspace upgrade.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Organization',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True)),
                ('slug', models.SlugField(max_length=140, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name='Project',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=160)),
                ('slug', models.SlugField(max_length=180)),
                ('brief', models.TextField(blank=True, default='')),
                ('is_archived', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='projects', to='api.organization')),
            ],
            options={
                'ordering': ['-created_at'],
                'unique_together': {('organization', 'slug')},
            },
        ),
        migrations.CreateModel(
            name='Campaign',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=160)),
                ('objective', models.CharField(blank=True, default='', max_length=255)),
                ('status', models.CharField(default='active', max_length=32)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='campaigns', to='api.project')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='Membership',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('admin', 'Admin'), ('creator', 'Creator'), ('ops', 'Ops'), ('viewer', 'Viewer')], default='creator', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to='api.organization')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'unique_together': {('user', 'organization')},
            },
        ),
        migrations.CreateModel(
            name='Asset',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('asset_type', models.CharField(choices=[('image', 'Image'), ('audio', 'Audio'), ('video', 'Video'), ('document', 'Document')], max_length=20)),
                ('title', models.CharField(max_length=255)),
                ('source_url', models.CharField(blank=True, default='', max_length=600)),
                ('tags', models.JSONField(blank=True, default=list)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('campaign', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assets', to='api.campaign')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assets', to='api.organization')),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assets', to='api.project')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='GenerationTask',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('task_type', models.CharField(choices=[('copy', 'Marketing Copywriting'), ('image', 'Social Media Image'), ('storyboard', 'Storyboard Script'), ('audio', 'AI Voiceover'), ('rag_search', 'Semantic Retrieval')], max_length=20)),
                ('status', models.CharField(choices=[('queued', 'Queued'), ('running', 'Running'), ('succeeded', 'Succeeded'), ('failed', 'Failed')], default='queued', max_length=20)),
                ('payload', models.JSONField(default=dict)),
                ('result', models.JSONField(blank=True, default=dict)),
                ('error_message', models.TextField(blank=True, default='')),
                ('token_count', models.IntegerField(default=0)),
                ('cost_usd', models.DecimalField(decimal_places=4, default=0, max_digits=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('campaign', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='generation_tasks', to='api.campaign')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='generation_tasks', to='api.organization')),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='generation_tasks', to='api.project')),
                ('requested_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='generation_tasks', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='UsageEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider', models.CharField(default='mock', max_length=32)),
                ('model_name', models.CharField(blank=True, default='', max_length=128)),
                ('prompt_tokens', models.IntegerField(default=0)),
                ('completion_tokens', models.IntegerField(default=0)),
                ('total_tokens', models.IntegerField(default=0)),
                ('cost_usd', models.DecimalField(decimal_places=4, default=0, max_digits=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('campaign', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='usage_events', to='api.campaign')),
                ('generation_task', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='usage_events', to='api.generationtask')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='usage_events', to='api.organization')),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='usage_events', to='api.project')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddField(
            model_name='communitycreation',
            name='campaign',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='community_creations', to='api.campaign'),
        ),
        migrations.AddField(
            model_name='communitycreation',
            name='organization',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='community_creations', to='api.organization'),
        ),
        migrations.AddField(
            model_name='communitycreation',
            name='project',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='community_creations', to='api.project'),
        ),
        migrations.AddField(
            model_name='communitycreation',
            name='tags',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
