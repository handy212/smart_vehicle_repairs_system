import pytest
from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.permission_models import Permission, Role
from apps.appointments.models import Appointment
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle

pytestmark = pytest.mark.django_db

User = get_user_model()


@pytest.fixture
def technician_user():
    view_own, _ = Permission.objects.update_or_create(
        code="view_own_appointments",
        defaults={"name": "View Own Appointments", "category": "appointments", "is_active": True},
    )
    role, _ = Role.objects.update_or_create(
        code="technician",
        defaults={"name": "Technician", "is_active": True},
    )
    role.permissions.add(view_own)
    user = User.objects.create_user(
        username="tech_schedule",
        email="tech_schedule@example.com",
        password="password123",
        role="technician",
    )
    return user


@pytest.fixture
def appointment_for_technician(technician_user):
    admin_user = User.objects.create_user(
        username="branch_admin_sched",
        email="branch_admin_sched@example.com",
        password="password123",
        role="admin",
        is_staff=True,
    )
    branch = Branch.objects.create(
        name="Schedule Test Branch",
        code="STB",
        phone="0244000000",
        address="123 Schedule St",
        city="Accra",
        region="Greater Accra",
        zip_code="00233",
        country="Ghana",
        is_active=True,
        is_headquarters=True,
        created_by=admin_user,
    )
    technician_user.branch = branch
    technician_user.save(update_fields=["branch"])

    customer_user = User.objects.create_user(
        username="cust_sched",
        email="cust_sched@example.com",
        password="password123",
        role="customer",
    )
    customer = Customer.objects.create(user=customer_user, customer_number="CUST-SCHED-1")
    vehicle = Vehicle.objects.create(
        owner=customer,
        make="Toyota",
        model="Camry",
        year=2020,
        vin="1HGBH41JXMN109186",
        license_plate="SCHED-001",
        current_mileage=12000,
    )
    appt = Appointment.objects.create(
        customer=customer,
        vehicle=vehicle,
        appointment_date=date.today(),
        appointment_time=time(9, 0),
        branch=branch,
        service_type="maintenance",
        status="confirmed",
        estimated_duration=60,
        customer_concerns="Oil change",
    )
    appt.assigned_technicians.add(technician_user)
    return appt


def test_my_schedule_returns_own_appointments(technician_user, appointment_for_technician):
    client = APIClient()
    client.force_authenticate(user=technician_user)

    response = client.get("/api/appointments/appointments/my_schedule/")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["technician_id"] == technician_user.id
    assert len(response.data["appointments"]) == 1
    assert response.data["appointments"][0]["id"] == appointment_for_technician.id


def test_my_schedule_denied_for_other_technician_id(technician_user, appointment_for_technician):
    other = User.objects.create_user(
        username="other_tech",
        email="other_tech@example.com",
        password="password123",
        role="technician",
    )
    client = APIClient()
    client.force_authenticate(user=technician_user)

    response = client.get(
        "/api/appointments/appointments/technician_schedule/",
        {"technician_id": other.id, "date": date.today().isoformat()},
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_list_allows_view_own_appointments(technician_user, appointment_for_technician):
    """Technicians with only view_own_appointments can list (scoped to assigned)."""
    other_tech = User.objects.create_user(
        username="other_tech_list",
        email="other_tech_list@example.com",
        password="password123",
        role="technician",
        branch=technician_user.branch,
    )
    other_appt = Appointment.objects.create(
        customer=appointment_for_technician.customer,
        vehicle=appointment_for_technician.vehicle,
        appointment_date=date.today() + timedelta(days=1),
        appointment_time=time(11, 0),
        branch=appointment_for_technician.branch,
        service_type="maintenance",
        status="confirmed",
        estimated_duration=60,
        customer_concerns="Other tech job",
    )
    other_appt.assigned_technicians.add(other_tech)

    client = APIClient()
    client.force_authenticate(user=technician_user)

    response = client.get("/api/appointments/appointments/?page=1")

    assert response.status_code == status.HTTP_200_OK
    ids = [row["id"] for row in response.data["results"]]
    assert appointment_for_technician.id in ids
    assert other_appt.id not in ids
