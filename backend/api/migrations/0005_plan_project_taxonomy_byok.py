from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0004_campaign_updated_at_project_brand_context_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='organization',
            name='subscription_plan',
            field=models.CharField(
                choices=[('free', 'Free'), ('pro', 'Pro'), ('enterprise', 'Enterprise')],
                default='free',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='project',
            name='folder_path',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='project',
            name='platform_tags',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='project',
            name='sort_order',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='project',
            name='status_tag',
            field=models.CharField(default='creating', max_length=40),
        ),
        migrations.AlterModelOptions(
            name='project',
            options={'ordering': ['folder_path', 'sort_order', '-created_at']},
        ),
        migrations.AddField(
            model_name='aiconfiguration',
            name='billing_mode',
            field=models.CharField(
                choices=[('platform', 'Platform Credits'), ('byok', 'Bring Your Own Key')],
                default='platform',
                max_length=20,
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
                ],
                default='mock',
                max_length=20,
            ),
        ),
    ]
