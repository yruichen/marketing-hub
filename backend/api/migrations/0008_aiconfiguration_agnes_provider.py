from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0007_security_audit_idempotency_gateway'),
    ]

    operations = [
        migrations.AlterField(
            model_name='aiconfiguration',
            name='provider',
            field=models.CharField(
                choices=[
                    ('mock', 'Mock Sandbox Simulator'),
                    ('agnes', 'Agnes AI'),
                    ('gemini', 'Google Gemini API'),
                    ('openai', 'OpenAI API'),
                    ('anthropic', 'Anthropic API'),
                    ('local_proxy', 'Local Model Proxy'),
                ],
                default='mock',
                max_length=20,
            ),
        ),
    ]
