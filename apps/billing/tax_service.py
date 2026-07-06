"""
Centralized tax configuration and calculation utilities.

Implements Ghana Revenue Authority "Standard Rate" regime with VAT, NHIL,
GETFund and COVID-19 Health Recovery Levy. Rates are configurable via the
System Settings admin UI under the Tax & Compliance category.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict

from apps.accounts.admin_models import SystemSettings


TWOPLACES = Decimal('0.01')


@dataclass(frozen=True)
class TaxConfig:
    enabled: bool
    regime: str
    vat_rate: Decimal
    nhil_rate: Decimal
    getfund_rate: Decimal

    def as_dict(self) -> Dict[str, str]:
        return {
            'enabled': self.enabled,
            'regime': self.regime,
            'vat_rate': str(self.vat_rate),
            'nhil_rate': str(self.nhil_rate),
            'getfund_rate': str(self.getfund_rate),
        }


@dataclass(frozen=True)
class TaxBreakdown:
    taxable_subtotal: Decimal
    nhil_amount: Decimal
    getfund_amount: Decimal
    vat_amount: Decimal
    total_tax: Decimal
    regime: str

    def as_dict(self) -> Dict[str, str]:
        return {
            'taxable_subtotal': str(self.taxable_subtotal),
            'nhil_amount': str(self.nhil_amount),
            'getfund_amount': str(self.getfund_amount),
            'vat_amount': str(self.vat_amount),
            'total_tax': str(self.total_tax),
            'regime': self.regime,
        }


class TaxService:
    """
    Helper class for reading tax configuration from SystemSettings and
    calculating Ghanaian VAT + levies for invoices/estimates.
    """

    DEFAULTS = {
        'enabled': True,
        'regime': 'ghana_standard',
        'vat_rate': Decimal('15.0'),
        'nhil_rate': Decimal('2.5'),
        'getfund_rate': Decimal('2.5'),
    }

    @classmethod
    def _parse_bool(cls, value) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}

    @classmethod
    def _parse_decimal(cls, value, default: Decimal) -> Decimal:
        try:
            return Decimal(str(value))
        except (ArithmeticError, ValueError, TypeError):
            return default

    @classmethod
    def get_config(cls) -> TaxConfig:
        """Fetch the active tax configuration from system settings."""
        enabled = cls._parse_bool(SystemSettings.get_setting('tax_enabled', cls.DEFAULTS['enabled']))
        vat_rate = cls._parse_decimal(
            SystemSettings.get_setting('tax_vat_rate', cls.DEFAULTS['vat_rate']),
            cls.DEFAULTS['vat_rate'],
        )
        nhil_rate = cls._parse_decimal(
            SystemSettings.get_setting('tax_nhil_rate', cls.DEFAULTS['nhil_rate']),
            cls.DEFAULTS['nhil_rate'],
        )
        getfund_rate = cls._parse_decimal(
            SystemSettings.get_setting('tax_getfund_rate', cls.DEFAULTS['getfund_rate']),
            cls.DEFAULTS['getfund_rate'],
        )
        regime = SystemSettings.get_setting('tax_regime', cls.DEFAULTS['regime']) or cls.DEFAULTS['regime']

        return TaxConfig(
            enabled=enabled,
            regime=regime,
            vat_rate=vat_rate,
            nhil_rate=nhil_rate,
            getfund_rate=getfund_rate,
        )

    @classmethod
    def calculate_breakdown(cls, taxable_subtotal: Decimal) -> TaxBreakdown:
        """
        Calculate the levy and VAT amounts for the provided taxable subtotal.

        Args:
            taxable_subtotal: Decimal amount after discounts representing the
                taxable value of the supply.
        """
        taxable_subtotal = taxable_subtotal or Decimal('0')
        config = cls.get_config()

        if not config.enabled or taxable_subtotal <= 0:
            return TaxBreakdown(
                taxable_subtotal=taxable_subtotal.quantize(TWOPLACES),
                nhil_amount=Decimal('0'),
                getfund_amount=Decimal('0'),
                vat_amount=Decimal('0'),
                total_tax=Decimal('0'),
                regime=config.regime,
            )

        nhil_amount = cls._quantize(taxable_subtotal * config.nhil_rate / Decimal('100'))
        getfund_amount = cls._quantize(taxable_subtotal * config.getfund_rate / Decimal('100'))

        # VAT reform 2026: VAT is decoupled from levies, calculated on base value
        vat_base = taxable_subtotal
        vat_amount = cls._quantize(vat_base * config.vat_rate / Decimal('100'))

        total_tax = nhil_amount + getfund_amount + vat_amount

        return TaxBreakdown(
            taxable_subtotal=taxable_subtotal.quantize(TWOPLACES),
            nhil_amount=nhil_amount,
            getfund_amount=getfund_amount,
            vat_amount=vat_amount,
            total_tax=total_tax.quantize(TWOPLACES),
            regime=config.regime,
        )

    @staticmethod
    def _quantize(value: Decimal) -> Decimal:
        return value.quantize(TWOPLACES, rounding=ROUND_HALF_UP)

