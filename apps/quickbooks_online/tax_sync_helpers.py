"""QuickBooks Online sales tax helpers (Ghana / non-US global tax)."""
from __future__ import annotations

import logging
import re
from decimal import Decimal

logger = logging.getLogger(__name__)

try:
    from quickbooks.objects.base import Ref
    from quickbooks.objects.tax import TaxLine, TaxLineDetail, TxnTaxDetail
    from quickbooks.objects.taxcode import TaxCode as QBTaxCode
    from quickbooks.objects.taxrate import TaxRate as QBTaxRate
except ModuleNotFoundError:
    Ref = None
    TaxLine = None
    TaxLineDetail = None
    TxnTaxDetail = None
    QBTaxCode = None
    QBTaxRate = None

_US_COUNTRY_CODES = frozenset({'US', 'USA', 'UNITED STATES'})
US_LINE_TAX_CODE = 'TAX'
US_LINE_NON_TAX_CODE = 'NON'

try:
    from quickbooks.objects.company_info import CompanyInfo as QBCompanyInfo
except ModuleNotFoundError:
    QBCompanyInfo = None


def uses_us_line_tax_codes(service) -> bool:
    """
    US QBO (Automated Sales Tax) only accepts TAX/NON on invoice lines.

    Ghana and other global editions require numeric TaxCode ids (e.g. composite id 8).
    """
    cached = getattr(service, '_qbo_uses_us_line_tax', None)
    if cached is not None:
        return cached

    uses_us = False
    if QBCompanyInfo is not None:
        client = service.get_client()
        if client:
            try:
                info = QBCompanyInfo.get(1, qb=client)
                country = (getattr(info, 'Country', None) or '').upper().strip()
                uses_us = country in _US_COUNTRY_CODES
            except Exception as exc:
                logger.debug('Could not read QBO company country: %s', exc)

    service._qbo_uses_us_line_tax = uses_us
    if uses_us:
        logger.info('QBO company uses US line tax codes (TAX/NON); numeric tax code ids are not valid on lines.')
    return uses_us


# Read-only / response-only fields returned by GET that QBO rejects on update (error 2010).
_QBO_READONLY_SALES_TXN_ATTRS = (
    'Balance',
    'TotalAmt',
    'HomeBalance',
    'HomeTotalAmt',
    'MetaData',
    'InvoiceLink',
    'domain',
    'DeliveryInfo',
    'PrintStatus',
    'ExchangeRate',
    'AllowIPNPayment',
    'AllowOnlineACHPayment',
    'AllowOnlineCreditCardPayment',
    'AllowOnlinePayment',
    'ApplyTaxAfterDiscount',
    'FreeFormAddress',
    'Deposit',
    'ShipFromAddr',
    'CustomField',
    'sparse',
)


def _strip_empty_ref_fields(ref):
    if ref is None:
        return
    for attr in ('name', 'type'):
        if getattr(ref, attr, None) == '':
            setattr(ref, attr, None)


def _sanitize_sales_lines(qb_txn):
    for line in getattr(qb_txn, 'Line', None) or []:
        for attr in ('LinkedTxn', 'CustomField'):
            if getattr(line, attr, None) == []:
                setattr(line, attr, None)

        detail = getattr(line, 'SalesItemLineDetail', None)
        if detail is None:
            continue
        if getattr(detail, 'TaxInclusiveAmt', None) == 0:
            detail.TaxInclusiveAmt = None
        if getattr(detail, 'ServiceDate', None) == '':
            detail.ServiceDate = None
        _strip_empty_ref_fields(getattr(detail, 'ItemRef', None))
        _strip_empty_ref_fields(getattr(detail, 'TaxCodeRef', None))


def finalize_sales_transaction_for_qbo(service, qb_txn):
    """
    Sanitize outbound invoice/estimate/credit-memo payloads before save.

    - Updates: strip read-only fields loaded from QBO GET (error 2010).
    - All locales: remove empty strings, zero TaxInclusiveAmt, empty Ref names.
    - US AST: also drop GlobalTaxCalculation, EmailStatus, and manual tax fields.
    """
    us_company = uses_us_line_tax_codes(service)

    if getattr(qb_txn, 'Id', None):
        for attr in _QBO_READONLY_SALES_TXN_ATTRS:
            if hasattr(qb_txn, attr):
                setattr(qb_txn, attr, None)

    for attr in ('DueDate', 'ShipDate', 'TxnDate', 'TrackingNum', 'PrivateNote'):
        if getattr(qb_txn, attr, None) == '':
            setattr(qb_txn, attr, None)

    _sanitize_sales_lines(qb_txn)

    txn_tax = getattr(qb_txn, 'TxnTaxDetail', None)
    if txn_tax is not None:
        if not getattr(txn_tax, 'TaxLine', None):
            txn_tax.TaxLine = None
        _strip_empty_ref_fields(getattr(txn_tax, 'TxnTaxCodeRef', None))

    for ref_attr in ('CustomerRef', 'DepartmentRef', 'CurrencyRef'):
        _strip_empty_ref_fields(getattr(qb_txn, ref_attr, None))

    if not us_company:
        return

    if hasattr(qb_txn, 'GlobalTaxCalculation'):
        qb_txn.GlobalTaxCalculation = None

    for attr in ('EmailStatus', 'BillEmail', 'BillEmailCc', 'BillEmailBcc'):
        if hasattr(qb_txn, attr):
            setattr(qb_txn, attr, None)


def stamp_us_sales_line_tax_codes(qb_lines, local_line_items):
    """Apply TAX/NON line tax codes required by US Automated Sales Tax."""
    if Ref is None:
        return

    for qb_line, local_item in zip(qb_lines, list(local_line_items)):
        detail = getattr(qb_line, 'SalesItemLineDetail', None)
        if detail is None:
            continue
        is_taxable = getattr(local_item, 'is_taxable', True)
        detail.TaxCodeRef = Ref()
        detail.TaxCodeRef.value = US_LINE_TAX_CODE if is_taxable else US_LINE_NON_TAX_CODE


_LEVY_FIELD_MAP = (
    ('vat', 'tax_vat_amount'),
    ('nhil', 'tax_nhil_amount'),
    ('getfund', 'tax_getfund_amount'),
    ('hrl', 'tax_hrl_amount'),
)

_LEVY_NAME_HINTS = {
    'vat': ('vat', 'value added'),
    'nhil': ('nhil', 'national health'),
    'getfund': ('getfund', 'get fund', 'gfld'),
    'hrl': ('hrl', 'health recovery', 'covid'),
}


def _sdk_ready() -> bool:
    return all(x is not None for x in (Ref, TaxLine, TaxLineDetail, QBTaxCode))


def fetch_qbo_tax_code(service, tax_code_id: str):
    if not _sdk_ready() or not tax_code_id:
        return None
    client = service.get_client()
    if not client:
        return None
    try:
        return QBTaxCode.get(int(tax_code_id), qb=client)
    except Exception as exc:
        logger.debug('Could not load QBO tax code %s: %s', tax_code_id, exc)
        return None


def fetch_qbo_tax_rate_name(service, tax_rate_id: str) -> str:
    if not _sdk_ready() or not tax_rate_id:
        return ''
    client = service.get_client()
    if not client:
        return ''
    try:
        tax_rate = QBTaxRate.get(int(tax_rate_id), qb=client)
        return (getattr(tax_rate, 'Name', None) or '').strip()
    except Exception as exc:
        logger.debug('Could not load QBO tax rate %s: %s', tax_rate_id, exc)
        return ''


def _first_sales_tax_rate_id(tax_code) -> str | None:
    rate_list = getattr(tax_code, 'SalesTaxRateList', None)
    details = getattr(rate_list, 'TaxRateDetail', None) or []
    for detail in details:
        rate_ref = getattr(detail, 'TaxRateRef', None)
        rate_id = getattr(rate_ref, 'value', None)
        if rate_id:
            return str(rate_id)
    return None


def _rate_name_matches_levy(rate_name: str, levy_key: str) -> bool:
    normalized = re.sub(r'[^a-z0-9]+', ' ', (rate_name or '').lower()).strip()
    return any(hint in normalized for hint in _LEVY_NAME_HINTS.get(levy_key, ()))


def _match_composite_rate_id(service, composite_code, levy_key: str) -> str | None:
    rate_list = getattr(composite_code, 'SalesTaxRateList', None)
    details = getattr(rate_list, 'TaxRateDetail', None) or []
    for detail in details:
        rate_ref = getattr(detail, 'TaxRateRef', None)
        rate_id = getattr(rate_ref, 'value', None)
        if not rate_id:
            continue
        rate_name = fetch_qbo_tax_rate_name(service, str(rate_id))
        if _rate_name_matches_levy(rate_name, levy_key):
            return str(rate_id)
    return None


def _composite_rate_ids(composite_code) -> set[str]:
    rate_list = getattr(composite_code, 'SalesTaxRateList', None)
    details = getattr(rate_list, 'TaxRateDetail', None) or []
    ids: set[str] = set()
    for detail in details:
        rate_ref = getattr(detail, 'TaxRateRef', None)
        rate_id = getattr(rate_ref, 'value', None)
        if rate_id:
            ids.add(str(rate_id))
    return ids


def _resolve_levy_rate_id(service, composite_code, levy_key: str, mapping_service) -> str | None:
    """
    Resolve the TaxRateRef for a levy using rates that belong to the composite code.

    Individual VAT/NHIL/GETFund mappings are used as hints, but the rate id must
    appear in the composite SalesTaxRateList or QBO returns error 6000.
    """
    allowed = _composite_rate_ids(composite_code)
    if not allowed:
        return None

    levy_code_id = mapping_service.resolve_tax_code_id(levy_key)
    if levy_code_id:
        levy_code = fetch_qbo_tax_code(service, levy_code_id)
        if levy_code is not None:
            candidate = _first_sales_tax_rate_id(levy_code)
            if candidate and candidate in allowed:
                return candidate

    return _match_composite_rate_id(service, composite_code, levy_key)


def build_override_tax_lines(service, local_obj, composite_tax_code_id, mapping_service):
    """
    Build TxnTaxDetail.TaxLine rows for non-US tax override.

    QBO error 6000 occurs when TotalTax is set without matching TaxLine amounts.
    """
    if not _sdk_ready() or not composite_tax_code_id or mapping_service is None:
        return None

    composite_code = fetch_qbo_tax_code(service, composite_tax_code_id)
    if composite_code is None:
        return None

    tax_lines = []
    unresolved = []
    for levy_key, field_name in _LEVY_FIELD_MAP:
        amount = Decimal(str(getattr(local_obj, field_name, 0) or 0)).quantize(Decimal('0.01'))
        if amount <= 0:
            continue

        tax_rate_id = _resolve_levy_rate_id(service, composite_code, levy_key, mapping_service)
        if not tax_rate_id:
            unresolved.append(levy_key)
            continue

        line = TaxLine()
        line.Amount = float(amount)
        line.DetailType = 'TaxLineDetail'
        detail = TaxLineDetail()
        detail.TaxRateRef = Ref()
        detail.TaxRateRef.value = tax_rate_id
        detail.PercentBased = False
        taxable_subtotal = Decimal(str(getattr(local_obj, 'taxable_subtotal', 0) or 0)).quantize(
            Decimal('0.01')
        )
        if taxable_subtotal > 0:
            detail.NetAmountTaxable = float(taxable_subtotal)
        line.TaxLineDetail = detail
        tax_lines.append(line)

    if unresolved:
        logger.warning(
            'Could not match QBO composite tax rates for levy(s) %s on %s; '
            'ensure individual VAT/NHIL/GETFund mappings use rates included in '
            'your composite tax code.',
            ', '.join(unresolved),
            getattr(local_obj, 'invoice_number', None)
            or getattr(local_obj, 'estimate_number', None)
            or local_obj.pk,
        )
        return None

    return _merge_tax_lines_by_rate(tax_lines) or None


def _merge_tax_lines_by_rate(tax_lines):
    """Merge TaxLine rows that share a TaxRateRef (QBO requires unique rates)."""
    if not tax_lines:
        return None

    merged: dict[str, TaxLine] = {}
    for line in tax_lines:
        rate_id = line.TaxLineDetail.TaxRateRef.value
        if rate_id in merged:
            merged[rate_id].Amount = float(
                Decimal(str(merged[rate_id].Amount)) + Decimal(str(line.Amount))
            )
        else:
            merged[rate_id] = line
    return list(merged.values())


def stamp_sales_line_tax_codes(qb_lines, local_line_items, *, tax_code_id, exempt_tax_code_id=None):
    """Apply TaxCodeRef on outbound sales lines so QBO can calculate tax."""
    if not tax_code_id or Ref is None:
        return

    local_items = list(local_line_items)
    for qb_line, local_item in zip(qb_lines, local_items):
        detail = getattr(qb_line, 'SalesItemLineDetail', None)
        if detail is None:
            continue
        is_taxable = getattr(local_item, 'is_taxable', True)
        code_id = tax_code_id if is_taxable else exempt_tax_code_id
        if not code_id:
            continue
        detail.TaxCodeRef = Ref()
        detail.TaxCodeRef.value = code_id


def apply_transaction_tax(service, qb_txn, local_obj, *, mapping_service, sales_lines=None, line_items=None):
    """
    Apply Ghana/global sales tax to a QBO invoice, estimate, or credit memo.

    Prefer QBO auto-calculation via line TaxCodeRef. When SVR levy breakdown can
    be mapped to QBO tax rates, send TaxLine overrides instead of bare TotalTax.
    """
    if TxnTaxDetail is None or Ref is None:
        return

    tax_amount = Decimal(str(getattr(local_obj, 'tax_amount', 0) or 0)).quantize(Decimal('0.01'))
    if tax_amount <= 0:
        return

    if mapping_service is None:
        logger.warning(
            'Invoice/estimate %s has tax %s but QBO mapping service unavailable.',
            getattr(local_obj, 'invoice_number', None)
            or getattr(local_obj, 'estimate_number', None)
            or local_obj.pk,
            tax_amount,
        )
        return

    composite_id = mapping_service.resolve_tax_code_id('composite')
    tax_code_id = composite_id
    if not tax_code_id:
        for key, field in _LEVY_FIELD_MAP:
            if Decimal(str(getattr(local_obj, field, 0) or 0)) <= 0:
                continue
            tax_code_id = mapping_service.resolve_tax_code_id(key)
            if tax_code_id:
                break

    if not tax_code_id:
        logger.warning(
            'Invoice/estimate %s has tax %s but no QBO tax code mapping; '
            'map composite or levy tax codes in QuickBooks integrations.',
            getattr(local_obj, 'invoice_number', None)
            or getattr(local_obj, 'estimate_number', None)
            or local_obj.pk,
            tax_amount,
        )
        return

    exempt_id = mapping_service.resolve_tax_code_id('exempt')
    us_tax_lines = uses_us_line_tax_codes(service)

    if hasattr(qb_txn, 'GlobalTaxCalculation') and not us_tax_lines:
        qb_txn.GlobalTaxCalculation = 'TaxExcluded'

    if sales_lines is not None and line_items is not None:
        if us_tax_lines:
            stamp_us_sales_line_tax_codes(sales_lines, line_items)
        else:
            stamp_sales_line_tax_codes(
                sales_lines,
                line_items,
                tax_code_id=tax_code_id,
                exempt_tax_code_id=exempt_id,
            )

    qb_txn.TxnTaxDetail = TxnTaxDetail()
    qb_txn.TxnTaxDetail.TaxLine = None

    if us_tax_lines:
        if tax_code_id:
            qb_txn.TxnTaxDetail.TxnTaxCodeRef = Ref()
            qb_txn.TxnTaxDetail.TxnTaxCodeRef.value = tax_code_id
        qb_txn.TxnTaxDetail.TotalTax = float(tax_amount)
        finalize_sales_transaction_for_qbo(service, qb_txn)
        logger.info(
            'Applied US QBO tax override for %s: TotalTax=%s',
            getattr(local_obj, 'invoice_number', None)
            or getattr(local_obj, 'estimate_number', None)
            or local_obj.pk,
            tax_amount,
        )
        return

    qb_txn.TxnTaxDetail.TxnTaxCodeRef = Ref()
    qb_txn.TxnTaxDetail.TxnTaxCodeRef.value = tax_code_id

    override_lines = None
    if composite_id:
        override_lines = build_override_tax_lines(
            service,
            local_obj,
            composite_id,
            mapping_service,
        )

    if override_lines:
        override_total = sum(Decimal(str(line.Amount or 0)) for line in override_lines)
        if abs(override_total - tax_amount) <= Decimal('0.02'):
            qb_txn.TxnTaxDetail.TaxLine = override_lines
            qb_txn.TxnTaxDetail.TotalTax = float(override_total)
            logger.info(
                'Applied QBO tax override for %s: total=%s (VAT=%s NHIL=%s GETFund=%s)',
                getattr(local_obj, 'invoice_number', None)
                or getattr(local_obj, 'estimate_number', None)
                or local_obj.pk,
                override_total,
                getattr(local_obj, 'tax_vat_amount', 0),
                getattr(local_obj, 'tax_nhil_amount', 0),
                getattr(local_obj, 'tax_getfund_amount', 0),
            )
            return

        logger.warning(
            'SVR tax breakdown (%s) does not match mapped QBO levy lines (%s) for %s; '
            'using QBO auto-calculation instead of TotalTax override.',
            tax_amount,
            override_total,
            getattr(local_obj, 'invoice_number', None)
            or getattr(local_obj, 'estimate_number', None)
            or local_obj.pk,
        )

    # Let QBO calculate TotalTax from line TaxCodeRef — do not set TotalTax manually.
