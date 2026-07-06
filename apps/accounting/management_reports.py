"""
Management reporting services (Part B — Phase 1 finance pack).
"""
from calendar import monthrange
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone


def _decimal_to_float(value):
    if value is None:
        return 0.0
    return float(value)


def _prior_period(start_date, end_date, comparison='mom'):
    days = (end_date - start_date).days + 1
    if comparison == 'yoy':
        prior_start = start_date.replace(year=start_date.year - 1)
        prior_end = end_date.replace(year=end_date.year - 1)
        return prior_start, prior_end
    prior_end = start_date - timedelta(days=1)
    prior_start = prior_end - timedelta(days=days - 1)
    return prior_start, prior_end


def _comparison_payload(current_totals, prior_totals):
    def var(cur, prev):
        cur_f = _decimal_to_float(cur)
        prev_f = _decimal_to_float(prev)
        change = cur_f - prev_f
        pct = (change / prev_f * 100) if prev_f else (100.0 if cur_f else 0.0)
        return {'current': cur_f, 'prior': prev_f, 'change': change, 'change_percent': round(pct, 2)}

    return {
        'income': var(current_totals.get('income'), prior_totals.get('income')),
        'expenses': var(current_totals.get('expenses'), prior_totals.get('expenses')),
        'net_income': var(current_totals.get('net_income'), prior_totals.get('net_income')),
    }


def compute_expected_payment_date(bill_date, payment_terms='', due_date=None):
    if due_date:
        return due_date
    terms = (payment_terms or '').lower().replace('_', ' ')
    if not bill_date:
        return None
    if 'due on receipt' in terms or terms.strip() in ('cod', 'immediate'):
        return bill_date
    for label, days in (
        ('net 60', 60),
        ('net 45', 45),
        ('net 30', 30),
        ('net 15', 15),
        ('net 7', 7),
    ):
        if label in terms:
            return bill_date + timedelta(days=days)
    if 'net' in terms:
        digits = ''.join(c for c in terms if c.isdigit())
        if digits:
            return bill_date + timedelta(days=int(digits))
    return bill_date + timedelta(days=30)


def _corporate_customer_types():
    return ('business', 'fleet')


class ManagementReportingService:
    @classmethod
    def get_profit_loss_comparative(cls, start_date, end_date, branch_id=None, comparison='mom'):
        from .services import ReportingService

        current = ReportingService.get_profit_loss(start_date, end_date, branch_id=branch_id)
        prior_start, prior_end = _prior_period(start_date, end_date, comparison=comparison)
        prior = ReportingService.get_profit_loss(prior_start, prior_end, branch_id=branch_id)

        return {
            'period': {'start': start_date, 'end': end_date},
            'comparison': comparison,
            'prior_period': {'start': prior_start, 'end': prior_end},
            'branch_id': branch_id,
            'current': cls._serialize_pl(current),
            'prior': cls._serialize_pl(prior),
            'variance': _comparison_payload(current['totals'], prior['totals']),
        }

    @staticmethod
    def _serialize_pl(pl):
        return {
            'income': [
                {'code': r['code'], 'name': r['name'], 'balance': _decimal_to_float(r['balance'])}
                for r in pl['income']
            ],
            'expenses': [
                {'code': r['code'], 'name': r['name'], 'balance': _decimal_to_float(r['balance'])}
                for r in pl['expenses']
            ],
            'totals': {k: _decimal_to_float(v) for k, v in pl['totals'].items()},
        }

    @classmethod
    def get_consolidated_profit_loss(cls, start_date, end_date, branch_ids=None):
        from apps.branches.models import Branch
        from .services import ReportingService

        branch_qs = Branch.objects.filter(is_active=True).order_by('name')
        if branch_ids is not None:
            branch_qs = branch_qs.filter(id__in=branch_ids)

        branches = []
        for branch in branch_qs:
            b_pl = ReportingService.get_profit_loss(start_date, end_date, branch_id=branch.id)
            branches.append({
                'branch_id': branch.id,
                'branch_name': branch.name,
                'totals': {k: _decimal_to_float(v) for k, v in b_pl['totals'].items()},
            })

        if branch_ids is not None and len(branch_ids) == 1:
            consolidated = ReportingService.get_profit_loss(start_date, end_date, branch_id=branch_ids[0])
        elif branch_ids is not None:
            consolidated = cls._aggregate_branch_pl_totals(branches)
        else:
            consolidated = ReportingService.get_profit_loss(start_date, end_date, branch_id=None)

        return {
            'period': {'start': start_date, 'end': end_date},
            'consolidated': cls._serialize_pl(consolidated),
            'branches': branches,
        }

    @staticmethod
    def _aggregate_branch_pl_totals(branch_rows):
        income = sum(Decimal(str(row['totals'].get('income', 0))) for row in branch_rows)
        expenses = sum(Decimal(str(row['totals'].get('expenses', 0))) for row in branch_rows)
        net_income = income - expenses
        return {
            'income': [],
            'expenses': [],
            'totals': {
                'income': income,
                'expenses': expenses,
                'net_income': net_income,
            },
        }

    @classmethod
    def get_branch_pl_scorecard(cls, start_date, end_date, branch_ids=None):
        from apps.branches.models import Branch
        from .services import ReportingService

        branch_qs = Branch.objects.filter(is_active=True).order_by('name')
        if branch_ids is not None:
            branch_qs = branch_qs.filter(id__in=branch_ids)

        rows = []
        for branch in branch_qs:
            pl = ReportingService.get_profit_loss(start_date, end_date, branch_id=branch.id)
            income = pl['totals']['income']
            net = pl['totals']['net_income']
            margin = float((net / income * 100).quantize(Decimal('0.01'))) if income > 0 else 0.0
            rows.append({
                'branch_id': branch.id,
                'branch_name': branch.name,
                'revenue': _decimal_to_float(income),
                'expenses': _decimal_to_float(pl['totals']['expenses']),
                'net_income': _decimal_to_float(net),
                'margin_percent': margin,
            })

        rows.sort(key=lambda r: r['net_income'], reverse=True)
        for rank, row in enumerate(rows, start=1):
            row['rank'] = rank
        return {
            'period': {'start': start_date, 'end': end_date},
            'branches': rows,
        }

    @classmethod
    def get_supplier_ap_aging(cls, as_of_date=None, branch_id=None):
        from apps.billing.models import Bill

        if not as_of_date:
            as_of_date = timezone.now().date()

        bills_qs = Bill.objects.filter(
            status__in=['open', 'partially_paid', 'overdue']
        ).exclude(amount_due=0)
        if branch_id:
            bills_qs = bills_qs.filter(branch_id=branch_id)

        supplier_map = {}
        for bill in bills_qs.select_related('vendor'):
            vendor = bill.vendor
            sid = vendor.id
            if sid not in supplier_map:
                supplier_map[sid] = {
                    'supplier_id': sid,
                    'supplier_code': vendor.supplier_code,
                    'supplier_name': vendor.name,
                    'payment_terms': vendor.payment_terms or bill.terms or '',
                    'amount_due': Decimal('0'),
                    'bills': [],
                    'buckets': {
                        'current': Decimal('0'),
                        '1-30': Decimal('0'),
                        '31-60': Decimal('0'),
                        '61-90': Decimal('0'),
                        '90+': Decimal('0'),
                    },
                }
            entry = supplier_map[sid]
            amount = bill.amount_due
            due = bill.due_date
            if not due or as_of_date <= due:
                bucket = 'current'
            else:
                days = (as_of_date - due).days
                if days <= 30:
                    bucket = '1-30'
                elif days <= 60:
                    bucket = '31-60'
                elif days <= 90:
                    bucket = '61-90'
                else:
                    bucket = '90+'

            expected = compute_expected_payment_date(
                bill.bill_date, entry['payment_terms'], due_date=due
            )
            entry['amount_due'] += amount
            entry['buckets'][bucket] += amount
            entry['bills'].append({
                'bill_id': bill.id,
                'bill_number': bill.bill_number,
                'bill_date': bill.bill_date.isoformat(),
                'due_date': due.isoformat() if due else None,
                'expected_payment_date': expected.isoformat() if expected else None,
                'amount_due': _decimal_to_float(amount),
                'bucket': bucket,
            })

        suppliers = []
        summary_buckets = {k: 0.0 for k in ['current', '1-30', '31-60', '61-90', '90+', 'total']}
        for entry in supplier_map.values():
            next_expected = None
            for b in entry['bills']:
                ed = b.get('expected_payment_date')
                if ed and (next_expected is None or ed < next_expected):
                    next_expected = ed
            row = {
                'supplier_id': entry['supplier_id'],
                'supplier_code': entry['supplier_code'],
                'supplier_name': entry['supplier_name'],
                'payment_terms': entry['payment_terms'],
                'amount_due': _decimal_to_float(entry['amount_due']),
                'expected_payment_date': next_expected,
                'buckets': {k: _decimal_to_float(v) for k, v in entry['buckets'].items()},
                'bill_count': len(entry['bills']),
                'bills': entry['bills'],
            }
            suppliers.append(row)
            for k in entry['buckets']:
                summary_buckets[k] += _decimal_to_float(entry['buckets'][k])
            summary_buckets['total'] += row['amount_due']

        suppliers.sort(key=lambda s: s['amount_due'], reverse=True)
        return {
            'as_of_date': as_of_date.isoformat(),
            'summary': summary_buckets,
            'suppliers': suppliers,
        }

    @classmethod
    def get_cash_collection_report(cls, start_date, end_date, branch_id=None):
        from apps.billing.models import Invoice

        qs = Invoice.objects.filter(
            invoice_date__gte=start_date,
            invoice_date__lte=end_date,
        ).exclude(status='void')
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        segments = {
            'individual': {
                'label': 'Individual',
                'invoiced': Decimal('0'),
                'collected': Decimal('0'),
                'invoice_count': 0,
            },
            'corporate': {
                'label': 'Corporate (Business & Fleet)',
                'invoiced': Decimal('0'),
                'collected': Decimal('0'),
                'invoice_count': 0,
            },
        }

        for inv in qs.select_related('customer'):
            ctype = getattr(inv.customer, 'customer_type', 'individual') or 'individual'
            key = 'corporate' if ctype in _corporate_customer_types() else 'individual'
            segments[key]['invoiced'] += inv.total or Decimal('0')
            segments[key]['collected'] += inv.amount_paid or Decimal('0')
            segments[key]['invoice_count'] += 1

        result_segments = []
        total_invoiced = Decimal('0')
        total_collected = Decimal('0')
        for key, seg in segments.items():
            invoiced = seg['invoiced']
            collected = seg['collected']
            total_invoiced += invoiced
            total_collected += collected
            result_segments.append({
                'segment': key,
                'label': seg['label'],
                'invoiced': _decimal_to_float(invoiced),
                'collected': _decimal_to_float(collected),
                'outstanding': _decimal_to_float(invoiced - collected),
                'collection_rate_percent': round(
                    float((collected / invoiced * 100) if invoiced > 0 else 0), 2
                ),
                'invoice_count': seg['invoice_count'],
            })

        return {
            'period': {'start': start_date, 'end': end_date},
            'branch_id': branch_id,
            'segments': result_segments,
            'totals': {
                'invoiced': _decimal_to_float(total_invoiced),
                'collected': _decimal_to_float(total_collected),
                'collection_rate_percent': round(
                    float((total_collected / total_invoiced * 100) if total_invoiced > 0 else 0), 2
                ),
            },
        }

    @classmethod
    def get_revenue_mix(cls, start_date, end_date, branch_id=None):
        from django.db.models import Sum

        from apps.billing.models import Invoice, Payment
        from apps.branches.models import Branch

        inv_qs = Invoice.objects.filter(
            invoice_date__gte=start_date,
            invoice_date__lte=end_date,
        ).exclude(status='void')
        if branch_id:
            inv_qs = inv_qs.filter(branch_id=branch_id)

        by_product = {
            'service': {'label': 'Workshop / Service', 'invoiced': Decimal('0'), 'collected': Decimal('0')},
            'subscription': {'label': 'Subscription', 'invoiced': Decimal('0'), 'collected': Decimal('0')},
            'other': {'label': 'Other', 'invoiced': Decimal('0'), 'collected': Decimal('0')},
        }
        for inv in inv_qs:
            desc = (inv.description or '').lower()
            if 'subscription:' in desc:
                key = 'subscription'
            elif inv.work_order_id:
                key = 'service'
            else:
                key = 'other'
            by_product[key]['invoiced'] += inv.total or Decimal('0')
            by_product[key]['collected'] += inv.amount_paid or Decimal('0')

        branch_rows = []
        branches = Branch.objects.filter(is_active=True)
        if branch_id:
            branches = branches.filter(id=branch_id)
        for branch in branches.order_by('name'):
            b_inv = inv_qs.filter(branch_id=branch.id)
            invoiced = b_inv.aggregate(t=Sum('total'))['t'] or Decimal('0')
            collected = b_inv.aggregate(t=Sum('amount_paid'))['t'] or Decimal('0')
            branch_rows.append({
                'branch_id': branch.id,
                'branch_name': branch.name,
                'invoiced': _decimal_to_float(invoiced),
                'collected': _decimal_to_float(collected),
                'share_percent': 0.0,
            })

        total_inv = sum(r['invoiced'] for r in branch_rows) or 0
        for row in branch_rows:
            row['share_percent'] = round((row['invoiced'] / total_inv * 100) if total_inv else 0, 2)

        pay_qs = Payment.objects.filter(
            status='completed',
            payment_date__date__gte=start_date,
            payment_date__date__lte=end_date,
            invoice__isnull=False,
        )
        if branch_id:
            pay_qs = pay_qs.filter(invoice__branch_id=branch_id)
        cash_collected = pay_qs.aggregate(t=Sum('amount'))['t'] or Decimal('0')

        return {
            'period': {'start': start_date, 'end': end_date},
            'by_product': [
                {
                    'product': k,
                    'label': v['label'],
                    'invoiced': _decimal_to_float(v['invoiced']),
                    'collected': _decimal_to_float(v['collected']),
                }
                for k, v in by_product.items()
            ],
            'by_branch': branch_rows,
            'payment_collected_in_period': _decimal_to_float(cash_collected),
        }

    @classmethod
    def get_revenue_by_product(cls, start_date, end_date, branch_id=None):
        """Revenue breakdown by owner-aligned RevenueProduct on invoice lines."""
        from django.db.models import Sum

        from apps.billing.models import InvoiceLineItem

        line_qs = InvoiceLineItem.objects.filter(
            invoice__invoice_date__gte=start_date,
            invoice__invoice_date__lte=end_date,
        ).exclude(invoice__status='void')
        if branch_id:
            line_qs = line_qs.filter(invoice__branch_id=branch_id)

        rows = (
            line_qs.values(
                'revenue_product_id',
                'revenue_product__code',
                'revenue_product__name',
                'revenue_product__owner_account_code',
                'revenue_product__owner_account_label',
                'revenue_product__revenue_class',
            )
            .annotate(invoiced=Sum('total'))
            .order_by('revenue_product__sort_order', 'revenue_product__name')
        )

        unclassified = line_qs.filter(revenue_product__isnull=True).aggregate(
            invoiced=Sum('total'),
        )['invoiced'] or Decimal('0')

        product_rows = []
        total_invoiced = Decimal('0')
        for row in rows:
            invoiced = row['invoiced'] or Decimal('0')
            total_invoiced += invoiced
            product_rows.append({
                'revenue_product_id': row['revenue_product_id'],
                'code': row['revenue_product__code'],
                'name': row['revenue_product__name'],
                'owner_account_code': row['revenue_product__owner_account_code'] or '',
                'owner_account_label': row['revenue_product__owner_account_label'] or '',
                'revenue_class': row['revenue_product__revenue_class'] or '',
                'invoiced': _decimal_to_float(invoiced),
            })

        if unclassified > 0:
            total_invoiced += unclassified
            product_rows.append({
                'revenue_product_id': None,
                'code': 'unclassified',
                'name': 'Unclassified',
                'owner_account_code': '',
                'owner_account_label': '',
                'revenue_class': 'other',
                'invoiced': _decimal_to_float(unclassified),
            })

        for row in product_rows:
            invoiced = Decimal(str(row['invoiced']))
            row['share_percent'] = round(
                float((invoiced / total_invoiced * 100) if total_invoiced > 0 else 0), 2,
            )

        return {
            'period': {'start': start_date, 'end': end_date},
            'branch_id': branch_id,
            'products': product_rows,
            'totals': {'invoiced': _decimal_to_float(total_invoiced)},
        }

    @classmethod
    def get_opex_variance(cls, budget_id, start_date=None, end_date=None):
        from .models import Account
        from .services import ReportingService

        report = ReportingService.get_budget_vs_actual(budget_id, start_date, end_date)
        if not report:
            return None

        opex_lines = []
        total_budget = Decimal('0')
        total_actual = Decimal('0')
        for line in report.get('lines', []):
            code = line.get('account_code') or ''
            if line.get('account_type') != 'expense':
                continue
            # Exclude COGS / direct job cost accounts (5100–5299); keep operating expenses (5300+)
            if code and len(code) >= 4 and '5100' <= code <= '5299':
                continue
            budget_amt = Decimal(str(line.get('budget', 0)))
            actual_amt = Decimal(str(line.get('actual', 0)))
            variance = actual_amt - budget_amt
            opex_lines.append({
                'account_code': code,
                'account_name': line.get('account_name'),
                'budget': float(budget_amt),
                'actual': float(actual_amt),
                'variance': float(variance),
                'variance_percent': float(
                    (variance / budget_amt * 100).quantize(Decimal('0.01'))
                ) if budget_amt else 0.0,
            })
            total_budget += budget_amt
            total_actual += actual_amt

        total_variance = total_actual - total_budget
        return {
            'budget_id': budget_id,
            'budget': report.get('budget'),
            'period': report.get('period'),
            'lines': opex_lines,
            'totals': {
                'budget': float(total_budget),
                'actual': float(total_actual),
                'variance': float(total_variance),
                'variance_percent': float(
                    (total_variance / total_budget * 100).quantize(Decimal('0.01'))
                ) if total_budget else 0.0,
            },
        }

    @classmethod
    def get_cost_control_report(cls, start_date, end_date, branch_id=None):
        """Workshop cost control: expense breakdown + return/rework jobs."""
        from apps.reporting.operations_reports import OperationsReportingService
        from .services import ReportingService

        expense = ReportingService.get_expense_breakdown(start_date, end_date, branch_id=branch_id)
        branch_ids = [branch_id] if branch_id else None
        return_jobs = OperationsReportingService.cost_control_return_jobs(
            start_date, end_date, branch_ids
        )
        return {
            'period': {'start': start_date, 'end': end_date},
            'expense_breakdown': expense,
            'return_jobs': return_jobs.get('return_jobs', []),
            'return_job_count': len(return_jobs.get('return_jobs', [])),
        }
