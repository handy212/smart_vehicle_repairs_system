from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications_app', '0021_document_share_link'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='provider',
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name='notification',
            name='provider_message_id',
            field=models.CharField(blank=True, db_index=True, max_length=255),
        ),
        migrations.AddField(
            model_name='notification',
            name='provider_status',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='notification',
            name='provider_status_updated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(
                fields=['provider', 'provider_message_id'],
                name='notificatio_provide_0ab593_idx',
            ),
        ),
    ]
