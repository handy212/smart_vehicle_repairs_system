"""SVR inventory Part catalog ↔ QuickBooks Item sync (metadata only inbound)."""
from __future__ import annotations

import logging

from django.contrib.contenttypes.models import ContentType

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
    'QuickBooks requires an income or expense account on catalog Items. '
    'Map control accounts under Admin → Integrations → Account mappings: '
    '"Sales Revenue" (sales_revenue_account) and/or '
    '"Purchases / Operating Expense" (default_expense_account). '
    'Alternatively, map invoice line type "Part" to a QBO Item that already has accounts.'
)


def _accounts_from_mapped_part_line_item(mapping_service, client):
    """Copy account refs from the mapped invoice line type Part QBO Item."""
    if not mapping_service or client is None or QBItem is None:
        return None, None

    item_id = mapping_service.resolve_invoice_line_item_id('part')
    if not item_id:
        return None, None

    try:
        qb_item = QBItem.get(int(item_id), qb=client)
    except Exception as exc:
        logger.debug('Could not load mapped Part line QBO item %s: %s', item_id, exc)
        return None, None

    income_ref = getattr(qb_item, 'IncomeAccountRef', None)
    expense_ref = getattr(qb_item, 'ExpenseAccountRef', None)
    income_id = getattr(income_ref, 'value', None) if income_ref else None
    expense_id = getattr(expense_ref, 'value', None) if expense_ref else None
    return income_id, expense_id


def _income_expense_account_ids(mapping_service, client=None):
    income_id = None
    expense_id = None
    if mapping_service:
        income_id = mapping_service.resolve_control_account_qbo_id('sales_revenue_account')
        expense_id = mapping_service.resolve_control_account_qbo_id('default_expense_account')
        if not expense_id:
            expense_id = mapping_service.resolve_control_account_qbo_id('cost_of_goods_sold_account')

    if client is not None and mapping_service and (not income_id or not expense_id):
        fallback_income, fallback_expense = _accounts_from_mapped_part_line_item(
            mapping_service, client
        )
        income_id = income_id or fallback_income
        expense_id = expense_id or fallback_expense

    return income_id, expense_id


def _apply_item_account_refs(qb_item, income_id, expense_id):
    if income_id and Ref is not None:
        qb_item.IncomeAccountRef = Ref()
        qb_item.IncomeAccountRef.value = income_id
    if expense_id and Ref is not None:
        qb_item.ExpenseAccountRef = Ref()
        qb_item.ExpenseAccountRef.value = expense_id


def sync_part(service, local_part):
    """
    Push SVR Part catalog row to QBO as NonInventory Item (SVR owns quantities).
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

    qb_item = QBItem()
    if mapping and mapping.qbo_id:
        try:
            qb_item = QBItem.get(int(mapping.qbo_id), qb=client)
        except Exception:
            qb_item = QBItem()

    display_name = f'{local_part.part_number} — {local_part.name}'[:100]
    qb_item.Name = display_name
    qb_item.Type = 'NonInventory'
    qb_item.Sku = local_part.part_number[:100]
    qb_item.Active = bool(local_part.is_active)
    if local_part.description:
        qb_item.Description = local_part.description[:4000]

    mapping_service = _mapping_service(service)
    income_id, expense_id = _income_expense_account_ids(mapping_service, client=client)
    if not income_id and not expense_id:
        service._update_qbo_mapping(local_part, None, error=PART_ITEM_ACCOUNTS_HELP)
        return None

    _apply_item_account_refs(qb_item, income_id, expense_id)

    if local_part.selling_price:
        qb_item.UnitPrice = float(local_part.selling_price)
    if local_part.cost_price:
        qb_item.PurchaseCost = float(local_part.cost_price)

    try:
        service._save_qb(qb_item, client)
        service._update_qbo_mapping(local_part, qb_item)
        return qb_item
    except Exception as exc:
        logger.error('QBO Part/Item sync error for %s: %s', local_part.part_number, exc)
        service._update_qbo_mapping(local_part, None, error=str(exc))
        return None


def resolve_part_qbo_item_id(service, local_part) -> str | None:
    """QBO Item id for a part, syncing the catalog row when needed."""
    if not local_part:
        return None

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
    Inbound: update mapped SVR Part name/SKU/active from QBO Item.
    Never imports quantities — SVR remains inventory source of truth.
    """
    from django.utils import timezone

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
            sku = (getattr(qb_item, 'Sku', None) or '').strip()
            if sku and sku != part.part_number:
                part.part_number = sku[:100]
                changed = True

            qbo_name = (getattr(qb_item, 'Name', None) or '').strip()
            if qbo_name:
                clean = qbo_name.split(' — ', 1)[-1] if ' — ' in qbo_name else qbo_name
                if clean and clean != part.name:
                    part.name = clean[:255]
                    changed = True

            active = bool(getattr(qb_item, 'Active', True))
            if part.is_active != active:
                part.is_active = active
                changed = True

            if changed:
                part.save(update_fields=['part_number', 'name', 'is_active', 'updated_at'])
                mapping.qbo_sync_token = getattr(qb_item, 'SyncToken', '') or ''
                mapping.save(update_fields=['qbo_sync_token', 'updated_at'])
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
