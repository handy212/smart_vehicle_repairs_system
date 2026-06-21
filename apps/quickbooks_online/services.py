import logging
from urllib.parse import urlparse
from django.utils import timezone
from datetime import timedelta
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from apps.accounts.settings_utils import get_site_url
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


def _normalize_qbo_callback_url(base_url: str) -> str:
    normalized = str(base_url or "").strip().rstrip("/")
    if normalized.endswith("/api/quickbooks/callback"):
        return f"{normalized}/"
    if normalized.endswith("/api/quickbooks/callback/"):
        return normalized
    return f"{normalized}/api/quickbooks/callback/"


def _is_allowed_qbo_redirect_base(origin: str) -> bool:
    parsed = urlparse(origin.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False

    if getattr(settings, "DEBUG", False) and parsed.hostname in ("localhost", "127.0.0.1"):
        return True

    allowed_bases = {get_site_url().rstrip("/")}
    for attr in ("FRONTEND_URL", "FRONTEND_BASE_URL"):
        value = getattr(settings, attr, None)
        if value:
            allowed_bases.add(str(value).strip().rstrip("/"))
    for cors_origin in getattr(settings, "CORS_ALLOWED_ORIGINS", []) or []:
        allowed_bases.add(str(cors_origin).strip().rstrip("/"))

    return origin.strip().rstrip("/") in allowed_bases


def _infer_redirect_base(request) -> str | None:
    redirect_base = request.GET.get("redirect_base", "").strip()
    if redirect_base:
        return redirect_base

    for header in (
        request.META.get("HTTP_ORIGIN", ""),
        request.META.get("HTTP_REFERER", ""),
    ):
        if not header:
            continue
        parsed = urlparse(header.strip())
        if parsed.scheme in ("http", "https") and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    forwarded_host = request.META.get("HTTP_X_FORWARDED_HOST", "").split(",")[0].strip()
    forwarded_proto = request.META.get("HTTP_X_FORWARDED_PROTO", "http").split(",")[0].strip()
    if forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}"

    return None


def get_qbo_redirect_uri(redirect_base: str | None = None) -> str:
    """
    Public OAuth callback URL registered with Intuit.

    Uses the SPA origin (via redirect_base or FRONTEND_BASE_URL), not SITE_URL,
    so the browser callback stays on the same host as /api proxy routes.
    """
    explicit = getattr(settings, "QBO_REDIRECT_URI", "")
    if explicit:
        return _normalize_qbo_callback_url(explicit)

    if redirect_base and _is_allowed_qbo_redirect_base(redirect_base):
        return _normalize_qbo_callback_url(redirect_base)

    return _normalize_qbo_callback_url(get_site_url())


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
    def get_auth_client(config=None, redirect_uri: str | None = None):
        """Get the Intuit AuthClient."""
        if AuthClient is None:
            logger.warning(_quickbooks_sdk_message())
            return None

        if not config:
            config = QuickBooksService.get_config()
        
        if not config:
            return None

        resolved_redirect_uri = redirect_uri or get_qbo_redirect_uri()
            
        return AuthClient(
            client_id=config.client_id,
            client_secret=config.client_secret,
            environment='sandbox' if config.is_sandbox else 'production',
            redirect_uri=resolved_redirect_uri,
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

    def _fail_qbo_mapping(self, local_obj, error_message: str):
        QBOMapping.objects.update_or_create(
            content_type=ContentType.objects.get_for_model(local_obj),
            object_id=local_obj.id,
            defaults={'status': 'failed', 'error_message': error_message},
        )

    def _load_qbo_entity(
        self,
        qb_class,
        local_obj,
        *,
        doc_number=None,
        display_name=None,
        sku=None,
        name=None,
        allow_create=True,
    ):
        """
        Resolve a QBO record for update (GET → query by natural key → create).

        Returns (entity, is_new_in_qbo, error_message).
        """
        from .entity_resolver import resolve_qbo_entity

        client = self.get_client()
        if not client:
            return None, False, 'QuickBooks not connected or unauthorized.'

        mapping = QBOMapping.objects.filter(
            content_type=ContentType.objects.get_for_model(local_obj),
            object_id=local_obj.id,
        ).first()

        entity, error = resolve_qbo_entity(
            client=client,
            qb_class=qb_class,
            local_obj=local_obj,
            mapping=mapping,
            doc_number=doc_number,
            display_name=display_name,
            sku=sku,
            name=name,
            allow_create=allow_create,
        )
        if error:
            return None, False, error
        is_new = entity is not None and not getattr(entity, 'Id', None)
        return entity, is_new, None

    def sync_customer(self, local_customer):
        """
        Sync a local Customer to QBO.
        """
        client = self.get_client()
        if not client:
            self._fail_qbo_mapping(
                local_customer,
                'QuickBooks not connected or unauthorized.',
            )
            return None

        user = local_customer.user
        full_name = f"{user.first_name} {user.last_name}".strip()
        if local_customer.company_name:
            display_name = f"{local_customer.company_name} ({local_customer.customer_number})"
        else:
            display_name = f"{full_name} ({local_customer.customer_number})"

        qb_customer, _is_new, load_error = self._load_qbo_entity(
            QBCustomer,
            local_customer,
            display_name=display_name,
        )
        if load_error:
            logger.error('QBO Customer load failed: %s', load_error)
            self._fail_qbo_mapping(local_customer, load_error)
            return None
        
        # Map fields
        if local_customer.company_name:
            qb_customer.CompanyName = local_customer.company_name
            qb_customer.DisplayName = display_name
        else:
            qb_customer.DisplayName = display_name
            
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
            
        dept_name = f"{local_branch.name} ({local_branch.code})"
        qb_dept, _is_new, load_error = self._load_qbo_entity(
            QBDepartment,
            local_branch,
            name=dept_name,
        )
        if load_error:
            self._fail_qbo_mapping(local_branch, load_error)
            return None
                
        # Map Fields
        qb_dept.Name = dept_name
        
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

    def _apply_estimate_txn_status(self, qb_estimate, local_estimate):
        """Push Accepted/Rejected/Closed to QBO when SVR estimate status changes."""
        from .sync_policy import ESTIMATE_QBO_TXN_STATUS

        txn_status = ESTIMATE_QBO_TXN_STATUS.get(local_estimate.status)
        if txn_status:
            qb_estimate.TxnStatus = txn_status

    def _build_sales_item_lines(
        self,
        line_items,
        *,
        item_type_attr='item_type',
        default_item_type='other',
        part_attr='part',
        txn_date=None,
    ):
        lines = []
        mapping_service = self._get_mapping_service()
        from .item_sync import resolve_part_qbo_item_id

        if txn_date:
            from .item_sync import _prepare_inventory_parts_for_txn_date
            _prepare_inventory_parts_for_txn_date(
                self,
                line_items,
                txn_date,
                part_attr=part_attr,
            )

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
            qbo_item_id = None
            part = getattr(item, part_attr, None) if part_attr else None
            if part is not None and getattr(part, 'pk', None):
                qbo_item_id = resolve_part_qbo_item_id(self, part, txn_date=txn_date)
            if not qbo_item_id and mapping_service and Ref is not None:
                qbo_item_id = mapping_service.resolve_invoice_line_item_id(item_type)
            if qbo_item_id and Ref is not None:
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

    def _apply_mapped_tax(self, qb_txn, local_obj, *, sales_lines=None, line_items=None):
        mapping_service = self._get_mapping_service()
        from .tax_sync_helpers import apply_transaction_tax

        apply_transaction_tax(
            self,
            qb_txn,
            local_obj,
            mapping_service=mapping_service,
            sales_lines=sales_lines,
            line_items=line_items,
        )

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

    def _mirror_po_qbo_bill_mapping(self, purchase_order, qb_bill):
        """Keep PO mapping aligned with the vendor bill's QBO Bill (inbound pull + UI)."""
        if not purchase_order or not qb_bill or not getattr(qb_bill, 'Id', None):
            return
        QBOMapping.objects.update_or_create(
            content_type=ContentType.objects.get_for_model(purchase_order),
            object_id=purchase_order.id,
            defaults={
                'qbo_id': str(qb_bill.Id),
                'qbo_sync_token': getattr(qb_bill, 'SyncToken', '') or '',
                'status': 'synced',
                'error_message': '',
            },
        )

    def _resolve_vendor_bill_qbo_bill(self, local_bill, *, doc_number):
        """
        Load the QBO Bill for a vendor bill.

        PO-linked bills reuse the Bill already created from an earlier PO push
        (DocNumber = po_number) instead of creating a second QBO Bill.
        """
        from apps.inventory.models import PurchaseOrder

        client = self.get_client()
        purchase_order = getattr(local_bill, 'purchase_order', None)

        if purchase_order:
            po_mapping = QBOMapping.objects.filter(
                content_type=ContentType.objects.get_for_model(PurchaseOrder),
                object_id=purchase_order.id,
            ).exclude(qbo_id='').first()
            if po_mapping:
                try:
                    return QBBill.get(int(po_mapping.qbo_id), qb=client), None
                except Exception as exc:
                    logger.warning(
                        'Could not load QBO Bill %s from PO %s mapping: %s',
                        po_mapping.qbo_id,
                        purchase_order.po_number,
                        exc,
                    )

        qb_bill, _is_new, load_error = self._load_qbo_entity(
            QBBill,
            local_bill,
            doc_number=doc_number,
        )
        if not load_error or not purchase_order:
            return qb_bill, load_error

        from .entity_resolver import find_by_doc_number

        found = find_by_doc_number(QBBill, client, purchase_order.po_number)
        if found and getattr(found, 'Id', None):
            self._mirror_po_qbo_bill_mapping(purchase_order, found)
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_bill),
                object_id=local_bill.id,
                defaults={
                    'qbo_id': str(found.Id),
                    'qbo_sync_token': getattr(found, 'SyncToken', '') or '',
                    'status': 'synced',
                    'error_message': '',
                },
            )
            return found, None

        return qb_bill, load_error

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
        qb_bill=None,
    ):
        """Create or update a QBO Bill for a PO or vendor bill."""
        client = self.get_client()
        if qb_bill is None:
            qb_bill, _is_new, load_error = self._load_qbo_entity(
                QBBill,
                local_obj,
                doc_number=doc_number,
            )
            if load_error:
                self._fail_qbo_mapping(local_obj, load_error)
                raise ValueError(load_error)

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
        purchase_order = getattr(local_obj, 'purchase_order', None)
        if purchase_order is not None:
            self._mirror_po_qbo_bill_mapping(purchase_order, qb_bill)
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
        
        qb_invoice, is_new_qbo, load_error = self._load_qbo_entity(
            QBInvoice,
            local_invoice,
            doc_number=local_invoice.invoice_number,
        )
        if load_error:
            logger.error('QBO Invoice load failed for %s: %s', local_invoice.invoice_number, load_error)
            self._fail_qbo_mapping(local_invoice, load_error)
            return None
                
        # Map Header Fields
        qb_invoice.CustomerRef = Ref()
        qb_invoice.CustomerRef.value = qb_customer.Id
        
        qb_invoice.DocNumber = local_invoice.invoice_number
        invoice_lines = list(local_invoice.line_items.select_related('part').all())
        from .item_sync import effective_sales_txn_date

        qbo_txn_date = effective_sales_txn_date(
            self,
            invoice_lines,
            local_invoice.invoice_date,
        )
        qb_invoice.TxnDate = qbo_txn_date.isoformat()
        if local_invoice.due_date:
            qb_invoice.DueDate = local_invoice.due_date.isoformat()
            
        if local_invoice.notes:
            qb_invoice.PrivateNote = local_invoice.notes
            
        self._apply_department_ref(qb_invoice, local_invoice.branch)

        qb_invoice.Line = self._build_sales_item_lines(
            invoice_lines,
            txn_date=qbo_txn_date,
        )
        self._apply_mapped_tax(
            qb_invoice,
            local_invoice,
            sales_lines=qb_invoice.Line,
            line_items=invoice_lines,
        )

        from .invoice_status_sync_helpers import apply_invoice_communication_status
        from .tax_sync_helpers import finalize_sales_transaction_for_qbo, uses_us_line_tax_codes

        apply_invoice_communication_status(
            qb_invoice,
            local_invoice,
            us_company=uses_us_line_tax_codes(self),
        )

        finalize_sales_transaction_for_qbo(self, qb_invoice)

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
            from .attachment_sync import sync_invoice_attachment
            if is_new_qbo:
                sync_invoice_attachment(self, local_invoice, str(qb_invoice.Id))
            return qb_invoice
        except Exception as e:
            from .item_sync import _is_inv_start_before_txn_error, effective_sales_txn_date

            if _is_inv_start_before_txn_error(e):
                invoice_lines = local_invoice.line_items.select_related('part').all()
                qbo_txn_date = effective_sales_txn_date(
                    self,
                    invoice_lines,
                    local_invoice.invoice_date,
                )
                qb_invoice.TxnDate = qbo_txn_date.isoformat()
                qb_invoice.Line = self._build_sales_item_lines(
                    invoice_lines,
                    txn_date=qbo_txn_date,
                )
                try:
                    self._save_qb(qb_invoice, client)
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
                    from .attachment_sync import sync_invoice_attachment
                    if is_new_qbo:
                        sync_invoice_attachment(self, local_invoice, str(qb_invoice.Id))
                    return qb_invoice
                except Exception as retry_exc:
                    logger.error('QBO Invoice Sync retry failed: %s', retry_exc)
                    QBOMapping.objects.update_or_create(
                        content_type=ContentType.objects.get_for_model(local_invoice),
                        object_id=local_invoice.id,
                        defaults={'status': 'failed', 'error_message': str(retry_exc)}
                    )
                    return None
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

        qb_estimate, is_new_qbo, load_error = self._load_qbo_entity(
            QBEstimate,
            local_estimate,
            doc_number=local_estimate.estimate_number,
        )
        if load_error:
            self._update_qbo_mapping(local_estimate, None, error=load_error)
            return None

        qb_estimate.CustomerRef = Ref()
        qb_estimate.CustomerRef.value = qb_customer.Id
        qb_estimate.DocNumber = local_estimate.estimate_number
        estimate_lines = list(local_estimate.line_items.select_related('part').all())
        from .item_sync import effective_sales_txn_date

        qbo_txn_date = effective_sales_txn_date(
            self,
            estimate_lines,
            local_estimate.estimate_date,
        )
        qb_estimate.TxnDate = qbo_txn_date.isoformat()
        if local_estimate.valid_until:
            qb_estimate.ExpirationDate = local_estimate.valid_until.isoformat()
        if local_estimate.notes:
            qb_estimate.PrivateNote = local_estimate.notes
        if local_estimate.customer_notes:
            from .invoice_status_sync_helpers import set_qbo_customer_memo

            set_qbo_customer_memo(qb_estimate, local_estimate.customer_notes)

        self._apply_department_ref(qb_estimate, local_estimate.branch)
        qb_estimate.Line = self._build_sales_item_lines(
            estimate_lines,
            txn_date=qbo_txn_date,
        )
        self._apply_mapped_tax(
            qb_estimate,
            local_estimate,
            sales_lines=qb_estimate.Line,
            line_items=estimate_lines,
        )
        self._apply_estimate_txn_status(qb_estimate, local_estimate)

        from .tax_sync_helpers import finalize_sales_transaction_for_qbo

        finalize_sales_transaction_for_qbo(self, qb_estimate)

        try:
            self._save_qb(qb_estimate, client)
            self._update_qbo_mapping(local_estimate, qb_estimate)
            from .attachment_sync import sync_estimate_attachment
            if is_new_qbo:
                sync_estimate_attachment(self, local_estimate, str(qb_estimate.Id))
            return qb_estimate
        except Exception as exc:
            from .item_sync import _is_inv_start_before_txn_error, effective_sales_txn_date

            if _is_inv_start_before_txn_error(exc):
                estimate_lines = local_estimate.line_items.select_related('part').all()
                qbo_txn_date = effective_sales_txn_date(
                    self,
                    estimate_lines,
                    local_estimate.estimate_date,
                )
                qb_estimate.TxnDate = qbo_txn_date.isoformat()
                qb_estimate.Line = self._build_sales_item_lines(
                    estimate_lines,
                    txn_date=qbo_txn_date,
                )
                try:
                    self._save_qb(qb_estimate, client)
                    self._update_qbo_mapping(local_estimate, qb_estimate)
                    from .attachment_sync import sync_estimate_attachment
                    if is_new_qbo:
                        sync_estimate_attachment(self, local_estimate, str(qb_estimate.Id))
                    return qb_estimate
                except Exception as retry_exc:
                    logger.error('QBO Estimate Sync retry failed: %s', retry_exc)
                    self._update_qbo_mapping(local_estimate, None, error=str(retry_exc))
                    return None
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

        qb_credit_memo, _is_new, load_error = self._load_qbo_entity(
            QBCreditMemo,
            local_credit_note,
            doc_number=local_credit_note.credit_note_number,
        )
        if load_error:
            self._update_qbo_mapping(local_credit_note, None, error=load_error)
            return None

        qb_credit_memo.CustomerRef = Ref()
        qb_credit_memo.CustomerRef.value = qb_customer.Id
        qb_credit_memo.DocNumber = local_credit_note.credit_note_number
        credit_lines = list(local_credit_note.line_items.all())
        from .item_sync import effective_sales_txn_date

        qbo_txn_date = effective_sales_txn_date(
            self,
            credit_lines,
            local_credit_note.credit_date,
        )
        qb_credit_memo.TxnDate = qbo_txn_date.isoformat()
        if local_credit_note.reason:
            qb_credit_memo.PrivateNote = local_credit_note.reason
        if local_credit_note.notes:
            from .invoice_status_sync_helpers import set_qbo_customer_memo

            set_qbo_customer_memo(qb_credit_memo, local_credit_note.notes)

        self._apply_department_ref(qb_credit_memo, local_credit_note.branch)

        qb_credit_memo.Line = self._build_sales_item_lines(
            credit_lines,
            default_item_type='other',
            txn_date=qbo_txn_date,
        )

        self._apply_mapped_tax(
            qb_credit_memo,
            local_credit_note,
            sales_lines=qb_credit_memo.Line,
            line_items=credit_lines,
        )

        from .tax_sync_helpers import finalize_sales_transaction_for_qbo

        finalize_sales_transaction_for_qbo(self, qb_credit_memo)

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
            from .item_sync import _is_inv_start_before_txn_error, effective_sales_txn_date

            if _is_inv_start_before_txn_error(exc):
                credit_lines = local_credit_note.line_items.all()
                qbo_txn_date = effective_sales_txn_date(
                    self,
                    credit_lines,
                    local_credit_note.credit_date,
                )
                qb_credit_memo.TxnDate = qbo_txn_date.isoformat()
                qb_credit_memo.Line = self._build_sales_item_lines(
                    credit_lines,
                    default_item_type='other',
                    txn_date=qbo_txn_date,
                )
                try:
                    self._save_qb(qb_credit_memo, client)
                    self._update_qbo_mapping(local_credit_note, qb_credit_memo)
                    return qb_credit_memo
                except Exception as retry_exc:
                    logger.error('QBO Credit Memo Sync retry failed: %s', retry_exc)
                    self._update_qbo_mapping(local_credit_note, None, error=str(retry_exc))
                    return None
            logger.error('QBO Credit Memo Sync Error: %s', exc)
            self._update_qbo_mapping(local_credit_note, None, error=str(exc))
            return None

    def sync_payment(self, local_payment):
        """
        Sync a local Payment to QBO with explicit invoice linking or deposit handling.
        """
        from .payment_helpers import (
            PaymentSyncError,
            build_qbo_payment_lines,
            payment_private_note,
        )

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

        qb_customer = self.sync_customer(local_payment.customer)
        if not qb_customer:
            logger.error(
                'Cannot sync payment %s: Customer sync failed.',
                local_payment.payment_number,
            )
            return None

        qb_payment, _is_new, load_error = self._load_qbo_entity(
            QBPayment,
            local_payment,
            allow_create=True,
        )
        if load_error:
            self._fail_qbo_mapping(local_payment, load_error)
            return None

        qb_payment.CustomerRef = Ref()
        qb_payment.CustomerRef.value = qb_customer.Id
        qb_payment.TotalAmt = float(local_payment.amount)
        qb_payment.TxnDate = local_payment.payment_date.date().isoformat()

        if local_payment.reference_number:
            qb_payment.PaymentRefNum = local_payment.reference_number

        note = payment_private_note(local_payment)
        if note:
            qb_payment.PrivateNote = note

        try:
            from .mapping_services import get_account_mapping_service
            deposit_account_id = get_account_mapping_service().resolve_payment_deposit_account_id(local_payment)
            if deposit_account_id and Ref is not None:
                qb_payment.DepositToAccountRef = Ref()
                qb_payment.DepositToAccountRef.value = deposit_account_id
        except Exception as mapping_error:
            logger.debug('Could not resolve QBO deposit account for payment: %s', mapping_error)

        try:
            qb_payment.Line = build_qbo_payment_lines(
                self,
                local_payment,
                PaymentLine=PaymentLine,
                LinkedTxn=LinkedTxn,
            )
        except PaymentSyncError as exc:
            logger.error('QBO payment %s blocked: %s', local_payment.payment_number, exc)
            QBOMapping.objects.update_or_create(
                content_type=ContentType.objects.get_for_model(local_payment),
                object_id=local_payment.id,
                defaults={'status': 'failed', 'error_message': str(exc)},
            )
            return None

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

    def sync_part(self, local_part):
        """Sync SVR Part catalog row to QBO Item (NonInventory; SVR owns stock)."""
        from .item_sync import sync_part as _sync_part
        return _sync_part(self, local_part)

    def pull_items(self, triggered_by=None):
        """Pull Item name/SKU/active metadata for mapped parts (no quantities)."""
        from .item_sync import pull_items_metadata
        return pull_items_metadata(self, triggered_by=triggered_by)

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
            
        display_name = f"{local_supplier.name} ({local_supplier.supplier_code})"
        qb_vendor, _is_new, load_error = self._load_qbo_entity(
            QBVendor,
            local_supplier,
            display_name=display_name,
        )
        if load_error:
            self._fail_qbo_mapping(local_supplier, load_error)
            return None
                
        qb_vendor.DisplayName = display_name
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
        Delegate PO-linked AP to the vendor bill.

        POs are not pushed as standalone QBO bills. If a vendor bill exists for
        this PO, sync that bill (one QBO Bill for the procurement flow).
        """
        from apps.billing.models import Bill

        linked_bill = (
            Bill.objects.filter(purchase_order=local_po)
            .exclude(status='void')
            .order_by('-id')
            .first()
        )
        if linked_bill:
            return self.sync_vendor_bill(linked_bill)

        logger.info(
            'Skipping QBO sync for PO %s — create the vendor bill from this PO to push AP to QuickBooks.',
            local_po.po_number,
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

        notes = (local_bill.notes or '').strip()
        if local_bill.purchase_order_id:
            po_line = f'SVR PO: {local_bill.purchase_order.po_number}'
            notes = f'{notes}\n{po_line}'.strip() if notes else po_line

        try:
            qb_bill, load_error = self._resolve_vendor_bill_qbo_bill(
                local_bill,
                doc_number=local_bill.bill_number,
            )
            if load_error:
                self._fail_qbo_mapping(local_bill, load_error)
                return None

            return self._sync_qbo_bill_document(
                local_bill,
                qb_vendor=qb_vendor,
                doc_number=local_bill.bill_number,
                txn_date=local_bill.bill_date,
                due_date=local_bill.due_date,
                notes=notes or None,
                branch=local_bill.branch,
                line_items=local_bill.line_items.all(),
                inventory_relation='inventory_item',
                qb_bill=qb_bill,
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

        qb_vendor_credit, _is_new, load_error = self._load_qbo_entity(
            QBVendorCredit,
            local_vendor_credit,
            doc_number=local_vendor_credit.credit_number,
        )
        if load_error:
            self._update_qbo_mapping(local_vendor_credit, None, error=load_error)
            return None

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
                        from .sync_context import suppress_outbound_qbo_signals

                        # Build a unique supplier_code from the vendor name
                        base_code = slugify(vendor.DisplayName or vendor.CompanyName or f"QBO-{vendor.Id}")[:45].upper().replace('-', '')
                        supplier_code = base_code[:50]
                        counter = 1
                        while Supplier.objects.filter(supplier_code=supplier_code).exists():
                            suffix = str(counter)
                            supplier_code = f"{base_code[:50 - len(suffix)]}{suffix}"
                            counter += 1

                        with suppress_outbound_qbo_signals():
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

                    from .invoice_sync_helpers import should_apply_qbo_payment_pull

                    if local_invoice.amount_paid != qbo_paid:
                        if should_apply_qbo_payment_pull(
                            local_invoice,
                            qbo_total=qbo_total,
                            qbo_paid=qbo_paid,
                            qbo_balance=qbo_balance,
                        ):
                            local_invoice.amount_paid = qbo_paid
                            local_invoice.amount_due = qbo_balance
                            updated = True
                            logger.info(
                                'Updated payment amounts from QBO for invoice %s '
                                '(paid=%s due=%s)',
                                local_invoice.invoice_number,
                                qbo_paid,
                                qbo_balance,
                            )
                        else:
                            logger.debug(
                                'Conflict resolved (local wins): Invoice %s '
                                'local_paid=%s qbo_paid=%s',
                                local_invoice.invoice_number,
                                local_invoice.amount_paid,
                                qbo_paid,
                            )

                    # Update status if QBO shows as fully paid and totals align
                    from .invoice_sync_helpers import invoice_totals_aligned

                    if (
                        qbo_balance == 0
                        and local_invoice.status not in ('paid', 'void', 'refunded')
                        and invoice_totals_aligned(local_invoice.total, qbo_total)
                    ):
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
