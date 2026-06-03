from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0008_aiconfiguration_agnes_provider'),
    ]

    operations = [
        migrations.AddField(
            model_name='aiconfiguration',
            name='config_scope',
            field=models.CharField(
                choices=[
                    ('all', 'All Capabilities'),
                    ('text', 'Text Generation'),
                    ('image', 'Image Generation'),
                    ('audio', 'Audio Generation'),
                ],
                default='all',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='aiconfiguration',
            name='image_model_name',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AlterUniqueTogether(
            name='aiconfiguration',
            unique_together={('provider', 'organization', 'config_scope')},
        ),
    ]
