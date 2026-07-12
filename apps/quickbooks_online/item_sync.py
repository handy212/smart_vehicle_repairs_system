"""SVR inventory Part catalog ↔ QuickBooks Item sync."""
from __future__ import annotations

import logging
from datetime import date, timedelta

from django.contrib.contenttypes.models import ContentType
from django.db.models import Sum
from django.utils import timezone

from .models import QBOMapping, QBOSyncLog

logger = logging.getLogger(__name__)

try:
    from quickbooks.objects.item import Item as QBItem
    from quickbooks.objects.base import Ref
except ModuleNotFoundError:
    QBItem = None
    Ref = None


def _sdk_message():
    from .services import QuickBooksService
    return QuickBooksService.sdk_unavailable_message()


def _mapping_service(service):
    return service._get_mapping_service()


PART_ITEM_ACCOUNTS_HELP = (
    'QuickBooks requires specific account types for Inventory products. '
    'Map under Accounting → Control Panel → QuickBooks Chart of Accounts Mapping: '
    '"Sales Revenue" → Income / Sales of Product Income; '
    '"Cost of Goods Sold" → Cost of Goods Sold / Supplies and Materials; '
    '"Inventory Asset" → Other Current Asset / Inventory. '
    'Non-inventory parts use Sales Revenue and/or Purchases / Operating Expense.'
)

QBO_TYPE_TO_ITEM_TYPE = {
    'Inventory': 'inventory',
    'NonInventory': 'non_inventory',
    'Service': 'service',
}


def _accounts_from_mapped_part_line_item(mapping_service, client):
    """Copy account refs from the mapped invoice line type Part QBO Item."""
    if not mapping_service or client is None or QBItem is None:
        return None, None, None

    item_id = mapping_service.resolve_invoice_line_item_id('part')
    if not item_id:
        return None, None, None

    try:
        qb_item = QBItem.get(int(item_id), qb=client)
    except Exception as exc:
        logger.debug('Could not load mapped Part line QBO item %s: %s', item_id, exc)
        return None, None, None

    income_ref = getattr(qb_item, 'IncomeAccountRef', None)
    expense_ref = getattr(qb_item, 'ExpenseAccountRef', None)
    asset_ref = getattr(qb_item, 'AssetAccountRef', None)
    income_id = getattr(income_ref, 'value', None) if income_ref else None
    expense_id = getattr(expense_ref, 'value', None) if expense_ref else None
    asset_id = getattr(asset_ref, 'value', None) if asset_ref else None
    return income_id, expense_id, asset_id


def _income_from_revenue_product_template(local_part, mapping_service, client):
    """Use revenue product catalog Part's synced QBO Item income account when available."""
    if mapping_service is None or client is None or local_part is None or QBItem is None:
        return None

    from apps.billing.revenue_resolution import resolve_revenue_product_for_part

    revenue_product = resolve_revenue_product_for_part(local_part)
    template_part = getattr(revenue_product, 'catalog_part', None) if revenue_product else None
    if template_part is None or not getattr(template_part, 'pk', None):
        return None
    if template_part.pk == local_part.pk:
        return None

    mapping = QBOMapping.objects.filter(
        content_type=ContentType.objects.get_for_model(template_part),
        object_id=template_part.pk,
        status='synced',
    ).first()
    if not mapping or not mapping.qbo_id:
        return None

    try:
        qb_item = QBItem.get(int(mapping.qbo_id), qb=client)
        income_ref = getattr(qb_item, 'IncomeAccountRef', None)
        return getattr(income_ref, 'value', None) if income_ref else None
    except Exception:
        return None


def _resolve_item_account_ids(mapping_service, local_part, client=None):
    income_id = None
    expense_id = None
    asset_id = None

    if mapping_service:
        income_id = mapping_service.resolve_control_account_qbo_id('sales_revenue_account')
        if local_part.item_type == 'inventory':
            expense_id = mapping_service.resolve_control_account_qbo_id('cost_of_goods_sold_account')
            asset_id = mapping_service.resolve_control_account_qbo_id('inventory_asset_account')
        elif local_part.item_type == 'non_inventory':
            expense_id = mapping_service.resolve_control_account_qbo_id('default_expense_account')
            if not expense_id:
                expense_id = mapping_service.resolve_control_account_qbo_id('cost_of_goods_sold_account')
        # Service items typically only need income in QBO.

    if client is not None and mapping_service:
        fallback_income, fallback_expense, fallback_asset = _accounts_from_mapped_part_line_item(
            mapping_service, client
        )
        income_id = income_id or fallback_income
        expense_id = expense_id or fallback_expense
        asset_id = asset_id or fallback_asset
        income_id = income_id or _income_from_revenue_product_template(local_part, mapping_service, client)

    return income_id, expense_id, asset_id


def _apply_item_account_refs(qb_item, income_id, expense_id, asset_id=None):
    if income_id and Ref is not None:
        qb_item.IncomeAccountRef = Ref()
        qb_item.IncomeAccountRef.value = income_id
    if expense_id and Ref is not None:
        qb_item.ExpenseAccountRef = Ref()
        qb_item.ExpenseAccountRef.value = expense_id
    if asset_id and Ref is not None:
        qb_item.AssetAccountRef = Ref()
        qb_item.AssetAccountRef.value = asset_id


def part_quantity_on_hand_across_branches(local_part) -> float:
    """Company-wide qty for QBO: sum of every branch StockItem (scales as branches are added)."""
    total = local_part.stock_items.aggregate(total=Sum('quantity_in_stock'))['total']
    return float(total or 0)


def _part_quantity_on_hand(local_part) -> float:
    return part_quantity_on_hand_across_branches(local_part)


def _inventory_start_date(local_part) -> date:
    if local_part.inventory_start_date:
        return local_part.inventory_start_date
    created = getattr(local_part, 'created_at', None)
    if created:
        return created.date()
    return timezone.now().date()


def _parse_qbo_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _is_inv_start_after_txn_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return 'after the last transaction' in message and 'date' in message


def _is_inv_start_before_txn_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        'prior to start date' in message
        or 'inventory start date' in message
        or '6270' in message
    )


def _preferred_inventory_start_date(local_part) -> date:
    """Opening inventory date in QBO — never later than today."""
    return min(_inventory_start_date(local_part), timezone.now().date())


def _inv_start_date_for_sync(
    local_part,
    *,
    is_new_qbo_item: bool,
    previous_qbo_type: str | None,
    qb_item,
) -> date | None:
    """
    InvStartDate to send to QBO, or None to leave the existing QBO value unchanged.

    QBO requires InvStartDate on create and when converting to Inventory, but rejects
    dates on or before the item's last transaction when the QBO item already exists.
    Estimates/invoices dated today fail if InvStartDate is in the future.
    """
    today = timezone.now().date()
    preferred = _preferred_inventory_start_date(local_part)
    existing = _parse_qbo_date(getattr(qb_item, 'InvStartDate', None))

    if previous_qbo_type == 'Inventory':
        # Fix items synced with a future start date (older conversion workaround).
        if existing and existing > today and preferred <= today:
            return preferred
        return None

    if is_new_qbo_item:
        return preferred

    # Converting an existing QBO item — use part opening date (not tomorrow).
    if existing and existing <= preferred:
        return existing
    return preferred


def _validate_accounts_for_part(local_part, income_id, expense_id, asset_id):
    if local_part.item_type == 'inventory':
        missing = []
        if not income_id:
            missing.append('Sales Revenue')
        if not expense_id:
            missing.append('Cost of Goods Sold')
        if not asset_id:
            missing.append('Inventory Asset')
        if missing:
            return f'Missing QBO account mapping(s) for Inventory item: {", ".join(missing)}. {PART_ITEM_ACCOUNTS_HELP}'
    elif local_part.item_type == 'service':
        if not income_id:
            return f'Missing QBO Sales Revenue account for Service item. {PART_ITEM_ACCOUNTS_HELP}'
    else:
        if not income_id and not expense_id:
            return PART_ITEM_ACCOUNTS_HELP
    return None


def sync_part(service, local_part, *, update_qty_on_hand: bool = True):
    """
    Push SVR Part catalog row to QBO Item.

    Inventory parts sync as QBO Inventory items with qty on hand and asset account.
    Non-inventory parts sync as NonInventory. Service parts sync as Service.

    When ``update_qty_on_hand`` is False (inventory adjustment path), existing QBO
  items keep their current qty; only metadata is refreshed. New items are created
    with QtyOnHand=0 so the InventoryAdjustment QtyDiff is the sole qty movement.
    """
    if QBItem is None or Ref is None:
        service._update_qbo_mapping(local_part, None, error=_sdk_message())
        return None

    client = service.get_client()
    if not client:
        service._update_qbo_mapping(
            local_part, None, error='QuickBooks not connected or unauthorized.'
        )
        return None

    mapping = QBOMapping.objects.filter(
        content_type=ContentType.objects.get_for_model(local_part),
        object_id=local_part.id,
    ).first()

    display_name = f'{local_part.part_number} — {local_part.name}'[:100]
    from .entity_resolver import resolve_qbo_entity

    qb_item, load_error = resolve_qbo_entity(
        client=client,
        qb_class=QBItem,
        local_obj=local_part,
        mapping=mapping,
        sku=local_part.part_number,
        name=display_name,
    )
    if load_error:
        service._update_qbo_mapping(local_part, None, error=load_error)
        return None

    previous_qbo_type = getattr(qb_item, 'Type', None) if getattr(qb_item, 'Id', None) else None
    is_new_qbo_item = not bool(getattr(qb_item, 'Id', None))

    qb_item.Name = display_name
    qb_item.Type = local_part.qbo_item_type
    qb_item.Sku = local_part.part_number[:100]
    qb_item.Active = bool(local_part.is_active)
    if local_part.description:
        qb_item.Description = local_part.description[:4000]

    mapping_service = _mapping_service(service)
    income_id, expense_id, asset_id = _resolve_item_account_ids(
        mapping_service, local_part, client=client
    )
    account_error = _validate_accounts_for_part(local_part, income_id, expense_id, asset_id)
    if account_error:
        service._update_qbo_mapping(local_part, None, error=account_error)
        return None

    if local_part.item_type == 'inventory':
        from .account_requirements import validate_inventory_part_account_ids

        type_error = validate_inventory_part_account_ids(
            client,
            income_id=income_id,
            expense_id=expense_id,
            asset_id=asset_id,
        )
        if type_error:
            service._update_qbo_mapping(local_part, None, error=type_error)
            return None

    _apply_item_account_refs(qb_item, income_id, expense_id, asset_id)

    if local_part.selling_price:
        qb_item.UnitPrice = float(local_part.selling_price)
    if local_part.cost_price and local_part.item_type != 'service':
        qb_item.PurchaseCost = float(local_part.cost_price)

    if local_part.item_type == 'inventory':
        qb_item.TrackQtyOnHand = True
        if update_qty_on_hand:
            qb_item.QtyOnHand = _part_quantity_on_hand(local_part)
        elif is_new_qbo_item:
            qb_item.QtyOnHand = 0
        inv_start = _inv_start_date_for_sync(
            local_part,
            is_new_qbo_item=is_new_qbo_item,
            previous_qbo_type=previous_qbo_type,
            qb_item=qb_item,
        )
        if inv_start:
            qb_item.InvStartDate = inv_start.isoformat()

    try:
        service._save_qb(qb_item, client)
        service._update_qbo_mapping(local_part, qb_item)
        return qb_item
    except Exception as exc:
        if (
            local_part.item_type == 'inventory'
            and _is_inv_start_after_txn_error(exc)
            and getattr(qb_item, 'InvStartDate', None)
        ):
            current = _parse_qbo_date(getattr(qb_item, 'InvStartDate', None)) or timezone.now().date()
            qb_item.InvStartDate = (current + timedelta(days=1)).isoformat()
            try:
                service._save_qb(qb_item, client)
                service._update_qbo_mapping(local_part, qb_item)
                return qb_item
            except Exception as retry_exc:
                logger.error(
                    'QBO Part/Item sync retry failed for %s: %s',
                    local_part.part_number,
                    retry_exc,
                )
                service._update_qbo_mapping(local_part, None, error=str(retry_exc))
                return None
        logger.error('QBO Part/Item sync error for %s: %s', local_part.part_number, exc)
        service._update_qbo_mapping(local_part, None, error=str(exc))
        return None


def ensure_part_item_for_inventory_adjustment(service, local_part):
    """
    Ensure a QBO Item exists for an adjustment without overwriting company-wide qty.

    Qty changes on corrections/counts flow only through InventoryAdjustment QtyDiff.
    """
    return sync_part(service, local_part, update_qty_on_hand=False)


def ensure_inventory_start_on_or_before_txn_date(service, local_part, txn_date: date) -> None:
    """
    Ensure a QBO Inventory item's InvStartDate is not after txn_date.

    QuickBooks rejects estimates/invoices when TxnDate is before InvStartDate (6270).
    """
    if (
        not local_part
        or local_part.item_type != 'inventory'
        or not txn_date
        or QBItem is None
    ):
        return

    client = service.get_client()
    if not client:
        return

    mapping = QBOMapping.objects.filter(
        content_type=ContentType.objects.get_for_model(local_part),
        object_id=local_part.id,
    ).exclude(qbo_id='').first()
    if not mapping:
        sync_part(service, local_part)
        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_part),
            object_id=local_part.id,
        ).exclude(qbo_id='').first()
    if not mapping or not mapping.qbo_id:
        return

    try:
        qb_item = QBItem.get(int(mapping.qbo_id), qb=client)
    except Exception as exc:
        logger.warning(
            'Could not load QBO item %s for part %s: %s',
            mapping.qbo_id,
            local_part.part_number,
            exc,
        )
        return

    inv_start = _parse_qbo_date(getattr(qb_item, 'InvStartDate', None))
    target = min(_preferred_inventory_start_date(local_part), txn_date)
    if inv_start and inv_start <= target:
        return

    qb_item.InvStartDate = target.isoformat()
    try:
        service._save_qb(qb_item, client)
        mapping.qbo_sync_token = getattr(qb_item, 'SyncToken', '') or ''
        mapping.status = 'synced'
        mapping.error_message = ''
        mapping.save(update_fields=['qbo_sync_token', 'status', 'error_message', 'last_synced_at'])
        logger.info(
            'Adjusted QBO InvStartDate for part %s to %s (txn %s)',
            local_part.part_number,
            target,
            txn_date,
        )
    except Exception as exc:
        logger.warning(
            'Could not adjust InvStartDate for part %s to %s: %s',
            local_part.part_number,
            target,
            exc,
        )


def _prepare_inventory_parts_for_txn_date(service, line_items, txn_date, *, part_attr='part'):
    if not txn_date:
        return
    seen = set()
    for item in line_items:
        part = getattr(item, part_attr, None)
        if not part or not getattr(part, 'pk', None) or part.pk in seen:
            continue
        if part.item_type != 'inventory':
            continue
        seen.add(part.pk)
        ensure_inventory_start_on_or_before_txn_date(service, part, txn_date)


def _qbo_inv_start_date_for_part(service, local_part) -> date | None:
    """Read InvStartDate from QBO for a mapped inventory part."""
    if (
        not local_part
        or local_part.item_type != 'inventory'
        or QBItem is None
    ):
        return None

    client = service.get_client()
    if not client:
        return None

    mapping = QBOMapping.objects.filter(
        content_type=ContentType.objects.get_for_model(local_part),
        object_id=local_part.id,
    ).exclude(qbo_id='').first()
    if not mapping or not mapping.qbo_id:
        return None

    try:
        qb_item = QBItem.get(int(mapping.qbo_id), qb=client)
    except Exception as exc:
        logger.warning(
            'Could not load QBO item %s for part %s: %s',
            mapping.qbo_id,
            local_part.part_number,
            exc,
        )
        return None

    return _parse_qbo_date(getattr(qb_item, 'InvStartDate', None))


def effective_sales_txn_date(service, line_items, txn_date, *, part_attr='part') -> date:
    """
    TxnDate safe for QBO estimates/invoices/credit memos.

    Tries to lower each inventory item's InvStartDate to the document date first.
    If QBO still has a later start date (e.g. item already has transactions), raises
    the outbound TxnDate to that start date so error 6270 is avoided.
    """
    if not txn_date:
        return txn_date

    _prepare_inventory_parts_for_txn_date(
        service,
        line_items,
        txn_date,
        part_attr=part_attr,
    )

    effective = txn_date
    seen = set()
    for item in line_items:
        part = getattr(item, part_attr, None)
        if not part or not getattr(part, 'pk', None) or part.pk in seen:
            continue
        if part.item_type != 'inventory':
            continue
        seen.add(part.pk)
        inv_start = _qbo_inv_start_date_for_part(service, part)
        if inv_start and inv_start > effective:
            effective = inv_start

    if effective > txn_date:
        logger.info(
            'QBO sales TxnDate raised from %s to %s to satisfy inventory start dates',
            txn_date,
            effective,
        )
    return effective


def resolve_part_qbo_item_id(service, local_part, *, txn_date: date | None = None) -> str | None:
    """QBO Item id for a part, syncing the catalog row when needed."""
    if not local_part:
        return None

    if txn_date and local_part.item_type == 'inventory':
        ensure_inventory_start_on_or_before_txn_date(service, local_part, txn_date)

    mapping = QBOMapping.objects.filter(
        content_type=ContentType.objects.get_for_model(local_part),
        object_id=local_part.id,
        status='synced',
    ).first()
    if mapping and mapping.qbo_id:
        return str(mapping.qbo_id)

    qb_item = sync_part(service, local_part)
    if qb_item and getattr(qb_item, 'Id', None):
        return str(qb_item.Id)
    return None


def pull_items_metadata(service, triggered_by=None):
    """
    Inbound: update mapped SVR Part metadata from QBO Item.
    Quantities remain SVR-owned; prices and item type are refreshed from QBO.
    """
    from apps.inventory.models import Part

    log = QBOSyncLog.objects.create(entity_type='item', triggered_by=triggered_by)

    if QBItem is None:
        log.status = 'failed'
        log.error_message = _sdk_message()
        log.finished_at = timezone.now()
        log.save()
        return log

    client = service.get_client()
    if not client:
        log.status = 'failed'
        log.error_message = 'QuickBooks not connected.'
        log.finished_at = timezone.now()
        log.save()
        return log

    part_ct = ContentType.objects.get_for_model(Part)
    mappings = QBOMapping.objects.filter(content_type=part_ct, status='synced').exclude(qbo_id='')

    try:
        for mapping in mappings:
            log.records_pulled += 1
            try:
                qb_item = QBItem.get(int(mapping.qbo_id), qb=client)
            except Exception as exc:
                logger.warning('QBO item %s fetch failed: %s', mapping.qbo_id, exc)
                log.records_skipped += 1
                continue

            try:
                part = Part.objects.get(pk=mapping.object_id)
            except Part.DoesNotExist:
                log.records_skipped += 1
                continue

            changed = False
            update_fields = []

            sku = (getattr(qb_item, 'Sku', None) or '').strip()
            if sku and sku != part.part_number:
                part.part_number = sku[:100]
                changed = True
                update_fields.append('part_number')

            qbo_name = (getattr(qb_item, 'Name', None) or '').strip()
            if qbo_name:
                clean = qbo_name.split(' — ', 1)[-1] if ' — ' in qbo_name else qbo_name
                if clean and clean != part.name:
                    part.name = clean[:255]
                    changed = True
                    update_fields.append('name')

            description = (getattr(qb_item, 'Description', None) or '').strip()
            if description and description != (part.description or ''):
                part.description = description[:4000]
                changed = True
                update_fields.append('description')

            active = bool(getattr(qb_item, 'Active', True))
            if part.is_active != active:
                part.is_active = active
                changed = True
                update_fields.append('is_active')

            qbo_type = getattr(qb_item, 'Type', None)
            mapped_type = QBO_TYPE_TO_ITEM_TYPE.get(qbo_type)
            if mapped_type and part.item_type != mapped_type:
                part.item_type = mapped_type
                changed = True
                update_fields.append('item_type')

            unit_price = getattr(qb_item, 'UnitPrice', None)
            if unit_price is not None:
                from decimal import Decimal
                price = Decimal(str(unit_price)).quantize(Decimal('0.01'))
                if part.selling_price != price:
                    part.selling_price = price
                    changed = True
                    update_fields.append('selling_price')

            purchase_cost = getattr(qb_item, 'PurchaseCost', None)
            if purchase_cost is not None:
                from decimal import Decimal
                cost = Decimal(str(purchase_cost)).quantize(Decimal('0.01'))
                if part.cost_price != cost:
                    part.cost_price = cost
                    changed = True
                    update_fields.append('cost_price')

            if changed:
                update_fields.append('updated_at')
                part.save(update_fields=update_fields)
                mapping.qbo_sync_token = getattr(qb_item, 'SyncToken', '') or ''
                mapping.save(update_fields=['qbo_sync_token', 'last_synced_at'])
                log.records_updated += 1
            else:
                log.records_skipped += 1

        log.status = 'success'
        log.finished_at = timezone.now()
        log.save()
        return log
    except Exception as exc:
        logger.error('QBO pull_items_metadata failed: %s', exc)
        log.status = 'failed'
        log.error_message = str(exc)
        log.finished_at = timezone.now()
        log.save()
        return log
