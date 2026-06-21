"""Metadata for QuickBooks Online account and item mappings."""

from apps.accounting.models import AccountingControl
from apps.billing.models import BillPayment, InvoiceLineItem, Payment

# Human labels for AccountingControl fields (used in mapping UI).
CONTROL_ACCOUNT_LABELS = {
    'accounts_receivable_account': 'Accounts Receivable',
    'accounts_payable_account': 'Accounts Payable',
    'customer_prepayment_account': 'Customer Prepayments',
    'sales_revenue_account': 'Sales Revenue',
    'sales_discount_account': 'Sales Returns & Allowances',
    'sales_tax_payable_account': 'Sales Tax Payable',
    'shop_supplies_revenue_account': 'Shop Supplies Revenue',
    'environmental_fee_revenue_account': 'Environmental Fee Revenue',
    'input_tax_account': 'Input Sales Tax',
    'withholding_tax_payable_account': 'Withholding Tax Payable',
    'default_expense_account': 'Purchases / Operating Expense',
    'purchase_returns_account': 'Purchase Returns',
    'inventory_asset_account': 'Inventory Asset',
    'cost_of_goods_sold_account': 'Cost of Goods Sold',
    'cash_over_short_account': 'Cash Over/Short',
    'till_counterparty_cash_account': 'Cash in Safe',
    'default_bank_account': 'Operating Bank Account',
}

CONTROL_ACCOUNT_GROUPS = {
    'accounts_receivable_account': 'Receivables & Payables',
    'accounts_payable_account': 'Receivables & Payables',
    'customer_prepayment_account': 'Receivables & Payables',
    'sales_revenue_account': 'Revenue & Tax',
    'sales_discount_account': 'Revenue & Tax',
    'sales_tax_payable_account': 'Revenue & Tax',
    'shop_supplies_revenue_account': 'Revenue & Tax',
    'environmental_fee_revenue_account': 'Revenue & Tax',
    'input_tax_account': 'Revenue & Tax',
    'withholding_tax_payable_account': 'Revenue & Tax',
    'default_expense_account': 'Purchasing & Inventory',
    'purchase_returns_account': 'Purchasing & Inventory',
    'inventory_asset_account': 'Purchasing & Inventory',
    'cost_of_goods_sold_account': 'Purchasing & Inventory',
    'cash_over_short_account': 'Cash & Banking',
    'till_counterparty_cash_account': 'Cash & Banking',
    'default_bank_account': 'Cash & Banking',
}

INVOICE_LINE_TYPE_LABELS = dict(InvoiceLineItem.ITEM_TYPE_CHOICES)
PAYMENT_METHOD_LABELS = dict(Payment.PAYMENT_METHOD_CHOICES)
VENDOR_PAYMENT_METHOD_LABELS = dict(BillPayment.PAYMENT_METHOD_CHOICES)

BILL_LINE_KIND_LABELS = {
    'inventory': 'Inventory / Parts (PO lines)',
    'expense': 'Operating Expense (PO lines)',
}

MAPPING_KIND_CONTROL = 'control_account'
MAPPING_KIND_INVOICE_LINE = 'invoice_line_type'
MAPPING_KIND_PAYMENT_METHOD = 'payment_method'
MAPPING_KIND_VENDOR_PAYMENT_METHOD = 'vendor_payment_method'
MAPPING_KIND_BILL_LINE = 'bill_line_kind'
MAPPING_KIND_TAX_CODE = 'tax_code'

TAX_CODE_LABELS = {
    'composite': 'Composite sales tax (all levies)',
    'exempt': 'Non-taxable / Exempt',
    'vat': 'VAT',
    'nhil': 'NHIL',
    'getfund': 'GETFund levy',
    'hrl': 'Health Recovery Levy (HRL)',
}

# Invoice lines map to QBO Items; tax codes use qbo_account_id to store TaxCode.Id.
ITEM_MAPPING_KINDS = {MAPPING_KIND_INVOICE_LINE}
TAX_CODE_MAPPING_KINDS = {MAPPING_KIND_TAX_CODE}
ACCOUNT_MAPPING_KINDS = {
    MAPPING_KIND_CONTROL,
    MAPPING_KIND_PAYMENT_METHOD,
    MAPPING_KIND_VENDOR_PAYMENT_METHOD,
    MAPPING_KIND_BILL_LINE,
    MAPPING_KIND_TAX_CODE,
}


def all_mapping_rows():
    """Return spec rows for every configurable mapping slot."""
    rows = []
    for field_name in AccountingControl.ACCOUNT_FIELD_NAMES:
        rows.append({
            'mapping_kind': MAPPING_KIND_CONTROL,
            'mapping_key': field_name,
            'label': CONTROL_ACCOUNT_LABELS.get(field_name, field_name),
            'group': CONTROL_ACCOUNT_GROUPS.get(field_name, 'Control Accounts'),
            'uses_item': False,
            'uses_tax_code': False,
            'control_field': field_name,
        })

    for key, label in INVOICE_LINE_TYPE_LABELS.items():
        rows.append({
            'mapping_kind': MAPPING_KIND_INVOICE_LINE,
            'mapping_key': key,
            'label': label,
            'group': 'Invoice Line Types',
            'uses_item': True,
            'uses_tax_code': False,
            'control_field': None,
        })

    for key, label in PAYMENT_METHOD_LABELS.items():
        rows.append({
            'mapping_kind': MAPPING_KIND_PAYMENT_METHOD,
            'mapping_key': key,
            'label': label,
            'group': 'Customer Payment Methods',
            'uses_item': False,
            'uses_tax_code': False,
            'control_field': None,
        })

    for key, label in VENDOR_PAYMENT_METHOD_LABELS.items():
        rows.append({
            'mapping_kind': MAPPING_KIND_VENDOR_PAYMENT_METHOD,
            'mapping_key': key,
            'label': label,
            'group': 'Vendor Payment Methods',
            'uses_item': False,
            'uses_tax_code': False,
            'control_field': None,
        })

    for key, label in BILL_LINE_KIND_LABELS.items():
        rows.append({
            'mapping_kind': MAPPING_KIND_BILL_LINE,
            'mapping_key': key,
            'label': label,
            'group': 'Purchase Order / Bill Lines',
            'uses_item': False,
            'uses_tax_code': False,
            'control_field': None,
        })

    for key, label in TAX_CODE_LABELS.items():
        rows.append({
            'mapping_kind': MAPPING_KIND_TAX_CODE,
            'mapping_key': key,
            'label': label,
            'group': 'Sales Tax Codes',
            'uses_item': False,
            'uses_tax_code': True,
            'control_field': None,
        })

    return rows
