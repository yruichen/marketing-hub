from django.db import migrations, models
import django.db.models.deletion
from django.utils.text import slugify


def forwards(apps, schema_editor):
    Folder = apps.get_model('api', 'Folder')
    Project = apps.get_model('api', 'Project')

    for project in Project.objects.select_related('organization').all().order_by('organization_id', 'id'):
        raw_path = (project.folder_path or '').strip().strip('/')
        if not raw_path:
            continue

        parent = None
        for index, part in enumerate(segment for segment in raw_path.split('/') if segment.strip()):
            name = part.strip()
            slug = slugify(name) or f'folder-{index + 1}'
            folder, _ = Folder.objects.get_or_create(
                organization=project.organization,
                parent=parent,
                slug=slug,
                defaults={
                    'name': name,
                    'sort_order': index,
                    'permission_scope': 'workspace',
                    'is_archived': False,
                },
            )
            parent = folder

        project.folder = parent
        project.save(update_fields=['folder'])


def backwards(apps, schema_editor):
    Project = apps.get_model('api', 'Project')
    Project.objects.update(folder=None)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_plan_project_taxonomy_byok'),
    ]

    operations = [
        migrations.CreateModel(
            name='Folder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('slug', models.SlugField(max_length=140)),
                ('sort_order', models.IntegerField(default=0)),
                ('permission_scope', models.CharField(choices=[('workspace', 'Workspace'), ('private', 'Private'), ('restricted', 'Restricted')], default='workspace', max_length=20)),
                ('is_archived', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='folders', to='api.organization')),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='children', to='api.folder')),
            ],
            options={
                'ordering': ['parent_id', 'sort_order', 'name'],
                'unique_together': {('organization', 'parent', 'slug')},
            },
        ),
        migrations.AddField(
            model_name='project',
            name='folder',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='projects', to='api.folder'),
        ),
        migrations.RunPython(forwards, backwards),
    ]
