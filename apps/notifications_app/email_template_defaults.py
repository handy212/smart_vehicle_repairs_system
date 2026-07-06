"""
Default notification email template content (plain + HTML).
Used by management commands and data migrations.
"""
from typing import Any, Dict, List

from .email_layout import detail_card_html, plain_footer, wrap_email_html

FOOTER = plain_footer().strip()

# Template names that ship with the product (safe to refresh on deploy with --refresh-defaults)
DEFAULT_TEMPLATE_NAMES = {
    'Invoice Sent - Default',
    'Payment Received - Default',
    'Invoice Due Reminder',
    'Invoice Overdue Notice',
    'Default Appointment Reminder Email',
    'Default Appointment Confirmation Email',
    'Default Appointment Cancelled Email',
    'Default Work Order Created Email',
    'Default Work Order Completed Email',
    'Default Work Order Approved Email',
    'Default Vehicle Ready Email',
    'Default Inspection Completed Email',
    'Default Low Stock Alert Email',
    'Default Service Due Email',
    'Default Parts Arrived Email',
    'Default Estimate Sent Email',
    'Default Estimate Expiring Soon Email',
    'Default Estimate Expired Email',
    'Default Estimate Approved Email',
    'Default Estimate Declined Email',
    'Default User Welcome Email',
    'Default Password Reset Email',
    'Default Password Reset Link Email',
    'Default Purchase Order Approval Email',
    'Default Stock Transfer Approval Email',
    'Default Gate Pass Created Email',
    'Default Gate Pass Issued Email',
}


def _html_block(
    greeting: str,
    intro: str,
    card_rows: str,
    closing: str,
    *,
    cta_label: str = '',
    cta_url: str = '',
    heading: str = '',
) -> str:
    heading_html = f'<h2 style="margin:0 0 16px;font-size:20px;color:#111827;">{heading}</h2>' if heading else ''
    inner = f'''
    {heading_html}
    <p style="margin:0 0 12px;">{greeting}</p>
    <p style="margin:0 0 16px;">{intro}</p>
    {detail_card_html(card_rows)}
    <p style="margin:16px 0 0;">{closing}</p>
    <p style="margin:24px 0 0;">Best regards,<br /><strong>{{company_name}}</strong> Team</p>
    '''
    return wrap_email_html(
        inner,
        cta_label=cta_label or None,
        cta_url=cta_url or None,
    )


def get_invoice_email_templates() -> List[Dict[str, Any]]:
    """Invoice/payment email templates (billing setup command)."""
    return [
        {
            'name': 'Invoice Sent - Default',
            'template_type': 'invoice_generated',
            'channel': 'email',
            'subject': 'Invoice {invoice_number} - {total_display}',
            'body': f'''Dear {{customer_name}},

Your invoice is ready for review.

INVOICE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Invoice Number: {{invoice_number}}
Invoice Date: {{invoice_date}}
Due Date: {{due_date}}
Work Order: {{work_order_number}}
Vehicle: {{vehicle_info}}

AMOUNT DUE: {{total_display}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please remit payment by the due date to avoid late fees.

For questions or to arrange payment, please contact us at your earliest convenience.

Thank you for your business!
{FOOTER}''',
            'html_body': _html_block(
                'Dear {customer_name},',
                'Your invoice is ready for review.',
                '''<p style="margin:6px 0;"><strong>Invoice Number:</strong> {invoice_number}</p>
                <p style="margin:6px 0;"><strong>Invoice Date:</strong> {invoice_date}</p>
                <p style="margin:6px 0;"><strong>Due Date:</strong> {due_date}</p>
                <p style="margin:6px 0;"><strong>Work Order:</strong> {work_order_number}</p>
                <p style="margin:6px 0;"><strong>Vehicle:</strong> {vehicle_info}</p>
                <p style="margin:12px 0 0;font-size:18px;font-weight:700;color:#059669;">
                  Amount Due: {total_display}</p>''',
                'Please remit payment by the due date to avoid late fees.',
                heading='Invoice {invoice_number}',
                cta_label='View invoice',
                cta_url='{invoice_link}',
            ),
        },
        {
            'name': 'Payment Received - Default',
            'template_type': 'payment_received',
            'channel': 'email',
            'subject': 'Payment Received - {amount_display} - Invoice {invoice_number}',
            'body': f'''Dear {{customer_name}},

Thank you for your payment!

PAYMENT RECEIPT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Payment Number: {{payment_number}}
Payment Date: {{payment_date}}
Payment Method: {{payment_method}}
Amount: {{amount_display}}
Invoice: {{invoice_number}}
Balance Remaining: {{balance_remaining_display}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your payment has been successfully processed.

Thank you for your business!
{FOOTER}''',
            'html_body': _html_block(
                'Dear {customer_name},',
                'Thank you for your payment!',
                '''<p style="margin:6px 0;"><strong>Payment Number:</strong> {payment_number}</p>
                <p style="margin:6px 0;"><strong>Payment Date:</strong> {payment_date}</p>
                <p style="margin:6px 0;"><strong>Payment Method:</strong> {payment_method}</p>
                <p style="margin:12px 0 0;font-size:18px;font-weight:700;color:#059669;">
                  Amount: {amount_display}</p>
                <p style="margin:6px 0;"><strong>Invoice:</strong> {invoice_number}</p>
                <p style="margin:6px 0;"><strong>Balance Remaining:</strong> {balance_remaining_display}</p>''',
                'Your payment has been successfully processed.',
                heading='Payment Received',
            ),
        },
        {
            'name': 'Invoice Due Reminder',
            'template_type': 'invoice_due',
            'channel': 'email',
            'subject': 'Reminder: Invoice {invoice_number} Due in {days_until_due} Days',
            'body': f'''Dear {{customer_name}},

This is a friendly reminder that your invoice is due soon.

INVOICE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Invoice Number: {{invoice_number}}
Amount Due: {{balance_due_display}}
Due Date: {{due_date}} ({{days_until_due}} days)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please remit payment by the due date to avoid late fees.
{FOOTER}''',
            'html_body': _html_block(
                'Dear {customer_name},',
                'This is a friendly reminder that your invoice is due soon.',
                '''<p style="margin:6px 0;"><strong>Invoice Number:</strong> {invoice_number}</p>
                <p style="margin:6px 0;"><strong>Amount Due:</strong> {balance_due_display}</p>
                <p style="margin:6px 0;"><strong>Due Date:</strong> {due_date} ({days_until_due} days)</p>''',
                'Please remit payment by the due date to avoid late fees.',
                heading='Invoice Due Reminder',
                cta_label='Pay now',
                cta_url='{payment_link}',
            ),
        },
        {
            'name': 'Invoice Overdue Notice',
            'template_type': 'invoice_overdue',
            'channel': 'email',
            'subject': 'URGENT: Invoice {invoice_number} is Overdue - {balance_due_display}',
            'body': f'''Dear {{customer_name}},

Your invoice is now overdue.

OVERDUE INVOICE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Invoice Number: {{invoice_number}}
Amount Due: {{balance_due_display}}
Due Date: {{due_date}}
Days Overdue: {{days_overdue}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Late fees may apply. Please contact us immediately to arrange payment.
{FOOTER}''',
            'html_body': wrap_email_html(
                '''<h2 style="margin:0 0 16px;font-size:20px;color:#dc2626;">Invoice Overdue</h2>
                <p style="margin:0 0 12px;">Dear {customer_name},</p>
                <p style="margin:0 0 16px;">Your invoice is now overdue.</p>'''
                + detail_card_html(
                    '''<p style="margin:6px 0;"><strong>Invoice Number:</strong> {invoice_number}</p>
                    <p style="margin:6px 0;"><strong>Amount Due:</strong> {balance_due_display}</p>
                    <p style="margin:6px 0;"><strong>Due Date:</strong> {due_date}</p>
                    <p style="margin:6px 0;color:#dc2626;font-weight:700;">
                      Days Overdue: {days_overdue}</p>'''
                )
                + '''<p style="margin:16px 0 0;">Late fees may apply. Please contact us immediately.</p>
                <p style="margin:24px 0 0;">Best regards,<br /><strong>{company_name}</strong> Team</p>''',
                cta_label='Pay now',
                cta_url='{payment_link}',
            ),
        },
    ]


def _appointment_template(
    template_type: str,
    name: str,
    subject: str,
    intro: str,
    extra_plain: str = '',
    extra_html: str = '',
) -> Dict[str, Any]:
    details_plain = '''Date: {appointment_date}
Time: {appointment_time}
Vehicle: {vehicle}
Service: {service_description}
Technician: {technician_name}'''
    details_html = '''<p style="margin:6px 0;"><strong>Date:</strong> {appointment_date}</p>
    <p style="margin:6px 0;"><strong>Time:</strong> {appointment_time}</p>
    <p style="margin:6px 0;"><strong>Vehicle:</strong> {vehicle}</p>
    <p style="margin:6px 0;"><strong>Service:</strong> {service_description}</p>
    <p style="margin:6px 0;"><strong>Technician:</strong> {technician_name}</p>'''
    return {
        'name': name,
        'template_type': template_type,
        'channel': 'email',
        'subject': subject,
        'body': f'''Dear {{customer_name}},

{intro}

APPOINTMENT DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{details_plain}
{extra_plain}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{FOOTER}''',
        'html_body': _html_block(
            'Dear {customer_name},',
            intro,
            details_html + extra_html,
            'We look forward to serving you.',
        ),
    }


def get_all_email_template_definitions() -> Dict[str, Dict[str, Any]]:
    """All default email templates keyed by template_type."""
    definitions: Dict[str, Dict[str, Any]] = {}

    definitions['appointment_reminder'] = _appointment_template(
        'appointment_reminder',
        'Default Appointment Reminder Email',
        'Reminder: Appointment on {appointment_date} at {appointment_time}',
        'This is a friendly reminder that you have an appointment scheduled.',
        '\nPlease arrive 10 minutes early for your appointment.',
        '<p style="margin:12px 0 0;">Please arrive 10 minutes early.</p>',
    )
    definitions['appointment_confirmation'] = _appointment_template(
        'appointment_confirmation',
        'Default Appointment Confirmation Email',
        'Appointment Confirmed - {appointment_date}',
        'Your appointment has been confirmed!',
    )
    definitions['appointment_cancelled'] = {
        'name': 'Default Appointment Cancelled Email',
        'template_type': 'appointment_cancelled',
        'channel': 'email',
        'subject': 'Appointment Cancelled - {appointment_date}',
        'body': f'''Dear {{customer_name}},

Your appointment scheduled for {{appointment_date}} at {{appointment_time}} has been cancelled.

Reason: {{reason}}

Vehicle: {{vehicle}}

Please contact us to reschedule at your convenience.

We apologize for any inconvenience.
{FOOTER}''',
        'html_body': _html_block(
            'Dear {customer_name},',
            'Your appointment has been cancelled.',
            '''<p style="margin:6px 0;"><strong>Date:</strong> {appointment_date}</p>
            <p style="margin:6px 0;"><strong>Time:</strong> {appointment_time}</p>
            <p style="margin:6px 0;"><strong>Vehicle:</strong> {vehicle}</p>
            <p style="margin:6px 0;"><strong>Reason:</strong> {reason}</p>''',
            'Please contact us to reschedule at your convenience.',
            heading='Appointment Cancelled',
        ),
    }

    definitions['work_order_created'] = {
        'name': 'Default Work Order Created Email',
        'template_type': 'work_order_created',
        'channel': 'email',
        'subject': 'Work Order #{work_order_number} Created',
        'body': f'''Dear {{customer_name}},

A new work order has been created for your vehicle.

WORK ORDER DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Work Order Number: {{work_order_number}}
Vehicle: {{vehicle}}
Service Description: {{service_description}}
Estimated Completion: {{estimated_completion}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{FOOTER}''',
        'html_body': _html_block(
            'Dear {customer_name},',
            'A new work order has been created for your vehicle.',
            '''<p style="margin:6px 0;"><strong>Work Order:</strong> {work_order_number}</p>
            <p style="margin:6px 0;"><strong>Vehicle:</strong> {vehicle}</p>
            <p style="margin:6px 0;"><strong>Service:</strong> {service_description}</p>
            <p style="margin:6px 0;"><strong>Est. Completion:</strong> {estimated_completion}</p>''',
            'We will keep you updated on progress.',
            heading='Work Order #{work_order_number}',
        ),
    }

    definitions['work_order_completed'] = {
        'name': 'Default Work Order Completed Email',
        'template_type': 'work_order_completed',
        'channel': 'email',
        'subject': 'Work Order #{work_order_number} Completed',
        'body': f'''Dear {{customer_name}},

Your work order has been completed!

WORK ORDER DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Work Order Number: {{work_order_number}}
Vehicle: {{vehicle}}
Completion Date: {{completion_date}}
Total Amount: {{total_amount_display}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your vehicle is ready for pickup.
{FOOTER}''',
        'html_body': _html_block(
            'Dear {customer_name},',
            'Your work order has been completed!',
            '''<p style="margin:6px 0;"><strong>Work Order:</strong> {work_order_number}</p>
            <p style="margin:6px 0;"><strong>Vehicle:</strong> {vehicle}</p>
            <p style="margin:6px 0;"><strong>Completed:</strong> {completion_date}</p>
            <p style="margin:12px 0 0;font-size:18px;font-weight:700;">Total: {total_amount_display}</p>''',
            'Your vehicle is ready for pickup.',
            heading='Work Order Complete',
        ),
    }

    definitions['work_order_approved'] = {
        'name': 'Default Work Order Approved Email',
        'template_type': 'work_order_approved',
        'channel': 'email',
        'subject': 'Work Order #{work_order_number} Approved',
        'body': f'''Dear {{customer_name}},

Your work order estimate has been approved!

WORK ORDER DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Work Order Number: {{work_order_number}}
Vehicle: {{vehicle}}
Estimate Amount: {{estimate_amount_display}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{FOOTER}''',
        'html_body': _html_block(
            'Dear {customer_name},',
            'Your work order estimate has been approved!',
            '''<p style="margin:6px 0;"><strong>Work Order:</strong> {work_order_number}</p>
            <p style="margin:6px 0;"><strong>Vehicle:</strong> {vehicle}</p>
            <p style="margin:12px 0 0;font-size:18px;font-weight:700;">Estimate: {estimate_amount_display}</p>''',
            'We will begin work on your vehicle shortly.',
            heading='Estimate Approved',
        ),
    }

    definitions['vehicle_ready'] = {
        'name': 'Default Vehicle Ready Email',
        'template_type': 'vehicle_ready',
        'channel': 'email',
        'subject': 'Your {vehicle} is Ready for Pickup',
        'body': f'''Dear {{customer_name}},

Great news! Your vehicle is ready for pickup.

Vehicle: {{vehicle}}
Work Order: {{work_order_number}}
Pickup Location: {{pickup_location}}
Ready Time: {{ready_time}}

{FOOTER}''',
        'html_body': _html_block(
            'Dear {customer_name},',
            'Great news! Your vehicle is ready for pickup.',
            '''<p style="margin:6px 0;"><strong>Vehicle:</strong> {vehicle}</p>
            <p style="margin:6px 0;"><strong>Work Order:</strong> {work_order_number}</p>
            <p style="margin:6px 0;"><strong>Location:</strong> {pickup_location}</p>
            <p style="margin:6px 0;"><strong>Ready:</strong> {ready_time}</p>''',
            'Please contact us to arrange pickup.',
            heading='Vehicle Ready',
        ),
    }

    definitions['estimate_sent'] = {
        'name': 'Default Estimate Sent Email',
        'template_type': 'estimate_sent',
        'channel': 'email',
        'subject': 'New Estimate #{estimate_number} - {total_display}',
        'body': f'''Dear {{customer_name}},

A new estimate has been prepared for your review.

Estimate Number: {{estimate_number}}
Amount: {{total_display}}
Valid Until: {{valid_until}}
Vehicle: {{vehicle_display}}

Description: {{description}}

Please review and approve or decline this estimate.
{FOOTER}''',
        'html_body': _html_block(
            'Dear {customer_name},',
            'A new estimate has been prepared for your review.',
            '''<p style="margin:6px 0;"><strong>Estimate:</strong> {estimate_number}</p>
            <p style="margin:12px 0 0;font-size:18px;font-weight:700;">Amount: {total_display}</p>
            <p style="margin:6px 0;"><strong>Valid Until:</strong> {valid_until}</p>
            <p style="margin:6px 0;"><strong>Vehicle:</strong> {vehicle_display}</p>
            <p style="margin:6px 0;"><strong>Description:</strong> {description}</p>''',
            'Please review and respond at your earliest convenience.',
            heading='Estimate #{estimate_number}',
            cta_label='View estimate',
            cta_url='{estimate_link}',
        ),
    }

    definitions['estimate_expiring_soon'] = {
        'name': 'Default Estimate Expiring Soon Email',
        'template_type': 'estimate_expiring_soon',
        'channel': 'email',
        'subject': 'Estimate #{estimate_number} Expires in {days_until_expiration} Days',
        'body': f'''Dear {{customer_name}},

Your estimate is expiring soon.

Estimate Number: {{estimate_number}}
Amount: {{total_display}}
Expires: {{valid_until}} ({{days_until_expiration}} days)
Vehicle: {{vehicle_display}}
{FOOTER}''',
        'html_body': _html_block(
            'Dear {customer_name},',
            'Your estimate is expiring soon.',
            '''<p style="margin:6px 0;"><strong>Estimate:</strong> {estimate_number}</p>
            <p style="margin:6px 0;"><strong>Amount:</strong> {total_display}</p>
            <p style="margin:6px 0;"><strong>Expires:</strong> {valid_until}</p>''',
            'Please approve or decline before it expires.',
            heading='Estimate Expiring Soon',
            cta_label='View estimate',
            cta_url='{estimate_link}',
        ),
    }

    definitions['estimate_expired'] = {
        'name': 'Default Estimate Expired Email',
        'template_type': 'estimate_expired',
        'channel': 'email',
        'subject': 'Estimate #{estimate_number} Has Expired',
        'body': f'''Dear {{customer_name}},

Your estimate has expired.

Estimate Number: {{estimate_number}}
Amount: {{total_display}}
Expired: {{valid_until}}
{FOOTER}''',
        'html_body': _html_block(
            'Dear {customer_name},',
            'Your estimate has expired.',
            '''<p style="margin:6px 0;"><strong>Estimate:</strong> {estimate_number}</p>
            <p style="margin:6px 0;"><strong>Amount:</strong> {total_display}</p>
            <p style="margin:6px 0;"><strong>Expired:</strong> {valid_until}</p>''',
            'Please contact us to request a new estimate.',
            heading='Estimate Expired',
        ),
    }

    definitions['user_welcome'] = {
        'name': 'Default User Welcome Email',
        'template_type': 'user_welcome',
        'channel': 'email',
        'subject': 'Welcome to {company_name}',
        'body': f'''Hello {{user_name}},

Welcome to {{company_name}}!

Your account has been created.
Username: {{username}}
Email: {{email}}
Role: {{role}}
{{branch_info}}

Login: {{login_url}}

Best regards,
{{company_name}} Team
{FOOTER}''',
        'html_body': _html_block(
            'Hello {user_name},',
            'Welcome to {company_name}! Your account has been created.',
            '''<p style="margin:6px 0;"><strong>Username:</strong> {username}</p>
            <p style="margin:6px 0;"><strong>Email:</strong> {email}</p>
            <p style="margin:6px 0;"><strong>Role:</strong> {role}</p>
            <p style="margin:6px 0;">{branch_info}</p>''',
            'We are glad to have you on the team.',
            heading='Welcome',
            cta_label='Sign in',
            cta_url='{login_url}',
        ),
    }

    definitions['password_reset'] = {
        'name': 'Default Password Reset Email',
        'template_type': 'password_reset',
        'channel': 'email',
        'subject': 'Password Reset - {company_name}',
        'body': f'''Hello {{user_name}},

Your password has been reset.

Username: {{username}}
New Password: {{new_password}}

Login: {{login_url}}

Please change your password after logging in.
{FOOTER}''',
        'html_body': _html_block(
            'Hello {user_name},',
            'Your password has been reset by an administrator.',
            '''<p style="margin:6px 0;"><strong>Username:</strong> {username}</p>
            <p style="margin:6px 0;"><strong>New Password:</strong> {new_password}</p>''',
            'Please change your password after logging in.',
            heading='Password Reset',
            cta_label='Sign in',
            cta_url='{login_url}',
        ),
    }

    definitions['password_reset_link'] = {
        'name': 'Default Password Reset Link Email',
        'template_type': 'password_reset_link',
        'channel': 'email',
        'subject': 'Password Reset Request - {company_name}',
        'body': f'''Hello {{user_name}},

We received a request to reset your password.

Use this link to reset your password: {{reset_link}}

If you did not request this, please ignore this email.
{FOOTER}''',
        'html_body': _html_block(
            'Hello {user_name},',
            'We received a request to reset your password.',
            '<p style="margin:6px 0;">Click the button below to choose a new password.</p>',
            'If you did not request this, please ignore this email.',
            heading='Reset your password',
            cta_label='Reset password',
            cta_url='{reset_link}',
        ),
    }

    # Merge remaining types from legacy command (inspection, inventory, etc.) with updated currency
    _merge_legacy_definitions(definitions)
    return definitions


def _merge_legacy_definitions(definitions: Dict[str, Dict[str, Any]]) -> None:
    """Add templates not yet migrated to structured builders (inspection, stock, gate pass)."""
    legacy = {
        'inspection_completed': (
            'Default Inspection Completed Email',
            'Inspection {inspection_number} Completed',
            'Your vehicle inspection has been completed.',
            '''Inspection Number: {inspection_number}
Vehicle: {vehicle_display}
Date: {inspection_date}
View: {inspection_link}''',
        ),
        'low_stock_alert': (
            'Default Low Stock Alert Email',
            'Low Stock Alert: {part_name}',
            'A part has fallen below minimum stock level.',
            '''Part: {part_name} ({part_number})
Current Stock: {current_stock}
Minimum: {min_stock}
Reorder Qty: {reorder_quantity}''',
        ),
        'service_due': (
            'Default Service Due Email',
            'Service Due Reminder - {vehicle}',
            'Your vehicle is due for service.',
            '''Vehicle: {vehicle}
Service: {service_type}
Due Date: {due_date}
Miles Remaining: {miles_remaining}''',
        ),
        'parts_arrived': (
            'Default Parts Arrived Email',
            'Parts Arrived for Work Order {work_order_number}',
            'Parts for your vehicle have arrived.',
            '''Part: {part_name} ({part_number})
Quantity: {quantity}
Work Order: {work_order_number}
Vehicle: {vehicle}''',
        ),
        'purchase_order_approval': (
            'Default Purchase Order Approval Email',
            'Approval Required: PO {po_number}',
            'A purchase order requires your approval.',
            '''PO: {po_number}
Supplier: {supplier}
Total: {total_display}
Requested By: {requested_by}''',
        ),
        'stock_transfer_approval': (
            'Default Stock Transfer Approval Email',
            'Approval Required: Transfer {transfer_number}',
            'A stock transfer requires your approval.',
            '''Transfer: {transfer_number}
From: {source_branch}
To: {destination_branch}
Requested By: {requested_by}''',
        ),
    }
    for template_type, (name, subject, intro, details) in legacy.items():
        if template_type in definitions:
            continue
        definitions[template_type] = {
            'name': name,
            'template_type': template_type,
            'channel': 'email',
            'subject': subject,
            'body': f'''{intro}

{details}

{FOOTER}''',
            'html_body': _html_block(
                'Hello,',
                intro,
                ''.join(
                    f'<p style="margin:6px 0;">{line}</p>'
                    for line in details.split('\n')
                ),
                'Please review in the system.',
            ),
        }

    for template_type, name in (
        ('estimate_approved', 'Default Estimate Approved Email'),
        ('estimate_declined', 'Default Estimate Declined Email'),
        ('gate_pass_created', 'Default Gate Pass Created Email'),
        ('gate_pass_issued', 'Default Gate Pass Issued Email'),
    ):
        if template_type not in definitions:
            definitions[template_type] = {
                'name': name,
                'template_type': template_type,
                'channel': 'email',
                'subject': f'Notification: {template_type.replace("_", " ").title()}',
                'body': f'{{customer_name}},\n\nYou have a new notification.\n\n{FOOTER}',
                'html_body': _html_block(
                    'Dear {customer_name},',
                    'You have a new notification.',
                    '<p style="margin:6px 0;">Please check your portal for details.</p>',
                    'Thank you.',
                ),
            }


TEMPLATE_VARIABLES_DOC = {
    'customer_name': "Customer's full name or company name",
    'company_name': 'Your company name',
    'currency_symbol': 'System currency symbol (e.g. ₵)',
    'total_display': 'Formatted total with currency symbol',
    'amount_display': 'Formatted payment amount',
    'balance_due_display': 'Formatted balance due',
    'balance_remaining_display': 'Formatted remaining balance',
    'total_amount_display': 'Formatted work order total',
    'estimate_amount_display': 'Formatted estimate amount',
    'work_order_number': 'Work order number',
    'vehicle': 'Vehicle details',
    'invoice_number': 'Invoice number',
    'invoice_link': 'URL to view invoice',
    'payment_link': 'URL to pay invoice',
    'estimate_link': 'URL to view estimate',
}
