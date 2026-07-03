from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0027_communitycreation_ai_generated_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='subscription_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='subscription_plan',
            field=models.CharField(choices=[('free', 'Free'), ('pro', 'Pro')], default='free', max_length=20),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='subscription_source',
            field=models.CharField(choices=[('default', 'Default'), ('invite_code', 'Invite Code'), ('admin', 'Admin')], default='default', max_length=30),
        ),
        migrations.CreateModel(
            name='ProInvite',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code_hash', models.CharField(max_length=128, unique=True)),
                ('label', models.CharField(blank=True, default='', max_length=120)),
                ('max_uses', models.PositiveIntegerField(default=1)),
                ('used_count', models.PositiveIntegerField(default=0)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_pro_invites', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='EnterpriseContactRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('company_name', models.CharField(max_length=160)),
                ('contact_name', models.CharField(max_length=100)),
                ('contact_email', models.EmailField(max_length=254)),
                ('contact_phone', models.CharField(blank=True, default='', max_length=40)),
                ('team_size', models.CharField(blank=True, default='', max_length=40)),
                ('requirements', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('new', 'New'), ('contacted', 'Contacted'), ('closed', 'Closed')], default='new', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='enterprise_contact_requests', to='api.organization')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='enterprise_contact_requests', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='ProInviteRedemption',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('redeemed_at', models.DateTimeField(auto_now_add=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, default='', max_length=255)),
                ('invite', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='redemptions', to='api.proinvite')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pro_invite_redemptions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-redeemed_at'],
                'unique_together': {('invite', 'user')},
            },
        ),
        migrations.AddIndex(
            model_name='enterprisecontactrequest',
            index=models.Index(fields=['status', '-created_at'], name='api_enterpr_status_4559e3_idx'),
        ),
        migrations.AddIndex(
            model_name='enterprisecontactrequest',
            index=models.Index(fields=['user', '-created_at'], name='api_enterpr_user_id_d15658_idx'),
        ),
    ]
