import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from apps.billing.models import Estimate, Invoice
from apps.accounts.models import User
from apps.branches.models import Branch
from apps.customers.models import Customer
from django.utils import timezone
from decimal import Decimal

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="admin_user", 
        email="admin@example.com", 
        password="password", 
        role="admin",
        first_name="Admin",
        last_name="User"
    )

@pytest.fixture
def branch(db, user):
    branch = Branch.objects.create(name="Test Branch", code="TBR", created_by=user)
    user.managed_branches.add(branch)
    return branch

@pytest.fixture
def customer(db, branch):
    customer_user = User.objects.create_user(
        username="cust_user",
        email="cust@example.com",
        password="password",
        role="customer",
        first_name="Test",
        last_name="Customer",
        branch=branch
    )
    return Customer.objects.create(user=customer_user)

@pytest.mark.django_db
class TestBillingAPI:
    def test_estimate_actions_available(self, api_client, user, branch, customer):
        api_client.force_authenticate(user=user)
        
        # Create an estimate
        estimate = Estimate.objects.create(
            customer=customer,
            branch=branch,
            status='draft',
            total=Decimal('100.00'),
            valid_until=timezone.now().date() + timezone.timedelta(days=7),
            created_by=user
        )
        
        url = reverse('api_billing:estimate-detail', args=[estimate.id])
        
        # Test mark_viewed (BillingStatusMixin)
        response = api_client.post(f"{url}mark_viewed/")
        assert response.status_code == status.HTTP_200_OK
        
        # Test history (BillingStatusMixin)
        response = api_client.get(f"{url}history/")
        assert response.status_code == status.HTTP_200_OK
        
        # Test duplicate (EstimateActionMixin)
        response = api_client.post(f"{url}duplicate/")
        assert response.status_code == status.HTTP_201_CREATED
        assert Estimate.objects.count() == 2
        
        # Test send (BillingCommunicationMixin)
        response = api_client.post(f"{url}send/")
        assert response.status_code == status.HTTP_200_OK

        # Test approve (EstimateActionMixin)
        response = api_client.post(f"{url}approve/")
        assert response.status_code == status.HTTP_200_OK, f"Approve failed: {response.data}"
        estimate.refresh_from_db()
        assert estimate.status == 'approved'

    def test_invoice_actions_available(self, api_client, user, branch, customer):
        api_client.force_authenticate(user=user)
        
        # Create an invoice
        invoice = Invoice.objects.create(
            customer=customer,
            branch=branch,
            status='draft',
            total=Decimal('200.00'),
            amount_due=Decimal('200.00'),
            invoice_date=timezone.now().date(),
            created_by=user
        )
        
        url = reverse('api_billing:invoice-detail', args=[invoice.id])
        
        # Test stats (BillingReportMixin) - detail=False
        stats_url = reverse('api_billing:invoice-stats')
        response = api_client.get(stats_url)
        assert response.status_code == status.HTTP_200_OK
        
        # Test void (InvoiceActionMixin)
        response = api_client.post(f"{url}void/", data={'reason': 'Test void'})
        assert response.status_code == status.HTTP_200_OK
        invoice.refresh_from_db()
        assert invoice.status == 'void'
