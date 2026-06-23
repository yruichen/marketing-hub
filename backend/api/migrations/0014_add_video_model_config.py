from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0013_alter_auditlog_action'),
    ]

    operations = [
        migrations.AddField(
            model_name='aiconfiguration',
            name='video_model_name',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AlterField(
            model_name='aiconfiguration',
            name='config_scope',
            field=models.CharField(
                choices=[
                    ('all', 'All Capabilities'),
                    ('text', 'Text Generation'),
                    ('image', 'Image Generation'),
                    ('audio', 'Audio Generation'),
                    ('video', 'Video Generation'),
                ],
                default='all',
                max_length=16,
            ),
        ),
    ]
