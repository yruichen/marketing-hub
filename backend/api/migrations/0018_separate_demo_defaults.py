from django.db import migrations, models


def rewrite_root_content_defaults(apps, schema_editor):
    CommunityCreation = apps.get_model('api', 'CommunityCreation')
    WorkflowTemplate = apps.get_model('api', 'WorkflowTemplate')
    CommunityCreation.objects.filter(username='ROOT').update(username='DEMO')
    WorkflowTemplate.objects.filter(author_username='ROOT').update(author_username='DEMO')


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_phase3_admin_ops'),
    ]

    operations = [
        migrations.AlterField(
            model_name='communitycreation',
            name='username',
            field=models.CharField(default='DEMO', max_length=100),
        ),
        migrations.AlterField(
            model_name='workflowtemplate',
            name='author_username',
            field=models.CharField(default='DEMO', max_length=100),
        ),
        migrations.RunPython(rewrite_root_content_defaults, migrations.RunPython.noop),
    ]
