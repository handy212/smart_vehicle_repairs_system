"""
Sample context for admin email template preview.
"""
from datetime import date, timedelta
from typing import Any, Dict

from apps.accounts.settings_utils import get_company_info, get_site_url
from .currency import enrich_money_context, format_money
from .template_variables import get_variables_for_type


def _sample_values() -> Dict[str, Any]:
    company = get_company_info()
    base_url = get_site_url()
    today = date.today()
    due = today + timedelta(days=14)

    return {
        'customer_name': 'Jane Doe',
        'company_name': company.get('company_name', 'Smart Vehicle Repairs'),
        'company_email': company.get('company_email', 'service@example.com'),
        'company_phone': company.get('company_phone', '+1 555-0100'),
        'company_address': company.get('company_address', '123 Main Street'),
        'site_url': base_url,
        'vehicle': '2020 Toyota Camry',
        'vehicle_display': '2020 Toyota Camry',
        'vehicle_info': '2020 Toyota Camry',
        'service_description': 'Oil change and brake inspection',
        'technician_name': 'Alex Technician',
        'appointment_date': today.strftime('%B %d, %Y'),
        'appointment_time': '10:30 AM',
        'estimated_completion': (today + timedelta(days=2)).strftime('%B %d, %Y'),
        'completion_date': today.strftime('%B %d, %Y'),
        'reason': 'Customer requested reschedule',
        'invoice_number': 'INV-ACC-000105',
        'invoice_date': today.strftime('%B %d, %Y'),
        'due_date': due.strftime('%B %d, %Y'),
        'work_order_number': 'ACC-WO000042',
        'days_until_due': '7',
        'days_overdue': '3',
        'payment_number': 'PAY-ACC-000088',
        'payment_date': today.strftime('%B %d, %Y'),
        'payment_method': 'Card',
        'estimate_number': 'ACC-EST000033',
        'valid_until': due.strftime('%B %d, %Y'),
        'days_until_expiration': '5',
        'description': 'Brake pads and rotor replacement',
        'inspection_number': 'ACC-INS000012',
        'inspection_date': today.strftime('%B %d, %Y'),
        'inspection_link': f'{base_url}/portal/inspections/1',
        'portal_link': f'{base_url}/portal/inspections/1',
        'overall_result': 'Passed',
        'rejection_reason': 'Brake wear exceeds limit',
        'part_name': 'Brake Pad Set',
        'part_number': 'BP-4421',
        'current_stock': '2',
        'min_stock': '5',
        'reorder_quantity': '10',
        'quantity': '4',
        'service_type': 'Oil Change',
        'miles_remaining': '500',
        'ready_time': '3:00 PM',
        'pickup_location': 'Main Workshop',
        'user_name': 'John Smith',
        'email': 'john.smith@example.com',
        'username': 'jsmith',
        'password': '********',
        'new_password': 'TempPass123!',
        'role': 'Technician',
        'branch_info': 'Main Branch',
        'login_url': f'{base_url}/login',
        'reset_link': f'{base_url}/reset-password/sample-token',
        'po_number': 'PO-ACC-000099',
        'supplier': 'Auto Parts Wholesale',
        'transfer_number': 'TR-ACC-000015',
        'source_branch': 'Downtown',
        'destination_branch': 'Airport',
        'requested_by': 'Maria Manager',
        'gate_pass_number': 'GP-000007',
        'branch_name': 'Main Branch',
        'purpose': 'Vehicle pickup',
        'issued_at': today.strftime('%Y-%m-%d %H:%M'),
        'issued_by_name': 'Front Desk',
        'acquisition_id': '42',
        'request_number': 'ACQ-000003',
        'title': 'Lift equipment purchase',
        'expected_cost': '15000.00',
        'branch': 'Main Branch',
        'total': '1250.00',
        'total_amount': '1250.00',
        'amount': '500.00',
        'balance_due': '750.00',
        'balance_remaining': '750.00',
        'estimate_amount': '980.00',
        'amount_paid': '500.00',
        'invoice_link': f'{base_url}/portal/invoices/1',
        'payment_link': f'{base_url}/portal/payment/1',
        'estimate_link': f'{base_url}/portal/estimates/1',
    }


def build_sample_context(template_type: str = '') -> Dict[str, Any]:
    """Build sample context with all variables for the template type filled in."""
    samples = _sample_values()
    context: Dict[str, Any] = {}

    for var in get_variables_for_type(template_type):
        if var in samples:
            context[var] = samples[var]
        elif var.endswith('_display'):
            # Derive from raw key if present
            raw = var.replace('_display', '')
            if raw in samples:
                context[var] = format_money(samples[raw])
            else:
                context[var] = format_money('0')
        else:
            context[var] = samples.get(var, f'[{var}]')

    # Ensure company defaults always present
    for key, value in samples.items():
        context.setdefault(key, value)

    return enrich_money_context(context)
