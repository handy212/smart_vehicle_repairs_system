# Generated migration for adding user_welcome template type

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications_app', '0003_alter_notificationtemplate_template_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notificationtemplate',
            name='template_type',
            field=models.CharField(
                choices=[
                    ('appointment_reminder', 'Appointment Reminder'),
                    ('appointment_confirmation', 'Appointment Confirmation'),
                    ('appointment_cancelled', 'Appointment Cancelled'),
                    ('work_order_created', 'Work Order Created'),
                    ('work_order_completed', 'Work Order Completed'),
                    ('work_order_approved', 'Work Order Approved'),
                    ('invoice_generated', 'Invoice Generated'),
                    ('invoice_due', 'Invoice Due'),
                    ('invoice_overdue', 'Invoice Overdue'),
                    ('payment_received', 'Payment Received'),
                    ('inspection_completed', 'Inspection Completed'),
                    ('low_stock_alert', 'Low Stock Alert'),
                    ('service_due', 'Service Due'),
                    ('vehicle_ready', 'Vehicle Ready'),
                    ('parts_arrived', 'Parts Arrived'),
                    ('estimate_sent', 'Estimate Sent'),
                    ('estimate_approved', 'Estimate Approved'),
                    ('estimate_declined', 'Estimate Declined'),
                    ('estimate_expiring_soon', 'Estimate Expiring Soon'),
                    ('estimate_expired', 'Estimate Expired'),
                    ('user_welcome', 'User Welcome'),
                    ('custom', 'Custom'),
                ],
                max_length=50
            ),
        ),
    ]

