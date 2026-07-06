"""
Template variable definitions per notification type (single source of truth).
Used for admin hints, preview sample context, and validation.
"""
import re
from string import Formatter
from typing import Dict, List, Set

# Available in every template via _get_default_context / preview
COMMON_VARIABLES: List[str] = [
    'customer_name',
    'company_name',
    'company_email',
    'company_phone',
    'company_address',
    'site_url',
    'currency_symbol',
]

MONEY_DISPLAY_VARIABLES: List[str] = [
    'total_display',
    'amount_display',
    'balance_due_display',
    'balance_remaining_display',
    'total_amount_display',
    'estimate_amount_display',
    'amount_paid_display',
]

# Raw money keys triggers still pass (auto-enriched to *_display on send)
MONEY_RAW_VARIABLES: List[str] = [
    'total',
    'amount',
    'balance_due',
    'balance_remaining',
    'total_amount',
    'estimate_amount',
    'amount_paid',
    'expected_cost',
]

VARIABLES_BY_TEMPLATE_TYPE: Dict[str, List[str]] = {
    'appointment_reminder': COMMON_VARIABLES + [
        'appointment_date', 'appointment_time', 'vehicle', 'service_description', 'technician_name',
    ],
    'appointment_confirmation': COMMON_VARIABLES + [
        'appointment_date', 'appointment_time', 'vehicle', 'service_description', 'technician_name',
    ],
    'appointment_cancelled': COMMON_VARIABLES + [
        'appointment_date', 'appointment_time', 'vehicle', 'reason',
    ],
    'work_order_created': COMMON_VARIABLES + [
        'work_order_number', 'vehicle', 'vehicle_display', 'service_description', 'estimated_completion',
    ],
    'work_order_completed': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'work_order_number', 'vehicle', 'vehicle_display', 'completion_date', 'total_amount',
    ],
    'work_order_approved': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'work_order_number', 'vehicle', 'vehicle_display', 'estimate_amount',
    ],
    'invoice_generated': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'invoice_number', 'invoice_date', 'due_date', 'work_order_number', 'vehicle_info',
        'vehicle_display', 'total', 'balance_due', 'amount_paid', 'invoice_link', 'payment_link',
    ],
    'invoice_due': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'invoice_number', 'due_date', 'days_until_due', 'balance_due', 'total',
        'invoice_link', 'payment_link',
    ],
    'invoice_overdue': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'invoice_number', 'due_date', 'days_overdue', 'balance_due', 'total',
        'invoice_link', 'payment_link',
    ],
    'payment_received': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'payment_number', 'payment_date', 'payment_method', 'invoice_number', 'amount',
        'balance_remaining', 'invoice_link', 'payment_link',
    ],
    'inspection_completed': COMMON_VARIABLES + [
        'inspection_number', 'vehicle_display', 'vehicle', 'inspection_date',
        'inspection_link', 'portal_link', 'overall_result',
    ],
    'inspection_approved': COMMON_VARIABLES + [
        'inspection_number', 'vehicle_display', 'vehicle', 'inspection_date',
        'inspection_link', 'portal_link', 'overall_result',
    ],
    'inspection_rejected': COMMON_VARIABLES + [
        'inspection_number', 'vehicle_display', 'vehicle', 'inspection_date',
        'inspection_link', 'portal_link', 'rejection_reason',
    ],
    'inspection_sent_to_customer': COMMON_VARIABLES + [
        'inspection_number', 'vehicle_display', 'vehicle', 'inspection_date',
        'inspection_link', 'portal_link', 'overall_result',
    ],
    'low_stock_alert': [
        'company_name', 'part_name', 'part_number', 'current_stock', 'min_stock', 'reorder_quantity',
    ],
    'service_due': COMMON_VARIABLES + [
        'vehicle', 'service_type', 'due_date', 'miles_remaining',
    ],
    'vehicle_ready': COMMON_VARIABLES + [
        'vehicle', 'work_order_number', 'pickup_location', 'ready_time',
    ],
    'parts_arrived': COMMON_VARIABLES + [
        'part_name', 'part_number', 'quantity', 'work_order_number', 'vehicle',
    ],
    'estimate_sent': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'estimate_number', 'total', 'valid_until', 'vehicle_display', 'description', 'estimate_link',
    ],
    'estimate_expiring_soon': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'estimate_number', 'total', 'valid_until', 'days_until_expiration', 'vehicle_display', 'estimate_link',
    ],
    'estimate_expired': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'estimate_number', 'total', 'valid_until', 'vehicle_display',
    ],
    'estimate_approved': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'estimate_number', 'customer_name', 'total', 'vehicle_display',
    ],
    'estimate_declined': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'estimate_number', 'customer_name', 'total', 'vehicle_display',
    ],
    'user_welcome': [
        'user_name', 'email', 'username', 'password', 'role', 'login_url', 'branch_info', 'company_name',
        'company_email', 'company_phone', 'company_address', 'site_url',
    ],
    'password_reset': [
        'user_name', 'email', 'username', 'new_password', 'login_url', 'company_name',
        'company_email', 'company_phone', 'company_address', 'site_url',
    ],
    'password_reset_link': [
        'user_name', 'email', 'username', 'reset_link', 'company_name',
        'company_email', 'company_phone', 'company_address', 'site_url',
    ],
    'purchase_order_approval': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES + [
        'po_number', 'supplier', 'total', 'requested_by',
    ],
    'stock_transfer_approval': COMMON_VARIABLES + [
        'transfer_number', 'source_branch', 'destination_branch', 'requested_by',
    ],
    'gate_pass_created': COMMON_VARIABLES + [
        'gate_pass_number', 'vehicle_display', 'customer_name', 'branch_name', 'purpose',
    ],
    'gate_pass_issued': COMMON_VARIABLES + [
        'gate_pass_number', 'vehicle_display', 'customer_name', 'branch_name',
        'issued_at', 'issued_by_name',
    ],
    'asset_acquisition_approval': COMMON_VARIABLES + [
        'acquisition_id', 'request_number', 'title', 'expected_cost', 'requested_by', 'branch',
    ],
    'custom': COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES,
}


def get_variables_for_type(template_type: str) -> List[str]:
    """Return unique variable names for a template type (without braces)."""
    keys = VARIABLES_BY_TEMPLATE_TYPE.get(template_type) or (COMMON_VARIABLES + MONEY_DISPLAY_VARIABLES)
    seen = set()
    ordered: List[str] = []
    for key in keys:
        if key not in seen:
            seen.add(key)
            ordered.append(key)
    return ordered


def get_variable_hints(template_type: str) -> List[str]:
    """Return {variable} strings for UI."""
    return [f'{{{name}}}' for name in get_variables_for_type(template_type)]


def find_unresolved_placeholders(template_string: str, context: Dict) -> List[str]:
    """Find {placeholders} in template that are missing from context."""
    if not template_string:
        return []
    unresolved: Set[str] = set()
    formatter = Formatter()
    for literal_text, field_name, format_spec, conversion in formatter.parse(template_string):
        if field_name and field_name not in context:
            unresolved.add(field_name)
    # Also catch simple {word} patterns Formatter might miss in malformed templates
    for match in re.findall(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}', template_string):
        if match not in context:
            unresolved.add(match)
    return sorted(unresolved)
