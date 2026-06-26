from django.db import migrations


def remove_superuser_memberships(apps, schema_editor):
    Membership = apps.get_model('api', 'Membership')
    Membership.objects.filter(user__is_superuser=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0018_separate_demo_defaults'),
    ]

    operations = [
        migrations.RunPython(remove_superuser_memberships, migrations.RunPython.noop),
    ]
