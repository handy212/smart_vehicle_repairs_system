# Generated manually for gate pass notifications

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications_app', '0012_notificationtemplate_whatsapp_template_name_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='notification_type',
            field=models.CharField(
                choices=[
                    ('appointment', 'Appointment'),
                    ('work_order', 'Work Order'),
                    ('invoice', 'Invoice'),
                    ('payment', 'Payment'),
                    ('inspection', 'Inspection'),
                    ('inventory', 'Inventory'),
                    ('vehicle', 'Vehicle'),
                    ('system', 'System'),
                    ('roadside', 'Roadside Assistance'),
                    ('gatepass', 'Gate Pass'),
                    ('custom', 'Custom'),
                ],
                max_length=50
            ),
        ),
    ]
