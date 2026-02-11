#!/usr/bin/env python
"""
Verify PDF generation for all document types.
Run: python scripts/verify_pdf_generation.py
"""
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import django
from datetime import date, timedelta
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.http import HttpResponse
from apps.accounts.settings_utils import get_company_info
from apps.core.services.print_service import (
    generate_invoice_pdf,
    generate_estimate_pdf,
    generate_aging_report_pdf,
    generate_revenue_summary_pdf,
)


def check_currency_in_context():
    """Ensure currency_symbol is configured and available."""
    info = get_company_info()
    symbol = info.get('currency_symbol', '')
    print(f"  Currency from settings: {repr(symbol) or '(empty - will use default)'}")
    return bool(symbol)


def run_test(name, fn, *args, **kwargs):
    """Run a PDF generation test and report result."""
    try:
        result = fn(*args, **kwargs)
        if isinstance(result, HttpResponse) and result.status_code == 200:
            print(f"  ✓ {name}")
            return True
        print(f"  ✗ {name}: status={getattr(result, 'status_code', 'N/A')}")
        return False
    except Exception as e:
        print(f"  ✗ {name}: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("=== PDF Generation Verification ===\n")

    # 1. Currency config
    print("1. Currency configuration")
    has_currency = check_currency_in_context()
    if not has_currency:
        print("  ⚠ currency_symbol not set in admin - PDFs may show blank for amounts\n")
    else:
        print()

    # 2. Use real DB objects if available, else skip
    from apps.billing.models import Invoice, Estimate
    from apps.workorders.models import WorkOrder

    invoice = Invoice.objects.select_related('customer', 'branch').first()
    estimate = Estimate.objects.select_related('customer', 'branch').first()

    # Invoice PDF
    print("2. Invoice PDF")
    if invoice:
        run_test("Invoice", generate_invoice_pdf, invoice)
    else:
        print("  ⊘ No invoices in DB, skipping")

    # Estimate PDF
    print("\n3. Estimate PDF")
    if estimate:
        run_test("Estimate", generate_estimate_pdf, estimate)
    else:
        print("  ⊘ No estimates in DB, skipping")

    # Aging report
    print("\n4. Aging Report PDF")
    from django.utils import timezone
    today = timezone.now().date()
    run_test(
        "Aging Report",
        generate_aging_report_pdf,
        {
            'summary': {
                'total_outstanding': Decimal('100.00'),
                'current': Decimal('50'), 'current_percent': 50,
                'days_1_30': Decimal('30'), 'days_1_30_percent': 30,
                'days_31_60': Decimal('20'), 'days_31_60_percent': 20,
                'days_61_90': Decimal('0'), 'days_61_90_percent': 0,
                'days_over_90': Decimal('0'), 'days_over_90_percent': 0,
            },
            'details': {},
            'invoice_count': 0,
            'report_date': today,
            'branch': None,
        }
    )

    # Revenue summary
    print("\n5. Revenue Summary PDF")
    run_test(
        "Revenue Summary",
        generate_revenue_summary_pdf,
        {
            'start_date': today - timedelta(days=30),
            'end_date': today,
            'total_invoiced': Decimal('1000'),
            'total_paid': Decimal('500'),
            'total_outstanding': Decimal('500'),
            'invoice_count': 5,
            'status_breakdown': {'Paid': {'count': 2, 'total': Decimal('500'), 'percent': 50}},
            'branch': None,
        }
    )

    print("\n=== Verification complete ===")


if __name__ == '__main__':
    main()
