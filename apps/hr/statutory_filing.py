"""Payroll statutory filing pack and register reports."""
from collections import defaultdict
from decimal import Decimal

from apps.hr.models import PaySlip, SalaryComponent


class StatutoryFilingService:
  STATUTORY_LABELS = dict(SalaryComponent.STATUTORY_CODE_CHOICES)

  @classmethod
  def _component_code_map(cls):
    return {
      comp.name: comp.statutory_code
      for comp in SalaryComponent.objects.filter(is_active=True).exclude(statutory_code='')
    }

  @classmethod
  def get_payroll_register(cls, payroll_period):
    payslips = payroll_period.payslips.select_related(
      'employee', 'employee__user', 'employee__department'
    ).order_by('employee__user__last_name')

    rows = []
    totals = {
      'basic_salary': Decimal('0'),
      'overtime_pay': Decimal('0'),
      'gross_pay': Decimal('0'),
      'tax_amount': Decimal('0'),
      'deductions': Decimal('0'),
      'net_pay': Decimal('0'),
      'headcount': 0,
    }
    for slip in payslips:
      deduction_total = sum(Decimal(str(v)) for v in (slip.deductions or {}).values())
      rows.append({
        'employee_id': slip.employee_id,
        'employee_name': slip.employee.user.get_full_name(),
        'department': getattr(slip.employee.department, 'name', None),
        'basic_salary': float(slip.basic_salary),
        'overtime_pay': float(slip.overtime_pay),
        'gross_pay': float(slip.gross_pay),
        'tax_amount': float(slip.tax_amount),
        'deductions': float(deduction_total),
        'net_pay': float(slip.net_pay),
        'status': slip.status,
      })
      totals['basic_salary'] += slip.basic_salary
      totals['overtime_pay'] += slip.overtime_pay
      totals['gross_pay'] += slip.gross_pay
      totals['tax_amount'] += slip.tax_amount
      totals['deductions'] += deduction_total
      totals['net_pay'] += slip.net_pay
      totals['headcount'] += 1

    return {
      'period': {
        'id': payroll_period.id,
        'name': payroll_period.name,
        'start_date': payroll_period.start_date.isoformat(),
        'end_date': payroll_period.end_date.isoformat(),
        'status': payroll_period.status,
      },
      'rows': rows,
      'totals': {k: float(v) if k != 'headcount' else v for k, v in totals.items()},
    }

  @classmethod
  def get_statutory_pack(cls, payroll_period):
    code_map = cls._component_code_map()
    payslips = payroll_period.payslips.select_related('employee', 'employee__user')

    statutory_totals = defaultdict(lambda: Decimal('0'))
    employee_lines = []

    for slip in payslips:
      line = {
        'employee_id': slip.employee_id,
        'employee_name': slip.employee.user.get_full_name(),
        'gross_pay': float(slip.gross_pay),
        'taxable_income': float(slip.gross_pay),
        'paye': float(slip.tax_amount),
        'statutory_deductions': {},
      }
      statutory_totals['PAYE'] += slip.tax_amount
      line['statutory_deductions']['PAYE'] = float(slip.tax_amount)

      for name, amount in (slip.deductions or {}).items():
        code = code_map.get(name, 'OTHER')
        if not code:
          code = 'OTHER'
        amt = Decimal(str(amount))
        statutory_totals[code] += amt
        line['statutory_deductions'][code] = line['statutory_deductions'].get(code, 0) + float(amt)

      employee_lines.append(line)

    summary = [
      {
        'code': code,
        'label': cls.STATUTORY_LABELS.get(code, code),
        'total': float(total),
      }
      for code, total in sorted(statutory_totals.items())
      if total > 0
    ]

    return {
      'period': {
        'id': payroll_period.id,
        'name': payroll_period.name,
        'start_date': payroll_period.start_date.isoformat(),
        'end_date': payroll_period.end_date.isoformat(),
        'status': payroll_period.status,
      },
      'summary': summary,
      'employees': employee_lines,
      'filing_notes': (
        'Statutory totals aggregate PAYE from payslips and deductions mapped via '
        'salary component statutory codes. Configure SSNIT_EE, SSNIT_ER, and other '
        'codes on salary components for authority-ready breakdowns.'
      ),
    }
