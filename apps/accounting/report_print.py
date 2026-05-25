"""
Server-side HTML/PDF context for accounting financial reports.
Uses templates/printing/reports/financial_report.html (document_base layout).
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.branches.utils import resolve_branch

from .management_reports import ManagementReportingService
from .models import Account, Budget, Transaction
from .services import DashboardService, ReportingService
from .views import get_report_branch_id, scope_budgets

ACCOUNTING_REPORT_SLUGS = frozenset({
    'balance-sheet',
    'profit-loss',
    'trial-balance',
    'general-ledger',
    'aging',
    'cash-flow',
    'tax',
    'job-profitability',
    'margin-analysis',
    'expense-breakdown',
    'management',
    'cost-control',
    'opex-variance',
    'supplier-ap-aging',
})

REPORT_TITLES = {
    'balance-sheet': 'Balance Sheet',
    'profit-loss': 'Profit & Loss Statement',
    'trial-balance': 'Trial Balance',
    'general-ledger': 'General Ledger',
    'aging': 'AR/AP Aging Report',
    'cash-flow': 'Cash Flow Statement',
    'tax': 'Tax Liability Report',
    'job-profitability': 'Job Profitability',
    'margin-analysis': 'Margin Analysis',
    'expense-breakdown': 'Expense Breakdown',
    'management': 'Management Reports',
    'cost-control': 'Cost Control Report',
    'opex-variance': 'OPEX Variance vs Budget',
    'supplier-ap-aging': 'AP Aging by Supplier',
}


def _fmt_money(value: Any) -> str:
    if value is None:
        return '0.00'
    try:
        n = float(value)
    except (TypeError, ValueError):
        return str(value)
    return f'{n:,.2f}'


def _row(cells: list, *, is_total: bool = False, is_section: bool = False) -> dict:
    return {'cells': [str(c) for c in cells], 'is_total': is_total, 'is_section': is_section}


def _section(
    title: str,
    headers: list[str],
    rows: list[dict],
    *,
    numeric_last: bool = True,
    description: str = '',
) -> dict:
    return {
        'title': title,
        'headers': headers,
        'rows': rows,
        'numeric_last': numeric_last,
        'description': description,
    }


def _branch_name(request) -> str | None:
    branch = resolve_branch(request)
    return branch.name if branch else None


def _parse_period(request, *, required: bool = True):
    today = timezone.now().date()
    start_str = request.query_params.get('start_date')
    end_str = request.query_params.get('end_date')
    if not start_str or not end_str:
        if required:
            return today.replace(day=1), today
        return None, None
    start_date = parse_date(start_str)
    end_date = parse_date(end_str)
    if not start_date or not end_date:
        return None, None
    return start_date, end_date


def fetch_report_data(slug: str, request) -> dict[str, Any]:
    branch_id = get_report_branch_id(request)

    if slug == 'balance-sheet':
        date_str = request.query_params.get('date')
        date = parse_date(date_str) if date_str else timezone.now().date()
        return {'data': ReportingService.get_balance_sheet(date, branch_id=branch_id), 'date': date}

    if slug == 'profit-loss':
        start_date, end_date = _parse_period(request)
        return {
            'data': ReportingService.get_profit_loss(start_date, end_date, branch_id=branch_id),
            'start_date': start_date,
            'end_date': end_date,
        }

    if slug == 'trial-balance':
        date_str = request.query_params.get('date')
        date = parse_date(date_str) if date_str else timezone.now().date()
        return {'data': ReportingService.get_trial_balance(date, branch_id=branch_id), 'date': date}

    if slug == 'general-ledger':
        start_date, end_date = _parse_period(request, required=False)
        account_id = request.query_params.get('account_id')
        reference = (request.query_params.get('reference') or '').strip()
        qs = (
            Transaction.objects.filter(journal_entry__posted=True)
            .select_related('journal_entry', 'account')
            .order_by('-journal_entry__date', '-journal_entry_id', 'id')
        )
        if account_id:
            qs = qs.filter(account_id=account_id)
        if branch_id is not None:
            qs = qs.filter(journal_entry__branch_id=branch_id)
        if start_date:
            qs = qs.filter(journal_entry__date__gte=start_date)
        if end_date:
            qs = qs.filter(journal_entry__date__lte=end_date)
        if reference:
            qs = qs.filter(journal_entry__reference__icontains=reference)
        lines = list(qs[:1000])
        return {
            'lines': lines,
            'start_date': start_date,
            'end_date': end_date,
            'account_id': account_id,
        }

    if slug == 'aging':
        report_type = request.query_params.get('type', 'ar')
        date_str = request.query_params.get('date')
        date = parse_date(date_str) if date_str else timezone.now().date()
        return {
            'data': ReportingService.get_aging_report(report_type, date, branch_id=branch_id),
            'type': report_type,
            'date': date,
        }

    if slug == 'cash-flow':
        start_str = request.query_params.get('start_date')
        end_str = request.query_params.get('end_date')
        end_date = parse_date(end_str) if end_str else timezone.now().date()
        start_date = parse_date(start_str) if start_str else end_date.replace(month=1, day=1)
        return {
            'data': ReportingService.get_cash_flow_statement(start_date, end_date, branch_id=branch_id),
            'start_date': start_date,
            'end_date': end_date,
        }

    if slug == 'tax':
        start_str = request.query_params.get('start_date')
        end_str = request.query_params.get('end_date')
        start_date = parse_date(start_str) if start_str else None
        end_date = parse_date(end_str) if end_str else None
        return {
            'data': ReportingService.get_tax_report(start_date, end_date, branch_id=branch_id),
            'start_date': start_date,
            'end_date': end_date,
        }

    if slug in ('job-profitability', 'margin-analysis'):
        start_str = request.query_params.get('start_date')
        end_str = request.query_params.get('end_date')
        start_date = parse_date(start_str) if start_str else None
        end_date = parse_date(end_str) if end_str else None
        return {
            'data': ReportingService.get_job_profitability(
                work_order_id=request.query_params.get('work_order_id'),
                start_date=start_date,
                end_date=end_date,
                branch_id=branch_id,
            ),
            'start_date': start_date,
            'end_date': end_date,
        }

    if slug == 'expense-breakdown':
        start_date, end_date = _parse_period(request)
        return {
            'data': ReportingService.get_expense_breakdown(start_date, end_date, branch_id=branch_id),
            'start_date': start_date,
            'end_date': end_date,
        }

    if slug == 'cost-control':
        start_date, end_date = _parse_period(request)
        return {
            'data': ManagementReportingService.get_cost_control_report(
                start_date, end_date, branch_id=branch_id
            ),
            'start_date': start_date,
            'end_date': end_date,
        }

    if slug == 'opex-variance':
        budget_id = request.query_params.get('budget_id')
        if not budget_id or not scope_budgets(Budget.objects.filter(id=budget_id), request).exists():
            return {'error': 'budget_id required'}
        start_date = parse_date(request.query_params.get('start_date') or '')
        end_date = parse_date(request.query_params.get('end_date') or '')
        report = ManagementReportingService.get_opex_variance(budget_id, start_date, end_date)
        return {'data': report, 'start_date': start_date, 'end_date': end_date}

    if slug == 'supplier-ap-aging':
        date_str = request.query_params.get('date')
        date = parse_date(date_str) if date_str else timezone.now().date()
        return {
            'data': ManagementReportingService.get_supplier_ap_aging(date, branch_id=branch_id),
            'date': date,
        }

    if slug == 'management':
        start_date, end_date = _parse_period(request)
        tab = request.query_params.get('tab', 'executive')
        branch_id = get_report_branch_id(request)
        payload = {'tab': tab, 'start_date': start_date, 'end_date': end_date}
        if tab == 'executive':
            payload['data'] = DashboardService.get_management_metrics(start_date, end_date, branch_id=branch_id)
        elif tab == 'scorecard':
            payload['data'] = ManagementReportingService.get_branch_pl_scorecard(start_date, end_date)
        elif tab == 'consolidated':
            payload['data'] = ManagementReportingService.get_consolidated_profit_loss(start_date, end_date)
        elif tab == 'cash':
            payload['data'] = ManagementReportingService.get_cash_collection_report(
                start_date, end_date, branch_id=branch_id
            )
        elif tab == 'mix':
            payload['data'] = ManagementReportingService.get_revenue_mix(
                start_date, end_date, branch_id=branch_id
            )
        else:
            payload['error'] = f'Unknown tab: {tab}'
        return payload

    raise ValueError(f'Unknown report slug: {slug}')


def build_print_sections(slug: str, payload: dict[str, Any]) -> tuple[list[dict], str, list[dict] | None, str]:
    """Returns (sections, date_info, summary_cards, footer_note)."""
    if payload.get('error'):
        return [], payload['error'], None, ''

    if slug == 'balance-sheet':
        data = payload['data']
        date = payload['date']
        sections = []
        for key, title, total_key in (
            ('assets', 'Assets', 'assets'),
            ('liabilities', 'Liabilities', 'liabilities'),
            ('equity', 'Equity', 'equity'),
        ):
            rows = [_row([a['code'], a['name'], _fmt_money(a['balance'])]) for a in data.get(key, [])]
            rows.append(_row(['', f'Total {title}', _fmt_money(data['totals'][total_key])], is_total=True))
            sections.append(_section(title, ['Code', 'Account', 'Amount'], rows))
        sections.append(
            _section(
                'Summary',
                ['', 'Line', 'Amount'],
                [
                    _row(['', 'Total Assets', _fmt_money(data['totals']['assets'])], is_total=True),
                    _row(
                        ['', 'Total Liabilities + Equity', _fmt_money(data['totals']['liabilities_plus_equity'])],
                        is_total=True,
                    ),
                ],
            )
        )
        balanced = 'Yes' if data.get('is_balanced') else 'No — OUT OF BALANCE'
        return sections, f'As of {date}', None, f'Balanced: {balanced}'

    if slug == 'profit-loss':
        data = payload['data']
        start, end = payload['start_date'], payload['end_date']
        sections = []
        for key, title in (('income', 'Income'), ('expenses', 'Expenses')):
            rows = [_row([r['code'], r['name'], _fmt_money(r['balance'])]) for r in data.get(key, [])]
            total_label = 'Total Income' if key == 'income' else 'Total Expenses'
            rows.append(_row(['', total_label, _fmt_money(data['totals'][key])], is_total=True))
            sections.append(_section(title, ['Code', 'Account', 'Amount'], rows))
        sections.append(
            _section(
                'Net Income',
                ['', '', 'Amount'],
                [_row(['', 'NET INCOME', _fmt_money(data['totals']['net_income'])], is_total=True)],
            )
        )
        return sections, f'{start} to {end}', None, ''

    if slug == 'trial-balance':
        data = payload['data']
        date = payload['date']
        rows = [
            _row([a['code'], a['name'], a['type'], _fmt_money(a['debit']), _fmt_money(a['credit'])])
            for a in data.get('accounts', [])
        ]
        rows.append(
            _row(
                ['', 'Totals', '', _fmt_money(data['totals']['debits']), _fmt_money(data['totals']['credits'])],
                is_total=True,
            )
        )
        sections = [_section('Accounts', ['Code', 'Name', 'Type', 'Debit', 'Credit'], rows, numeric_last=False)]
        balanced = 'Yes' if data.get('is_balanced') else 'No'
        return sections, f'As of {date}', None, f'Balanced: {balanced}'

    if slug == 'general-ledger':
        lines = payload['lines']
        rows = []
        for line in lines:
            je = line.journal_entry
            rows.append(
                _row(
                    [
                        str(je.date),
                        je.reference or '',
                        line.account.code,
                        line.account.name,
                        line.transaction_type,
                        _fmt_money(line.amount),
                    ]
                )
            )
        date_info = ''
        if payload.get('start_date') and payload.get('end_date'):
            date_info = f"{payload['start_date']} to {payload['end_date']}"
        elif payload.get('start_date'):
            date_info = f"From {payload['start_date']}"
        elif payload.get('end_date'):
            date_info = f"Through {payload['end_date']}"
        note = f'Showing {len(rows)} line(s)' + (' (max 1000)' if len(rows) >= 1000 else '')
        sections = [
            _section(
                'Transactions',
                ['Date', 'Reference', 'Code', 'Account', 'Type', 'Amount'],
                rows,
                numeric_last=True,
            )
        ]
        return sections, date_info, None, note

    if slug == 'aging':
        data = payload['data']
        report_type = payload['type'].upper()
        date = payload['date']
        summary = data.get('summary', {})
        bucket_labels = {
            'current': 'Current',
            '1-30': '1-30 Days',
            '31-60': '31-60 Days',
            '61-90': '61-90 Days',
            '90+': '90+ Days',
        }
        sum_rows = [
            _row([bucket_labels.get(k, k), _fmt_money(summary.get(k, 0))])
            for k in bucket_labels
        ]
        sum_rows.append(_row(['Total', _fmt_money(summary.get('total', 0))], is_total=True))
        sections = [_section(f'{report_type} Aging Summary', ['Bucket', 'Amount'], sum_rows)]
        detail_rows = [
            _row(
                [
                    d.get('number', ''),
                    d.get('entity', ''),
                    d.get('date', ''),
                    d.get('due_date', '') or '',
                    d.get('bucket', ''),
                    _fmt_money(d.get('amount', 0)),
                ]
            )
            for d in data.get('details', [])[:500]
        ]
        if detail_rows:
            sections.append(
                _section(
                    'Detail',
                    ['Number', 'Entity', 'Date', 'Due', 'Bucket', 'Amount'],
                    detail_rows,
                    numeric_last=True,
                )
            )
        return sections, f'As of {date} ({report_type})', None, ''

    if slug == 'cash-flow':
        data = payload['data']
        start, end = payload['start_date'], payload['end_date']
        rows = [
            _row(['Opening Balance', _fmt_money(data.get('opening_balance', 0))], is_section=True),
        ]
        for key, label in (
            ('operating_activities', 'Operating'),
            ('investing_activities', 'Investing'),
            ('financing_activities', 'Financing'),
        ):
            act = data.get(key, {})
            rows.extend(
                [
                    _row([f'{label} — Inflows', _fmt_money(act.get('inflows', 0))]),
                    _row([f'{label} — Outflows', _fmt_money(act.get('outflows', 0))]),
                    _row([f'{label} — Net', _fmt_money(act.get('net', 0))], is_total=True),
                ]
            )
        rows.extend(
            [
                _row(['Net Increase/(Decrease)', _fmt_money(data.get('net_increase_decrease', 0))], is_total=True),
                _row(['Closing Balance', _fmt_money(data.get('closing_balance', 0))], is_total=True),
            ]
        )
        sections = [_section('Cash Flow', ['Activity', 'Amount'], rows)]
        return sections, f'{start} to {end}', None, ''

    if slug == 'tax':
        data = payload['data']
        start, end = payload.get('start_date'), payload.get('end_date')
        date_info = f'{start} to {end}' if start and end else 'All dates'
        collected = data.get('tax_collected', {})
        paid = data.get('tax_paid', {})
        sections = [
            _section(
                'Tax Collected',
                ['Tax', 'Amount'],
                [
                    _row(['VAT', _fmt_money(collected.get('vat', 0))]),
                    _row(['NHIL', _fmt_money(collected.get('nhil', 0))]),
                    _row(['GETFund', _fmt_money(collected.get('getfund', 0))]),
                    _row(['HRL', _fmt_money(collected.get('hrl', 0))]),
                    _row(['Total', _fmt_money(collected.get('total', 0))], is_total=True),
                ],
            ),
            _section(
                'Summary',
                ['Item', 'Value'],
                [
                    _row(['Tax Paid', _fmt_money(paid.get('total', 0))]),
                    _row(['Net Tax Liability', _fmt_money(data.get('net_tax_liability', 0))], is_total=True),
                    _row(['Invoices', str(data.get('invoice_count', 0))]),
                    _row(['Bills', str(data.get('bill_count', 0))]),
                ],
                numeric_last=False,
            ),
        ]
        return sections, date_info, None, ''

    if slug in ('job-profitability', 'margin-analysis'):
        data = payload['data']
        totals = data.get('totals', {})
        start, end = payload.get('start_date'), payload.get('end_date')
        date_info = f'{start} to {end}' if start and end else ''
        cards = [
            {'label': 'Revenue', 'value': _fmt_money(totals.get('revenue', 0))},
            {'label': 'Direct Costs', 'value': _fmt_money(totals.get('direct_costs', 0))},
            {'label': 'Gross Profit', 'value': _fmt_money(totals.get('gross_profit', 0))},
            {'label': 'Avg Margin %', 'value': f"{totals.get('avg_margin_percent', 0):.1f}%"},
        ]
        rows = [
            _row(
                [
                    j.get('work_order_number', ''),
                    j.get('customer', ''),
                    str(j.get('created_at', ''))[:10] if j.get('created_at') else '',
                    _fmt_money(j.get('revenue', 0)),
                    _fmt_money(j.get('labor_cost', 0)),
                    _fmt_money(j.get('parts_cost', 0)),
                    _fmt_money(j.get('gross_profit', 0)),
                    f"{j.get('margin_percent', 0):.1f}%",
                ]
            )
            for j in data.get('jobs', [])[:200]
        ]
        sections = [
            _section(
                'Jobs',
                ['WO #', 'Customer', 'Date', 'Revenue', 'Labor', 'Parts', 'Profit', 'Margin %'],
                rows,
                numeric_last=True,
            )
        ]
        return sections, date_info, cards, ''

    if slug == 'expense-breakdown':
        data = payload['data']
        start, end = payload['start_date'], payload['end_date']
        categories = data.get('categories', {})
        rows = [
            _row([categories.get(k, {}).get('label', k), _fmt_money(categories.get(k, {}).get('amount', 0))])
            for k in ('parts', 'labor', 'overhead')
            if k in categories
        ]
        rows.append(_row(['Total', _fmt_money(data.get('total_expenses', 0))], is_total=True))
        sections = [_section('By Category', ['Category', 'Amount'], rows)]
        return sections, f'{start} to {end}', None, ''

    if slug == 'cost-control':
        data = payload['data']
        start, end = payload['start_date'], payload['end_date']
        expense = data.get('expense_breakdown', {})
        cats = expense.get('categories', {})
        sections = [
            _section(
                'Expense Categories',
                ['Category', 'Amount'],
                [
                    _row([cats.get(k, {}).get('label', k), _fmt_money(cats.get(k, {}).get('amount', 0))])
                    for k in ('parts', 'labor', 'overhead')
                ]
                + [_row(['Total', _fmt_money(expense.get('total_expenses', 0))], is_total=True)],
            ),
        ]
        jobs = data.get('return_jobs', [])[:100]
        if jobs:
            sections.append(
                _section(
                    'Return / Rework Jobs',
                    ['WO #', 'Branch', 'Status', 'Warranty', 'Variance'],
                    [
                        _row(
                            [
                                j.get('work_order_number', ''),
                                j.get('branch', ''),
                                j.get('status', ''),
                                'Yes' if j.get('is_warranty_rework') else 'No',
                                _fmt_money(j.get('cost_variance', 0)),
                            ]
                        )
                        for j in jobs
                    ],
                )
            )
        return sections, f'{start} to {end}', None, ''

    if slug == 'opex-variance':
        data = payload['data']
        if not data:
            return [], 'Select a budget', None, ''
        budget = data.get('budget') or {}
        period = data.get('period') or {}
        period_label = ''
        if period.get('start') and period.get('end'):
            period_label = f"{period['start']} to {period['end']}"
        budget_name = budget.get('name', 'OPEX Variance') if isinstance(budget, dict) else 'OPEX Variance'
        lines = data.get('lines', [])
        rows = [
            _row(
                [
                    line.get('account_code', ''),
                    line.get('account_name', ''),
                    _fmt_money(line.get('budget', 0)),
                    _fmt_money(line.get('actual', 0)),
                    _fmt_money(line.get('variance', 0)),
                    f"{line.get('variance_percent', 0):.1f}%",
                ]
            )
            for line in lines
        ]
        sections = [
            _section(
                budget_name,
                ['Code', 'Account', 'Budget', 'Actual', 'Variance', 'Var %'],
                rows,
                description=period_label,
            )
        ]
        return sections, period_label, None, ''

    if slug == 'supplier-ap-aging':
        data = payload['data']
        date = payload['date']
        summary = data.get('summary', {})
        bucket_labels = {
            'current': 'Current',
            '1-30': '1-30 Days',
            '31-60': '31-60 Days',
            '61-90': '61-90 Days',
            '90+': '90+ Days',
        }
        sum_rows = [
            _row([bucket_labels.get(k, k), _fmt_money(summary.get(k, 0))])
            for k in bucket_labels
        ]
        sum_rows.append(_row(['Total', _fmt_money(summary.get('total', 0))], is_total=True))
        sections = [_section('Summary', ['Bucket', 'Amount'], sum_rows)]
        sup_rows = [
            _row(
                [
                    s.get('supplier_code', ''),
                    s.get('supplier_name', ''),
                    s.get('payment_terms', ''),
                    _fmt_money(s.get('amount_due', 0)),
                    s.get('expected_payment_date', '') or '',
                    s.get('bill_count', 0),
                ]
            )
            for s in data.get('suppliers', [])[:200]
        ]
        if sup_rows:
            sections.append(
                _section(
                    'By Supplier',
                    ['Code', 'Supplier', 'Terms', 'Amount Due', 'Expected Pay', 'Bills'],
                    sup_rows,
                    numeric_last=True,
                )
            )
        return sections, f'As of {date}', None, ''

    if slug == 'management':
        tab = payload['tab']
        start, end = payload['start_date'], payload['end_date']
        data = payload.get('data') or {}
        date_info = f'{start} to {end}'
        tab_titles = {
            'executive': 'Executive KPIs',
            'scorecard': 'Branch Scorecard',
            'consolidated': 'Consolidated P&L',
            'cash': 'Cash Collection',
            'mix': 'Revenue Mix',
        }
        sections = []

        if tab == 'executive':
            kpis = data.get('kpis', {})
            cards = [{'label': k.replace('_', ' ').title(), 'value': _fmt_money(v)} for k, v in list(kpis.items())[:8]]
            top = data.get('top_expenses', [])
            if top:
                sections.append(
                    _section(
                        'Top Operating Expenses',
                        ['Account', 'Amount'],
                        [_row([e['name'], _fmt_money(e['amount'])]) for e in top],
                    )
                )
            return sections, date_info, cards, tab_titles.get(tab, '')

        if tab == 'scorecard':
            branches = data.get('branches', [])
            sections.append(
                _section(
                    'Branch Rankings',
                    ['Rank', 'Branch', 'Revenue', 'Expenses', 'Net Income', 'Margin %'],
                    [
                        _row(
                            [
                                b.get('rank', ''),
                                b.get('branch_name', ''),
                                _fmt_money(b.get('revenue', 0)),
                                _fmt_money(b.get('expenses', 0)),
                                _fmt_money(b.get('net_income', 0)),
                                f"{b.get('margin_percent', 0):.1f}%",
                            ]
                        )
                        for b in branches
                    ],
                    numeric_last=True,
                )
            )
            return sections, date_info, None, tab_titles.get(tab, '')

        if tab == 'consolidated':
            cons = data.get('consolidated', {}).get('totals', {})
            cards = [
                {'label': 'Revenue', 'value': _fmt_money(cons.get('income', 0))},
                {'label': 'Expenses', 'value': _fmt_money(cons.get('expenses', 0))},
                {'label': 'Net Income', 'value': _fmt_money(cons.get('net_income', 0))},
            ]
            sections.append(
                _section(
                    'By Branch',
                    ['Branch', 'Revenue', 'Expenses', 'Net Income'],
                    [
                        _row(
                            [
                                b.get('branch_name', ''),
                                _fmt_money(b.get('totals', {}).get('income', 0)),
                                _fmt_money(b.get('totals', {}).get('expenses', 0)),
                                _fmt_money(b.get('totals', {}).get('net_income', 0)),
                            ]
                        )
                        for b in data.get('branches', [])
                    ],
                )
            )
            return sections, date_info, cards, tab_titles.get(tab, '')

        if tab == 'cash':
            segments = data.get('segments', [])
            totals = data.get('totals', {})
            cards = [
                {
                    'label': 'Collection Rate',
                    'value': f"{totals.get('collection_rate_percent', 0):.1f}%",
                },
            ]
            sections.append(
                _section(
                    'Segments',
                    ['Segment', 'Invoiced', 'Collected', 'Rate %', 'Count'],
                    [
                        _row(
                            [
                                s.get('label', ''),
                                _fmt_money(s.get('invoiced', 0)),
                                _fmt_money(s.get('collected', 0)),
                                f"{s.get('collection_rate_percent', 0):.1f}%",
                                s.get('invoice_count', 0),
                            ]
                        )
                        for s in segments
                    ],
                )
            )
            return sections, date_info, cards, tab_titles.get(tab, '')

        if tab == 'mix':
            sections = [
                _section(
                    'By Product',
                    ['Product', 'Invoiced', 'Collected'],
                    [
                        _row([p.get('label', ''), _fmt_money(p.get('invoiced', 0)), _fmt_money(p.get('collected', 0))])
                        for p in data.get('by_product', [])
                    ],
                ),
                _section(
                    'By Branch',
                    ['Branch', 'Invoiced', 'Share %'],
                    [
                        _row(
                            [
                                b.get('branch_name', ''),
                                _fmt_money(b.get('invoiced', 0)),
                                f"{b.get('share_percent', 0):.1f}%",
                            ]
                        )
                        for b in data.get('by_branch', [])
                    ],
                ),
            ]
            return sections, date_info, None, tab_titles.get(tab, '')

    return [], '', None, ''


def build_accounting_report_context(slug: str, request) -> dict[str, Any]:
    if slug not in ACCOUNTING_REPORT_SLUGS:
        raise ValueError(f'Invalid report slug: {slug}')

    payload = fetch_report_data(slug, request)
    sections, date_info, summary_cards, footer_note = build_print_sections(slug, payload)

    title = REPORT_TITLES.get(slug, slug.replace('-', ' ').title())
    if slug == 'management':
        tab = request.query_params.get('tab', 'executive')
        title = f"{title} — {tab.replace('_', ' ').title()}"

    return {
        'report_title': title,
        'date_info': date_info,
        'sections': sections,
        'summary_cards': summary_cards,
        'footer_note': footer_note or 'Generated by Smart Vehicle Repairs System',
        'branch_name': _branch_name(request),
        'generated_at': timezone.now(),
        'slug': slug,
    }
