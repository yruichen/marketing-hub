from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_add_custom_agent_task_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='generationtask',
            name='task_type',
            field=models.CharField(
                choices=[
                    ('copy', 'Marketing Copywriting'),
                    ('image', 'Social Media Image'),
                    ('storyboard', 'Storyboard Script'),
                    ('audio', 'AI Voiceover'),
                    ('video', 'Marketing Video'),
                    ('rag_search', 'Semantic Retrieval'),
                    ('custom_agent', 'Custom Agent'),
                    ('brainstorm', 'Workflow Brainstorm'),
                ],
                max_length=20,
            ),
        ),
    ]
