"""Capitalization of approved acquisition requests into FixedAsset records."""
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.utils import timezone

from .models import AssetAcquisitionRequest, FixedAsset


def next_asset_number() -> str:
    """Sequential FA-{year}-{seq} within each calendar year."""
    year = timezone.now().year
    prefix = f'FA-{year}-'
    existing = FixedAsset.objects.filter(asset_number__startswith=prefix).values_list(
        'asset_number', flat=True
    )
    max_seq = 0
    for num in existing:
        try:
            seq = int(str(num).split('-')[-1])
            max_seq = max(max_seq, seq)
        except (ValueError, IndexError):
            continue
    return f'{prefix}{max_seq + 1:05d}'


def _effective_depreciation_method(req: AssetAcquisitionRequest) -> str:
    if req.depreciation_method:
        return req.depreciation_method
    return req.category.default_depreciation_method


def _effective_useful_life_years(req: AssetAcquisitionRequest) -> int:
    if req.useful_life_years:
        return int(req.useful_life_years)
    return int(req.category.default_useful_life_years)


@transaction.atomic
def capitalize_request(
    req: AssetAcquisitionRequest,
    *,
    acquisition_cost: Decimal,
    acquisition_date,
    depreciation_start_date,
    asset_number: Optional[str],
    location: str,
    manufacturer: Optional[str],
    model_number: Optional[str],
    serial_number: Optional[str],
    supplier_id: Optional[int],
    total_units: Optional[int],
    declining_balance_rate: Optional[Decimal],
    notes: str,
    created_by,
) -> FixedAsset:
    """Create FixedAsset from an approved acquisition request (caller validates status + documents)."""
    from apps.inventory.models import Supplier

    method = _effective_depreciation_method(req)
    life_years = _effective_useful_life_years(req)

    supplier = req.supplier
    if supplier_id is not None:
        supplier = Supplier.objects.filter(pk=supplier_id).first()

    num = asset_number or next_asset_number()
    if FixedAsset.objects.filter(asset_number=num).exists():
        raise ValueError(f'Asset number {num} already exists')

    d_rate = declining_balance_rate if declining_balance_rate is not None else Decimal('2.00')

    asset = FixedAsset.objects.create(
        asset_number=num,
        name=req.proposed_asset_name,
        description=req.description or '',
        category=req.category,
        branch=req.branch,
        acquisition_cost=acquisition_cost,
        acquisition_date=acquisition_date,
        salvage_value=req.salvage_value,
        depreciation_method=method,
        useful_life_years=life_years,
        depreciation_start_date=depreciation_start_date,
        declining_balance_rate=d_rate,
        total_units=total_units if method == 'units_of_production' else None,
        status='active',
        location=location or None,
        manufacturer=manufacturer or None,
        model_number=model_number or None,
        serial_number=serial_number or None,
        supplier=supplier,
        notes=notes or '',
        created_by=created_by,
        gl_asset_account_code=req.category.gl_asset_account_code,
        gl_depreciation_expense_account_code=req.category.gl_depreciation_expense_account_code,
        gl_accumulated_depreciation_account_code=req.category.gl_accumulated_depreciation_account_code,
    )
    req.created_asset = asset
    req.save(update_fields=['created_asset', 'updated_at'])
    return asset
