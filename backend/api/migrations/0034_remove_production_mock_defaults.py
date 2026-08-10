from django.db import migrations, models


def remove_mock_provider_configs(apps, schema_editor):
    AIConfiguration = apps.get_model('api', 'AIConfiguration')
    AIConfiguration.objects.filter(provider='mock').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0033_harnessrun'),
    ]

    operations = [
        migrations.RunPython(remove_mock_provider_configs, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='aiconfiguration',
            name='provider',
            field=models.CharField(
                choices=[
                    ('agnes', 'Agnes AI'),
                    ('gemini', 'Google Gemini API'),
                    ('openai', 'OpenAI API'),
                    ('anthropic', 'Anthropic API'),
                    ('local_proxy', 'Local Model Proxy'),
                ],
                default='agnes',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='communitycreation',
            name='username',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AlterField(
            model_name='usageevent',
            name='provider',
            field=models.CharField(default='unreported', max_length=32),
        ),
        migrations.AlterField(
            model_name='workflowtemplate',
            name='author_username',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
    ]
