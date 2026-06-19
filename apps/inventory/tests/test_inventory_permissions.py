import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.inventory.models import Part, PartCategory, StockItem, Transfer


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def branch(db):
    creator = User.objects.create_user(
        username="branch_admin",
        email="branch_admin@example.com",
        password="password",
        role="admin",
    )
    return Branch.objects.create(name="Main", code="MAIN", created_by=creator)


@pytest.fixture
def manager_user(db, branch):
    user = User.objects.create_user(
        username="manager_user",
        email="manager@example.com",
        password="password",
        role="manager",
        branch=branch,
    )
    user.managed_branches.add(branch)
    return user


@pytest.fixture
def technician_user(db, branch):
    user = User.objects.create_user(
        username="tech_user",
        email="tech@example.com",
        password="password",
        role="technician",
        branch=branch,
    )
    return user


@pytest.fixture
def part(db, branch):
    category = PartCategory.objects.create(name="Filters")
    part = Part.objects.create(
        name="Oil Filter",
        part_number="OF-001",
        category=category,
        cost_price=Decimal("10.00"),
        selling_price=Decimal("15.00"),
        reorder_point=2,
    )
    StockItem.objects.create(part=part, branch=branch, quantity_in_stock=5)
    return part


@pytest.mark.django_db
def test_technician_cannot_adjust_stock_without_adjust_permission(api_client, technician_user, part, branch):
    api_client.force_authenticate(user=technician_user)
    url = reverse("api_inventory:part-adjust", args=[part.id])
    response = api_client.post(url, {"quantity": 1, "reason": "Should fail"}, format="json")
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_manager_can_create_transfer_with_manage_inventory(api_client, manager_user, part, branch):
    other_branch = Branch.objects.create(name="North", code="NORTH", created_by=manager_user)
    manager_user.managed_branches.add(other_branch)
    api_client.force_authenticate(user=manager_user)

    response = api_client.post(
        reverse("api_inventory:transfer-list"),
        {
            "source_branch": branch.id,
            "destination_branch": other_branch.id,
            "notes": "Branch restock",
            "items": [{"part_id": part.id, "quantity": 1}],
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert Transfer.objects.filter(source_branch=branch, destination_branch=other_branch).exists()


@pytest.mark.django_db
def test_stock_alerts_endpoint_is_registered(api_client, manager_user, part, branch):
    from apps.inventory.models import StockAlert

    StockAlert.objects.create(
        part=part,
        branch=branch,
        alert_type="low_stock",
        severity="warning",
        status="active",
        current_quantity=Decimal("1"),
        reorder_point=Decimal("2"),
        message="Low stock",
    )
    api_client.force_authenticate(user=manager_user)

    response = api_client.get(reverse("api_inventory:stockalert-active"))

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
