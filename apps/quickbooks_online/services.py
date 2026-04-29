import logging
from django.utils import timezone
from datetime import timedelta
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from .models import QBOConfig, QBOToken, QBOMapping, QBOSyncLog

logger = logging.getLogger(__name__)

try:
    from quickbooks import QuickBooks
    from quickbooks.objects.customer import Customer as QBCustomer
    from quickbooks.objects.invoice import Invoice as QBInvoice
    from quickbooks.objects.payment import Payment as QBPayment, PaymentLine
    from quickbooks.objects.base import Ref, LinkedTxn
    from quickbooks.objects.detailline import DetailLine, SalesItemLineDetail
    from quickbooks.objects.department import Department as QBDepartment
    from quickbooks.objects.vendor import Vendor as QBVendor
    from quickbooks.objects.bill import Bill as QBBill
    from quickbooks.objects.detailline import ItemBasedExpenseLineDetail
except ModuleNotFoundError as exc:
    if exc.name != "quickbooks":
        raise
    QuickBooks = None
    QBCustomer = None
    QBInvoice = None
    QBPayment = None
    PaymentLine = None
    Ref = None
    LinkedTxn = None
    DetailLine = None
    SalesItemLineDetail = None
    QBDepartment = None
    QBVendor = None
    QBBill = None
    ItemBasedExpenseLineDetail = None

try:
    from intuitlib.client import AuthClient
except ModuleNotFoundError as exc:
    if exc.name != "intuitlib":
        raise
    AuthClient = None


def _quickbooks_sdk_available():
    return QuickBooks is not None and AuthClient is not None


def _quickbooks_sdk_message():
    missing = []
    if QuickBooks is None:
        missing.append("python-quickbooks")
    if AuthClient is None:
        missing.append("intuit-oauth")
    return f"QuickBooks SDK dependency missing: {', '.join(missing)}."


def _is_stale_error(exc) -> bool:
    """Return True if the exception is a QuickBooks Stale Object Error (5010)."""
    msg = str(exc)
    return '5010' in msg or 'stale object' in msg.lower()


class QuickBooksService:
    """
    Service for interacting with QuickBooks Online API.
    """

    @staticmethod
    def sdk_available():
        return _quickbooks_sdk_available()

    @staticmethod
    def sdk_unavailable_message():
        return _quickbooks_sdk_message()
    
    @staticmethod
    def get_config(active_only=True):
        """Get the QBO configuration, syncing from SystemSettings if needed."""
        from apps.accounts.admin_models import SystemSettings
        
        query = QBOConfig.objects.all()
        if active_only:
            query = query.filter(is_active=True)
        
        config = query.first()
        
        # If no config or keys missing, try to sync from SystemSettings
        client_id = SystemSettings.get_setting('quickbooks_client_id')
        client_secret = SystemSettings.get_setting('quickbooks_client_secret')
        is_sandbox = SystemSettings.get_setting('quickbooks_sandbox_enabled', 'true').lower() == 'true'
        
        if client_id and client_secret:
            if not config:
                # Create if missing (using first available or new)
                config = QBOConfig.objects.first() or QBOConfig()
                
            config.client_id = client_id
            config.client_secret = client_secret
            config.is_sandbox = is_sandbox
            # Don't force is_active=True here, let the auth flow handle it
            config.save()
            
        return config

    @staticmethod
    def get_auth_client(config=None):
        """Get the Intuit AuthClient."""
        if AuthClient is None:
            logger.warning(_quickbooks_sdk_message())
            return None

        if not config:
            config = QuickBooksService.get_config()
        
        if not config:
            return None
            
        return AuthClient(
            client_id=config.client_id,
            client_secret=config.client_secret,
            environment='sandbox' if config.is_sandbox else 'production',
            redirect_uri=f"{settings.SITE_URL}/api/quickbooks/callback/",
        )

    @classmethod
    def get_client(cls):
        """
        Get an authenticated QuickBooks client.
        Automatically refreshes token if expired.
        """
        try:
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
            if not auth_client or QuickBooks is None:
                logger.warning(_quickbooks_sdk_message())
                return None
            
            client = QuickBooks(
                auth_client=auth_client,
                refresh_token=token.refresh_token,
                company_id=config.realm_id,
            )
            
            client.access_token = token.access_token
            
            return client
        except Exception as e:
            logger.error(f"Error initializing QBO client: {e}")
            return None

    @classmethod
    def refresh_token(cls, config, token):
        """Refresh the OAuth2 token."""
        try:
            auth_client = cls.get_auth_client(config)
            auth_client.refresh(token.refresh_token)
            
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

    @classmethod
    def _save_qb(cls, qb_obj, client):
        """
        Save a QBO object. If a Stale Object Error (5010) is raised, re-fetch
        the entity to get the current SyncToken and retry once.
        Local data always wins — we intentionally overwrite any concurrent QBO changes.
        """
        try:
            qb_obj.save(qb=client)
        except Exception as e:
            if _is_stale_error(e) and getattr(qb_obj, 'Id', None):
                logger.warning(
                    "Stale Object Error (5010) on %s id=%s — refreshing SyncToken and retrying.",
                    type(qb_obj).__name__, qb_obj.Id,
                )
                fresh = type(qb_obj).get(int(qb_obj.Id), qb=client)
                qb_obj.SyncToken = fresh.SyncToken
                qb_obj.save(qb=client)   # propagate if it fails a second time
            else:
                raise
        return qb_obj

    def sync_customer(self, local_customer):
        """
        Sync a local Customer to QBO.
        """
        client = self.get_client()
        if not client:
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_customer),
                object_id=local_customer.id,
                defaults={
                    'status': 'failed',
                    'error_message': 'QuickBooks not connected or unauthorized.'
                }
            )
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
        try:
            self._save_qb(qb_customer, client)

            # Update/Create mapping
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_customer),
                object_id=local_customer.id,
                defaults={
                    'qbo_id': qb_customer.Id,
                    'qbo_sync_token': qb_customer.SyncToken,
                    'status': 'synced',
                    'error_message': ''
                }
            )
            return qb_customer
        except Exception as e:
            logger.error(f"QBO Customer Sync Error: {e}")
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_customer),
                object_id=local_customer.id,
                defaults={
                    'status': 'failed',
                    'error_message': str(e)
                }
            )
            return None

    def sync_branch(self, local_branch):
        """
        Sync a local Branch to QBO Department (Location).
        """
        client = self.get_client()
        if not client:
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_branch),
                object_id=local_branch.id,
                defaults={
                    'status': 'failed',
                    'error_message': 'QuickBooks not connected or unauthorized.'
                }
            )
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
            self._save_qb(qb_dept, client)

            # Update Mapping
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_branch),
                object_id=local_branch.id,
                defaults={
                    'qbo_id': qb_dept.Id,
                    'qbo_sync_token': qb_dept.SyncToken,
                    'status': 'synced',
                    'error_message': ''
                }
            )
            return qb_dept
        except Exception as e:
            logger.error(f"QBO Branch Sync Error: {e}")
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_branch),
                object_id=local_branch.id,
                defaults={
                    'status': 'failed',
                    'error_message': str(e)
                }
            )
            return None

    def sync_invoice(self, local_invoice):
        """
        Sync a local Invoice to QBO.
        """
        client = self.get_client()
        if not client:
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_invoice),
                object_id=local_invoice.id,
                defaults={
                    'status': 'failed',
                    'error_message': 'QuickBooks not connected or unauthorized.'
                }
            )
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
        qb_invoice.Line = []
        
        for item in local_invoice.line_items.all():
            line = DetailLine()
            line.Amount = float(item.total)
            line.DetailType = "SalesItemLineDetail"
            line.Description = item.description or f"{item.item_type.title()} Item"
            
            sales_item = SalesItemLineDetail()
            # If QBO requires an ItemRef, we might still need to set it,
            # but setting Qty and UnitPrice is a start
            sales_item.Qty = float(item.quantity)
            sales_item.UnitPrice = float(item.unit_price)
            line.SalesItemLineDetail = sales_item
            
            qb_invoice.Line.append(line)
            
        # Save
        try:
            self._save_qb(qb_invoice, client)

            # Update Mapping
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_invoice),
                object_id=local_invoice.id,
                defaults={
                    'qbo_id': qb_invoice.Id,
                    'qbo_sync_token': qb_invoice.SyncToken,
                    'status': 'synced',
                    'error_message': ''
                }
            )
            return qb_invoice
        except Exception as e:
            logger.error(f"QBO Invoice Sync Error: {e}")
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_invoice),
                object_id=local_invoice.id,
                defaults={
                    'status': 'failed',
                    'error_message': str(e)
                }
            )
            return None

    def sync_payment(self, local_payment):
        """
        Sync a local Payment to QBO.
        """
        client = self.get_client()
        if not client:
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_payment),
                object_id=local_payment.id,
                defaults={
                    'status': 'failed',
                    'error_message': 'QuickBooks not connected or unauthorized.'
                }
            )
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
            self._save_qb(qb_payment, client)

            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_payment),
                object_id=local_payment.id,
                defaults={
                    'qbo_id': qb_payment.Id,
                    'qbo_sync_token': qb_payment.SyncToken,
                    'status': 'synced',
                    'error_message': ''
                }
            )
            return qb_payment
            
        except Exception as e:
            logger.error(f"QBO Payment Sync Error: {e}")
            if hasattr(e, 'detail'):
                logger.error(f"Validation Errors: {e.detail}")
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_payment),
                object_id=local_payment.id,
                defaults={
                    'status': 'failed',
                    'error_message': str(e)
                }
            )
            return None

    def sync_supplier(self, local_supplier):
        """
        Sync a local Supplier to QBO Vendor.
        """
        client = self.get_client()
        if not client:
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_supplier),
                object_id=local_supplier.id,
                defaults={
                    'status': 'failed',
                    'error_message': 'QuickBooks not connected or unauthorized.'
                }
            )
            return None
            
        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_supplier),
            object_id=local_supplier.id
        ).first()
        
        qb_vendor = QBVendor()
        if mapping:
            try:
                qb_vendor = QBVendor.get(int(mapping.qbo_id), qb=client)
            except Exception:
                mapping = None
                qb_vendor = QBVendor()
                
        qb_vendor.DisplayName = f"{local_supplier.name} ({local_supplier.supplier_code})"
        qb_vendor.CompanyName = local_supplier.name
        
        if local_supplier.email:
            qb_vendor.PrimaryEmailAddr = {"Address": local_supplier.email}
        if local_supplier.phone:
            qb_vendor.PrimaryPhone = {"FreeFormNumber": local_supplier.phone}
            
        try:
            self._save_qb(qb_vendor, client)
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_supplier),
                object_id=local_supplier.id,
                defaults={
                    'qbo_id': qb_vendor.Id,
                    'qbo_sync_token': qb_vendor.SyncToken,
                    'status': 'synced',
                    'error_message': ''
                }
            )
            return qb_vendor
        except Exception as e:
            logger.error(f"QBO Supplier Sync Error: {e}")
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_supplier),
                object_id=local_supplier.id,
                defaults={
                    'status': 'failed',
                    'error_message': str(e)
                }
            )
            return None

    def sync_purchase_order(self, local_po):
        """
        Sync a local PurchaseOrder to QBO Bill.
        """
        client = self.get_client()
        if not client:
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_po),
                object_id=local_po.id,
                defaults={
                    'status': 'failed',
                    'error_message': 'QuickBooks not connected or unauthorized.'
                }
            )
            return None
            
        qb_vendor = self.sync_supplier(local_po.supplier)
        if not qb_vendor:
            logger.error(f"Cannot sync PO {local_po.po_number}: Supplier sync failed.")
            return None
            
        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_po),
            object_id=local_po.id
        ).first()
        
        qb_bill = QBBill()
        if mapping:
            try:
                qb_bill = QBBill.get(int(mapping.qbo_id), qb=client)
            except Exception:
                mapping = None
                qb_bill = QBBill()
                
        qb_bill.VendorRef = Ref()
        qb_bill.VendorRef.value = qb_vendor.Id
        qb_bill.DocNumber = local_po.po_number
        qb_bill.TxnDate = local_po.order_date.isoformat()
        if local_po.expected_delivery_date:
            qb_bill.DueDate = local_po.expected_delivery_date.isoformat()
            
        if local_po.notes:
            qb_bill.PrivateNote = local_po.notes
            
        if local_po.branch:
            qb_dept = self.sync_branch(local_po.branch)
            if qb_dept:
                qb_bill.DepartmentRef = Ref()
                qb_bill.DepartmentRef.value = qb_dept.Id
                
        qb_bill.Line = []
        for item in local_po.items.all():
            line = DetailLine()
            line.Amount = float(item.total)
            line.DetailType = "ItemBasedExpenseLineDetail"
            line.Description = item.part.name or "PO Item"
            
            exp_item = ItemBasedExpenseLineDetail()
            # If QBO requires an ItemRef, we might still need to set it,
            # but setting Qty and UnitPrice is a start
            exp_item.Qty = float(item.quantity)
            exp_item.UnitPrice = float(item.unit_cost)
            line.ItemBasedExpenseLineDetail = exp_item
            
            qb_bill.Line.append(line)
            
        try:
            self._save_qb(qb_bill, client)
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_po),
                object_id=local_po.id,
                defaults={
                    'qbo_id': qb_bill.Id,
                    'qbo_sync_token': qb_bill.SyncToken,
                    'status': 'synced',
                    'error_message': ''
                }
            )
            return qb_bill
        except Exception as e:
            logger.error(f"QBO PO Sync Error: {e}")
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_po),
                object_id=local_po.id,
                defaults={
                    'status': 'failed',
                    'error_message': str(e)
                }
            )
            return None

    # -------------------------------------------------------------------------
    # INBOUND SYNC: Pull from QBO → our local system
    # Design rules:
    #   - Local is source of truth for business data (names, contact info, etc.)
    #   - Only STATUS/FINANCIAL fields are pulled from QBO to keep local records current
    #   - New Vendors in QBO are imported as local Suppliers
    #   - Customers are managed locally only — no auto-create from QBO
    # -------------------------------------------------------------------------

    def pull_vendors(self, triggered_by=None):
        """
        Pull Vendors from QBO.
        - Creates new local Suppliers for QBO Vendors that have no local match.
        - Does NOT overwrite existing local Supplier business data.
        - Updates QBOMapping for all matched/created records.
        """
        from apps.inventory.models import Supplier
        from django.utils.text import slugify

        log = QBOSyncLog.objects.create(entity_type='vendor', triggered_by=triggered_by)

        client = self.get_client()
        if not client:
            log.status = 'failed'
            log.error_message = 'QuickBooks not connected or unauthorized.'
            log.finished_at = timezone.now()
            log.save()
            return log

        try:
            qb_vendors = QBVendor.all(qb=client)
            log.records_pulled = len(qb_vendors)

            supplier_ct = ContentType.objects.get_for_model(Supplier)

            for vendor in qb_vendors:
                # Find an existing local Supplier by QBOMapping.qbo_id
                mapping = QBOMapping.objects.filter(
                    content_type=supplier_ct,
                    qbo_id=str(vendor.Id)
                ).first()

                if mapping:
                    # Already mapped — keep local data as source of truth, just update sync meta
                    mapping.status = 'synced'
                    mapping.error_message = ''
                    mapping.save()
                    log.records_updated += 1
                else:
                    # New vendor in QBO with no local match — create it locally
                    try:
                        # Build a unique supplier_code from the vendor name
                        base_code = slugify(vendor.DisplayName or vendor.CompanyName or f"QBO-{vendor.Id}")[:45].upper().replace('-', '')
                        supplier_code = base_code[:50]
                        counter = 1
                        while Supplier.objects.filter(supplier_code=supplier_code).exists():
                            suffix = str(counter)
                            supplier_code = f"{base_code[:50 - len(suffix)]}{suffix}"
                            counter += 1

                        local_supplier = Supplier.objects.create(
                            name=vendor.CompanyName or vendor.DisplayName or f"QBO Vendor {vendor.Id}",
                            supplier_code=supplier_code,
                            email=vendor.PrimaryEmailAddr.Address if vendor.PrimaryEmailAddr else '',
                            phone=vendor.PrimaryPhone.FreeFormNumber if vendor.PrimaryPhone else '',
                        )

                        QBOMapping.objects.create(
                            content_type=supplier_ct,
                            object_id=local_supplier.id,
                            qbo_id=str(vendor.Id),
                            qbo_sync_token=vendor.SyncToken or '',
                            status='synced',
                        )
                        log.records_created += 1
                        logger.info(f"Created local Supplier '{local_supplier.name}' from QBO Vendor {vendor.Id}")
                    except Exception as create_err:
                        logger.error(f"Failed to create local Supplier for QBO Vendor {vendor.Id}: {create_err}")
                        log.records_skipped += 1

            log.status = 'success'
        except Exception as e:
            logger.error(f"QBO pull_vendors failed: {e}")
            log.status = 'failed'
            log.error_message = str(e)

        log.finished_at = timezone.now()
        log.save()
        return log

    def pull_invoices(self, triggered_by=None):
        """
        Pull Invoices from QBO and update STATUS/AMOUNTS of existing local invoices.
        - Local is source of truth for all business data.
        - Only updates: status (to 'paid' if QBO shows fully paid), amount_paid, amount_due.
        - Does NOT create new invoices from QBO.
        """
        from apps.billing.models import Invoice
        from decimal import Decimal

        log = QBOSyncLog.objects.create(entity_type='invoice', triggered_by=triggered_by)

        client = self.get_client()
        if not client:
            log.status = 'failed'
            log.error_message = 'QuickBooks not connected or unauthorized.'
            log.finished_at = timezone.now()
            log.save()
            return log

        try:
            qb_invoices = QBInvoice.all(qb=client)
            log.records_pulled = len(qb_invoices)

            invoice_ct = ContentType.objects.get_for_model(Invoice)

            # QBO balance status mapping → local Invoice status
            QBO_STATUS_MAP = {
                'Paid': 'paid',
                'Voided': 'void',
            }

            for qb_inv in qb_invoices:
                mapping = QBOMapping.objects.filter(
                    content_type=invoice_ct,
                    qbo_id=str(qb_inv.Id)
                ).first()

                if not mapping:
                    log.records_skipped += 1
                    continue  # No local invoice for this QBO ID — skip (we don't create from QBO)

                try:
                    local_invoice = Invoice.objects.get(id=mapping.object_id)

                    updated = False

                    # Update payment amounts from QBO (these are financial facts from QBO)
                    qbo_balance = Decimal(str(qb_inv.Balance or 0))
                    qbo_total = Decimal(str(qb_inv.TotalAmt or 0))
                    qbo_paid = qbo_total - qbo_balance

                    # Conflict resolution: if local shows MORE paid than QBO,
                    # local data wins (payment may not have synced to QBO yet).
                    # If QBO shows MORE paid, QBO wins (payment confirmed externally).
                    if local_invoice.amount_paid != qbo_paid:
                        if qbo_paid > local_invoice.amount_paid:
                            # QBO has more payment info — trust QBO
                            local_invoice.amount_paid = qbo_paid
                            local_invoice.amount_due = qbo_balance
                            updated = True
                            logger.info(
                                f"Conflict resolved (QBO wins): Invoice {local_invoice.invoice_number} "
                                f"local_paid={local_invoice.amount_paid} qbo_paid={qbo_paid}"
                            )
                        else:
                            # Local is ahead of QBO — keep local, just update sync meta
                            logger.debug(
                                f"Conflict resolved (local wins): Invoice {local_invoice.invoice_number} "
                                f"local_paid={local_invoice.amount_paid} qbo_paid={qbo_paid}"
                            )

                    # Update status if QBO shows as fully paid
                    if qbo_balance == 0 and local_invoice.status not in ('paid', 'void', 'refunded'):
                        local_invoice.status = 'paid'
                        updated = True

                    if updated:
                        # Save without triggering the outbound QBO sync signal
                        Invoice.objects.filter(id=local_invoice.id).update(
                            amount_paid=local_invoice.amount_paid,
                            amount_due=local_invoice.amount_due,
                            status=local_invoice.status
                        )
                        log.records_updated += 1
                        logger.info(f"Updated local Invoice {local_invoice.invoice_number} from QBO Invoice {qb_inv.Id}")
                    else:
                        log.records_skipped += 1

                    # Keep sync meta current
                    mapping.status = 'synced'
                    mapping.qbo_sync_token = qb_inv.SyncToken or ''
                    mapping.error_message = ''
                    mapping.save()

                except Invoice.DoesNotExist:
                    logger.warning(f"QBOMapping points to Invoice id={mapping.object_id} which no longer exists.")
                    log.records_skipped += 1

            log.status = 'success'
        except Exception as e:
            logger.error(f"QBO pull_invoices failed: {e}")
            log.status = 'failed'
            log.error_message = str(e)

        log.finished_at = timezone.now()
        log.save()
        return log

    def pull_bills(self, triggered_by=None):
        """
        Pull Bills from QBO and update STATUS of existing local Purchase Orders.
        - Local is source of truth for business data.
        - Only updates: status (to 'received' if QBO Bill is paid/cleared).
        - Does NOT create new POs from QBO.
        """
        from apps.inventory.models import PurchaseOrder
        from decimal import Decimal

        log = QBOSyncLog.objects.create(entity_type='bill', triggered_by=triggered_by)

        client = self.get_client()
        if not client:
            log.status = 'failed'
            log.error_message = 'QuickBooks not connected or unauthorized.'
            log.finished_at = timezone.now()
            log.save()
            return log

        try:
            qb_bills = QBBill.all(qb=client)
            log.records_pulled = len(qb_bills)

            po_ct = ContentType.objects.get_for_model(PurchaseOrder)

            for qb_bill in qb_bills:
                mapping = QBOMapping.objects.filter(
                    content_type=po_ct,
                    qbo_id=str(qb_bill.Id)
                ).first()

                if not mapping:
                    log.records_skipped += 1
                    continue  # No local PO for this QBO Bill — skip

                try:
                    local_po = PurchaseOrder.objects.get(id=mapping.object_id)

                    updated = False

                    # If QBO Bill balance is 0, the bill is fully paid/received
                    qbo_balance = Decimal(str(qb_bill.Balance or 0))
                    if qbo_balance == Decimal('0') and local_po.status not in ('received', 'cancelled'):
                        PurchaseOrder.objects.filter(id=local_po.id).update(status='received')
                        updated = True
                        logger.info(f"Updated PO {local_po.po_number} status to 'received' based on QBO Bill {qb_bill.Id}")

                    if updated:
                        log.records_updated += 1
                    else:
                        log.records_skipped += 1

                    # Keep sync meta current
                    mapping.status = 'synced'
                    mapping.qbo_sync_token = qb_bill.SyncToken or ''
                    mapping.error_message = ''
                    mapping.save()

                except PurchaseOrder.DoesNotExist:
                    logger.warning(f"QBOMapping points to PurchaseOrder id={mapping.object_id} which no longer exists.")
                    log.records_skipped += 1

            log.status = 'success'
        except Exception as e:
            logger.error(f"QBO pull_bills failed: {e}")
            log.status = 'failed'
            log.error_message = str(e)

        log.finished_at = timezone.now()
        log.save()
        return log
