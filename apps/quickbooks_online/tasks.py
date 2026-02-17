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
