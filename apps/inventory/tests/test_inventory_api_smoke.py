import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from decimal import Decimal
from django.utils import timezone
from apps.inventory.models import Part, PartCategory, StockAlert, StockItem, InventoryTransaction
from apps.inventory.models import Supplier
from apps.inventory.services import InventoryService
from apps.accounts.models import User
from apps.branches.models import Branch

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

@pytest.mark.django_db
class TestInventoryAPI:
    @pytest.fixture
    def setup_data(self, user, branch):
        category = PartCategory.objects.create(name="Test Category")
        part = Part.objects.create(
            name="Test Part",
            part_number="TP-001",
            category=category,
            cost_price=Decimal("50.00"),
            selling_price=Decimal("80.00"),
            reorder_point=5,
            created_by=user
        )
        # Create stock item for the branch
        stock_item = StockItem.objects.create(
            part=part,
            branch=branch,
            quantity_in_stock=10,
            quantity_reserved=0
        )
        return category, part, stock_item

    def test_part_list_and_detail(self, api_client, user, setup_data):
        api_client.force_authenticate(user=user)
        category, part, stock_item = setup_data
        
        url = reverse('api_inventory:part-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        
        url = reverse('api_inventory:part-detail', args=[part.id])
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        # Check annotated stock fields (mapped to model field names in serializer)
        assert 'quantity_in_stock' in response.data
        assert response.data['quantity_in_stock'] == 10

    def test_inventory_stats(self, api_client, user, setup_data):
        api_client.force_authenticate(user=user)
        
        url = reverse('api_inventory:part-dashboard-stats')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert 'total_parts' in response.data
        assert 'total_value' in response.data
        # total_value = 10 * 50 = 500
        assert float(response.data['total_value']) == 500.0

    def test_stock_adjust(self, api_client, user, setup_data):
        api_client.force_authenticate(user=user)
        category, part, stock_item = setup_data
        
        url = reverse('api_inventory:part-adjust', args=[part.id])
        data = {
            "quantity": 5,
            "reason": "Restock",
            "notes": "Added some more items"
        }
        response = api_client.post(url, data)
        assert response.status_code == status.HTTP_200_OK
        
        stock_item.refresh_from_db()
        assert stock_item.quantity_in_stock == 15
        
        # Verify transaction record
        assert InventoryTransaction.objects.filter(part=part, transaction_type='adjustment').count() == 1

    def test_stock_adjust_cannot_make_branch_stock_negative(self, api_client, user, setup_data):
        api_client.force_authenticate(user=user)
        category, part, stock_item = setup_data

        url = reverse('api_inventory:part-adjust', args=[part.id])
        response = api_client.post(url, {"quantity": -11, "reason": "Bad count"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        stock_item.refresh_from_db()
        assert stock_item.quantity_in_stock == 10

    def test_stock_reserve_and_release(self, api_client, user, setup_data):
        api_client.force_authenticate(user=user)
        category, part, stock_item = setup_data
        
        # Reserve
        url = reverse('api_inventory:part-reserve', args=[part.id])
        response = api_client.post(url, {"quantity": 3, "reason": "Work order reservation"})
        assert response.status_code == status.HTTP_200_OK
        
        stock_item.refresh_from_db()
        assert stock_item.quantity_reserved == 3
        assert stock_item.available_quantity == 7
        
        # Release
        url = reverse('api_inventory:part-release-reservation', args=[part.id])
        response = api_client.post(url, {"quantity": 1, "reason": "Partial release"})
        assert response.status_code == status.HTTP_200_OK
        
        stock_item.refresh_from_db()
        assert stock_item.quantity_reserved == 2
        assert stock_item.available_quantity == 8

    def test_release_cannot_exceed_reserved_quantity(self, api_client, user, setup_data):
        api_client.force_authenticate(user=user)
        category, part, stock_item = setup_data

        url = reverse('api_inventory:part-release-reservation', args=[part.id])
        response = api_client.post(url, {"quantity": 1, "reason": "Nothing reserved"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_outbound_transaction_is_logged_as_negative(self, user, setup_data, branch):
        category, part, stock_item = setup_data

        transaction = InventoryService.record_transaction(
            part=part,
            quantity=2,
            transaction_type='sale',
            user=user,
            branch=branch,
            reason='Issued to work order',
        )

        stock_item.refresh_from_db()
        assert stock_item.quantity_in_stock == 8
        assert transaction.quantity == -2

    def test_low_stock_filtering(self, api_client, user, setup_data, branch):
        api_client.force_authenticate(user=user)
        category, part, stock_item = setup_data
        
        # Add another part with low stock
        low_part = Part.objects.create(
            name="Low Stock Part",
            part_number="LOW-001",
            category=category,
            cost_price=Decimal("10.00"),
            selling_price=Decimal("20.00"),
            reorder_point=10,
            created_by=user
        )
        StockItem.objects.create(part=low_part, branch=branch, quantity_in_stock=5)
        
        url = reverse('api_inventory:part-low-stock')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        
        # Check that we have results
        data = response.data
        if 'results' in data:
            results = data['results']
        else:
            results = data
            
        part_ids = [p['id'] for p in results]
        assert low_part.id in part_ids
        assert part.id not in part_ids

    def test_stock_alerts_use_active_status(self, user, setup_data, branch):
        category, part, stock_item = setup_data
        stock_item.quantity_in_stock = 0
        stock_item.save(update_fields=['quantity_in_stock'])

        alerts = InventoryService.check_and_create_stock_alerts(part=part, branch=branch)

        assert len(alerts) == 1
        alert = StockAlert.objects.get(part=part, branch=branch)
        assert alert.status == 'active'
        assert alert.alert_type == 'out_of_stock'
        assert alert.severity == 'critical'

    def test_inventory_accounting_report_uses_branch_stock(self, api_client, user, setup_data):
        api_client.force_authenticate(user=user)

        url = reverse('api_inventory:part-inventory-accounting-report')
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['inventory_summary']['total_quantity'] == 10

    def test_supplier_crud(self, api_client, user):
        api_client.force_authenticate(user=user)

        response = api_client.post(reverse('api_inventory:supplier-list'), {
            'name': 'Acme Parts',
            'supplier_code': 'ACME',
            'supplier_type': 'distributor',
            'email': 'parts@example.com',
            'is_active': True,
            'is_preferred': False,
        })
        assert response.status_code == status.HTTP_201_CREATED
        supplier_id = response.data['id']

        response = api_client.get(reverse('api_inventory:supplier-detail', kwargs={'pk': supplier_id}))
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Acme Parts'

        response = api_client.patch(
            reverse('api_inventory:supplier-detail', kwargs={'pk': supplier_id}),
            {'is_preferred': True, 'contact_person': 'Pat Buyer'},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_preferred'] is True
        assert response.data['contact_person'] == 'Pat Buyer'

        response = api_client.delete(reverse('api_inventory:supplier-detail', kwargs={'pk': supplier_id}))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Supplier.objects.filter(id=supplier_id).exists()
