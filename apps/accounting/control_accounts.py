"""Canonical control-account codes aligned with docs/ACCOUNTING-POSTING-STANDARD.md."""

# field_name -> (code, name, account_type, balance_type, account_subtype, parent_code)
CONTROL_ACCOUNT_SPECS = {
    'accounts_receivable_account': (
        '1200', 'Accounts Receivable', 'asset', 'debit', 'accounts_receivable', 'A100',
    ),
    'accounts_payable_account': (
        '2000', 'Accounts Payable', 'liability', 'credit', 'accounts_payable', 'L100',
    ),
    'customer_prepayment_account': (
        '2150', 'Customer Prepayments', 'liability', 'credit', 'current_liability', 'L100',
    ),
    'sales_revenue_account': (
        '4010', 'Service Revenue', 'income', 'credit', 'revenue', 'I000',
    ),
    'sales_discount_account': (
        '4100', 'Sales Returns & Allowances', 'income', 'debit', 'revenue', 'I000',
    ),
    'sales_tax_payable_account': (
        '2100', 'Sales Tax Payable', 'liability', 'credit', 'tax_payable', 'L100',
    ),
    'shop_supplies_revenue_account': (
        '4050', 'Shop Supplies Revenue', 'income', 'credit', 'revenue', 'I000',
    ),
    'environmental_fee_revenue_account': (
        '4060', 'Environmental Fee Revenue', 'income', 'credit', 'revenue', 'I000',
    ),
    'input_tax_account': (
        '2200', 'Input Sales Tax', 'asset', 'debit', 'current_asset', 'A100',
    ),
    'default_expense_account': (
        '5000', 'Purchases / Operating Expense', 'expense', 'debit', 'expense', 'E000',
    ),
    'purchase_returns_account': (
        '5050', 'Purchase Returns', 'expense', 'credit', 'expense', 'E000',
    ),
    'inventory_asset_account': (
        '1500', 'Inventory Asset', 'asset', 'debit', 'inventory', 'A100',
    ),
    'cost_of_goods_sold_account': (
        '5100', 'Cost of Goods Sold', 'expense', 'debit', 'expense', 'E000',
    ),
    'cash_over_short_account': (
        '5950', 'Cash Over/Short Expense', 'expense', 'debit', 'expense', 'E000',
    ),
    'till_counterparty_cash_account': (
        '1010', 'Cash in Safe', 'asset', 'debit', 'cash', 'A110',
    ),
    'default_bank_account': (
        '1100', 'Operating Bank Account', 'asset', 'debit', 'bank', 'A120',
    ),
    'withholding_tax_payable_account': (
        '2320', 'Withholding Tax Payable', 'liability', 'credit', 'tax_payable', 'L100',
    ),
    'salary_expense_account': (
        '6000', 'Salary Expense', 'expense', 'debit', 'expense', 'E000',
    ),
    'overtime_expense_account': (
        '6010', 'Overtime Expense', 'expense', 'debit', 'expense', 'E000',
    ),
    'allowances_expense_account': (
        '6020', 'Allowances Expense', 'expense', 'debit', 'expense', 'E000',
    ),
    'employer_statutory_expense_account': (
        '6030', 'Employer Statutory Expense', 'expense', 'debit', 'expense', 'E000',
    ),
    'paye_tax_payable_account': (
        '2300', 'PAYE Tax Payable', 'liability', 'credit', 'tax_payable', 'L100',
    ),
    'payroll_deductions_payable_account': (
        '2310', 'Payroll Deductions Payable', 'liability', 'credit', 'current_liability', 'L100',
    ),
    'employer_statutory_payable_account': (
        '2315', 'Employer Statutory Payable', 'liability', 'credit', 'current_liability', 'L100',
    ),
}

# Historical postings often used parent clearing account 1000 instead of a leaf bank/cash account.
DEFAULT_PARENT_ACCOUNT_REMAP = {
    '1000': '1100',
}
