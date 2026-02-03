# Generated manually for gate pass notification templates

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications_app', '0013_add_gatepass_notification_type'),
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
                    ('inspection_approved', 'Inspection Approved'),
                    ('inspection_rejected', 'Inspection Rejected'),
                    ('inspection_sent_to_customer', 'Inspection Sent to Customer'),
                    ('low_stock_alert', 'Low Stock Alert'),
                    ('service_due', 'Service Due'),
                    ('vehicle_ready', 'Vehicle Ready'),
                    ('parts_arrived', 'Parts Arrived'),
                    ('estimate_sent', 'Estimate Sent'),
                    ('estimate_approved', 'Estimate Approved'),
                    ('estimate_declined', 'Estimate Declined'),
                    ('estimate_expiring_soon', 'Estimate Expiring Soon'),
                    ('estimate_expired', 'Estimate Expired'),
                    ('gate_pass_created', 'Gate Pass Created'),
                    ('gate_pass_issued', 'Gate Pass Issued'),
                    ('user_welcome', 'User Welcome'),
                    ('password_reset', 'Password Reset'),
                    ('password_reset_link', 'Password Reset Link'),
                    ('custom', 'Custom'),
                ],
                max_length=50,
            ),
        ),
    ]
