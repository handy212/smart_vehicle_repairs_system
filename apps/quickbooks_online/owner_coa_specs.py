"""
Owner legacy chart-of-accounts reference for SVR ↔ QBO separation.

SVR keeps a lean operational GL (~45 accounts). The owner's ~250-account workshop
chart lives in QuickBooks Online. This module defines name/code match patterns,
supplemental accounts to create in QBO, invoice line item templates, and documented
accounting corrections — without importing the full owner tree into SVR.
"""

from apps.accounting.models import AccountingControl

# Accounts the owner chart is missing but SVR/QBO bridge requires.
SUPPLEMENTAL_QBO_ACCOUNTS = [
    {
        'name': 'Customer Prepayments',
        'account_type': 'Other Current Liability',
        'account_sub_type': 'OtherCurrentLiabilities',
        'description': 'Customer deposits and unapplied overpayments (SVR 2150).',
        'maps_control_field': 'customer_prepayment_account',
    },
    {
        'name': 'Sales Returns and Allowances',
        'account_type': 'Income',
        'account_sub_type': 'SalesOfProductIncome',
        'description': 'Contra-revenue for discounts and credit notes (prefer over 802 Discount Allowed).',
        'maps_control_field': 'sales_discount_account',
    },
    {
        'name': 'Work in Progress',
        'account_type': 'Other Current Asset',
        'account_sub_type': 'OtherCurrentAssets',
        'description': 'Optional accrual job costing in QBO; not posted from SVR GL.',
        'maps_control_field': None,
    },
]

# Documented corrections for the owner's QBO chart (informational + validation warnings).
OWNER_COA_CORRECTIONS = [
    {
        'code': '685-697',
        'issue': 'Sub-Contractors classified as Income',
        'action': 'Customer invoice → service/labour revenue (655/679). Subcontractor payment → COGS/expense (700), not income.',
    },
    {
        'code': '698K/T/698TM',
        'issue': 'Branch-specific revenue GL accounts',
        'action': 'Use QBO Department per branch; do not map SVR revenue to branch sales accounts.',
    },
    {
        'code': '802',
        'issue': 'Discount Allowed posted as expense',
        'action': 'Map SVR sales_discount_account to contra-revenue (Sales Returns), not 802.',
    },
    {
        'code': '662-678',
        'issue': 'L/O vs Stores vs Warehouse revenue splits',
        'action': 'Optional in QBO for legacy reporting; SVR uses inventory locations as dimensions, not GL.',
    },
]

# SVR control account → QBO account match patterns (ordered by priority).
# Each pattern: name_substrings (case-insensitive), optional account_number prefix,
# required QBO AccountType(s), exclude name substrings.
CONTROL_ACCOUNT_QBO_PATTERNS = {
    'accounts_receivable_account': {
        'name_substrings': ['accounts receivable', 'account receivable'],
        'account_numbers': ['120'],
        'account_types': ['Accounts Receivable'],
        'exclude_substrings': [],
    },
    'accounts_payable_account': {
        'name_substrings': ['accounts payable', 'account payable'],
        'account_numbers': ['400'],
        'account_types': ['Accounts Payable'],
        'exclude_substrings': ['momo', 'absa', 'cash receipt', 'cash recepts', 'main cash', 'lpo'],
    },
    'customer_prepayment_account': {
        'name_substrings': ['customer prepayment', 'customer deposit', 'deferred revenue', 'unearned'],
        'account_numbers': [],
        'account_types': ['Other Current Liability'],
        'exclude_substrings': [],
    },
    'sales_revenue_account': {
        'name_substrings': ['operating service', 'sales revenue', 'service/sales revenue'],
        'account_numbers': ['650'],
        'account_types': ['Income'],
        'exclude_substrings': ['kumasi sales', 'takoradi sales', 'tamale sales', 'sub-contractor', 'subcontractor'],
    },
    'sales_discount_account': {
        'name_substrings': ['sales return', 'returns and allowances', 'sales discount'],
        'account_numbers': [],
        'account_types': ['Income'],
        'exclude_substrings': ['discount allowed', 'discount received'],
    },
    'sales_tax_payable_account': {
        'name_substrings': ['tax account', 'sales tax', 'tax liability', 'gra tax'],
        'account_numbers': ['2553', '410'],
        'account_types': ['Other Current Liability'],
        'exclude_substrings': ['withholding', 'paye', 'ssnit', 'input'],
    },
    'shop_supplies_revenue_account': {
        'name_substrings': ['shop supplies', 'materials, parts', 'parts & access'],
        'account_numbers': ['661'],
        'account_types': ['Income'],
        'exclude_substrings': ['cost', 'cogs', 'stores-', 'l/o'],
    },
    'environmental_fee_revenue_account': {
        'name_substrings': ['miscellaneous', 'environmental', 'other operating'],
        'account_numbers': ['699'],
        'account_types': ['Income'],
        'exclude_substrings': ['cost', 'expense'],
    },
    'input_tax_account': {
        'name_substrings': ['withholding tax receivable', 'input tax', 'input sales tax'],
        'account_numbers': ['252'],
        'account_types': ['Other Current Asset'],
        'exclude_substrings': ['payable'],
    },
    'withholding_tax_payable_account': {
        'name_substrings': ['withholding tax payable', 'witholding tax payable'],
        'account_numbers': ['429'],
        'account_types': ['Other Current Liability'],
        'exclude_substrings': ['receivable'],
    },
    'default_expense_account': {
        'name_substrings': ['purchases / operating', 'operating expense', 'admin, selling'],
        'account_numbers': ['500', '800'],
        'account_types': ['Expense', 'Cost of Goods Sold'],
        'exclude_substrings': ['cost of goods sold', 'cogs', 'salary', 'wages'],
    },
    'purchase_returns_account': {
        'name_substrings': ['purchase return', 'vendor credit'],
        'account_numbers': ['505'],
        'account_types': ['Expense', 'Cost of Goods Sold'],
        'exclude_substrings': [],
    },
    'inventory_asset_account': {
        'name_substrings': ['inventory asset', 'inventory'],
        'account_numbers': ['12100', '131'],
        'account_types': ['Other Current Asset'],
        'exclude_substrings': ['sales', 'cost', 'cogs', 'warehouse inventory sales'],
    },
    'cost_of_goods_sold_account': {
        'name_substrings': ['cost of goods sold', 'cost of service'],
        'account_numbers': ['700'],
        'account_types': ['Cost of Goods Sold'],
        'exclude_substrings': ['adjustment'],
    },
    'cash_over_short_account': {
        'name_substrings': ['cash over', 'cash short', 'over/short'],
        'account_numbers': [],
        'account_types': ['Expense'],
        'exclude_substrings': [],
    },
    'till_counterparty_cash_account': {
        'name_substrings': ['cash in safe', 'main cash', 'petty cash', 'cash on hand'],
        'account_numbers': ['101', '102'],
        'account_types': ['Bank'],
        'exclude_substrings': ['receipt', 'imbursement'],
    },
    'default_bank_account': {
        'name_substrings': ['operating bank', 'absa', 'ecobank', 'gcb bank', 'first national', 'stanbic'],
        'account_numbers': ['118'],
        'account_types': ['Bank'],
        'exclude_substrings': ['lpo', 'momo', 'receipt', 'petty', 'cash receipt'],
    },
    'salary_expense_account': {
        'name_substrings': ['salary', 'salaries', 'wages', 'payroll expense'],
        'account_numbers': ['600', '800'],
        'account_types': ['Expense'],
        'exclude_substrings': ['overtime', 'allowance', 'statutory', 'employer'],
    },
    'overtime_expense_account': {
        'name_substrings': ['overtime', 'ot pay', 'over time'],
        'account_numbers': ['601'],
        'account_types': ['Expense'],
        'exclude_substrings': [],
    },
    'allowances_expense_account': {
        'name_substrings': ['allowance', 'allowances', 'staff benefit'],
        'account_numbers': ['602'],
        'account_types': ['Expense'],
        'exclude_substrings': ['employer statutory'],
    },
    'employer_statutory_expense_account': {
        'name_substrings': ['employer statutory', 'ssnit employer', 'employer contribution'],
        'account_numbers': ['603'],
        'account_types': ['Expense'],
        'exclude_substrings': ['payable'],
    },
    'paye_tax_payable_account': {
        'name_substrings': ['paye', 'pay as you earn', 'income tax payable'],
        'account_numbers': ['430', '230'],
        'account_types': ['Other Current Liability'],
        'exclude_substrings': ['receivable', 'withholding'],
    },
    'payroll_deductions_payable_account': {
        'name_substrings': ['payroll deduction', 'employee deduction', 'ssnit employee'],
        'account_numbers': ['431', '231'],
        'account_types': ['Other Current Liability'],
        'exclude_substrings': ['employer'],
    },
    'employer_statutory_payable_account': {
        'name_substrings': ['employer statutory payable', 'ssnit payable', 'employer contribution payable'],
        'account_numbers': ['432', '2315'],
        'account_types': ['Other Current Liability'],
        'exclude_substrings': ['expense', 'receivable'],
    },
}

# Customer payment method → QBO deposit account patterns.
PAYMENT_METHOD_QBO_PATTERNS = {
    'cash': {
        'name_substrings': ['cash reciept accounts', 'cash receipt accounts', 'main cash', 'petty cash'],
        'account_numbers': ['1120'],
        'account_types': ['Bank'],
        'exclude_substrings': ['lpo', 'momo', 'kumasi', 'accra', 'takoradi', 'tamale'],
    },
    'check': {
        'name_substrings': ['operating bank', 'absa', 'gcb', 'ecobank'],
        'account_types': ['Bank'],
        'exclude_substrings': ['momo', 'lpo'],
    },
    'credit_card': {
        'name_substrings': ['operating bank', 'absa', 'ecobank', 'gcb'],
        'account_types': ['Bank'],
        'exclude_substrings': ['momo'],
    },
    'debit_card': {
        'name_substrings': ['operating bank', 'absa', 'ecobank'],
        'account_types': ['Bank'],
        'exclude_substrings': ['momo'],
    },
    'ach': {
        'name_substrings': ['operating bank', 'absa', 'bank transfer'],
        'account_types': ['Bank'],
        'exclude_substrings': ['momo', 'lpo'],
    },
    'wire': {
        'name_substrings': ['operating bank', 'absa', 'wire'],
        'account_types': ['Bank'],
        'exclude_substrings': ['momo'],
    },
    'mtn_momo': {
        'name_substrings': ['momo', 'mobile money', 'mtn'],
        'account_types': ['Bank'],
        'exclude_substrings': [],
    },
    'vodafone_cash': {
        'name_substrings': ['momo', 'mobile money', 'vodafone'],
        'account_types': ['Bank'],
        'exclude_substrings': [],
    },
    'airteltigo_money': {
        'name_substrings': ['momo', 'mobile money', 'airteltigo', 'tigo'],
        'account_types': ['Bank'],
        'exclude_substrings': [],
    },
    'hubtel_card': {
        'name_substrings': ['operating bank', 'absa', 'hubtel'],
        'account_types': ['Bank'],
        'exclude_substrings': [],
    },
    'paystack': {
        'name_substrings': ['operating bank', 'absa', 'paystack'],
        'account_types': ['Bank'],
        'exclude_substrings': [],
    },
    'other': {
        'name_substrings': ['operating bank', 'absa', 'treasury'],
        'account_types': ['Bank'],
        'exclude_substrings': [],
    },
}

VENDOR_PAYMENT_METHOD_QBO_PATTERNS = {
    'cash': PAYMENT_METHOD_QBO_PATTERNS['cash'],
    'check': PAYMENT_METHOD_QBO_PATTERNS['check'],
    'bank_transfer': PAYMENT_METHOD_QBO_PATTERNS['ach'],
    'mobile_money': PAYMENT_METHOD_QBO_PATTERNS['mtn_momo'],
    'credit_card': PAYMENT_METHOD_QBO_PATTERNS['credit_card'],
    'other': PAYMENT_METHOD_QBO_PATTERNS['other'],
}

BILL_LINE_KIND_QBO_PATTERNS = {
    'inventory': CONTROL_ACCOUNT_QBO_PATTERNS['inventory_asset_account'],
    'expense': CONTROL_ACCOUNT_QBO_PATTERNS['default_expense_account'],
}

TAX_CODE_QBO_PATTERNS = {
    'composite': {'name_substrings': ['composite', 'standard', 'ghana', 'total tax']},
    'exempt': {'name_substrings': ['exempt', 'non-taxable', 'zero']},
    'vat': {'name_substrings': ['vat', 'value added']},
    'nhil': {'name_substrings': ['nhil']},
    'getfund': {'name_substrings': ['get fund', 'getfund']},
    'hrl': {'name_substrings': ['health recovery', 'hrl']},
}

# SVR GL account code/name → QBO bank/cash deposit account (svr_account mappings).
# Legacy generic codes remain for shared HQ accounts; branch leaves are mapped by
# provision_branch_settlement using BRANCH_SETTLEMENT_KINDS + city name matching.
SVR_ACCOUNT_QBO_PATTERNS = {
    '1111': {'name_substrings': ['kumasi absa'], 'account_numbers': ['1111'], 'account_types': ['Bank']},
    '1112': {'name_substrings': ['takoradi absa', 'petty cash'], 'account_numbers': ['1112'], 'account_types': ['Bank']},
    '1113': {'name_substrings': ['tamale absa', 'lpo'], 'account_numbers': ['1113'], 'account_types': ['Bank']},
    '1114': {'name_substrings': ['accra absa'], 'account_numbers': ['1114'], 'account_types': ['Bank']},
    '1121': {'name_substrings': ['kumasi cash receipt', 'kumasi cash reciept', 'kumasi cash recepts'], 'account_numbers': ['1121'], 'account_types': ['Bank']},
    '1122': {'name_substrings': ['takoradi cash receipt', 'takoradi cash reciept'], 'account_numbers': ['1122'], 'account_types': ['Bank']},
    '1123': {'name_substrings': ['accra cash receipt', 'accra cash recepts', 'accra cash reciept'], 'account_numbers': ['1123'], 'account_types': ['Bank']},
    '1141': {'name_substrings': ['accra main cash'], 'account_numbers': ['1141'], 'account_types': ['Bank']},
    '1142': {'name_substrings': ['takoradi main cash'], 'account_numbers': ['1142'], 'account_types': ['Bank']},
    '1143': {'name_substrings': ['kumasi main cash'], 'account_numbers': ['1143'], 'account_types': ['Bank']},
    '1144': {'name_substrings': ['tamale main cash'], 'account_numbers': ['1144'], 'account_types': ['Bank']},
    '1151': {'name_substrings': ['accra momo'], 'account_numbers': ['1151'], 'account_types': ['Bank']},
    '1152': {'name_substrings': ['kumasi momo'], 'account_numbers': ['1152'], 'account_types': ['Bank']},
    '1153': {'name_substrings': ['takoradi momo'], 'account_numbers': ['1153'], 'account_types': ['Bank']},
    '1154': {'name_substrings': ['tamale momo'], 'account_numbers': ['1154'], 'account_types': ['Bank']},
    '1100': {'name_substrings': ['operating bank', 'ecobank'], 'account_types': ['Bank']},
    '1010': {'name_substrings': ['cash in safe'], 'account_types': ['Bank']},
    '1000': {'name_substrings': ['treasury', 'clearing'], 'account_types': ['Bank']},
}

# Invoice line type → QBO Item template (created in QBO when missing).
INVOICE_LINE_ITEM_TEMPLATES = {
    'labor': {
        'name': 'SVR Labor Revenue',
        'type': 'Service',
        'income_account_patterns': {
            'name_substrings': ['mechanical work labour', 'labour sales', 'labour revenue'],
            'account_numbers': ['658', '655'],
            'account_types': ['Income'],
            'exclude_substrings': ['sub-contractor', 'subcontractor'],
        },
    },
    'part': {
        'name': 'SVR Parts Revenue',
        'type': 'NonInventory',
        'income_account_patterns': {
            'name_substrings': ['materials, parts', 'parts & access', 'parts sales'],
            'account_numbers': ['661'],
            'account_types': ['Income'],
            'exclude_substrings': ['cost', 'stores-', 'l/o'],
        },
    },
    'fee': {
        'name': 'SVR Service Fee Revenue',
        'type': 'Service',
        'income_account_patterns': {
            'name_substrings': ['services', 'vehicle diagnosis', 'wheel alignment'],
            'account_numbers': ['679', '681', '684'],
            'account_types': ['Income'],
            'exclude_substrings': ['cost', 'sub-contractor'],
        },
    },
    'sublet': {
        'name': 'SVR Sublet Service Revenue',
        'type': 'Service',
        'income_account_patterns': {
            'name_substrings': ['vehicle programming', 'vehicle diagnosis', 'services'],
            'account_numbers': ['682', '681', '679'],
            'account_types': ['Income'],
            'exclude_substrings': ['sub-contractor', 'subcontractor', '685'],
        },
    },
    'discount': {
        'name': 'SVR Sales Discount',
        'type': 'Service',
        'income_account_patterns': {
            'name_substrings': ['sales return', 'returns and allowances', 'sales discount'],
            'account_numbers': [],
            'account_types': ['Income'],
            'exclude_substrings': ['discount allowed', '802'],
        },
    },
    'other': {
        'name': 'SVR Miscellaneous Revenue',
        'type': 'Service',
        'income_account_patterns': {
            'name_substrings': ['miscellaneous', 'other operating'],
            'account_numbers': ['699'],
            'account_types': ['Income'],
            'exclude_substrings': ['cost', 'expense'],
        },
    },
}

BRANCH_MAIN_CASH_CODES = {
    'accra': '1141',
    'kumasi': '1143',
    'takoradi': '1142',
    'tamale': '1144',
}

# Branch city/name keywords → QBO Department name patterns.
BRANCH_DEPARTMENT_PATTERNS = {
    'kumasi': ['kumasi'],
    'takoradi': ['takoradi'],
    'tamale': ['tamale'],
    'accra': ['accra'],
}

# Settlement account kinds matched in QBO by branch city + name substring.
BRANCH_SETTLEMENT_KINDS = {
    'absa': {
        'label': 'Absa Bank',
        'name_substrings': ['absa'],
        'account_subtype': 'bank',
        'is_till_enabled': False,
        'qbo_account_types': ['Bank'],
    },
    'cash_receipts': {
        'label': 'Cash Receipts',
        'name_substrings': ['cash receipt', 'cash reciept', 'cash recepts'],
        'account_subtype': 'cash_equivalent',
        'is_till_enabled': False,
        'qbo_account_types': ['Bank'],
    },
    'lpo': {
        'label': 'LPO Cash',
        'name_substrings': ['lpo'],
        'account_subtype': 'cash',
        'is_till_enabled': False,
        'qbo_account_types': ['Bank'],
    },
    'main_cash': {
        'label': 'Main Cash',
        'name_substrings': ['main cash'],
        'account_subtype': 'cash',
        'is_till_enabled': True,
        'qbo_account_types': ['Bank'],
    },
    'momo': {
        'label': 'MOMO',
        'name_substrings': ['momo', 'mobile money'],
        'account_subtype': 'cash_equivalent',
        'is_till_enabled': False,
        'qbo_account_types': ['Bank'],
    },
}

# Owner accounts that must NOT be auto-mapped (deprecated dimensions).
QBO_ACCOUNT_EXCLUDE_PATTERNS = [
    'kumasi sales',
    'takoradi sales',
    'tamale sales',
    '698k',
    '698t',
    '698tm',
    'more fuel ltd',
    'petrosol rent',
    'newsbo',
    'it scope',
    'specialist depot',
    'sub-contractors',
    'subcontractors',
]

OWNER_CONTROL_FIELD_NAMES = list(AccountingControl.ACCOUNT_FIELD_NAMES)


def branch_name_tokens(branch):
    tokens = []
    for value in (getattr(branch, 'city', None), getattr(branch, 'name', None), getattr(branch, 'code', None)):
        if value:
            token = str(value).strip().lower()
            if token and token not in tokens:
                tokens.append(token)
    return tokens


def branch_control_account_patterns(branch, control_field):
    """
    Best-effort patterns for branch-specific sub-COA rows in the owner's QBO chart.
    Used only when resolving branch-scoped control account overrides.
    """
    tokens = branch_name_tokens(branch)
    if not tokens:
        return None

    if control_field == 'accounts_receivable_account':
        return {
            'name_substrings': [f'{token} receivable' for token in tokens] + [f'{token} ar' for token in tokens],
            'account_numbers': ['120'],
            'account_types': ['Accounts Receivable'],
            'exclude_substrings': [],
        }
    if control_field == 'cost_of_goods_sold_account':
        return {
            'name_substrings': [
                f'{token} cogs' for token in tokens
            ] + [f'{token} cost of goods' for token in tokens],
            'account_numbers': ['700'],
            'account_types': ['Cost of Goods Sold'],
            'exclude_substrings': [],
        }
    if control_field == 'sales_revenue_account':
        return {
            'name_substrings': [f'{token} sales' for token in tokens] + [f'{token} revenue' for token in tokens],
            'account_numbers': ['698', '651', '650', '655', '658', '661'],
            'account_types': ['Income'],
            'exclude_substrings': ['sub-contractor', 'subcontractor', 'cost', 'cogs'],
        }
    return None
