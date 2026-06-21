from celery import shared_task
import logging
from .outbound_log import run_outbound_entity_sync

logger = logging.getLogger(__name__)

@shared_task
def task_sync_customer_to_qbo(customer_id):
    """Background task to sync a Customer to QBO."""
    run_outbound_entity_sync(
        'customer', customer_id, 'customers', 'Customer', 'sync_customer',
    )


@shared_task
def task_sync_invoice_to_qbo(invoice_id):
    """Background task to sync an Invoice to QBO."""
    run_outbound_entity_sync(
        'invoice', invoice_id, 'billing', 'Invoice', 'sync_invoice',
    )


@shared_task
def task_sync_payment_to_qbo(payment_id):
    """Background task to sync a Payment to QBO."""
    run_outbound_entity_sync(
        'payment', payment_id, 'billing', 'Payment', 'sync_payment',
    )


@shared_task
def task_sync_supplier_to_qbo(supplier_id):
    """Background task to sync a Supplier to QBO."""
    run_outbound_entity_sync(
        'supplier', supplier_id, 'inventory', 'Supplier', 'sync_supplier',
    )


@shared_task
def task_sync_purchase_order_to_qbo(po_id):
    """Background task to sync a PurchaseOrder to QBO as a Bill."""
    run_outbound_entity_sync(
        'purchase_order', po_id, 'inventory', 'PurchaseOrder', 'sync_purchase_order',
    )


@shared_task
def task_sync_estimate_to_qbo(estimate_id):
    """Background task to sync an Estimate to QBO."""
    run_outbound_entity_sync(
        'estimate', estimate_id, 'billing', 'Estimate', 'sync_estimate',
    )


@shared_task
def task_sync_credit_note_to_qbo(credit_note_id):
    """Background task to sync a CreditNote to QBO as a Credit Memo."""
    run_outbound_entity_sync(
        'credit_note', credit_note_id, 'billing', 'CreditNote', 'sync_credit_note',
    )


@shared_task
def task_sync_branch_to_qbo(branch_id):
    """Background task to sync a Branch to QBO as a Department (Location)."""
    from django.apps import apps
    from .services import QuickBooksService

    try:
        Branch = apps.get_model('branches', 'Branch')
        branch = Branch.objects.get(id=branch_id)

        service = QuickBooksService()
        qb_dept = service.sync_branch(branch)

        if qb_dept:
            logger.info(f"Successfully synced Branch {branch_id} to QBO Department ID {qb_dept.Id}")
        else:
            logger.warning(f"Failed to sync Branch {branch_id} to QBO (no result returned)")

    except Branch.DoesNotExist:
        logger.error(f"Branch {branch_id} does not exist.")
    except Exception as e:
        logger.error(f"Error syncing Branch {branch_id} to QBO: {e}", exc_info=True)


# ---------------------------------------------------------------------------
# INBOUND TASKS: Pull from QBO → local system
# ---------------------------------------------------------------------------

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
def task_full_inbound_sync(triggered_by_id=None):
    """
    Convenience task: runs all three inbound pulls sequentially.
    Triggered by Celery Beat schedule or manual admin action.
    """
    logger.info("[QBO Inbound] Starting full inbound sync...")
    task_pull_vendors_from_qbo(triggered_by_id=triggered_by_id)
    task_pull_invoices_from_qbo(triggered_by_id=triggered_by_id)
    task_pull_bills_from_qbo(triggered_by_id=triggered_by_id)
    logger.info("[QBO Inbound] Full inbound sync complete.")
