from django.db import migrations


def remove_beta_policy_placeholders(apps, schema_editor):
    PolicyDocument = apps.get_model('api', 'PolicyDocument')
    PolicyDocument.objects.filter(version='2026-06-27-beta').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0034_remove_production_mock_defaults'),
    ]

    operations = [
        migrations.RunPython(remove_beta_policy_placeholders, migrations.RunPython.noop),
    ]
