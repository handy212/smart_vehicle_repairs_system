# Generated manually - Data migration to create invoice email templates

from django.db import migrations


def create_invoice_email_templates(apps, schema_editor):
    """Create default invoice email templates"""
    NotificationTemplate = apps.get_model('notifications_app', 'NotificationTemplate')
    
    templates = [
        {
            'name': 'Invoice Sent - Default',
            'template_type': 'invoice_generated',
            'channel': 'email',
            'subject': 'Invoice {invoice_number} - ${total}',
            'body': '''Dear {customer_name},

Your invoice is ready for review.

INVOICE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Invoice Number: {invoice_number}
Invoice Date: {invoice_date}
Due Date: {due_date}

Work Order: {work_order_number}
Vehicle: {vehicle_info}

AMOUNT DUE: ${total}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please remit payment by the due date to avoid late fees.

For questions or to arrange payment, please contact us at your earliest convenience.

Thank you for your business!''',
            'html_body': '''<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Invoice {invoice_number}</h2>
        
        <p>Dear {customer_name},</p>
        
        <p>Your invoice is ready for review.</p>
        
        <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Invoice Details</h3>
            <p><strong>Invoice Number:</strong> {invoice_number}</p>
            <p><strong>Invoice Date:</strong> {invoice_date}</p>
            <p><strong>Due Date:</strong> {due_date}</p>
            <p><strong>Work Order:</strong> {work_order_number}</p>
            <p><strong>Vehicle:</strong> {vehicle_info}</p>
            <p style="font-size: 18px; font-weight: bold; color: #059669; margin-top: 15px;">
                Amount Due: ${total}
            </p>
        </div>
        
        <p>Please remit payment by the due date to avoid late fees.</p>
        
        <p>For questions or to arrange payment, please contact us at your earliest convenience.</p>
        
        <p>Thank you for your business!</p>
    </div>
</body>
</html>''',
        },
        {
            'name': 'Payment Received - Default',
            'template_type': 'payment_received',
            'channel': 'email',
            'subject': 'Payment Received - ${amount} - Invoice {invoice_number}',
            'body': '''Dear {customer_name},

Thank you for your payment!

PAYMENT RECEIPT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Payment Number: {payment_number}
Payment Date: {payment_date}
Payment Method: {payment_method}
Amount: ${amount}

Invoice: {invoice_number}
Balance Remaining: ${balance_remaining}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your payment has been successfully processed. This receipt serves as confirmation of your payment.

Thank you for your business!''',
            'html_body': '''<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #059669;">Payment Received</h2>
        
        <p>Dear {customer_name},</p>
        
        <p>Thank you for your payment!</p>
        
        <div style="background: #f0fdf4; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #059669;">
            <h3 style="margin-top: 0; color: #059669;">Payment Receipt</h3>
            <p><strong>Payment Number:</strong> {payment_number}</p>
            <p><strong>Payment Date:</strong> {payment_date}</p>
            <p><strong>Payment Method:</strong> {payment_method}</p>
            <p style="font-size: 18px; font-weight: bold; color: #059669; margin-top: 15px;">
                Amount: ${amount}
            </p>
            <p><strong>Invoice:</strong> {invoice_number}</p>
            <p><strong>Balance Remaining:</strong> ${balance_remaining}</p>
        </div>
        
        <p>Your payment has been successfully processed. This receipt serves as confirmation of your payment.</p>
        
        <p>Thank you for your business!</p>
    </div>
</body>
</html>''',
        },
        {
            'name': 'Invoice Due Reminder',
            'template_type': 'invoice_due',
            'channel': 'email',
            'subject': 'Reminder: Invoice {invoice_number} Due in {days_until_due} Days',
            'body': '''Dear {customer_name},

This is a friendly reminder that your invoice is due soon.

INVOICE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Invoice Number: {invoice_number}
Amount Due: ${balance_due}
Due Date: {due_date} ({days_until_due} days)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please remit payment by the due date to avoid late fees.

Thank you for your prompt attention to this matter.''',
            'html_body': '''<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #d97706;">Invoice Due Reminder</h2>
        
        <p>Dear {customer_name},</p>
        
        <p>This is a friendly reminder that your invoice is due soon.</p>
        
        <div style="background: #fef3c7; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #d97706;">
            <h3 style="margin-top: 0;">Invoice Details</h3>
            <p><strong>Invoice Number:</strong> {invoice_number}</p>
            <p><strong>Amount Due:</strong> ${balance_due}</p>
            <p><strong>Due Date:</strong> {due_date} ({days_until_due} days)</p>
        </div>
        
        <p>Please remit payment by the due date to avoid late fees.</p>
        
        <p>Thank you for your prompt attention to this matter.</p>
    </div>
</body>
</html>''',
        },
        {
            'name': 'Invoice Overdue Notice',
            'template_type': 'invoice_overdue',
            'channel': 'email',
            'subject': 'URGENT: Invoice {invoice_number} is Overdue - ${balance_due}',
            'body': '''Dear {customer_name},

Your invoice is now overdue.

OVERDUE INVOICE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Invoice Number: {invoice_number}
Amount Due: ${balance_due}
Due Date: {due_date}
Days Overdue: {days_overdue}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Late fees may apply. Please contact us immediately to arrange payment or discuss payment options.

We appreciate your immediate attention to this matter.''',
            'html_body': '''<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc2626;">Invoice Overdue</h2>
        
        <p>Dear {customer_name},</p>
        
        <p>Your invoice is now overdue.</p>
        
        <div style="background: #fee2e2; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3 style="margin-top: 0; color: #dc2626;">Overdue Invoice</h3>
            <p><strong>Invoice Number:</strong> {invoice_number}</p>
            <p><strong>Amount Due:</strong> ${balance_due}</p>
            <p><strong>Due Date:</strong> {due_date}</p>
            <p style="color: #dc2626; font-weight: bold;">
                Days Overdue: {days_overdue}
            </p>
        </div>
        
        <p>Late fees may apply. Please contact us immediately to arrange payment or discuss payment options.</p>
        
        <p>We appreciate your immediate attention to this matter.</p>
    </div>
</body>
</html>''',
        },
    ]

    for template_data in templates:
        NotificationTemplate.objects.update_or_create(
            name=template_data['name'],
            template_type=template_data['template_type'],
            channel=template_data['channel'],
            defaults={
                'subject': template_data.get('subject', ''),
                'body': template_data['body'],
                'html_body': template_data.get('html_body', ''),
                'is_active': True,
            }
        )


def remove_invoice_email_templates(apps, schema_editor):
    """Remove invoice email templates (reverse migration)"""
    NotificationTemplate = apps.get_model('notifications_app', 'NotificationTemplate')
    NotificationTemplate.objects.filter(
        template_type__in=['invoice_generated', 'invoice_due', 'invoice_overdue', 'payment_received'],
        name__in=[
            'Invoice Sent - Default',
            'Payment Received - Default',
            'Invoice Due Reminder',
            'Invoice Overdue Notice'
        ]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('notifications_app', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(
            create_invoice_email_templates,
            reverse_code=remove_invoice_email_templates
        ),
    ]

