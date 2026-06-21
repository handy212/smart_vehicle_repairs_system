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
    from quickbooks.objects.estimate import Estimate as QBEstimate
    from quickbooks.objects.creditmemo import CreditMemo as QBCreditMemo
    from quickbooks.objects.payment import Payment as QBPayment, PaymentLine
    from quickbooks.objects.base import Ref, LinkedTxn
    from quickbooks.objects.detailline import DetailLine, SalesItemLineDetail
    from quickbooks.objects.department import Department as QBDepartment
    from quickbooks.objects.vendor import Vendor as QBVendor
    from quickbooks.objects.bill import Bill as QBBill
    from quickbooks.objects.vendorcredit import VendorCredit as QBVendorCredit
    from quickbooks.objects.detailline import ItemBasedExpenseLineDetail
    from quickbooks.objects.detailline import AccountBasedExpenseLineDetail
    from quickbooks.objects.tax import TxnTaxDetail
except ModuleNotFoundError as exc:
    if exc.name != "quickbooks":
        raise
    QuickBooks = None
    QBCustomer = None
    QBInvoice = None
    QBEstimate = None
    QBCreditMemo = None
    QBPayment = None
    PaymentLine = None
    Ref = None
    LinkedTxn = None
    DetailLine = None
    SalesItemLineDetail = None
    QBDepartment = None
    QBVendor = None
    QBBill = None
    QBVendorCredit = None
    ItemBasedExpenseLineDetail = None
    AccountBasedExpenseLineDetail = None
    TxnTaxDetail = None

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
    def is_connected():
        """True when QBO config is active and has a valid OAuth token."""
        config = QuickBooksService.get_config(active_only=False)
        if not config:
            return False
        has_token = hasattr(config, 'token') and config.token is not None
        return bool(config.is_active and has_token)

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

            branch_ct = ContentType.objects.get_for_model(local_branch)
            conflict = QBOMapping.objects.filter(
                content_type=branch_ct,
                qbo_id=str(qb_dept.Id),
            ).exclude(object_id=local_branch.id).first()
            if conflict:
                raise ValueError(
                    f'QBO location {qb_dept.Id} is already mapped to branch id={conflict.object_id}.'
                )

            # Update Mapping
            QBOMapping.objects.update_or_create(
                content_type=branch_ct,
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

    def list_departments(self):
        """
        Fetch all QBO Departments (Locations) and include any existing SVR branch mappings.
        Returns (departments_list, error_message).
        """
        from apps.branches.models import Branch

        client = self.get_client()
        if not client:
            return None, 'QuickBooks not connected or unauthorized.'

        if QBDepartment is None:
            return None, _quickbooks_sdk_message()

        try:
            qb_departments = QBDepartment.all(qb=client)
            branch_ct = ContentType.objects.get_for_model(Branch)
            mappings_by_qbo_id = {
                mapping.qbo_id: mapping
                for mapping in QBOMapping.objects.filter(content_type=branch_ct).exclude(qbo_id='')
            }
            branch_ids = [mapping.object_id for mapping in mappings_by_qbo_id.values()]
            branches_by_id = Branch.objects.in_bulk(branch_ids)

            departments = []
            for department in qb_departments:
                mapping = mappings_by_qbo_id.get(str(department.Id))
                mapped_branch = None
                if mapping:
                    branch = branches_by_id.get(mapping.object_id)
                    if branch:
                        mapped_branch = {
                            'id': branch.id,
                            'name': branch.name,
                            'code': branch.code,
                        }
                departments.append({
                    'id': str(department.Id),
                    'name': department.Name,
                    'active': bool(getattr(department, 'Active', True)),
                    'mapped_branch': mapped_branch,
                    'sync_status': mapping.status if mapping else None,
                })

            departments.sort(key=lambda item: (item['name'] or '').lower())
            return departments, None
        except Exception as exc:
            logger.error('Failed to list QBO departments: %s', exc)
            return None, str(exc)

    def map_branch_to_department(self, local_branch, qbo_department_id):
        """
        Link a local Branch to an existing QBO Department without creating a new one.
        Returns (success, error_message).
        """
        client = self.get_client()
        if not client:
            return False, 'QuickBooks not connected or unauthorized.'

        if QBDepartment is None:
            return False, _quickbooks_sdk_message()

        branch_ct = ContentType.objects.get_for_model(local_branch)
        department_id = str(qbo_department_id).strip()
        if not department_id:
            return False, 'department_id is required.'

        conflict = QBOMapping.objects.filter(
            content_type=branch_ct,
            qbo_id=department_id,
        ).exclude(object_id=local_branch.id).first()
        if conflict:
            return False, (
                f'QBO location is already mapped to another branch (id={conflict.object_id}).'
            )

        try:
            qb_department = QBDepartment.get(int(department_id), qb=client)
        except Exception as exc:
            logger.error('Failed to fetch QBO department %s: %s', department_id, exc)
            return False, f'QBO location {department_id} was not found.'

        QBOMapping.objects.update_or_create(
            content_type=branch_ct,
            object_id=local_branch.id,
            defaults={
                'qbo_id': str(qb_department.Id),
                'qbo_sync_token': qb_department.SyncToken or '',
                'status': 'synced',
                'error_message': '',
            },
        )
        return True, None

    def clear_branch_qbo_mapping(self, local_branch):
        """Remove the QBO mapping for a branch."""
        branch_ct = ContentType.objects.get_for_model(local_branch)
        deleted, _ = QBOMapping.objects.filter(
            content_type=branch_ct,
            object_id=local_branch.id,
        ).delete()
        return deleted > 0

    def _get_mapping_service(self):
        try:
            from .mapping_services import get_account_mapping_service
            return get_account_mapping_service()
        except Exception:
            return None

    def _build_sales_item_lines(self, line_items, *, item_type_attr='item_type', default_item_type='other'):
        lines = []
        mapping_service = self._get_mapping_service()
        for item in line_items:
            line = DetailLine()
            line.Amount = float(item.total)
            line.DetailType = "SalesItemLineDetail"
            if hasattr(item, item_type_attr):
                item_type = getattr(item, item_type_attr)
            else:
                item_type = default_item_type
            line.Description = item.description or f"{str(item_type).title()} Item"

            sales_item = SalesItemLineDetail()
            sales_item.Qty = float(item.quantity)
            sales_item.UnitPrice = float(item.unit_price)
            if mapping_service and Ref is not None:
                qbo_item_id = mapping_service.resolve_invoice_line_item_id(item_type)
                if qbo_item_id:
                    sales_item.ItemRef = Ref()
                    sales_item.ItemRef.value = qbo_item_id
            line.SalesItemLineDetail = sales_item
            lines.append(line)
        return lines

    _LEVY_TAX_FIELD_MAP = (
        ('vat', 'tax_vat_amount'),
        ('nhil', 'tax_nhil_amount'),
        ('getfund', 'tax_getfund_amount'),
        ('hrl', 'tax_hrl_amount'),
    )

    def _resolve_tax_code_id(self, mapping_service, local_obj):
        """Prefer composite tax code; fall back to the first mapped Ghana levy with an amount."""
        composite_id = mapping_service.resolve_tax_code_id('composite')
        if composite_id:
            return composite_id
        for key, field in self._LEVY_TAX_FIELD_MAP:
            amount = float(getattr(local_obj, field, 0) or 0)
            if amount <= 0:
                continue
            code_id = mapping_service.resolve_tax_code_id(key)
            if code_id:
                return code_id
        return None

    def _apply_mapped_tax(self, qb_txn, local_obj):
        mapping_service = self._get_mapping_service()
        if not mapping_service or TxnTaxDetail is None or Ref is None:
            return
        tax_amount = float(getattr(local_obj, 'tax_amount', 0) or 0)
        if tax_amount <= 0:
            return
        tax_code_id = self._resolve_tax_code_id(mapping_service, local_obj)
        if not tax_code_id:
            return
        qb_txn.TxnTaxDetail = TxnTaxDetail()
        qb_txn.TxnTaxDetail.TxnTaxCodeRef = Ref()
        qb_txn.TxnTaxDetail.TxnTaxCodeRef.value = tax_code_id
        qb_txn.TxnTaxDetail.TotalTax = tax_amount
        if hasattr(qb_txn, 'GlobalTaxCalculation'):
            qb_txn.GlobalTaxCalculation = 'TaxExcluded'

    def _apply_department_ref(self, qb_txn, branch):
        if not branch:
            return
        qb_dept = self.sync_branch(branch)
        if qb_dept and Ref is not None:
            qb_txn.DepartmentRef = Ref()
            qb_txn.DepartmentRef.value = qb_dept.Id

    def _update_qbo_mapping(self, local_obj, qb_obj, *, error=None):
        defaults = {
            'status': 'failed' if error else 'synced',
            'error_message': error or '',
        }
        if qb_obj and not error:
            defaults['qbo_id'] = qb_obj.Id
            defaults['qbo_sync_token'] = qb_obj.SyncToken
        QBOMapping.objects.update_or_create(
            content_type=ContentType.objects.get_for_model(local_obj),
            object_id=local_obj.id,
            defaults=defaults,
        )

    def _build_ap_expense_lines(self, line_items, *, description_attr='description', inventory_relation=None):
        """Build QBO Bill/VendorCredit expense lines from SVR AP line items."""
        lines = []
        mapping_service = self._get_mapping_service()
        for item in line_items:
            line = DetailLine()
            line.Amount = float(item.total)
            description = getattr(item, description_attr, '') or 'Line item'
            is_inventory_line = False
            if inventory_relation:
                is_inventory_line = bool(getattr(item, f'{inventory_relation}_id', None))
                related = getattr(item, inventory_relation, None)
                if related and getattr(related, 'name', None):
                    description = related.name
            line.Description = description

            account_id = None
            if mapping_service:
                account_id = mapping_service.resolve_bill_line_account_id(
                    is_inventory_line=is_inventory_line,
                )

            if account_id and AccountBasedExpenseLineDetail is not None and Ref is not None:
                line.DetailType = "AccountBasedExpenseLineDetail"
                expense_detail = AccountBasedExpenseLineDetail()
                expense_detail.AccountRef = Ref()
                expense_detail.AccountRef.value = account_id
                line.AccountBasedExpenseLineDetail = expense_detail
            else:
                line.DetailType = "ItemBasedExpenseLineDetail"
                exp_item = ItemBasedExpenseLineDetail()
                exp_item.Qty = float(item.quantity)
                unit_price = getattr(item, 'unit_price', None) or getattr(item, 'unit_cost', 0)
                exp_item.UnitPrice = float(unit_price)
                line.ItemBasedExpenseLineDetail = exp_item
            lines.append(line)
        return lines

    def _sync_qbo_bill_document(
        self,
        local_obj,
        *,
        qb_vendor,
        doc_number,
        txn_date,
        due_date=None,
        notes=None,
        branch=None,
        line_items=None,
        inventory_relation=None,
    ):
        """Create or update a QBO Bill for a PO or vendor bill."""
        client = self.get_client()
        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_obj),
            object_id=local_obj.id,
        ).first()

        qb_bill = QBBill()
        if mapping and mapping.qbo_id:
            try:
                qb_bill = QBBill.get(int(mapping.qbo_id), qb=client)
            except Exception:
                qb_bill = QBBill()

        qb_bill.VendorRef = Ref()
        qb_bill.VendorRef.value = qb_vendor.Id
        qb_bill.DocNumber = doc_number
        qb_bill.TxnDate = txn_date.isoformat() if hasattr(txn_date, 'isoformat') else txn_date
        if due_date:
            qb_bill.DueDate = due_date.isoformat() if hasattr(due_date, 'isoformat') else due_date
        if notes:
            qb_bill.PrivateNote = notes
        self._apply_department_ref(qb_bill, branch)
        qb_bill.Line = self._build_ap_expense_lines(
            line_items or [],
            inventory_relation=inventory_relation,
        )
        self._save_qb(qb_bill, client)
        self._update_qbo_mapping(local_obj, qb_bill)
        return qb_bill

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
            
        self._apply_department_ref(qb_invoice, local_invoice.branch)

        qb_invoice.Line = self._build_sales_item_lines(local_invoice.line_items.all())
        self._apply_mapped_tax(qb_invoice, local_invoice)

        if local_invoice.estimate_id and LinkedTxn is not None:
            estimate_mapping = QBOMapping.objects.filter(
                content_type=ContentType.objects.get_for_model(local_invoice.estimate),
                object_id=local_invoice.estimate_id,
            ).first()
            if estimate_mapping and estimate_mapping.qbo_id:
                linked = LinkedTxn()
                linked.TxnId = estimate_mapping.qbo_id
                linked.TxnType = 'Estimate'
                qb_invoice.LinkedTxn = [linked]
            
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

    def sync_estimate(self, local_estimate):
        """Sync a local Estimate to QBO."""
        client = self.get_client()
        if not client:
            self._update_qbo_mapping(
                local_estimate,
                None,
                error='QuickBooks not connected or unauthorized.',
            )
            return None

        if QBEstimate is None:
            self._update_qbo_mapping(local_estimate, None, error=_quickbooks_sdk_message())
            return None

        qb_customer = self.sync_customer(local_estimate.customer)
        if not qb_customer:
            logger.error(
                'Cannot sync estimate %s: Customer sync failed.',
                local_estimate.estimate_number,
            )
            return None

        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_estimate),
            object_id=local_estimate.id,
        ).first()

        qb_estimate = QBEstimate()
        if mapping and mapping.qbo_id:
            try:
                qb_estimate = QBEstimate.get(int(mapping.qbo_id), qb=client)
            except Exception:
                qb_estimate = QBEstimate()

        qb_estimate.CustomerRef = Ref()
        qb_estimate.CustomerRef.value = qb_customer.Id
        qb_estimate.DocNumber = local_estimate.estimate_number
        qb_estimate.TxnDate = local_estimate.estimate_date.isoformat()
        if local_estimate.valid_until:
            qb_estimate.ExpirationDate = local_estimate.valid_until.isoformat()
        if local_estimate.notes:
            qb_estimate.PrivateNote = local_estimate.notes
        if local_estimate.customer_notes:
            qb_estimate.CustomerMemo = {'value': local_estimate.customer_notes}

        self._apply_department_ref(qb_estimate, local_estimate.branch)
        qb_estimate.Line = self._build_sales_item_lines(local_estimate.line_items.all())
        self._apply_mapped_tax(qb_estimate, local_estimate)

        try:
            self._save_qb(qb_estimate, client)
            self._update_qbo_mapping(local_estimate, qb_estimate)
            return qb_estimate
        except Exception as exc:
            logger.error('QBO Estimate Sync Error: %s', exc)
            self._update_qbo_mapping(local_estimate, None, error=str(exc))
            return None

    def sync_credit_note(self, local_credit_note):
        """Sync a local CreditNote to QBO as a Credit Memo."""
        client = self.get_client()
        if not client:
            self._update_qbo_mapping(
                local_credit_note,
                None,
                error='QuickBooks not connected or unauthorized.',
            )
            return None

        if QBCreditMemo is None:
            self._update_qbo_mapping(local_credit_note, None, error=_quickbooks_sdk_message())
            return None

        if local_credit_note.status not in ('issued', 'applied', 'refunded'):
            logger.info(
                'Skipping QBO sync for credit note %s in status %s',
                local_credit_note.credit_note_number,
                local_credit_note.status,
            )
            return None

        qb_customer = self.sync_customer(local_credit_note.customer)
        if not qb_customer:
            logger.error(
                'Cannot sync credit note %s: Customer sync failed.',
                local_credit_note.credit_note_number,
            )
            return None

        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_credit_note),
            object_id=local_credit_note.id,
        ).first()

        qb_credit_memo = QBCreditMemo()
        if mapping and mapping.qbo_id:
            try:
                qb_credit_memo = QBCreditMemo.get(int(mapping.qbo_id), qb=client)
            except Exception:
                qb_credit_memo = QBCreditMemo()

        qb_credit_memo.CustomerRef = Ref()
        qb_credit_memo.CustomerRef.value = qb_customer.Id
        qb_credit_memo.DocNumber = local_credit_note.credit_note_number
        qb_credit_memo.TxnDate = local_credit_note.credit_date.isoformat()
        if local_credit_note.reason:
            qb_credit_memo.PrivateNote = local_credit_note.reason
        if local_credit_note.notes:
            qb_credit_memo.CustomerMemo = {'value': local_credit_note.notes}

        self._apply_department_ref(qb_credit_memo, local_credit_note.branch)

        qb_credit_memo.Line = self._build_sales_item_lines(
            local_credit_note.line_items.all(),
            default_item_type='other',
        )

        self._apply_mapped_tax(qb_credit_memo, local_credit_note)

        if local_credit_note.invoice_id and LinkedTxn is not None:
            invoice_mapping = QBOMapping.objects.filter(
                content_type=ContentType.objects.get_for_model(local_credit_note.invoice),
                object_id=local_credit_note.invoice_id,
            ).first()
            qb_invoice_id = invoice_mapping.qbo_id if invoice_mapping else None
            if not qb_invoice_id and local_credit_note.invoice:
                qb_invoice = self.sync_invoice(local_credit_note.invoice)
                qb_invoice_id = qb_invoice.Id if qb_invoice else None
            if qb_invoice_id:
                linked = LinkedTxn()
                linked.TxnId = qb_invoice_id
                linked.TxnType = 'Invoice'
                qb_credit_memo.LinkedTxn = [linked]

        try:
            self._save_qb(qb_credit_memo, client)
            self._update_qbo_mapping(local_credit_note, qb_credit_memo)
            return qb_credit_memo
        except Exception as exc:
            logger.error('QBO Credit Memo Sync Error: %s', exc)
            self._update_qbo_mapping(local_credit_note, None, error=str(exc))
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
        if local_payment.notes:
            qb_payment.PrivateNote = local_payment.notes

        try:
            from .mapping_services import get_account_mapping_service
            deposit_account_id = get_account_mapping_service().resolve_payment_deposit_account_id(local_payment)
            if deposit_account_id and Ref is not None:
                qb_payment.DepositToAccountRef = Ref()
                qb_payment.DepositToAccountRef.value = deposit_account_id
        except Exception as mapping_error:
            logger.debug('Could not resolve QBO deposit account for payment: %s', mapping_error)

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
        mapping_service = None
        try:
            from .mapping_services import get_account_mapping_service
            mapping_service = get_account_mapping_service()
        except Exception:
            mapping_service = None

        for item in local_po.items.all():
            line = DetailLine()
            line.Amount = float(item.total)
            line.Description = item.part.name if item.part_id else "PO Item"

            is_inventory_line = bool(item.part_id)
            account_id = None
            if mapping_service:
                account_id = mapping_service.resolve_bill_line_account_id(
                    is_inventory_line=is_inventory_line,
                )

            if account_id and AccountBasedExpenseLineDetail is not None and Ref is not None:
                line.DetailType = "AccountBasedExpenseLineDetail"
                expense_detail = AccountBasedExpenseLineDetail()
                expense_detail.AccountRef = Ref()
                expense_detail.AccountRef.value = account_id
                line.AccountBasedExpenseLineDetail = expense_detail
            else:
                line.DetailType = "ItemBasedExpenseLineDetail"
                exp_item = ItemBasedExpenseLineDetail()
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

    def sync_vendor_bill(self, local_bill):
        """Sync a local AP Bill to QBO as a Bill."""
        client = self.get_client()
        if not client:
            self._update_qbo_mapping(
                local_bill,
                None,
                error='QuickBooks not connected or unauthorized.',
            )
            return None

        qb_vendor = self.sync_supplier(local_bill.vendor)
        if not qb_vendor:
            logger.error('Cannot sync vendor bill %s: Supplier sync failed.', local_bill.bill_number)
            return None

        try:
            return self._sync_qbo_bill_document(
                local_bill,
                qb_vendor=qb_vendor,
                doc_number=local_bill.bill_number,
                txn_date=local_bill.bill_date,
                due_date=local_bill.due_date,
                notes=local_bill.notes,
                branch=local_bill.branch,
                line_items=local_bill.line_items.all(),
                inventory_relation='inventory_item',
            )
        except Exception as exc:
            logger.error('QBO Vendor Bill Sync Error: %s', exc)
            self._update_qbo_mapping(local_bill, None, error=str(exc))
            return None

    def sync_vendor_credit(self, local_vendor_credit):
        """Sync a local VendorCredit to QBO as a Vendor Credit."""
        client = self.get_client()
        if not client:
            self._update_qbo_mapping(
                local_vendor_credit,
                None,
                error='QuickBooks not connected or unauthorized.',
            )
            return None

        if QBVendorCredit is None:
            self._update_qbo_mapping(local_vendor_credit, None, error=_quickbooks_sdk_message())
            return None

        qb_vendor = self.sync_supplier(local_vendor_credit.vendor)
        if not qb_vendor:
            logger.error(
                'Cannot sync vendor credit %s: Supplier sync failed.',
                local_vendor_credit.credit_number,
            )
            return None

        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_vendor_credit),
            object_id=local_vendor_credit.id,
        ).first()

        qb_vendor_credit = QBVendorCredit()
        if mapping and mapping.qbo_id:
            try:
                qb_vendor_credit = QBVendorCredit.get(int(mapping.qbo_id), qb=client)
            except Exception:
                qb_vendor_credit = QBVendorCredit()

        qb_vendor_credit.VendorRef = Ref()
        qb_vendor_credit.VendorRef.value = qb_vendor.Id
        qb_vendor_credit.DocNumber = local_vendor_credit.credit_number
        qb_vendor_credit.TxnDate = local_vendor_credit.credit_date.isoformat()
        if local_vendor_credit.notes:
            qb_vendor_credit.PrivateNote = local_vendor_credit.notes
        self._apply_department_ref(qb_vendor_credit, local_vendor_credit.branch)
        qb_vendor_credit.Line = self._build_ap_expense_lines(
            local_vendor_credit.line_items.all(),
            inventory_relation='inventory_item',
        )

        if local_vendor_credit.bill_id and LinkedTxn is not None:
            bill_mapping = QBOMapping.objects.filter(
                content_type=ContentType.objects.get_for_model(local_vendor_credit.bill),
                object_id=local_vendor_credit.bill_id,
            ).first()
            qb_bill_id = bill_mapping.qbo_id if bill_mapping else None
            if not qb_bill_id and local_vendor_credit.bill:
                qb_bill = self.sync_vendor_bill(local_vendor_credit.bill)
                qb_bill_id = qb_bill.Id if qb_bill else None
            if qb_bill_id:
                linked = LinkedTxn()
                linked.TxnId = qb_bill_id
                linked.TxnType = 'Bill'
                qb_vendor_credit.LinkedTxn = [linked]

        try:
            self._save_qb(qb_vendor_credit, client)
            self._update_qbo_mapping(local_vendor_credit, qb_vendor_credit)
            return qb_vendor_credit
        except Exception as exc:
            logger.error('QBO Vendor Credit Sync Error: %s', exc)
            self._update_qbo_mapping(local_vendor_credit, None, error=str(exc))
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
        Pull Bills from QBO and update existing local Purchase Orders or vendor bills.
        - PO: status → received when QBO balance is zero
        - Vendor bill: amount_paid / amount_due / status when QBO is ahead
        """
        from apps.billing.models import Bill
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
            bill_ct = ContentType.objects.get_for_model(Bill)

            for qb_bill in qb_bills:
                mapping = QBOMapping.objects.filter(qbo_id=str(qb_bill.Id)).filter(
                    content_type__in=[po_ct, bill_ct],
                ).first()

                if not mapping:
                    log.records_skipped += 1
                    continue

                qbo_balance = Decimal(str(qb_bill.Balance or 0))
                updated = False

                if mapping.content_type_id == po_ct.id:
                    try:
                        local_po = PurchaseOrder.objects.get(id=mapping.object_id)
                        if qbo_balance == Decimal('0') and local_po.status not in ('received', 'cancelled'):
                            PurchaseOrder.objects.filter(id=local_po.id).update(status='received')
                            updated = True
                    except PurchaseOrder.DoesNotExist:
                        log.records_skipped += 1
                        continue
                elif mapping.content_type_id == bill_ct.id:
                    try:
                        local_bill = Bill.objects.get(id=mapping.object_id)
                        qbo_total = Decimal(str(getattr(qb_bill, 'TotalAmt', 0) or 0))
                        qbo_paid = qbo_total - qbo_balance
                        if qbo_paid > local_bill.amount_paid:
                            amount_due = max(qbo_balance, Decimal('0'))
                            new_status = local_bill.status
                            if qbo_balance == Decimal('0'):
                                new_status = 'paid'
                            elif qbo_paid > Decimal('0') and local_bill.status == 'open':
                                new_status = 'partially_paid'
                            Bill.objects.filter(id=local_bill.id).update(
                                amount_paid=qbo_paid,
                                amount_due=amount_due,
                                status=new_status,
                            )
                            updated = True
                    except Bill.DoesNotExist:
                        log.records_skipped += 1
                        continue

                if updated:
                    log.records_updated += 1
                else:
                    log.records_skipped += 1

                mapping.status = 'synced'
                mapping.qbo_sync_token = qb_bill.SyncToken or ''
                mapping.error_message = ''
                mapping.save()

            log.status = 'success'
        except Exception as e:
            logger.error(f"QBO pull_bills failed: {e}")
            log.status = 'failed'
            log.error_message = str(e)

        log.finished_at = timezone.now()
        log.save()
        return log

    def pull_estimates(self, triggered_by=None):
        """
        Pull Estimates from QBO and update status on existing local estimates.
        Local business data remains authoritative; only status and sync meta are updated.
        """
        from apps.billing.models import Estimate

        log = QBOSyncLog.objects.create(entity_type='estimate', triggered_by=triggered_by)

        client = self.get_client()
        if not client:
            log.status = 'failed'
            log.error_message = 'QuickBooks not connected or unauthorized.'
            log.finished_at = timezone.now()
            log.save()
            return log

        if QBEstimate is None:
            log.status = 'failed'
            log.error_message = _quickbooks_sdk_message()
            log.finished_at = timezone.now()
            log.save()
            return log

        qbo_status_map = {
            'Accepted': 'approved',
            'Rejected': 'declined',
            'Closed': 'converted',
        }

        try:
            qb_estimates = QBEstimate.all(qb=client)
            log.records_pulled = len(qb_estimates)
            estimate_ct = ContentType.objects.get_for_model(Estimate)

            for qb_estimate in qb_estimates:
                mapping = QBOMapping.objects.filter(
                    content_type=estimate_ct,
                    qbo_id=str(qb_estimate.Id),
                ).first()
                if not mapping:
                    log.records_skipped += 1
                    continue

                try:
                    local_estimate = Estimate.objects.get(id=mapping.object_id)
                    updated = False
                    qbo_status = getattr(qb_estimate, 'TxnStatus', None)
                    mapped_status = qbo_status_map.get(qbo_status)
                    if mapped_status and local_estimate.status != mapped_status:
                        Estimate.objects.filter(id=local_estimate.id).update(status=mapped_status)
                        updated = True

                    if updated:
                        log.records_updated += 1
                    else:
                        log.records_skipped += 1

                    mapping.status = 'synced'
                    mapping.qbo_sync_token = qb_estimate.SyncToken or ''
                    mapping.error_message = ''
                    mapping.save()
                except Estimate.DoesNotExist:
                    logger.warning(
                        'QBOMapping points to Estimate id=%s which no longer exists.',
                        mapping.object_id,
                    )
                    log.records_skipped += 1

            log.status = 'success'
        except Exception as exc:
            logger.error('QBO pull_estimates failed: %s', exc)
            log.status = 'failed'
            log.error_message = str(exc)

        log.finished_at = timezone.now()
        log.save()
        return log

    def pull_credit_memos(self, triggered_by=None):
        """
        Pull Credit Memos from QBO and update applied status on existing local credit notes.
        """
        from apps.billing.models import CreditNote
        from decimal import Decimal

        log = QBOSyncLog.objects.create(entity_type='credit_memo', triggered_by=triggered_by)

        client = self.get_client()
        if not client:
            log.status = 'failed'
            log.error_message = 'QuickBooks not connected or unauthorized.'
            log.finished_at = timezone.now()
            log.save()
            return log

        if QBCreditMemo is None:
            log.status = 'failed'
            log.error_message = _quickbooks_sdk_message()
            log.finished_at = timezone.now()
            log.save()
            return log

        try:
            qb_credit_memos = QBCreditMemo.all(qb=client)
            log.records_pulled = len(qb_credit_memos)
            credit_note_ct = ContentType.objects.get_for_model(CreditNote)

            for qb_credit_memo in qb_credit_memos:
                mapping = QBOMapping.objects.filter(
                    content_type=credit_note_ct,
                    qbo_id=str(qb_credit_memo.Id),
                ).first()
                if not mapping:
                    log.records_skipped += 1
                    continue

                try:
                    local_credit_note = CreditNote.objects.get(id=mapping.object_id)
                    updated = False
                    remaining = Decimal(str(getattr(qb_credit_memo, 'RemainingCredit', 0) or 0))
                    if (
                        remaining == Decimal('0')
                        and local_credit_note.status == 'issued'
                    ):
                        CreditNote.objects.filter(id=local_credit_note.id).update(status='applied')
                        updated = True

                    if updated:
                        log.records_updated += 1
                    else:
                        log.records_skipped += 1

                    mapping.status = 'synced'
                    mapping.qbo_sync_token = qb_credit_memo.SyncToken or ''
                    mapping.error_message = ''
                    mapping.save()
                except CreditNote.DoesNotExist:
                    logger.warning(
                        'QBOMapping points to CreditNote id=%s which no longer exists.',
                        mapping.object_id,
                    )
                    log.records_skipped += 1

            log.status = 'success'
        except Exception as exc:
            logger.error('QBO pull_credit_memos failed: %s', exc)
            log.status = 'failed'
            log.error_message = str(exc)

        log.finished_at = timezone.now()
        log.save()
        return log

    def pull_vendor_credits(self, triggered_by=None):
        """Pull Vendor Credits from QBO and update applied status on local vendor credits."""
        from apps.billing.models import VendorCredit
        from decimal import Decimal

        log = QBOSyncLog.objects.create(entity_type='vendor_credit', triggered_by=triggered_by)

        client = self.get_client()
        if not client:
            log.status = 'failed'
            log.error_message = 'QuickBooks not connected or unauthorized.'
            log.finished_at = timezone.now()
            log.save()
            return log

        if QBVendorCredit is None:
            log.status = 'failed'
            log.error_message = _quickbooks_sdk_message()
            log.finished_at = timezone.now()
            log.save()
            return log

        try:
            qb_vendor_credits = QBVendorCredit.all(qb=client)
            log.records_pulled = len(qb_vendor_credits)
            vendor_credit_ct = ContentType.objects.get_for_model(VendorCredit)

            for qb_vendor_credit in qb_vendor_credits:
                mapping = QBOMapping.objects.filter(
                    content_type=vendor_credit_ct,
                    qbo_id=str(qb_vendor_credit.Id),
                ).first()
                if not mapping:
                    log.records_skipped += 1
                    continue

                try:
                    local_vendor_credit = VendorCredit.objects.get(id=mapping.object_id)
                    updated = False
                    remaining = Decimal(str(getattr(qb_vendor_credit, 'RemainingCredit', 0) or 0))
                    if remaining == Decimal('0') and local_vendor_credit.status == 'issued':
                        VendorCredit.objects.filter(id=local_vendor_credit.id).update(status='applied')
                        updated = True

                    if updated:
                        log.records_updated += 1
                    else:
                        log.records_skipped += 1

                    mapping.status = 'synced'
                    mapping.qbo_sync_token = qb_vendor_credit.SyncToken or ''
                    mapping.error_message = ''
                    mapping.save()
                except VendorCredit.DoesNotExist:
                    logger.warning(
                        'QBOMapping points to VendorCredit id=%s which no longer exists.',
                        mapping.object_id,
                    )
                    log.records_skipped += 1

            log.status = 'success'
        except Exception as exc:
            logger.error('QBO pull_vendor_credits failed: %s', exc)
            log.status = 'failed'
            log.error_message = str(exc)

        log.finished_at = timezone.now()
        log.save()
        return log
