from django.test import TestCase
from rest_framework.test import APIClient
from django.utils import timezone
from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder
from apps.roadside.models import RoadsideRequest
from apps.documents.models import Document, DocumentCategory
from apps.accounting.models import Account, JournalEntry, Transaction
from apps.accounting.services import ReportingService
from apps.gatepass.models import GatePass
from apps.hr.models import Department
from apps.fixed_assets.models import AssetCategory, FixedAsset
from apps.subscriptions.models import Package

from tests.rbac_test_utils import enable_system_modules


class BranchEnforcementTests(TestCase):
    def setUp(self):
        call_command('init_permissions', verbosity=0)
        enable_system_modules()
        self.client = APIClient()
        
        self.superuser = User.objects.create_superuser(
            username="admin",
            email="admin@example.com", 
            password="password123",
            first_name="Admin",
            last_name="User"
        )
        
        # Create branches
        self.branch_a = Branch.objects.create(name="Branch A", code="BRA", is_active=True, created_by=self.superuser)
        self.branch_b = Branch.objects.create(name="Branch B", code="BRB", is_active=True, created_by=self.superuser)
        
        # Create users
        self.user_a = User.objects.create_user(
            username="manager_a",
            email="manager_a@example.com", 
            password="password123", 
            first_name="Manager", 
            last_name="A",
            role="manager"
        )
        self.user_a.managed_branches.add(self.branch_a)
        
        self.user_b = User.objects.create_user(
            username="manager_b",
            email="manager_b@example.com", 
            password="password123", 
            first_name="Manager", 
            last_name="B",
            role="manager"
        )
        self.user_b.managed_branches.add(self.branch_b)
        
        # Create Customer and Vehicle for Roadside/WorkOrders
        self.customer = Customer.objects.create(
            user=User.objects.create_user(username="cust_0", email="cust0@ex.com", first_name="Cust", last_name="0"),
            customer_number="C000"
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin="VIN1234567890",
            make="Toyota",
            model="Camry",
            year=2020,
            license_plate="ABC-123",
            current_mileage=10000
        )

    def test_roadside_filtering(self):
        # Create Roadside Requests
        req_a = RoadsideRequest.objects.create(
            branch=self.branch_a,
            customer=self.customer,
            vehicle=self.vehicle,
            service_type='towing',
            status='requested',
            breakdown_location="Loc A",
            description="Issue A",
            request_number="RR-A"
        )
        req_b = RoadsideRequest.objects.create(
            branch=self.branch_b,
            customer=self.customer,
            vehicle=self.vehicle,
            service_type='towing',
            status='requested',
            breakdown_location="Loc B",
            description="Issue B",
            request_number="RR-B"
        )
        
        # Test User A (Branch A)
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/roadside/requests/')
        self.assertEqual(response.status_code, 200)
        results = response.data['results'] if 'results' in response.data else response.data
        ids = [r['id'] for r in results]
        self.assertIn(req_a.id, ids)
        self.assertNotIn(req_b.id, ids)
        
        # Test User B (Branch B)
        self.client.force_authenticate(user=self.user_b)
        response = self.client.get('/api/roadside/requests/')
        self.assertEqual(response.status_code, 200)
        results = response.data['results'] if 'results' in response.data else response.data
        ids = [r['id'] for r in results]
        self.assertNotIn(req_a.id, ids)
        self.assertIn(req_b.id, ids)

    def test_document_hybrid_filtering(self):
        # Setup Customer (Global)
        customer = Customer.objects.create(
            user=User.objects.create_user(username="cust_x", email="cust@ex.com", first_name="Cust", last_name="X"),
            customer_number="C001"
        )
        
        # Create vehicle for customer X
        vehicle_x = Vehicle.objects.create(
            owner=customer,
            vin="VINX",
            make="Ford",
            model="Focus",
            year=2019,
            license_plate="XYZ-987",
            current_mileage=5000
        )

        # Setup WOs
        wo_a = WorkOrder.objects.create(
            customer=customer,
            vehicle=vehicle_x,
            branch=self.branch_a,
            status='draft',
            work_order_number="WO-A",
            odometer_in=5000
        )
        wo_b = WorkOrder.objects.create(
            customer=customer,
            vehicle=vehicle_x,
            branch=self.branch_b,
            status='draft',
            work_order_number="WO-B",
            odometer_in=5000
        )
        
        # Create Documents
        category = DocumentCategory.objects.create(name="General")
        pdf_content = b"%PDF-1.4..."
        
        file_obj_a = SimpleUploadedFile("doc_a.pdf", pdf_content, content_type="application/pdf")
        doc_a = Document.objects.create(
            file=file_obj_a,
            title="Doc A",
            category=category,
            uploaded_by=self.user_a,
            work_order=wo_a
        )
        
        file_obj_b = SimpleUploadedFile("doc_b.pdf", pdf_content, content_type="application/pdf")
        doc_b = Document.objects.create(
            file=file_obj_b,
            title="Doc B",
            category=category,
            uploaded_by=self.user_b,
            work_order=wo_b
        )
        
        file_obj_c = SimpleUploadedFile("doc_c.pdf", pdf_content, content_type="application/pdf")
        doc_c_global = Document.objects.create(
            file=file_obj_c,
            title="Doc Global",
            category=category,
            customer=customer,
            uploaded_by=self.user_a
        )
        
        # Test User A
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/documents/documents/')
        self.assertEqual(response.status_code, 200)
        # Handle both paginated and non-paginated responses
        if isinstance(response.data, dict) and 'results' in response.data:
            results = response.data['results']
        elif isinstance(response.data, list):
            results = response.data
        else:
            results = []
        titles = [r['title'] for r in results]
        self.assertIn("Doc A", titles)
        self.assertIn("Doc Global", titles)
        self.assertNotIn("Doc B", titles)
        
        # Test User B
        self.client.force_authenticate(user=self.user_b)
        response = self.client.get('/api/documents/documents/')
        self.assertEqual(response.status_code, 200)
        # Handle both paginated and non-paginated responses
        if isinstance(response.data, dict) and 'results' in response.data:
            results = response.data['results']
        elif isinstance(response.data, list):
            results = response.data
        else:
            results = []
        titles = [r['title'] for r in results]
        self.assertIn("Doc B", titles)
        self.assertIn("Doc Global", titles)
        self.assertNotIn("Doc A", titles)

    def test_reporting_service_filtering(self):
        # Setup Accounts
        income_acc = Account.objects.create(code="4000", name="Sales", account_type="income", balance_type="credit")
        
        # Create JE for Branch A
        je_a = JournalEntry.objects.create(
            date=timezone.now().date(),
            branch=self.branch_a,
            description="Sales A",
            posted=True,
            created_by=self.user_a
        )
        Transaction.objects.create(journal_entry=je_a, account=income_acc, amount=Decimal("100.00"), transaction_type="credit")
        
        # Create JE for Branch B
        je_b = JournalEntry.objects.create(
            date=timezone.now().date(),
            branch=self.branch_b,
            description="Sales B",
            posted=True,
            created_by=self.user_b
        )
        Transaction.objects.create(journal_entry=je_b, account=income_acc, amount=Decimal("200.00"), transaction_type="credit")
        
        # Test ReportingService directly
        # Total
        total_bal = ReportingService.get_account_balance(income_acc, branch_id=None)
        self.assertEqual(total_bal, Decimal("300.00"))
        
        # Branch A
        bal_a = ReportingService.get_account_balance(income_acc, branch_id=self.branch_a.id)
        self.assertEqual(bal_a, Decimal("100.00"))
        
        # Branch B
        bal_b = ReportingService.get_account_balance(income_acc, branch_id=self.branch_b.id)
        self.assertEqual(bal_b, Decimal("200.00"))

    def test_mobile_dashboard_filtering(self):
        # Create WOs
        WorkOrder.objects.create(
            branch=self.branch_a, 
            status='in_progress', 
            work_order_number="MO-A",
            customer=self.customer,
            vehicle=self.vehicle,
            odometer_in=10000
        )
        WorkOrder.objects.create(
            branch=self.branch_b, 
            status='in_progress', 
            work_order_number="MO-B",
            customer=self.customer,
            vehicle=self.vehicle,
            odometer_in=12000
        )
        
        # Test User A - use force_login for regular Django view
        self.client.force_login(self.user_a)
        response = self.client.get('/mobile/dashboard/', {'force_mobile': '1'})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Branch A")
        self.assertNotContains(response, "Branch B")
        
        # Test User B
        self.client.force_login(self.user_b)
        response = self.client.get('/mobile/dashboard/', {'force_mobile': '1'})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Branch B")
        self.assertNotContains(response, "Branch A")

    def _closed_work_order(self, branch, number):
        return WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=branch,
            status='closed',
            work_order_number=number,
            odometer_in=10000,
        )

    def test_gatepass_branch_filtering(self):
        wo_a = self._closed_work_order(self.branch_a, 'WO-GP-A')
        wo_b = self._closed_work_order(self.branch_b, 'WO-GP-B')

        gp_a = GatePass.objects.create(
            work_order=wo_a,
            branch=self.branch_a,
            vehicle=self.vehicle,
            customer=self.customer,
            issued_by=self.superuser,
            picked_up_by_customer=True,
        )
        gp_b = GatePass.objects.create(
            work_order=wo_b,
            branch=self.branch_b,
            vehicle=self.vehicle,
            customer=self.customer,
            issued_by=self.superuser,
            picked_up_by_customer=True,
        )

        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/gatepass/gate-passes/')
        self.assertEqual(response.status_code, 200)
        ids = [item['id'] for item in response.data['results']]
        self.assertIn(gp_a.id, ids)
        self.assertNotIn(gp_b.id, ids)

        self.client.force_authenticate(user=self.user_b)
        response = self.client.get('/api/gatepass/gate-passes/')
        ids = [item['id'] for item in response.data['results']]
        self.assertIn(gp_b.id, ids)
        self.assertNotIn(gp_a.id, ids)

    def test_hr_department_branch_filtering(self):
        dept_a = Department.objects.create(name='Workshop A', branch=self.branch_a)
        dept_b = Department.objects.create(name='Workshop B', branch=self.branch_b)

        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/hr/departments/')
        self.assertEqual(response.status_code, 200)
        names = [item['name'] for item in response.data['results']]
        self.assertIn(dept_a.name, names)
        self.assertNotIn(dept_b.name, names)

        self.client.force_authenticate(user=self.user_b)
        response = self.client.get('/api/hr/departments/')
        names = [item['name'] for item in response.data['results']]
        self.assertIn(dept_b.name, names)
        self.assertNotIn(dept_a.name, names)

    def test_fixed_assets_branch_filtering(self):
        category, _ = AssetCategory.objects.get_or_create(
            name='Branch Matrix Equipment',
            defaults={'default_useful_life_years': 5},
        )
        asset_a = FixedAsset.objects.create(
            asset_number='FA-BRA-001',
            name='Lift A',
            category=category,
            branch=self.branch_a,
            acquisition_cost=Decimal('1000.00'),
            acquisition_date=timezone.now().date(),
            useful_life_years=5,
            depreciation_start_date=timezone.now().date(),
        )
        asset_b = FixedAsset.objects.create(
            asset_number='FA-BRB-001',
            name='Lift B',
            category=category,
            branch=self.branch_b,
            acquisition_cost=Decimal('1000.00'),
            acquisition_date=timezone.now().date(),
            useful_life_years=5,
            depreciation_start_date=timezone.now().date(),
        )

        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/fixed-assets/assets/')
        self.assertEqual(response.status_code, 200)
        numbers = [item['asset_number'] for item in response.data['results']]
        self.assertIn(asset_a.asset_number, numbers)
        self.assertNotIn(asset_b.asset_number, numbers)

        self.client.force_authenticate(user=self.user_b)
        response = self.client.get('/api/fixed-assets/assets/')
        numbers = [item['asset_number'] for item in response.data['results']]
        self.assertIn(asset_b.asset_number, numbers)
        self.assertNotIn(asset_a.asset_number, numbers)

    def test_subscriptions_packages_are_org_wide(self):
        Package.objects.create(
            name='Branch Matrix Lite',
            code='BMLITE',
            price=Decimal('99.00'),
            duration_months=12,
            is_active=True,
            created_by=self.superuser,
        )

        self.client.force_authenticate(user=self.user_a)
        response_a = self.client.get('/api/subscriptions/packages/')
        self.assertEqual(response_a.status_code, 200)

        self.client.force_authenticate(user=self.user_b)
        response_b = self.client.get('/api/subscriptions/packages/')
        self.assertEqual(response_b.status_code, 200)

        codes_a = {item['code'] for item in response_a.data['results']}
        codes_b = {item['code'] for item in response_b.data['results']}
        self.assertIn('BMLITE', codes_a)
        self.assertIn('BMLITE', codes_b)

