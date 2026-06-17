"""Auto-calculation of Ghana SSNIT tier 1/2 and employer contributions."""
from decimal import Decimal, ROUND_HALF_UP

from apps.accounts.settings_utils import get_setting
from apps.hr.models import EmployeeSalaryComponent, SalaryComponent


class StatutoryContributionService:
  MONEY_QUANT = Decimal('0.01')

  RATE_DEFAULTS = {
    'SSNIT_EE': Decimal('5.5'),
    'SSNIT_ER': Decimal('13.0'),
    'TIER2': Decimal('5.0'),
    'TIER2_ER': Decimal('5.0'),
  }

  @classmethod
  def _rate(cls, code):
    key = f'payroll_{code.lower()}_rate'
    raw = get_setting(key, str(cls.RATE_DEFAULTS.get(code, Decimal('0'))))
    try:
      return Decimal(str(raw))
    except Exception:
      return cls.RATE_DEFAULTS.get(code, Decimal('0'))

  @classmethod
  def _auto_enabled(cls):
    value = get_setting('payroll_auto_ssnit', 'true')
    return str(value).strip().lower() in {'true', '1', 'yes', 'on'}

  @classmethod
  def _tier2_enabled(cls):
    value = get_setting('payroll_auto_tier2', 'true')
    return str(value).strip().lower() in {'true', '1', 'yes', 'on'}

  @classmethod
  def _quantize(cls, amount):
    return Decimal(str(amount or 0)).quantize(cls.MONEY_QUANT, rounding=ROUND_HALF_UP)

  @classmethod
  def _percent_of(cls, base, rate):
    if base <= 0 or rate <= 0:
      return Decimal('0.00')
    return cls._quantize(base * rate / Decimal('100'))

  @classmethod
  def configured_statutory_codes(cls, employee):
    codes = set()
    components = EmployeeSalaryComponent.objects.filter(
      employee=employee, is_active=True
    ).select_related('component')
    for ec in components:
      code = ec.component.statutory_code
      if code:
        codes.add(code)
    return codes

  @classmethod
  def calculate(cls, employee, pensionable_income):
    """
    Return employee deductions and employer contributions for statutory items.

    Skips auto-calculation when the employee already has an active salary component
    mapped to the same statutory code.
    """
    deductions = {}
    employer = {}
    if not cls._auto_enabled():
      return deductions, employer

    configured = cls.configured_statutory_codes(employee)
    base = cls._quantize(pensionable_income)

    if 'SSNIT_EE' not in configured:
      amount = cls._percent_of(base, cls._rate('SSNIT_EE'))
      if amount > 0:
        deductions['SSNIT Employee (Tier 1)'] = str(amount)

    if 'SSNIT_ER' not in configured:
      amount = cls._percent_of(base, cls._rate('SSNIT_ER'))
      if amount > 0:
        employer['SSNIT Employer (Tier 1)'] = str(amount)

    if cls._tier2_enabled():
      if 'TIER2' not in configured:
        amount = cls._percent_of(base, cls._rate('TIER2'))
        if amount > 0:
          deductions['Tier 2 Pension (Employee)'] = str(amount)
      if 'TIER2_ER' not in configured:
        amount = cls._percent_of(base, cls._rate('TIER2_ER'))
        if amount > 0:
          employer['Tier 2 Pension (Employer)'] = str(amount)

    return deductions, employer

  @classmethod
  def ensure_default_components(cls):
    """Seed canonical statutory salary components if missing."""
    specs = [
      ('SSNIT Employee', 'deduction', 'SSNIT_EE', '5.5'),
      ('SSNIT Employer', 'deduction', 'SSNIT_ER', '13.0'),
      ('Tier 2 Pension (Employee)', 'deduction', 'TIER2', '5.0'),
      ('Tier 2 Pension (Employer)', 'deduction', 'TIER2_ER', '5.0'),
    ]
    for name, component_type, code, pct in specs:
      comp, _created = SalaryComponent.objects.get_or_create(
        name=name,
        defaults={
          'component_type': component_type,
          'calculation_type': 'percentage',
          'percentage': Decimal(pct),
          'statutory_code': code,
          'is_taxable': False,
          'is_active': True,
        },
      )
      if not comp.statutory_code:
        comp.statutory_code = code
        comp.save(update_fields=['statutory_code'])
