from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0036_remove_seeded_workflow_placeholders'),
    ]

    operations = [
        migrations.AlterField(
            model_name='workspacedraft',
            name='name',
            field=models.CharField(default='Untitled Workflow', max_length=160),
        ),
    ]
