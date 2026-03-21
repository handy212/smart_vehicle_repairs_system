"""
Management command to create all missing email templates based on TEMPLATE_TYPE_CHOICES.
This ensures all notification types have default email templates.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.notifications_app.models import NotificationTemplate
from apps.accounts.management.commands._auditlog_utils import disable_auditlog

User = get_user_model()


class Command(BaseCommand):
    help = 'Create default email templates for all notification types that are missing'

    def handle(self, *args, **options):
        # Get a superuser to assign as created_by
        created_by_user = None
        if User.objects.filter(is_superuser=True).exists():
            created_by_user = User.objects.filter(is_superuser=True).first()
        elif User.objects.exists():
            created_by_user = User.objects.first()

        # Template definitions for each type
        template_definitions = {
            'appointment_reminder': {
                'name': 'Default Appointment Reminder Email',
                'subject': 'Reminder: Appointment on {appointment_date} at {appointment_time}',
                'body': '''Dear {customer_name},

This is a friendly reminder that you have an appointment scheduled:

APPOINTMENT DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date: {appointment_date}
Time: {appointment_time}
Vehicle: {vehicle}
Service: {service_description}
Technician: {technician_name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please arrive 10 minutes early for your appointment.

If you need to reschedule or cancel, please contact us as soon as possible.

Thank you!

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>This is a friendly reminder that you have an appointment scheduled:</p>
<h3>APPOINTMENT DETAILS:</h3>
<hr>
<p><strong>Date:</strong> {appointment_date}</p>
<p><strong>Time:</strong> {appointment_time}</p>
<p><strong>Vehicle:</strong> {vehicle}</p>
<p><strong>Service:</strong> {service_description}</p>
<p><strong>Technician:</strong> {technician_name}</p>
<hr>
<p>Please arrive 10 minutes early for your appointment.</p>
<p>If you need to reschedule or cancel, please contact us as soon as possible.</p>
<p>Thank you!</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'appointment_confirmation': {
                'name': 'Default Appointment Confirmation Email',
                'subject': 'Appointment Confirmed - {appointment_date}',
                'body': '''Dear {customer_name},

Your appointment has been confirmed!

APPOINTMENT DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date: {appointment_date}
Time: {appointment_time}
Vehicle: {vehicle}
Service: {service_description}
Technician: {technician_name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please arrive 10 minutes early for your appointment.

We look forward to serving you!

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>Your appointment has been confirmed!</p>
<h3>APPOINTMENT DETAILS:</h3>
<hr>
<p><strong>Date:</strong> {appointment_date}</p>
<p><strong>Time:</strong> {appointment_time}</p>
<p><strong>Vehicle:</strong> {vehicle}</p>
<p><strong>Service:</strong> {service_description}</p>
<p><strong>Technician:</strong> {technician_name}</p>
<hr>
<p>Please arrive 10 minutes early for your appointment.</p>
<p>We look forward to serving you!</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'appointment_cancelled': {
                'name': 'Default Appointment Cancelled Email',
                'subject': 'Appointment Cancelled - {appointment_date}',
                'body': '''Dear {customer_name},

Your appointment scheduled for {appointment_date} at {appointment_time} has been cancelled.

{f"Reason: {reason}" if "{reason}" else ""}

Vehicle: {vehicle}

Please contact us to reschedule at your convenience.

We apologize for any inconvenience.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>Your appointment scheduled for {appointment_date} at {appointment_time} has been cancelled.</p>
{f"<p><strong>Reason:</strong> {reason}</p>" if "{reason}" else ""}
<p><strong>Vehicle:</strong> {vehicle}</p>
<p>Please contact us to reschedule at your convenience.</p>
<p>We apologize for any inconvenience.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'work_order_created': {
                'name': 'Default Work Order Created Email',
                'subject': 'Work Order #{work_order_number} Created',
                'body': '''Dear {customer_name},

A new work order has been created for your vehicle.

WORK ORDER DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Work Order Number: {work_order_number}
Vehicle: {vehicle}
Service Description: {service_description}
Estimated Completion: {estimated_completion}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

We will keep you updated on the progress of your work order.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>A new work order has been created for your vehicle.</p>
<h3>WORK ORDER DETAILS:</h3>
<hr>
<p><strong>Work Order Number:</strong> {work_order_number}</p>
<p><strong>Vehicle:</strong> {vehicle}</p>
<p><strong>Service Description:</strong> {service_description}</p>
<p><strong>Estimated Completion:</strong> {estimated_completion}</p>
<hr>
<p>We will keep you updated on the progress of your work order.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'work_order_completed': {
                'name': 'Default Work Order Completed Email',
                'subject': 'Work Order #{work_order_number} Completed',
                'body': '''Dear {customer_name},

Your work order has been completed!

WORK ORDER DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Work Order Number: {work_order_number}
Vehicle: {vehicle}
Completion Date: {completion_date}
Total Amount: ${total_amount}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your vehicle is ready for pickup. Please contact us to arrange pickup.

Thank you for your business!

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>Your work order has been completed!</p>
<h3>WORK ORDER DETAILS:</h3>
<hr>
<p><strong>Work Order Number:</strong> {work_order_number}</p>
<p><strong>Vehicle:</strong> {vehicle}</p>
<p><strong>Completion Date:</strong> {completion_date}</p>
<p><strong>Total Amount:</strong> ${total_amount}</p>
<hr>
<p>Your vehicle is ready for pickup. Please contact us to arrange pickup.</p>
<p>Thank you for your business!</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'work_order_approved': {
                'name': 'Default Work Order Approved Email',
                'subject': 'Work Order #{work_order_number} Approved',
                'body': '''Dear {customer_name},

Your work order estimate has been approved!

WORK ORDER DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Work Order Number: {work_order_number}
Vehicle: {vehicle}
Estimate Amount: ${estimate_amount}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

We will begin work on your vehicle. You will receive updates as we progress.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>Your work order estimate has been approved!</p>
<h3>WORK ORDER DETAILS:</h3>
<hr>
<p><strong>Work Order Number:</strong> {work_order_number}</p>
<p><strong>Vehicle:</strong> {vehicle}</p>
<p><strong>Estimate Amount:</strong> ${estimate_amount}</p>
<hr>
<p>We will begin work on your vehicle. You will receive updates as we progress.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'vehicle_ready': {
                'name': 'Default Vehicle Ready Email',
                'subject': 'Your {vehicle} is Ready for Pickup',
                'body': '''Dear {customer_name},

Great news! Your vehicle is ready for pickup.

VEHICLE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vehicle: {vehicle}
Work Order: {work_order_number}
Ready Time: {ready_time}
Pickup Location: {pickup_location}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please contact us to schedule a convenient pickup time.

We look forward to seeing you!

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>Great news! Your vehicle is ready for pickup.</p>
<h3>VEHICLE DETAILS:</h3>
<hr>
<p><strong>Vehicle:</strong> {vehicle}</p>
<p><strong>Work Order:</strong> {work_order_number}</p>
<p><strong>Ready Time:</strong> {ready_time}</p>
<p><strong>Pickup Location:</strong> {pickup_location}</p>
<hr>
<p>Please contact us to schedule a convenient pickup time.</p>
<p>We look forward to seeing you!</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'inspection_completed': {
                'name': 'Default Inspection Completed Email',
                'subject': 'Inspection #{inspection_number} Completed - Ready for Review',
                'body': '''Dear {customer_name},

Your vehicle inspection has been completed and is ready for your review.

INSPECTION DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Inspection Number: {inspection_number}
Vehicle: {vehicle_display}
Inspection Date: {inspection_date}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please review and approve the inspection report by clicking the link below:
{portal_link}

You can access your customer portal to view the full inspection report, including detailed results, photos, and recommendations.

If you have any questions or concerns, please don't hesitate to contact us.

Thank you for choosing our service.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>Your vehicle inspection has been completed and is ready for your review.</p>
<h3>INSPECTION DETAILS:</h3>
<hr>
<p><strong>Inspection Number:</strong> {inspection_number}</p>
<p><strong>Vehicle:</strong> {vehicle_display}</p>
<p><strong>Inspection Date:</strong> {inspection_date}</p>
<hr>
<p>Please review and approve the inspection report by clicking the link below:</p>
<p style="margin: 20px 0;">
    <a href="{portal_link}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Review Inspection Report</a>
</p>
<p>Or copy and paste this link: <a href="{portal_link}">{portal_link}</a></p>
<p>You can access your customer portal to view the full inspection report, including detailed results, photos, and recommendations.</p>
<p>If you have any questions or concerns, please don't hesitate to contact us.</p>
<p>Thank you for choosing our service.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'low_stock_alert': {
                'name': 'Default Low Stock Alert Email',
                'subject': 'Low Stock Alert: {part_name}',
                'body': '''Alert: Low Stock Level

PART INFORMATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Part Name: {part_name}
Part Number: {part_number}
Current Stock: {current_stock}
Minimum Stock: {min_stock}
Recommended Reorder: {reorder_quantity}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This part is running low. Please consider reordering soon.

Best regards,
Inventory System''',
                'html_body': '''<html><body>
<h3>Alert: Low Stock Level</h3>
<h4>PART INFORMATION:</h4>
<hr>
<p><strong>Part Name:</strong> {part_name}</p>
<p><strong>Part Number:</strong> {part_number}</p>
<p><strong>Current Stock:</strong> {current_stock}</p>
<p><strong>Minimum Stock:</strong> {min_stock}</p>
<p><strong>Recommended Reorder:</strong> {reorder_quantity}</p>
<hr>
<p>This part is running low. Please consider reordering soon.</p>
<p>Best regards,<br>Inventory System</p>
</body></html>''',
            },
            'service_due': {
                'name': 'Default Service Due Email',
                'subject': 'Service Due Reminder: {vehicle}',
                'body': '''Dear {customer_name},

This is a reminder that your vehicle is due for service.

VEHICLE SERVICE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vehicle: {vehicle}
Service Type: {service_type}
Due Date: {due_date}
Miles Remaining: {miles_remaining}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please schedule an appointment to keep your vehicle in optimal condition.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>This is a reminder that your vehicle is due for service.</p>
<h3>VEHICLE SERVICE DETAILS:</h3>
<hr>
<p><strong>Vehicle:</strong> {vehicle}</p>
<p><strong>Service Type:</strong> {service_type}</p>
<p><strong>Due Date:</strong> {due_date}</p>
<p><strong>Miles Remaining:</strong> {miles_remaining}</p>
<hr>
<p>Please schedule an appointment to keep your vehicle in optimal condition.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'parts_arrived': {
                'name': 'Default Parts Arrived Email',
                'subject': 'Parts Arrived for {work_order_number}',
                'body': '''Dear {customer_name},

The parts for your work order have arrived.

PARTS INFORMATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Part Name: {part_name}
Part Number: {part_number}
Quantity: {quantity}
Work Order: {work_order_number}
Vehicle: {vehicle}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Work on your vehicle can now proceed. We will keep you updated on progress.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>The parts for your work order have arrived.</p>
<h3>PARTS INFORMATION:</h3>
<hr>
<p><strong>Part Name:</strong> {part_name}</p>
<p><strong>Part Number:</strong> {part_number}</p>
<p><strong>Quantity:</strong> {quantity}</p>
<p><strong>Work Order:</strong> {work_order_number}</p>
<p><strong>Vehicle:</strong> {vehicle}</p>
<hr>
<p>Work on your vehicle can now proceed. We will keep you updated on progress.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'estimate_sent': {
                'name': 'Default Estimate Sent Email',
                'subject': 'New Estimate #{estimate_number} - ${total}',
                'body': '''Dear {customer_name},

A new estimate has been prepared for your review.

ESTIMATE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estimate Number: {estimate_number}
Amount: ${total}
Valid Until: {valid_until}
Vehicle: {vehicle_display}
Description: {description}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please review and approve or decline this estimate to proceed.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>A new estimate has been prepared for your review.</p>
<h3>ESTIMATE DETAILS:</h3>
<hr>
<p><strong>Estimate Number:</strong> {estimate_number}</p>
<p><strong>Amount:</strong> ${total}</p>
<p><strong>Valid Until:</strong> {valid_until}</p>
<p><strong>Vehicle:</strong> {vehicle_display}</p>
<p><strong>Description:</strong> {description}</p>
<hr>
<p>Please review and approve or decline this estimate to proceed.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'estimate_expiring_soon': {
                'name': 'Default Estimate Expiring Soon Email',
                'subject': 'Estimate #{estimate_number} Expires in {days_until_expiration} Days',
                'body': '''Dear {customer_name},

Your estimate is expiring soon.

ESTIMATE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estimate Number: {estimate_number}
Amount: ${total}
Expires: {valid_until} ({days_until_expiration} days)
Vehicle: {vehicle_display}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please review and approve or decline this estimate before it expires.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>Your estimate is expiring soon.</p>
<h3>ESTIMATE DETAILS:</h3>
<hr>
<p><strong>Estimate Number:</strong> {estimate_number}</p>
<p><strong>Amount:</strong> ${total}</p>
<p><strong>Expires:</strong> {valid_until} ({days_until_expiration} days)</p>
<p><strong>Vehicle:</strong> {vehicle_display}</p>
<hr>
<p>Please review and approve or decline this estimate before it expires.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'estimate_expired': {
                'name': 'Default Estimate Expired Email',
                'subject': 'Estimate #{estimate_number} Has Expired',
                'body': '''Dear {customer_name},

Your estimate has expired.

ESTIMATE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estimate Number: {estimate_number}
Amount: ${total}
Expired: {valid_until}
Vehicle: {vehicle_display}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please contact us to request a new estimate or update this one.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>Your estimate has expired.</p>
<h3>ESTIMATE DETAILS:</h3>
<hr>
<p><strong>Estimate Number:</strong> {estimate_number}</p>
<p><strong>Amount:</strong> ${total}</p>
<p><strong>Expired:</strong> {valid_until}</p>
<p><strong>Vehicle:</strong> {vehicle_display}</p>
<hr>
<p>Please contact us to request a new estimate or update this one.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'estimate_approved': {
                'name': 'Default Estimate Approved Email',
                'subject': 'Estimate #{estimate_number} Approved',
                'body': '''Dear Team,

Customer has approved estimate {estimate_number}.

ESTIMATE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estimate Number: {estimate_number}
Customer: {customer_name}
Amount: ${total}
Vehicle: {vehicle_display}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You can now proceed to convert it to a work order or invoice.

Best regards,
{company_name} System''',
                'html_body': '''<html><body>
<p>Dear Team,</p>
<p>Customer has approved estimate {estimate_number}.</p>
<h3>ESTIMATE DETAILS:</h3>
<hr>
<p><strong>Estimate Number:</strong> {estimate_number}</p>
<p><strong>Customer:</strong> {customer_name}</p>
<p><strong>Amount:</strong> ${total}</p>
<p><strong>Vehicle:</strong> {vehicle_display}</p>
<hr>
<p>You can now proceed to convert it to a work order or invoice.</p>
<p>Best regards,<br>{company_name} System</p>
</body></html>''',
            },
            'estimate_declined': {
                'name': 'Default Estimate Declined Email',
                'subject': 'Estimate #{estimate_number} Declined',
                'body': '''Dear Team,

Customer has declined estimate {estimate_number}.

ESTIMATE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estimate Number: {estimate_number}
Customer: {customer_name}
Amount: ${total}
Vehicle: {vehicle_display}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please contact the customer to discuss alternatives.

Best regards,
{company_name} System''',
                'html_body': '''<html><body>
<p>Dear Team,</p>
<p>Customer has declined estimate {estimate_number}.</p>
<h3>ESTIMATE DETAILS:</h3>
<hr>
<p><strong>Estimate Number:</strong> {estimate_number}</p>
<p><strong>Customer:</strong> {customer_name}</p>
<p><strong>Amount:</strong> ${total}</p>
<p><strong>Vehicle:</strong> {vehicle_display}</p>
<hr>
<p>Please contact the customer to discuss alternatives.</p>
<p>Best regards,<br>{company_name} System</p>
</body></html>''',
            },
            'user_welcome': {
                'name': 'Default User Welcome Email',
                'subject': 'Welcome to {company_name}',
                'body': '''Dear {user_name},

Welcome to {company_name}!

Your account has been created successfully.

ACCOUNT DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: {email}
Username: {username}
Password: {password}
Role: {role}
Branch: {branch_info}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please log in at: {login_url}

For security reasons, please change your password after your first login.

If you have any questions, please don't hesitate to contact us.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {user_name},</p>
<p>Welcome to {company_name}!</p>
<p>Your account has been created successfully.</p>
<h3>ACCOUNT DETAILS:</h3>
<hr>
<p><strong>Email:</strong> {email}</p>
<p><strong>Username:</strong> {username}</p>
<p><strong>Password:</strong> {password}</p>
<p><strong>Role:</strong> {role}</p>
<p><strong>Branch:</strong> {branch_info}</p>
<hr>
<p>Please log in at: <a href="{login_url}">{login_url}</a></p>
<p>For security reasons, please change your password after your first login.</p>
<p>If you have any questions, please don't hesitate to contact us.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'password_reset': {
                'name': 'Default Password Reset Email',
                'subject': 'Password Reset - {company_name}',
                'body': '''Dear {user_name},

Your password has been reset.

ACCOUNT DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: {email}
Username: {username}
New Password: {new_password}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please log in at: {login_url}

For security reasons, please change your password after logging in.

If you did not request this password reset, please contact us immediately.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {user_name},</p>
<p>Your password has been reset.</p>
<h3>ACCOUNT DETAILS:</h3>
<hr>
<p><strong>Email:</strong> {email}</p>
<p><strong>Username:</strong> {username}</p>
<p><strong>New Password:</strong> {new_password}</p>
<hr>
<p>Please log in at: <a href="{login_url}">{login_url}</a></p>
<p>For security reasons, please change your password after logging in.</p>
<p>If you did not request this password reset, please contact us immediately.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'password_reset_link': {
                'name': 'Default Password Reset Link Email',
                'subject': 'Password Reset Request - {company_name}',
                'body': '''Dear {user_name},

You have requested to reset your password.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Click the link below to reset your password:
{reset_link}

This link will expire in 24 hours.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If you did not request this password reset, please ignore this email or contact us if you have concerns.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {user_name},</p>
<p>You have requested to reset your password.</p>
<hr>
<p>Click the link below to reset your password:</p>
<p><a href="{reset_link}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
<p>Or copy and paste this link: {reset_link}</p>
<p><em>This link will expire in 24 hours.</em></p>
<hr>
<p>If you did not request this password reset, please ignore this email or contact us if you have concerns.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'purchase_order_approval': {
                'name': 'Default Purchase Order Approval Email',
                'subject': 'Approval Required: PO {po_number}',
                'body': '''Hello,

Purchase Order {po_number} requires your approval.

DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PO Number: {po_number}
Supplier: {supplier}
Total: ${total}
Requested By: {requested_by}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please log in to the portal to review and approve.

Best regards,
{company_name} System''',
                'html_body': '''<html><body>
<p>Hello,</p>
<p>Purchase Order {po_number} requires your approval.</p>
<h3>DETAILS:</h3>
<hr>
<p><strong>PO Number:</strong> {po_number}</p>
<p><strong>Supplier:</strong> {supplier}</p>
<p><strong>Total:</strong> ${total}</p>
<p><strong>Requested By:</strong> {requested_by}</p>
<hr>
<p>Please log in to the portal to review and approve.</p>
<p>Best regards,<br>{company_name} System</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'stock_transfer_approval': {
                'name': 'Default Stock Transfer Approval Email',
                'subject': 'Approval Required: Transfer {transfer_number}',
                'body': '''Hello,

Stock Transfer {transfer_number} requires your approval.

DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Transfer Number: {transfer_number}
From: {source_branch}
To: {destination_branch}
Requested By: {requested_by}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please log in to the portal to review and approve.

Best regards,
{company_name} System''',
                'html_body': '''<html><body>
<p>Hello,</p>
<p>Stock Transfer {transfer_number} requires your approval.</p>
<h3>DETAILS:</h3>
<hr>
<p><strong>Transfer Number:</strong> {transfer_number}</p>
<p><strong>From:</strong> {source_branch}</p>
<p><strong>To:</strong> {destination_branch}</p>
<p><strong>Requested By:</strong> {requested_by}</p>
<hr>
<p>Please log in to the portal to review and approve.</p>
<p>Best regards,<br>{company_name} System</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'gate_pass_created': {
                'name': 'Default Gate Pass Created Email',
                'subject': 'Your {vehicle_display} is Ready for Pickup - {gate_pass_number}',
                'body': '''Dear {customer_name},

Good news! Your vehicle is ready for pickup.

GATE PASS DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gate Pass: {gate_pass_number}
Work Order: {work_order_number}
Vehicle: {vehicle_display}
Pickup By: {pickup_info}
Branch: {branch_name}
{branch_address}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please bring your identification and payment method when picking up your vehicle.

{pickup_notes}

If you have any questions, please contact us.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>Good news! Your vehicle is ready for pickup.</p>
<h3>GATE PASS DETAILS:</h3>
<hr>
<p><strong>Gate Pass:</strong> {gate_pass_number}</p>
<p><strong>Work Order:</strong> {work_order_number}</p>
<p><strong>Vehicle:</strong> {vehicle_display}</p>
<p><strong>Pickup By:</strong> {pickup_info}</p>
<p><strong>Branch:</strong> {branch_name}</p>
<p><strong>Address:</strong> {branch_address}</p>
<hr>
<p>Please bring your identification and payment method when picking up your vehicle.</p>
<p><strong>Pickup Notes:</strong> {pickup_notes}</p>
<p>If you have any questions, please contact us.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
            'gate_pass_issued': {
                'name': 'Default Gate Pass Issued Email',
                'subject': 'Gate Pass Issued - {gate_pass_number}',
                'body': '''Dear {customer_name},

Your gate pass has been issued and your vehicle is ready for pickup.

GATE PASS DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gate Pass: {gate_pass_number}
Work Order: {work_order_number}
Vehicle: {vehicle_display}
Pickup By: {pickup_info}
Branch: {branch_name}
Address: {branch_address}
Issued At: {issued_at}
Issued By: {issued_by_name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please bring your identification and payment method when picking up your vehicle.

Pickup Notes: {pickup_notes}

If you have any questions, please contact us.

Best regards,
{company_name} Team''',
                'html_body': '''<html><body>
<p>Dear {customer_name},</p>
<p>Your gate pass has been issued and your vehicle is ready for pickup.</p>
<h3>GATE PASS DETAILS:</h3>
<hr>
<p><strong>Gate Pass:</strong> {gate_pass_number}</p>
<p><strong>Work Order:</strong> {work_order_number}</p>
<p><strong>Vehicle:</strong> {vehicle_display}</p>
<p><strong>Pickup By:</strong> {pickup_info}</p>
<p><strong>Branch:</strong> {branch_name}</p>
<p><strong>Address:</strong> {branch_address}</p>
<p><strong>Issued At:</strong> {issued_at}</p>
<p><strong>Issued By:</strong> {issued_by_name}</p>
<hr>
<p>Please bring your identification and payment method when picking up your vehicle.</p>
<p><strong>Pickup Notes:</strong> {pickup_notes}</p>
<p>If you have any questions, please contact us.</p>
<p>Best regards,<br>{company_name} Team</p>
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p><strong>{company_name}</strong><br>
    {company_address}<br>
    Phone: {company_phone} | Email: {company_email}<br>
    <a href="{site_url}" style="color: #666; text-decoration: none;">{site_url}</a></p>
</div>
</body></html>''',
            },
        }

        created_count = 0
        updated_count = 0

        # Process each template type
        for template_type, template_def in template_definitions.items():
            template, created = NotificationTemplate.objects.update_or_create(
                template_type=template_type,
                channel='email',
                defaults={
                    'name': template_def['name'],
                    'subject': template_def['subject'],
                    'body': template_def['body'],
                    'html_body': template_def['html_body'],
                    'is_active': True,
                    'variables': {
                        'customer_name': "Customer's full name or company name",
                        'company_name': 'Your company name',
                        'work_order_number': 'Work order number',
                        'vehicle': 'Vehicle details (year, make, model)',
                        'invoice_number': 'Invoice number',
                        'total': 'Total amount',
                        'due_date': 'Due date',
                        'balance_due': 'Balance due',
                        'invoice_link': 'URL to view invoice',
                        'appointment_date': 'Appointment date',
                        'appointment_time': 'Appointment time',
                        'service_description': 'Service description',
                        'technician_name': 'Technician name',
                        'reason': 'Cancellation reason',
                        'estimated_completion': 'Estimated completion date/time',
                        'completion_date': 'Completion date',
                        'total_amount': 'Total amount',
                        'estimate_amount': 'Estimate amount',
                        'ready_time': 'Ready time',
                        'pickup_location': 'Pickup location',
                        'inspection_number': 'Inspection number',
                        'inspection_date': 'Inspection date',
                        'inspection_link': 'URL to view inspection',
                        'portal_link': 'URL to customer portal inspection page',
                        'vehicle_display': 'Vehicle display (year, make, model)',
                        'part_name': 'Part name',
                        'part_number': 'Part number',
                        'current_stock': 'Current stock level',
                        'min_stock': 'Minimum stock level',
                        'reorder_quantity': 'Recommended reorder quantity',
                        'service_type': 'Service type',
                        'miles_remaining': 'Miles remaining',
                        'quantity': 'Part quantity',
                        'estimate_number': 'Estimate number',
                        'days_until_expiration': 'Days until expiration',
                        'description': 'Estimate description',
                        'vehicle_display': 'Vehicle display (year, make, model)',
                        'user_name': 'User full name',
                        'email': 'User email address',
                        'username': 'Username',
                        'password': 'User password',
                        'new_password': 'New password',
                        'role': 'User role',
                        'branch_info': 'Branch information',
                        'login_url': 'Login page URL',
                        'reset_link': 'Password reset link URL',
                        'po_number': 'Purchase Order number',
                        'supplier': 'Supplier name',
                        'transfer_number': 'Stock Transfer number',
                        'source_branch': 'Source branch name',
                        'destination_branch': 'Destination branch name',
                        'requested_by': 'Name of requestor',
                    },
                    'created_by': created_by_user,
                }
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Created template: {template_type}')
                )
            else:
                updated_count += 1
                self.stdout.write(
                    self.style.WARNING(f'→ Updated existing template: {template_type}')
                )

        # Note: Invoice and payment templates are already created by migration 0002
        self.stdout.write(self.style.SUCCESS(
            f'\nCompleted! Created {created_count} new template(s), updated {updated_count} existing template(s).'
        ))
        self.stdout.write(
            self.style.NOTICE(
                '\nNote: Invoice and payment email templates are managed separately. '
                'Run "python manage.py setup_invoice_email_templates" to create/update those.'
            )
        )

