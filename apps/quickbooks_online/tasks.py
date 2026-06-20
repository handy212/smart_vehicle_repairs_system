from celery import shared_task
from django.apps import apps
import logging
from .services import QuickBooksService

logger = logging.getLogger(__name__)

@shared_task
def task_sync_customer_to_qbo(customer_id):
    """
    Background task to sync a Customer to QBO.
    """
    try:
        Customer = apps.get_model('customers', 'Customer')
        customer = Customer.objects.get(id=customer_id)
        
        service = QuickBooksService()
        qb_customer = service.sync_customer(customer)
        
        if qb_customer:
            logger.info(f"Successfully synced Customer {customer_id} to QBO ID {qb_customer.Id}")
        else:
            logger.warning(f"Failed to sync Customer {customer_id} to QBO (no result returned)")
            
    except Customer.DoesNotExist:
        logger.error(f"Customer {customer_id} does not exist.")
    except Exception as e:
        logger.error(f"Error syncing Customer {customer_id} to QBO: {e}", exc_info=True)


@shared_task
def task_sync_invoice_to_qbo(invoice_id):
    """
    Background task to sync an Invoice to QBO.
    """
    try:
        Invoice = apps.get_model('billing', 'Invoice')
        invoice = Invoice.objects.get(id=invoice_id)
        
        service = QuickBooksService()
        qb_invoice = service.sync_invoice(invoice)
        
        if qb_invoice:
            logger.info(f"Successfully synced Invoice {invoice_id} to QBO ID {qb_invoice.Id}")
        else:
            logger.warning(f"Failed to sync Invoice {invoice_id} to QBO (no result returned)")
            
    except Invoice.DoesNotExist:
        logger.error(f"Invoice {invoice_id} does not exist.")
    except Exception as e:
        logger.error(f"Error syncing Invoice {invoice_id} to QBO: {e}", exc_info=True)


@shared_task
def task_sync_payment_to_qbo(payment_id):
    """
    Background task to sync a Payment to QBO.
    """
    try:
        Payment = apps.get_model('billing', 'Payment')
        payment = Payment.objects.get(id=payment_id)
        
        service = QuickBooksService()
        qb_payment = service.sync_payment(payment)
        
        if qb_payment:
            logger.info(f"Successfully synced Payment {payment_id} to QBO ID {qb_payment.Id}")
        else:
            logger.warning(f"Failed to sync Payment {payment_id} to QBO (no result returned)")
            
    except Payment.DoesNotExist:
        logger.error(f"Payment {payment_id} does not exist.")
    except Exception as e:
        logger.error(f"Error syncing Payment {payment_id} to QBO: {e}", exc_info=True)


@shared_task
def task_sync_supplier_to_qbo(supplier_id):
    """
    Background task to sync a Supplier to QBO.
    """
    try:
        Supplier = apps.get_model('inventory', 'Supplier')
        supplier = Supplier.objects.get(id=supplier_id)
        
        service = QuickBooksService()
        qb_vendor = service.sync_supplier(supplier)
        
        if qb_vendor:
            logger.info(f"Successfully synced Supplier {supplier_id} to QBO ID {qb_vendor.Id}")
        else:
            logger.warning(f"Failed to sync Supplier {supplier_id} to QBO (no result returned)")
            
    except Supplier.DoesNotExist:
        logger.error(f"Supplier {supplier_id} does not exist.")
    except Exception as e:
        logger.error(f"Error syncing Supplier {supplier_id} to QBO: {e}", exc_info=True)


@shared_task
def task_sync_purchase_order_to_qbo(po_id):
    """
    Background task to sync a PurchaseOrder to QBO as a Bill.
    """
    try:
        PurchaseOrder = apps.get_model('inventory', 'PurchaseOrder')
        po = PurchaseOrder.objects.get(id=po_id)
        
        service = QuickBooksService()
        qb_bill = service.sync_purchase_order(po)
        
        if qb_bill:
            logger.info(f"Successfully synced PO {po_id} to QBO ID {qb_bill.Id}")
        else:
            logger.warning(f"Failed to sync PO {po_id} to QBO (no result returned)")
            
    except PurchaseOrder.DoesNotExist:
        logger.error(f"PurchaseOrder {po_id} does not exist.")
    except Exception as e:
        logger.error(f"Error syncing PO {po_id} to QBO: {e}", exc_info=True)


@shared_task
def task_sync_estimate_to_qbo(estimate_id):
    """Background task to sync an Estimate to QBO."""
    try:
        Estimate = apps.get_model('billing', 'Estimate')
        estimate = Estimate.objects.get(id=estimate_id)

        service = QuickBooksService()
        qb_estimate = service.sync_estimate(estimate)

        if qb_estimate:
            logger.info(f"Successfully synced Estimate {estimate_id} to QBO ID {qb_estimate.Id}")
        else:
            logger.warning(f"Failed to sync Estimate {estimate_id} to QBO (no result returned)")

    except Estimate.DoesNotExist:
        logger.error(f"Estimate {estimate_id} does not exist.")
    except Exception as e:
        logger.error(f"Error syncing Estimate {estimate_id} to QBO: {e}", exc_info=True)


@shared_task
def task_sync_credit_note_to_qbo(credit_note_id):
    """Background task to sync a CreditNote to QBO as a Credit Memo."""
    try:
        CreditNote = apps.get_model('billing', 'CreditNote')
        credit_note = CreditNote.objects.get(id=credit_note_id)

        service = QuickBooksService()
        qb_credit_memo = service.sync_credit_note(credit_note)

        if qb_credit_memo:
            logger.info(
                f"Successfully synced CreditNote {credit_note_id} to QBO ID {qb_credit_memo.Id}"
            )
        else:
            logger.warning(f"Failed to sync CreditNote {credit_note_id} to QBO (no result returned)")

    except CreditNote.DoesNotExist:
        logger.error(f"CreditNote {credit_note_id} does not exist.")
    except Exception as e:
        logger.error(f"Error syncing CreditNote {credit_note_id} to QBO: {e}", exc_info=True)


@shared_task
def task_sync_branch_to_qbo(branch_id):
    """
    Background task to sync a Branch to QBO as a Department (Location).
    """
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
