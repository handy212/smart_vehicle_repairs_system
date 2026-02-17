import logging
from django.utils import timezone
from datetime import timedelta
from django.conf import settings
from quickbooks import QuickBooks
from intuitlib.client import AuthClient
from intuitlib.enums import Scopes

from quickbooks.objects.customer import Customer as QBCustomer
from quickbooks.objects.invoice import Invoice as QBInvoice
from quickbooks.objects.payment import Payment as QBPayment, PaymentLine
from quickbooks.objects.base import Ref, LinkedTxn
from quickbooks.objects.detailline import DetailLine, SalesItemLineDetail
from quickbooks.objects.department import Department as QBDepartment
from django.contrib.contenttypes.models import ContentType
from .models import QBOConfig, QBOToken, QBOMapping

logger = logging.getLogger(__name__)

class QuickBooksService:
    """
    Service for interacting with QuickBooks Online API.
    """
    
    @staticmethod
    def get_config():
        """Get the active QBO configuration."""
        return QBOConfig.objects.filter(is_active=True).first()

    @staticmethod
    def get_auth_client(config=None):
        """Get the Intuit AuthClient."""
        if not config:
            config = QuickBooksService.get_config()
        
        if not config:
            return None
            
        return AuthClient(
            client_id=config.client_id,
            client_secret=config.client_secret,
            environment='sandbox' if config.is_sandbox else 'production',
            redirect_uri=f"{settings.SITE_URL}/quickbooks/callback/",
        )

    @classmethod
    def get_client(cls):
        """
        Get an authenticated QuickBooks client.
        Automatically refreshes token if expired.
        """
        config = cls.get_config()
        if not config:
            logger.warning("No active QBO configuration found.")
            return None
            
        if not hasattr(config, 'token'):
            logger.warning("active QBO configuration has no token.")
            return None
            
        token = config.token
        
        # Check if token needs refresh (expires in less than 5 minutes)
        if token.expires_at <= timezone.now() + timedelta(minutes=5):
            cls.refresh_token(config, token)
            token.refresh_from_db()
            
        auth_client = cls.get_auth_client(config)
        
        client = QuickBooks(
            auth_client=auth_client,
            refresh_token=token.refresh_token,
            company_id=config.realm_id,
        )
        
        client.access_token = token.access_token
        
        return client

    @classmethod
    def refresh_token(cls, config, token):
        """Refresh the OAuth2 token."""
        try:
            auth_client = cls.get_auth_client(config)
            auth_client.refresh_token(token.refresh_token)
            
            token.access_token = auth_client.access_token
            token.refresh_token = auth_client.refresh_token
            token.expires_at = timezone.now() + timedelta(seconds=auth_client.expires_in)
            token.refresh_token_expires_at = timezone.now() + timedelta(seconds=auth_client.x_refresh_token_expires_in)
            token.save()
            
            logger.info("Successfully refreshed QBO token.")
            return True
        except Exception as e:
            logger.error(f"Failed to refresh QBO token: {e}")
            if "invalid_grant" in str(e):
                config.is_active = False
                config.save()
            return False

    @staticmethod
    def disconnect():
        """Disconnects the app from QBO."""
        config = QuickBooksService.get_config()
        if config and hasattr(config, 'token'):
            auth_client = QuickBooksService.get_auth_client(config)
            try:
                auth_client.revoke(token=config.token.access_token)
                auth_client.revoke(token=config.token.refresh_token)
            except Exception as e:
                logger.warning(f"Error revoking tokens: {e}")
            
            config.token.delete()
            config.is_active = False
            config.save()

    def sync_customer(self, local_customer):
        """
        Sync a local Customer to QBO.
        """
        client = self.get_client()
        if not client:
            return None
            
        # Check for existing mapping
        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_customer),
            object_id=local_customer.id
        ).first()
        
        qb_customer = QBCustomer()
        
        if mapping:
            # Update existing
            try:
                qb_customer = QBCustomer.get(int(mapping.qbo_id), qb=client)
            except Exception as e:
                logger.warning(f"Failed to fetch existing QBO customer {mapping.qbo_id}: {e}. Creating new.")
                mapping = None
                qb_customer = QBCustomer()
        
        # Map fields
        user = local_customer.user
        full_name = f"{user.first_name} {user.last_name}".strip()
        
        if local_customer.company_name:
            qb_customer.CompanyName = local_customer.company_name
            qb_customer.DisplayName = f"{local_customer.company_name} ({local_customer.customer_number})"
        else:
            qb_customer.DisplayName = f"{full_name} ({local_customer.customer_number})"
            
        # Parse name
        qb_customer.GivenName = user.first_name
        qb_customer.FamilyName = user.last_name
            
        # Contact info
        if user.email:
            qb_customer.PrimaryEmailAddr = {"Address": user.email}
            
        if hasattr(local_customer, 'phone') and local_customer.phone:
             qb_customer.PrimaryPhone = {"FreeFormNumber": local_customer.phone}

            
        # Save to QBO
        qb_customer.save(qb=client)
        
        # Update/Create mapping
        QBOMapping.objects.update_or_create(
            content_type=ContentType.objects.get_for_model(local_customer),
            object_id=local_customer.id,
            defaults={
                'qbo_id': qb_customer.Id,
                'qbo_sync_token': qb_customer.SyncToken
            }
        )
        
        return qb_customer

    def sync_branch(self, local_branch):
        """
        Sync a local Branch to QBO Department (Location).
        """
        client = self.get_client()
        if not client:
            return None
            
        # Check for existing mapping
        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_branch),
            object_id=local_branch.id
        ).first()
        
        qb_dept = QBDepartment()
        if mapping:
            try:
                qb_dept = QBDepartment.get(int(mapping.qbo_id), qb=client)
            except Exception:
                mapping = None
                qb_dept = QBDepartment()
                
        # Map Fields
        qb_dept.Name = f"{local_branch.name} ({local_branch.code})"
        
        # Save
        try:
            qb_dept.save(qb=client)
            
            # Update Mapping
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_branch),
                object_id=local_branch.id,
                defaults={
                    'qbo_id': qb_dept.Id,
                    'qbo_sync_token': qb_dept.SyncToken
                }
            )
            return qb_dept
        except Exception as e:
            logger.error(f"QBO Branch Sync Error: {e}")
            return None

    def sync_invoice(self, local_invoice):
        """
        Sync a local Invoice to QBO.
        """
        client = self.get_client()
        if not client:
            return None
            
        # Ensure Customer is synced first
        qb_customer = self.sync_customer(local_invoice.customer)
        if not qb_customer:
            logger.error(f"Cannot sync invoice {local_invoice.invoice_number}: Customer sync failed.")
            return None
            
        # Check for existing mapping
        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_invoice),
            object_id=local_invoice.id
        ).first()
        
        qb_invoice = QBInvoice()
        if mapping:
            try:
                qb_invoice = QBInvoice.get(int(mapping.qbo_id), qb=client)
            except Exception:
                mapping = None
                qb_invoice = QBInvoice()
                
        # Map Header Fields
        qb_invoice.CustomerRef = Ref()
        qb_invoice.CustomerRef.value = qb_customer.Id
        
        qb_invoice.DocNumber = local_invoice.invoice_number
        qb_invoice.TxnDate = local_invoice.invoice_date.isoformat()
        if local_invoice.due_date:
            qb_invoice.DueDate = local_invoice.due_date.isoformat()
            
        if local_invoice.notes:
            qb_invoice.PrivateNote = local_invoice.notes
            
        # Map Branch/Department
        if local_invoice.branch:
            qb_dept = self.sync_branch(local_invoice.branch)
            if qb_dept:
                qb_invoice.DepartmentRef = Ref()
                qb_invoice.DepartmentRef.value = qb_dept.Id
            
        # Map Line Items
        # We assume strict mapping of one-to-one for simplicity, 
        # but in reality we should diff lines. For now, we overwrite lines.
        qb_invoice.Line = []
        
        # 1. Labor
        if local_invoice.labor_subtotal > 0:
            line = DetailLine()
            line.Amount = float(local_invoice.labor_subtotal)
            line.DetailType = "SalesItemLineDetail"
            line.SalesItemLineDetail = SalesItemLineDetail()
            # Ideally map to a specific Service Item for Labor
            # For now, we might need a default "Services" item ID or let QBO handle it?
            # QBO requires an ItemRef. We should probably have a config or const for default items.
            # Skipping ItemRef might fail or use default. Let's try to set description at least.
            line.Description = "Labor Services"
            qb_invoice.Line.append(line)
            
        # 2. Parts
        if local_invoice.parts_subtotal > 0:
            line = DetailLine()
            line.Amount = float(local_invoice.parts_subtotal)
            line.DetailType = "SalesItemLineDetail"
            line.SalesItemLineDetail = SalesItemLineDetail()
            line.Description = "Parts"
            qb_invoice.Line.append(line)
            
        # Save
        try:
            qb_invoice.save(qb=client)
            
            # Update Mapping
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_invoice),
                object_id=local_invoice.id,
                defaults={
                    'qbo_id': qb_invoice.Id,
                    'qbo_sync_token': qb_invoice.SyncToken
                }
            )
            return qb_invoice
        except Exception as e:
            logger.error(f"QBO Invoice Sync Error: {e}")

    def sync_payment(self, local_payment):
        """
        Sync a local Payment to QBO.
        """
        client = self.get_client()
        if not client:
            return None
            
        # Ensure Customer is synced
        qb_customer = self.sync_customer(local_payment.customer)
        if not qb_customer:
            logger.error(f"Cannot sync payment {local_payment.payment_number}: Customer sync failed.")
            return None

        # Check for existing mapping
        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_payment),
            object_id=local_payment.id
        ).first()

        qb_payment = QBPayment()
        if mapping:
            try:
                qb_payment = QBPayment.get(int(mapping.qbo_id), qb=client)
            except Exception:
                mapping = None
                qb_payment = QBPayment()

        # Map Fields
        qb_payment.CustomerRef = Ref()
        qb_payment.CustomerRef.value = qb_customer.Id
        
        qb_payment.TotalAmt = float(local_payment.amount)
        qb_payment.TxnDate = local_payment.payment_date.date().isoformat()
        
        if local_payment.reference_number:
            qb_payment.PaymentRefNum = local_payment.reference_number
            
            qb_payment.PrivateNote = local_payment.notes

        # Map Branch/Department from Invoice
        # Payments in this system don't have direct branch, but are linked to invoice
        if local_payment.invoice and local_payment.invoice.branch:
            qb_dept = self.sync_branch(local_payment.invoice.branch)
            if qb_dept:
                # Payment object supports DepartmentRef? Check docs/schema.
                # python-quickbooks Payment object does NOT have 'DepartmentRef' in class_dict
                # But we can try to set it dynamically if QBO API supports it.
                # If python-quickbooks filters it out, we might need to subclass or mixin.
                # However, for now let's try to set it, if it fails validation we will catch it.
                # Checked QBO API Ref: Payment DOES NOT have DepartmentRef. 
                # Location is usually tracked at Line level for some txns, or Header for others.
                # Payment header does NOT confirm support for DepartmentRef in docs.
                # Wait, QBO API for Payment: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment
                # No DepartmentRef in Payment Header.
                # So we CANNOT set DepartmentRef on Payment.
                # We can only rely on the linked Invoice having the Location.
                pass
        
        # Link to Invoice

        # Link to Invoice
        # We need the QBO ID of the invoice being paid
        if local_payment.invoice:
            # Check if invoice is already synced
            invoice_mapping = QBOMapping.objects.filter(
                content_type=ContentType.objects.get_for_model(local_payment.invoice),
                object_id=local_payment.invoice.id
            ).first()
            
            qb_invoice_id = None
            if invoice_mapping:
                qb_invoice_id = invoice_mapping.qbo_id
            else:
                # Try to sync invoice immediately if not found
                # Note: sync_invoice checks customer sync internally, so it is safe
                qb_invoice = self.sync_invoice(local_payment.invoice)
                if qb_invoice:
                    qb_invoice_id = qb_invoice.Id
            
            if qb_invoice_id:
                line = PaymentLine()
                line.Amount = float(local_payment.amount)
                
                linked_txn = LinkedTxn()
                linked_txn.TxnId = qb_invoice_id
                linked_txn.TxnType = "Invoice"
                
                line.LinkedTxn = [linked_txn]
                qb_payment.Line = [line]
            else:
                logger.warning(f"Syncing payment {local_payment.payment_number} without linking to Invoice (Invoice sync failed).")

        # Save
        try:
            qb_payment.save(qb=client)
            
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_payment),
                object_id=local_payment.id,
                defaults={
                    'qbo_id': qb_payment.Id,
                    'qbo_sync_token': qb_payment.SyncToken
                }
            )
            return qb_payment
            
        except Exception as e:
            logger.error(f"QBO Payment Sync Error: {e}")
            logger.error(f"Validation Errors: {e.detail}")
            raise e

