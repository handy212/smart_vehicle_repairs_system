from django.test import TestCase, override_settings
from unittest.mock import patch, MagicMock
from django.urls import reverse
from apps.customers.models import Customer
from apps.inventory.models import Supplier, PurchaseOrder, PurchaseOrderItem, Part, PartCategory
from apps.billing.models import Invoice, InvoiceLineItem
from apps.branches.models import Branch
from apps.quickbooks_online.services import QuickBooksService
from apps.quickbooks_online.models import QBOMapping, QBOConfig, QBOToken
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from django.contrib.contenttypes.models import ContentType
from apps.accounts.models import User
from rest_framework_simplejwt.tokens import RefreshToken

class QuickBooksIntegrationTests(TestCase):
    def setUp(self):
        # Create necessary config
        self.config = QBOConfig.objects.create(
            client_id="test_id",
            client_secret="test_secret",
            realm_id="12345",
            is_active=True
        )
        self.token = QBOToken.objects.create(
            config=self.config,
            access_token="access",
            refresh_token="refresh",
            expires_at=timezone.now() + timedelta(days=1),
            refresh_token_expires_at=timezone.now() + timedelta(days=1)
        )
        
        # Create test users
        self.admin_user = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="password",
            first_name="Admin",
            last_name="User"
        )
        
        self.customer_user = User.objects.create_user(
            email="john@example.com",
            username="john_doe",
            password="password",
            first_name="John",
            last_name="Doe",
            role='customer'
        )
        
        # Create test data
        self.branch = Branch.objects.create(
            name="Main Branch", 
            code="MAIN",
            created_by=self.admin_user,
            phone="1234567890",
            address="123 Street",
            city="City",
            state="State",
            zip_code="12345"
        )
        
        self.customer = Customer.objects.create(
            user=self.customer_user,
            customer_number="CUST001"
        )
        self.supplier = Supplier.objects.create(
            name="Test Supplier",
            supplier_code="SUPP001",
            email="supp@example.com"
        )
        self.category = PartCategory.objects.create(name="Test Category")
        self.part = Part.objects.create(
            name="Test Part",
            part_number="PART001",
            selling_price=Decimal("10.00"),
            cost_price=Decimal("5.00"),
            branch=self.branch,
            category=self.category
        )

    @patch('apps.quickbooks_online.services.QuickBooks')
    @patch('apps.quickbooks_online.services.QBCustomer')
    def test_sync_customer_success(self, mock_qb_customer_class, mock_quickbooks_class):
        mock_client = MagicMock()
        mock_quickbooks_class.return_value = mock_client
        
        mock_qb_customer = MagicMock()
        mock_qb_customer.Id = "100"
        mock_qb_customer.SyncToken = "0"
        mock_qb_customer_class.return_value = mock_qb_customer
        
        service = QuickBooksService()
        result = service.sync_customer(self.customer)
        
        self.assertIsNotNone(result)
        self.assertEqual(result.Id, "100")
        
        ct = ContentType.objects.get_for_model(self.customer)
        mapping = QBOMapping.objects.get(content_type=ct, object_id=self.customer.id)
        self.assertEqual(mapping.qbo_id, "100")
        self.assertEqual(mapping.status, 'synced')

    @patch('apps.quickbooks_online.services.QuickBooks')
    @patch('apps.quickbooks_online.services.QBVendor')
    def test_sync_supplier_success(self, mock_qb_vendor_class, mock_quickbooks_class):
        mock_client = MagicMock()
        mock_quickbooks_class.return_value = mock_client
        
        mock_qb_vendor = MagicMock()
        mock_qb_vendor.Id = "200"
        mock_qb_vendor.SyncToken = "1"
        mock_qb_vendor_class.return_value = mock_qb_vendor
        
        service = QuickBooksService()
        result = service.sync_supplier(self.supplier)
        
        self.assertIsNotNone(result)
        self.assertEqual(result.Id, "200")
        
        ct = ContentType.objects.get_for_model(self.supplier)
        mapping = QBOMapping.objects.get(content_type=ct, object_id=self.supplier.id)
        self.assertEqual(mapping.qbo_id, "200")
        self.assertEqual(mapping.status, 'synced')

    @patch('apps.quickbooks_online.services.QuickBooks')
    @patch('apps.quickbooks_online.services.QBDepartment')
    def test_sync_branch_success(self, mock_qb_dept_class, mock_quickbooks_class):
        mock_client = MagicMock()
        mock_quickbooks_class.return_value = mock_client
        
        mock_qb_dept = MagicMock()
        mock_qb_dept.Id = "50"
        mock_qb_dept.SyncToken = "0"
        mock_qb_dept_class.return_value = mock_qb_dept
        
        service = QuickBooksService()
        result = service.sync_branch(self.branch)
        
        self.assertIsNotNone(result)
        self.assertEqual(result.Id, "50")
        
        ct = ContentType.objects.get_for_model(self.branch)
        mapping = QBOMapping.objects.get(content_type=ct, object_id=self.branch.id)
        self.assertEqual(mapping.qbo_id, "50")
        self.assertEqual(mapping.status, 'synced')

    @patch('apps.quickbooks_online.services.QuickBooksService.get_client')
    @patch('apps.quickbooks_online.services.QBDepartment')
    def test_list_departments_includes_branch_mappings(self, mock_qb_dept_class, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        dept_one = MagicMock()
        dept_one.Id = "10"
        dept_one.Name = "Main (MAIN)"
        dept_one.Active = True

        dept_two = MagicMock()
        dept_two.Id = "20"
        dept_two.Name = "West (WEST)"
        dept_two.Active = True

        mock_qb_dept_class.all.return_value = [dept_one, dept_two]

        branch_ct = ContentType.objects.get_for_model(self.branch)
        QBOMapping.objects.create(
            content_type=branch_ct,
            object_id=self.branch.id,
            qbo_id="10",
            qbo_sync_token="0",
            status='synced',
        )

        service = QuickBooksService()
        departments, error = service.list_departments()

        self.assertIsNone(error)
        self.assertEqual(len(departments), 2)
        self.assertEqual(departments[0]['mapped_branch']['id'], self.branch.id)
        self.assertIsNone(departments[1]['mapped_branch'])

    @patch('apps.quickbooks_online.services.QuickBooksService.get_client')
    @patch('apps.quickbooks_online.services.QBDepartment')
    def test_map_branch_to_department_success(self, mock_qb_dept_class, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        qb_department = MagicMock()
        qb_department.Id = "77"
        qb_department.SyncToken = "3"
        mock_qb_dept_class.get.return_value = qb_department

        service = QuickBooksService()
        success, error = service.map_branch_to_department(self.branch, "77")

        self.assertTrue(success)
        self.assertIsNone(error)

        branch_ct = ContentType.objects.get_for_model(self.branch)
        mapping = QBOMapping.objects.get(content_type=branch_ct, object_id=self.branch.id)
        self.assertEqual(mapping.qbo_id, "77")
        self.assertEqual(mapping.status, 'synced')

    @patch('apps.quickbooks_online.services.QuickBooksService.get_client')
    @patch('apps.quickbooks_online.services.QBDepartment')
    def test_map_branch_to_department_rejects_duplicate(self, mock_qb_dept_class, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        other_branch = Branch.objects.create(
            name="Other Branch",
            code="OTHER",
            created_by=self.admin_user,
            phone="1234567890",
            address="123 Street",
            city="City",
            state="State",
            zip_code="12345",
        )

        branch_ct = ContentType.objects.get_for_model(other_branch)
        QBOMapping.objects.create(
            content_type=branch_ct,
            object_id=other_branch.id,
            qbo_id="77",
            qbo_sync_token="0",
            status='synced',
        )

        service = QuickBooksService()
        success, error = service.map_branch_to_department(self.branch, "77")

        self.assertFalse(success)
        self.assertIn('already mapped', error)

    def test_clear_branch_qbo_mapping(self):
        branch_ct = ContentType.objects.get_for_model(self.branch)
        QBOMapping.objects.create(
            content_type=branch_ct,
            object_id=self.branch.id,
            qbo_id="88",
            qbo_sync_token="0",
            status='synced',
        )

        service = QuickBooksService()
        cleared = service.clear_branch_qbo_mapping(self.branch)

        self.assertTrue(cleared)
        self.assertFalse(
            QBOMapping.objects.filter(content_type=branch_ct, object_id=self.branch.id).exists()
        )

    @patch('apps.quickbooks_online.services.QuickBooksService.sync_customer')
    @patch('apps.quickbooks_online.services.QuickBooks')
    @patch('apps.quickbooks_online.services.QBInvoice')
    def test_sync_invoice_detailed_lines(self, mock_qb_invoice_class, mock_quickbooks_class, mock_sync_customer):
        mock_client = MagicMock()
        mock_quickbooks_class.return_value = mock_client
        
        mock_qb_customer = MagicMock()
        mock_qb_customer.Id = "100"
        mock_sync_customer.return_value = mock_qb_customer
        
        mock_qb_invoice = MagicMock()
        mock_qb_invoice.Id = "300"
        mock_qb_invoice.SyncToken = "2"
        mock_qb_invoice_class.return_value = mock_qb_invoice
        
        # Create Invoice
        invoice = Invoice.objects.create(
            customer=self.customer,
            invoice_number="INV001",
            invoice_date=timezone.now().date(),
            total=Decimal("20.00"),
            branch=self.branch,
            created_by=self.admin_user
        )
        InvoiceLineItem.objects.create(
            invoice=invoice,
            item_type='part',
            description="Part Item",
            quantity=1,
            unit_price=Decimal("10.00"),
            total=Decimal("10.00")
        )
        InvoiceLineItem.objects.create(
            invoice=invoice,
            item_type='labor',
            description="Labor Item",
            quantity=1,
            unit_price=Decimal("10.00"),
            total=Decimal("10.00")
        )
        
        service = QuickBooksService()
        # Mock sync_branch to avoid complex mocking nested deeper
        with patch.object(QuickBooksService, 'sync_branch', return_value=MagicMock(Id="50")):
            result = service.sync_invoice(invoice)
        
        self.assertIsNotNone(result)
        # Verify detailed lines
        self.assertEqual(len(mock_qb_invoice.Line), 2)
        # Filter for SalesItemLineDetail lines
        sales_lines = [l for l in mock_qb_invoice.Line if hasattr(l, 'SalesItemLineDetail')]
        self.assertEqual(len(sales_lines), 2)
        
        ct = ContentType.objects.get_for_model(invoice)
        mapping = QBOMapping.objects.get(content_type=ct, object_id=invoice.id)
        self.assertEqual(mapping.status, 'synced')
        # Verify DepartmentRef (Branch)
        self.assertEqual(mock_qb_invoice.DepartmentRef.value, "50")

    @patch('apps.quickbooks_online.services.QuickBooksService.sync_supplier')
    @patch('apps.quickbooks_online.services.QuickBooks')
    @patch('apps.quickbooks_online.services.QBBill')
    def test_sync_purchase_order_success(self, mock_qb_bill_class, mock_quickbooks_class, mock_sync_supplier):
        mock_client = MagicMock()
        mock_quickbooks_class.return_value = mock_client
        
        mock_qb_vendor = MagicMock()
        mock_qb_vendor.Id = "200"
        mock_sync_supplier.return_value = mock_qb_vendor
        
        mock_qb_bill = MagicMock()
        mock_qb_bill.Id = "400"
        mock_qb_bill.SyncToken = "3"
        mock_qb_bill_class.return_value = mock_qb_bill
        
        # Create Purchase Order
        po = PurchaseOrder.objects.create(
            supplier=self.supplier,
            po_number="PO001",
            order_date=timezone.now().date(),
            total=Decimal("50.00"),
            branch=self.branch,
            created_by=self.admin_user
        )
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            part=self.part,
            quantity=5,
            unit_cost=Decimal("10.00"),
            total=Decimal("50.00")
        )
        
        service = QuickBooksService()
        with patch.object(QuickBooksService, 'sync_branch', return_value=MagicMock(Id="50")):
            result = service.sync_purchase_order(po)
        
        self.assertIsNotNone(result)
        self.assertEqual(len(mock_qb_bill.Line), 1)
        
        ct = ContentType.objects.get_for_model(po)
        mapping = QBOMapping.objects.get(content_type=ct, object_id=po.id)
        self.assertEqual(mapping.qbo_id, "400")
        self.assertEqual(mapping.status, 'synced')
        # Verify DepartmentRef (Branch)
        self.assertEqual(mock_qb_bill.DepartmentRef.value, "50")

    @patch('apps.quickbooks_online.services.QuickBooksService.get_client', return_value=None)
    def test_sync_failure_no_client(self, mock_get_client):
        """Test that failure is recorded when QBO client cannot be retrieved."""
        service = QuickBooksService()
        
        result = service.sync_supplier(self.supplier)
        self.assertIsNone(result)
        
        ct = ContentType.objects.get_for_model(self.supplier)
        mapping = QBOMapping.objects.get(content_type=ct, object_id=self.supplier.id)
        self.assertEqual(mapping.status, 'failed')
        self.assertIn("QuickBooks not connected", mapping.error_message)

    @patch('apps.quickbooks_online.services.QuickBooks')
    @patch('apps.quickbooks_online.services.QBVendor')
    def test_sync_exception_handling(self, mock_qb_vendor_class, mock_quickbooks_class):
        """Test that exceptions during save are caught and recorded."""
        mock_client = MagicMock()
        mock_quickbooks_class.return_value = mock_client
        
        mock_qb_vendor = MagicMock()
        mock_qb_vendor.save.side_effect = Exception("API Error")
        mock_qb_vendor_class.return_value = mock_qb_vendor
        
        service = QuickBooksService()
        result = service.sync_supplier(self.supplier)
        
        self.assertIsNone(result)
        
        ct = ContentType.objects.get_for_model(self.supplier)
        mapping = QBOMapping.objects.get(content_type=ct, object_id=self.supplier.id)
        self.assertEqual(mapping.status, 'failed')
        self.assertEqual(mapping.error_message, "API Error")

    @patch('apps.quickbooks_online.services.QuickBooks')
    @patch('apps.quickbooks_online.services.QBVendor')
    def test_pull_vendors_success(self, mock_qb_vendor_class, mock_quickbooks_class):
        """Test pulling vendors from QBO create local suppliers."""
        mock_client = MagicMock()
        mock_quickbooks_class.return_value = mock_client
        
        # Mock two vendors from QBO
        v1 = MagicMock()
        v1.Id = "1001"
        v1.DisplayName = "New QBO Vendor"
        v1.CompanyName = "New QBO Co"
        v1.SyncToken = "0"
        v1.PrimaryEmailAddr = MagicMock(Address="new@example.com")
        v1.PrimaryPhone = MagicMock(FreeFormNumber="111222")
        
        v2 = MagicMock()
        v2.Id = "200" # This matches an existing ID we'll map below
        v2.DisplayName = "Existing Vendor"
        v2.SyncToken = "5"
        
        mock_qb_vendor_class.all.return_value = [v1, v2]
        
        # Map v2 to our local supplier
        ct = ContentType.objects.get_for_model(self.supplier)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=self.supplier.id,
            qbo_id="200",
            status='synced'
        )
        
        service = QuickBooksService()
        log = service.pull_vendors()
        
        self.assertEqual(log.status, 'success')
        self.assertEqual(log.records_pulled, 2)
        self.assertEqual(log.records_created, 1) # v1 created
        self.assertEqual(log.records_updated, 1) # v2 updated mapping
        
        # Verify v1 supplier exists
        new_supplier = Supplier.objects.get(name="New QBO Co")
        self.assertEqual(new_supplier.email, "new@example.com")

    @patch('apps.quickbooks_online.services.QuickBooks')
    @patch('apps.quickbooks_online.services.QBInvoice')
    def test_pull_invoices_status_update(self, mock_qb_invoice_class, mock_quickbooks_class):
        """Test pulling invoices from QBO updates local invoice status."""
        mock_client = MagicMock()
        mock_quickbooks_class.return_value = mock_client
        
        # Create local invoice
        invoice = Invoice.objects.create(
            customer=self.customer,
            invoice_number="INV-PULL",
            invoice_date=timezone.now().date(),
            total=Decimal("100.00"),
            amount_paid=Decimal("0.00"),
            amount_due=Decimal("100.00"),
            status='sent',
            branch=self.branch,
            created_by=self.admin_user
        )
        
        ct = ContentType.objects.get_for_model(invoice)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=invoice.id,
            qbo_id="5000",
            status='synced'
        )
        
        # Mock QBO Invoice showing it's paid (Balance = 0)
        qb_inv = MagicMock()
        qb_inv.Id = "5000"
        qb_inv.Balance = 0
        qb_inv.TotalAmt = 100.00
        qb_inv.SyncToken = "10"
        
        mock_qb_invoice_class.all.return_value = [qb_inv]
        
        service = QuickBooksService()
        log = service.pull_invoices()
        
        self.assertEqual(log.status, 'success')
        self.assertEqual(log.records_updated, 1)
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, 'paid')
        self.assertEqual(invoice.amount_paid, Decimal("100.00"))
        self.assertEqual(invoice.amount_due, Decimal("0.00"))

    @patch('apps.quickbooks_online.services.QuickBooks')
    @patch('apps.quickbooks_online.services.QBBill')
    def test_pull_bills_status_update(self, mock_qb_bill_class, mock_quickbooks_class):
        """Test pulling bills from QBO updates local PO status."""
        mock_client = MagicMock()
        mock_quickbooks_class.return_value = mock_client
        
        # Create local PO
        po = PurchaseOrder.objects.create(
            supplier=self.supplier,
            po_number="PO-PULL",
            order_date=timezone.now().date(),
            total=Decimal("200.00"),
            status='ordered',
            branch=self.branch,
            created_by=self.admin_user
        )
        
        ct = ContentType.objects.get_for_model(po)
        QBOMapping.objects.create(
            content_type=ct,
            object_id=po.id,
            qbo_id="6000",
            status='synced'
        )
        
        # Mock QBO Bill showing it's paid (Balance = 0)
        qb_bill = MagicMock()
        qb_bill.Id = "6000"
        qb_bill.Balance = 0
        qb_bill.SyncToken = "20"
        
        mock_qb_bill_class.all.return_value = [qb_bill]
        
        service = QuickBooksService()
        log = service.pull_bills()
        
        self.assertEqual(log.status, 'success')
        self.assertEqual(log.records_updated, 1)
        
        po.refresh_from_db()
        self.assertEqual(po.status, 'received')


@override_settings(FRONTEND_BASE_URL="http://frontend.test")
class QuickBooksAuthFlowTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            email="admin-flow@example.com",
            username="adminflow",
            password="password",
            first_name="Admin",
            last_name="Flow",
        )
        self.config = QBOConfig.objects.create(
            client_id="test-client-id",
            client_secret="test-client-secret",
            realm_id="realm-123",
            is_active=True,
        )
        self.token = QBOToken.objects.create(
            config=self.config,
            access_token="access",
            refresh_token="refresh",
            expires_at=timezone.now() + timedelta(days=1),
            refresh_token_expires_at=timezone.now() + timedelta(days=1),
        )

    @patch("apps.quickbooks_online.views.QuickBooksService.get_auth_client")
    @patch("apps.quickbooks_online.views.QuickBooksService.get_config")
    def test_connect_view_accepts_access_token_cookie(self, mock_get_config, mock_get_auth_client):
        config = MagicMock(client_id="client-id", client_secret="client-secret")
        mock_get_config.return_value = config

        auth_client = MagicMock()
        auth_client.state_token = "state-123"
        auth_client.get_authorization_url.return_value = "https://example.intuit.test/oauth"
        mock_get_auth_client.return_value = auth_client

        access_token = str(RefreshToken.for_user(self.admin_user).access_token)
        self.client.cookies["access_token"] = access_token

        response = self.client.get(reverse("quickbooks_online:connect"))

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "https://example.intuit.test/oauth")
        self.assertEqual(self.client.session["qbo_state"], "state-123")

    @patch("apps.quickbooks_online.views.QuickBooksService.get_auth_client")
    @patch("apps.quickbooks_online.views.QuickBooksService.get_config")
    def test_callback_rejects_state_mismatch(self, mock_get_config, mock_get_auth_client):
        config = MagicMock(client_id="client-id", client_secret="client-secret")
        mock_get_config.return_value = config
        mock_get_auth_client.return_value = MagicMock()

        self.client.force_login(self.admin_user)
        session = self.client.session
        session["qbo_state"] = "expected-state"
        session.save()

        response = self.client.get(
            reverse("quickbooks_online:callback"),
            {"state": "wrong-state", "code": "auth-code", "realmId": "realm-123"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertIn("qbo_status=invalid_state", response.url)
        mock_get_auth_client.return_value.get_bearer_token.assert_not_called()

    @patch("apps.quickbooks_online.views.QuickBooksService.get_auth_client")
    @patch("apps.quickbooks_online.views.QuickBooksService.get_config")
    def test_callback_clears_state_after_success(self, mock_get_config, mock_get_auth_client):
        config = QBOConfig.objects.get(pk=self.config.pk)
        mock_get_config.return_value = config

        auth_client = MagicMock()
        auth_client.access_token = "new-access"
        auth_client.refresh_token = "new-refresh"
        auth_client.expires_in = 3600
        auth_client.x_refresh_token_expires_in = 8640000
        mock_get_auth_client.return_value = auth_client

        self.client.force_login(self.admin_user)
        session = self.client.session
        session["qbo_state"] = "valid-state"
        session.save()

        response = self.client.get(
            reverse("quickbooks_online:callback"),
            {"state": "valid-state", "code": "auth-code", "realmId": "realm-456"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertIn("qbo_status=connected", response.url)
        self.assertNotIn("qbo_state", self.client.session)

    def test_unauthenticated_connect_redirects_to_frontend_login(self):
        response = self.client.get(reverse("quickbooks_online:connect"))

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response.url,
            "http://frontend.test/login?next=%2Fadmin%2Fintegrations%3Fcategory%3Daccounting",
        )

    def test_status_view_returns_json_401_for_api_requests(self):
        response = self.client.get(
            reverse("quickbooks_online:status"),
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["login_url"], "http://frontend.test/login?next=%2Fadmin%2Fintegrations%3Fcategory%3Daccounting")

    def test_status_view_accessible_to_authenticated_non_superuser(self):
        staff_user = User.objects.create_user(
            email="staff@example.com",
            username="staff",
            password="password",
            first_name="Staff",
            last_name="User",
            role="technician",
        )
        access_token = str(RefreshToken.for_user(staff_user).access_token)
        self.client.cookies["access_token"] = access_token

        response = self.client.get(
            reverse("quickbooks_online:status"),
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("is_connected", response.json())
        self.assertTrue(response.json()["is_connected"])

    def test_status_view_not_connected_without_token(self):
        self.token.delete()
        access_token = str(RefreshToken.for_user(self.admin_user).access_token)
        self.client.cookies["access_token"] = access_token

        response = self.client.get(
            reverse("quickbooks_online:status"),
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_connected"])

    def test_disconnect_redirects_to_frontend_when_not_json(self):
        self.client.force_login(self.admin_user)

        response = self.client.post(reverse("quickbooks_online:disconnect"))

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response.url,
            "http://frontend.test/admin/integrations?category=accounting&qbo_status=disconnected",
        )

    @patch("apps.quickbooks_online.views.task_full_inbound_sync.delay")
    def test_sync_inbound_returns_json_for_api_requests(self, mock_delay):
        self.client.force_login(self.admin_user)

        response = self.client.post(
            reverse("quickbooks_online:sync_inbound"),
            HTTP_ACCEPT="application/json, text/plain, */*",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        self.assertTrue(response.json()["queued"])
        mock_delay.assert_called_once_with(triggered_by_id=self.admin_user.id)

    @patch("apps.quickbooks_online.views.task_full_inbound_sync")
    def test_sync_inbound_falls_back_to_inline_execution(self, mock_task):
        self.client.force_login(self.admin_user)
        mock_task.delay.side_effect = Exception("broker unavailable")

        response = self.client.post(
            reverse("quickbooks_online:sync_inbound"),
            HTTP_ACCEPT="application/json, text/plain, */*",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        self.assertFalse(response.json()["queued"])
        mock_task.assert_called_once_with(triggered_by_id=self.admin_user.id)
