from django.test import TestCase
from datetime import date
from decimal import Decimal

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.hr.serializers import EmployeeProfileSerializer
from apps.technicians.models import Technician
from apps.technicians.serializers import TechnicianSerializer

class TechniciansPlaceholderTest(TestCase):
    """Placeholder to ensure the test runner does not fail missing module tests."""
    def test_placeholder(self):
        self.assertTrue(True)


class PeopleIntegrationTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_people",
            email="admin_people@example.com",
            password="password",
            role="admin",
        )
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MAINPPL",
            created_by=self.admin,
        )

    def test_role_change_to_technician_creates_staff_and_technician_profiles(self):
        user = User.objects.create_user(
            username="counter_people",
            email="counter_people@example.com",
            password="password",
            role="customer",
            first_name="Counter",
            last_name="Person",
        )

        user.role = "technician"
        user.branch = self.branch
        user.save()

        self.assertTrue(hasattr(user, "employee_profile"))
        self.assertTrue(Technician.objects.filter(user=user).exists())

    def test_technician_serializer_creates_linked_user_staff_and_technician(self):
        serializer = TechnicianSerializer(data={
            "email": "linked.tech@example.com",
            "first_name": "Linked",
            "last_name": "Tech",
            "password": "StrongPass123",
            "branch": self.branch.id,
            "employee_id": "TECH-100",
            "hire_date": "2026-05-08",
            "hourly_rate": "45.50",
            "years_of_experience": 4,
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        technician = serializer.save()

        user = technician.user
        profile = user.employee_profile
        self.assertEqual(user.role, "technician")
        self.assertEqual(user.branch, self.branch)
        self.assertEqual(user.employee_id, "TECH-100")
        self.assertTrue(user.is_staff)
        self.assertEqual(profile.start_date, date(2026, 5, 8))
        self.assertEqual(profile.salary_type, "hourly")
        self.assertEqual(profile.base_salary, Decimal("45.50"))

    def test_staff_employment_status_controls_user_login(self):
        user = User.objects.create_user(
            username="active_tech",
            email="active_tech@example.com",
            password="password",
            role="technician",
            branch=self.branch,
        )
        serializer = EmployeeProfileSerializer(
            user.employee_profile,
            data={"employment_status": "suspended"},
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        user.refresh_from_db()
        self.assertFalse(user.is_active)
