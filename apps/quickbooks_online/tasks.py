from celery import shared_task
import logging
from .celery_queue import QBO_OUTBOUND_QUEUE
from .outbound_log import run_outbound_entity_sync

logger = logging.getLogger(__name__)


def qbo_outbound_task(**task_kwargs):
    """Route outbound QuickBooks sync tasks to the dedicated Celery queue."""
    return shared_task(queue=QBO_OUTBOUND_QUEUE, **task_kwargs)


@qbo_outbound_task()
def task_sync_customer_to_qbo(customer_id):
    """Background task to sync a Customer to QBO."""
    run_outbound_entity_sync(
        'customer', customer_id, 'customers', 'Customer', 'sync_customer',
    )


@qbo_outbound_task()
def task_sync_invoice_to_qbo(invoice_id):
    """Background task to sync an Invoice to QBO."""
    run_outbound_entity_sync(
        'invoice', invoice_id, 'billing', 'Invoice', 'sync_invoice',
    )


@qbo_outbound_task()
def task_sync_payment_to_qbo(payment_id):
    """Background task to sync a Payment to QBO."""
    run_outbound_entity_sync(
        'payment', payment_id, 'billing', 'Payment', 'sync_payment',
    )


@qbo_outbound_task()
def task_sync_supplier_to_qbo(supplier_id):
    """Background task to sync a Supplier to QBO."""
    run_outbound_entity_sync(
        'supplier', supplier_id, 'inventory', 'Supplier', 'sync_supplier',
    )


@qbo_outbound_task()
def task_sync_purchase_order_to_qbo(po_id):
    """Background task to sync a PurchaseOrder to QBO."""
    run_outbound_entity_sync(
        'purchase_order', po_id, 'inventory', 'PurchaseOrder', 'sync_purchase_order',
    )


@qbo_outbound_task()
def task_sync_bill_payment_to_qbo(bill_payment_id):
    """Background task to sync a BillPayment to QBO."""
    run_outbound_entity_sync(
        'bill_payment', bill_payment_id, 'billing', 'BillPayment', 'sync_bill_payment',
    )


@qbo_outbound_task()
def task_sync_vendor_expense_to_qbo(vendor_expense_id):
    """Background task to sync a VendorExpense to QBO Purchase."""
    run_outbound_entity_sync(
        'vendor_expense', vendor_expense_id, 'billing', 'VendorExpense', 'sync_vendor_expense',
    )


@qbo_outbound_task()
def task_sync_estimate_to_qbo(estimate_id):
    """Background task to sync an Estimate to QBO."""
    run_outbound_entity_sync(
        'estimate', estimate_id, 'billing', 'Estimate', 'sync_estimate',
    )


@qbo_outbound_task()
def task_sync_credit_note_to_qbo(credit_note_id):
    """Background task to sync a CreditNote to QBO as a Credit Memo."""
    run_outbound_entity_sync(
        'credit_note', credit_note_id, 'billing', 'CreditNote', 'sync_credit_note',
    )


@qbo_outbound_task()
def task_sync_vendor_bill_to_qbo(bill_id):
    """Background task to sync a vendor Bill to QBO."""
    run_outbound_entity_sync(
        'vendor_bill', bill_id, 'billing', 'Bill', 'sync_vendor_bill',
    )


@qbo_outbound_task()
def task_sync_vendor_credit_to_qbo(vendor_credit_id):
    """Background task to sync a VendorCredit to QBO."""
    run_outbound_entity_sync(
        'vendor_credit', vendor_credit_id, 'billing', 'VendorCredit', 'sync_vendor_credit',
    )


@qbo_outbound_task()
def task_sync_branch_to_qbo(branch_id):
    """Background task to sync a Branch to QBO as a Department (Location)."""
    run_outbound_entity_sync(
        'branch', branch_id, 'branches', 'Branch', 'sync_branch',
    )


@qbo_outbound_task()
def task_sync_part_to_qbo(part_id):
    """Background task to sync a Part catalog row to QBO Item."""
    run_outbound_entity_sync(
        'part', part_id, 'inventory', 'Part', 'sync_part',
    )


@qbo_outbound_task()
def task_resync_payments_for_invoice(invoice_id):
    """Re-push completed payments after a proforma invoice is finalized."""
    from apps.billing.models import Invoice

    from .task_dispatch import schedule_entity_sync

    try:
        invoice = Invoice.objects.get(pk=invoice_id)
    except Invoice.DoesNotExist:
        return
    for payment_id in invoice.payments.filter(status='completed').values_list('id', flat=True):
        schedule_entity_sync('payment', payment_id, task=task_sync_payment_to_qbo)


@qbo_outbound_task()
def task_sync_invoice_then_resync_payments(invoice_id):
    """
    Sync issued invoice to QBO, then re-push completed payments in order.

    Used when a proforma/deposit invoice is finalized so payments apply only
    after the QBO invoice exists.
    """
    result = run_outbound_entity_sync(
        'invoice', invoice_id, 'billing', 'Invoice', 'sync_invoice',
    )
    if not result:
        logger.warning(
            'QBO invoice finalization sync failed for invoice %s; skipping payment resync',
            invoice_id,
        )
        return

    from apps.billing.models import Invoice

    try:
        invoice = Invoice.objects.get(pk=invoice_id)
    except Invoice.DoesNotExist:
        return

    for payment_id in invoice.payments.filter(status='completed').values_list('id', flat=True):
        run_outbound_entity_sync(
            'payment', payment_id, 'billing', 'Payment', 'sync_payment',
        )


@shared_task
def task_pull_items_from_qbo(triggered_by_id=None):
    """Pull QBO Item metadata (name/SKU/active) for mapped parts — no quantities."""
    try:
        from .services import QuickBooksService
        service = QuickBooksService()
        log = service.pull_items(triggered_by=triggered_by_id)
        if log:
            logger.info(
                '[QBO Inbound] Items pull complete: pulled=%s, updated=%s, skipped=%s, status=%s',
                log.records_pulled,
                log.records_updated,
                log.records_skipped,
                log.status,
            )
    except Exception as e:
        logger.error('Error in task_pull_items_from_qbo: %s', e, exc_info=True)



@shared_task
def task_pull_vendors_from_qbo(triggered_by_id=None):
    """
    Pull Vendors from QBO → create any new local Suppliers not yet in our system.
    Does NOT overwrite existing local Supplier data.
    """
    try:
        from .services import QuickBooksService
        service = QuickBooksService()
        log = service.pull_vendors()
        if log:
            logger.info(
                f"[QBO Inbound] Vendors pull complete: "
                f"pulled={log.records_pulled}, created={log.records_created}, "
                f"updated={log.records_updated}, skipped={log.records_skipped}, status={log.status}"
            )
    except Exception as e:
        logger.error(f"Error in task_pull_vendors_from_qbo: {e}", exc_info=True)


@shared_task
def task_pull_invoices_from_qbo(triggered_by_id=None):
    """
    Pull Invoices from QBO → update payment status and amounts on existing local invoices.
    Does NOT create new invoices from QBO.
    """
    try:
        from .services import QuickBooksService
        service = QuickBooksService()
        log = service.pull_invoices()
        if log:
            logger.info(
                f"[QBO Inbound] Invoices pull complete: "
                f"pulled={log.records_pulled}, updated={log.records_updated}, "
                f"skipped={log.records_skipped}, status={log.status}"
            )
    except Exception as e:
        logger.error(f"Error in task_pull_invoices_from_qbo: {e}", exc_info=True)


@shared_task
def task_pull_bills_from_qbo(triggered_by_id=None):
    """
    Pull Bills from QBO → update status on existing local Purchase Orders.
    Does NOT create new POs from QBO.
    """
    try:
        from .services import QuickBooksService
        service = QuickBooksService()
        log = service.pull_bills()
        if log:
            logger.info(
                f"[QBO Inbound] Bills pull complete: "
                f"pulled={log.records_pulled}, updated={log.records_updated}, "
                f"skipped={log.records_skipped}, status={log.status}"
            )
    except Exception as e:
        logger.error(f"Error in task_pull_bills_from_qbo: {e}", exc_info=True)


@shared_task
def task_pull_bill_payments_from_qbo(triggered_by_id=None):
    """Pull BillPayments from QBO to refresh local bill balances."""
    try:
        from .services import QuickBooksService
        service = QuickBooksService()
        log = service.pull_bill_payments(triggered_by=triggered_by_id)
        if log:
            logger.info(
                '[QBO Inbound] Bill payments pull complete: pulled=%s, updated=%s, skipped=%s, status=%s',
                log.records_pulled,
                log.records_updated,
                log.records_skipped,
                log.status,
            )
    except Exception as e:
        logger.error('Error in task_pull_bill_payments_from_qbo: %s', e, exc_info=True)


@shared_task
def task_pull_estimates_from_qbo(triggered_by_id=None):
    """Pull Estimates from QBO → update status on existing local estimates."""
    try:
        from .services import QuickBooksService
        service = QuickBooksService()
        log = service.pull_estimates(triggered_by=triggered_by_id)
        if log:
            logger.info(
                "[QBO Inbound] Estimates pull complete: "
                "pulled=%s, updated=%s, skipped=%s, status=%s",
                log.records_pulled,
                log.records_updated,
                log.records_skipped,
                log.status,
            )
    except Exception as e:
        logger.error("Error in task_pull_estimates_from_qbo: %s", e, exc_info=True)


@shared_task
def task_pull_credit_memos_from_qbo(triggered_by_id=None):
    """Pull Credit Memos from QBO → update applied status on local credit notes."""
    try:
        from .services import QuickBooksService
        service = QuickBooksService()
        log = service.pull_credit_memos(triggered_by=triggered_by_id)
        if log:
            logger.info(
                "[QBO Inbound] Credit memos pull complete: "
                "pulled=%s, updated=%s, skipped=%s, status=%s",
                log.records_pulled,
                log.records_updated,
                log.records_skipped,
                log.status,
            )
    except Exception as e:
        logger.error("Error in task_pull_credit_memos_from_qbo: %s", e, exc_info=True)


@shared_task
def task_pull_vendor_credits_from_qbo(triggered_by_id=None):
    """Pull Vendor Credits from QBO → update applied status on local vendor credits."""
    try:
        from .services import QuickBooksService
        service = QuickBooksService()
        log = service.pull_vendor_credits(triggered_by=triggered_by_id)
        if log:
            logger.info(
                "[QBO Inbound] Vendor credits pull complete: "
                "pulled=%s, updated=%s, skipped=%s, status=%s",
                log.records_pulled,
                log.records_updated,
                log.records_skipped,
                log.status,
            )
    except Exception as e:
        logger.error("Error in task_pull_vendor_credits_from_qbo: %s", e, exc_info=True)


@shared_task
def task_retry_failed_outbound_syncs():
    """
    Periodic retry for outbound syncs that failed (stale mappings, transient QBO errors).

    Scheduled via CELERY_BEAT_SCHEDULE; only queues mappings still eligible locally.
    """
    from django.conf import settings

    from .celery_queue import outbound_queue_overloaded
    from .bulk_outbound_sync import retry_failed_outbound_syncs
    from .services import QuickBooksService

    if not getattr(settings, 'QUICKBOOKS_RETRY_FAILED_OUTBOUND_ENABLED', True):
        logger.info('[QBO Outbound] Failed-sync retry disabled by settings.')
        return {'queued': 0, 'skipped': 'disabled'}

    if not QuickBooksService.is_connected():
        logger.info('[QBO Outbound] Skipping failed-sync retry — QuickBooks not connected.')
        return {'queued': 0, 'skipped': 'not_connected'}

    if outbound_queue_overloaded():
        return {'queued': 0, 'skipped': 'queue_backlog'}

    queued, skipped = retry_failed_outbound_syncs()
    return {'queued': queued, 'skipped_ineligible': len(skipped)}


@shared_task
def task_full_inbound_sync(triggered_by_id=None):
    """
    Queue all inbound pulls as separate Celery tasks.

    Each entity type runs independently so a slow/failed pull does not block
    the rest, and the webhook endpoint can return within Intuit's 3s limit.
    """
    logger.info("[QBO Inbound] Queueing full inbound sync...")
    inbound_tasks = (
        task_pull_vendors_from_qbo,
        task_pull_invoices_from_qbo,
        task_pull_bills_from_qbo,
        task_pull_bill_payments_from_qbo,
        task_pull_estimates_from_qbo,
        task_pull_credit_memos_from_qbo,
        task_pull_vendor_credits_from_qbo,
        task_pull_items_from_qbo,
    )
    queued = 0
    for task in inbound_tasks:
        try:
            task.delay(triggered_by_id=triggered_by_id)
            queued += 1
        except Exception as exc:
            logger.warning(
                'Celery dispatch failed for %s; running inline: %s',
                task.__name__,
                exc,
            )
            task(triggered_by_id=triggered_by_id)
            queued += 1
    logger.info("[QBO Inbound] Full inbound sync queued (%s tasks).", queued)
