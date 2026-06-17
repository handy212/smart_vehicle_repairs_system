from datetime import date, time
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.hr.models import (
    Applicant,
    Attendance,
    AttendancePolicy,
    Department,
    EmployeeProfile,
    EmployeeSalaryComponent,
    JobOpening,
    LeaveBalance,
    LeaveRequest,
    LeaveType,
    PayrollPeriod,
    PaySlip,
    PayrollAuditLog,
    Position,
    SalaryComponent,
    TaxRule,
)
from apps.hr.services import PayrollService, TaxService
from apps.hr.serializers import EmployeeProfileSerializer
from apps.technicians.models import Technician
from apps.technicians.serializers import TechnicianSerializer


@pytest.fixture
def branch(db):
    creator = User.objects.create_user(
        username="branch_creator",
        email="branch_creator@example.com",
        password="password",
        role="admin",
    )
    return Branch.objects.create(name="Main Branch", code="MAIN", created_by=creator)


@pytest.fixture
def admin_user(db, branch):
    user = User.objects.create_user(
        username="admin",
        email="admin@example.com",
        password="password",
        role="admin",
        first_name="Admin",
        last_name="User",
        branch=branch,
    )
    return user


@pytest.fixture
def employee(db, branch):
    user = User.objects.create_user(
        username="tech",
        email="tech@example.com",
        password="password",
        role="technician",
        first_name="Tech",
        last_name="User",
        branch=branch,
    )
    profile = user.employee_profile
    profile.employment_status = "active"
    profile.base_salary = Decimal("1000.00")
    profile.save(update_fields=["employment_status", "base_salary", "updated_at"])
    return profile


@pytest.mark.django_db
def test_tax_service_applies_progressive_rules_and_excess_amount():
    TaxRule.objects.create(
        name="Base",
        min_income=Decimal("0.00"),
        max_income=Decimal("1000.00"),
        rate=Decimal("10.00"),
    )
    TaxRule.objects.create(
        name="Top",
        min_income=Decimal("1000.00"),
        max_income=None,
        rate=Decimal("20.00"),
        excess_amount=Decimal("5.00"),
    )

    assert TaxService.calculate_tax(Decimal("1500.00")) == Decimal("205.00")


@pytest.mark.django_db
@patch("apps.hr.statutory_contributions.StatutoryContributionService._auto_enabled", return_value=False)
def test_payroll_uses_percentage_components_and_taxable_allowances(mock_auto_ssnit, employee, branch):
    TaxRule.objects.create(
        name="Flat",
        min_income=Decimal("0.00"),
        max_income=None,
        rate=Decimal("10.00"),
    )
    taxable = SalaryComponent.objects.create(
        name="Taxable Allowance",
        component_type="allowance",
        calculation_type="percentage",
        percentage=Decimal("10.00"),
        is_taxable=True,
    )
    non_taxable = SalaryComponent.objects.create(
        name="Non Taxable Allowance",
        component_type="allowance",
        calculation_type="fixed",
        amount=Decimal("50.00"),
        is_taxable=False,
    )
    deduction = SalaryComponent.objects.create(
        name="Union",
        component_type="deduction",
        calculation_type="fixed",
        amount=Decimal("25.00"),
    )
    EmployeeSalaryComponent.objects.create(employee=employee, component=taxable)
    EmployeeSalaryComponent.objects.create(employee=employee, component=non_taxable)
    EmployeeSalaryComponent.objects.create(employee=employee, component=deduction)
    period = PayrollPeriod.objects.create(
        name="May 2026",
        start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 31),
        branch=branch,
        created_by=employee.user,
    )

    assert PayrollService.process_period(period, [employee]) == 1
    slip = period.payslips.get()

    assert slip.allowances["Taxable Allowance"] == "100.00"
    assert slip.allowances["Non Taxable Allowance"] == "50.00"
    assert slip.gross_pay == Decimal("1150.00")
    assert slip.tax_amount == Decimal("110.00")
    assert slip.net_pay == Decimal("1015.00")


@pytest.mark.django_db
def test_leave_approval_blocks_insufficient_balance(api_client, admin_user, employee):
    leave_type = LeaveType.objects.create(name="Annual", days_allowed=5)
    LeaveBalance.objects.create(
        employee=employee,
        leave_type=leave_type,
        year=2026,
        total_days=Decimal("5.0"),
        used_days=Decimal("4.0"),
    )
    leave = LeaveRequest.objects.create(
        employee=employee,
        leave_type=leave_type,
        start_date=date(2026, 5, 4),
        end_date=date(2026, 5, 5),
        days_count=Decimal("2.0"),
        reason="Family",
    )
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(reverse("api_hr:leave-request-approve", args=[leave.id]))

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    leave.refresh_from_db()
    assert leave.status == "pending"


@pytest.mark.django_db
def test_leave_request_serializer_blocks_overlap(api_client, employee):
    leave_type = LeaveType.objects.create(name="Annual", days_allowed=20)
    LeaveRequest.objects.create(
        employee=employee,
        leave_type=leave_type,
        start_date=date(2026, 5, 4),
        end_date=date(2026, 5, 6),
        days_count=Decimal("3.0"),
        reason="Existing",
    )
    api_client.force_authenticate(user=employee.user)

    response = api_client.post(
        reverse("api_hr:leave-request-list"),
        {
            "leave_type": leave_type.id,
            "start_date": "2026-05-05",
            "end_date": "2026-05-07",
            "reason": "Overlap",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_leave_request_defaults_to_business_days(api_client, employee):
    leave_type = LeaveType.objects.create(name="Annual", days_allowed=20)
    api_client.force_authenticate(user=employee.user)

    response = api_client.post(
        reverse("api_hr:leave-request-list"),
        {
            "leave_type": leave_type.id,
            "start_date": "2026-05-01",
            "end_date": "2026-05-04",
            "reason": "Long weekend",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert Decimal(str(response.data["days_count"])) == Decimal("2.0")


@pytest.mark.django_db
def test_attendance_rejects_invalid_clock_order(employee, branch):
    with pytest.raises(ValidationError):
        Attendance.objects.create(
            employee=employee,
            branch=branch,
            date=date(2026, 5, 3),
            clock_in=timezone.make_aware(timezone.datetime(2026, 5, 3, 17, 0)),
            clock_out=timezone.make_aware(timezone.datetime(2026, 5, 3, 8, 0)),
        )


@pytest.mark.django_db
def test_attendance_calculates_overtime_from_default_policy(employee, branch):
    AttendancePolicy.objects.create(
        name="Standard",
        branch=branch,
        work_start_time=time(8, 0),
        work_end_time=time(16, 0),
        is_default=True,
    )

    attendance = Attendance.objects.create(
        employee=employee,
        branch=branch,
        date=date(2026, 5, 4),
        clock_in=timezone.make_aware(timezone.datetime(2026, 5, 4, 8, 0)),
        clock_out=timezone.make_aware(timezone.datetime(2026, 5, 4, 18, 0)),
    )

    assert attendance.total_hours == Decimal("10.0")
    assert attendance.overtime_hours == Decimal("2.00")


@pytest.mark.django_db
def test_hr_manager_branch_access_includes_assigned_branch(branch):
    user = User.objects.create_user(
        username="hr",
        email="hr@example.com",
        password="password",
        role="hr_manager",
        branch=branch,
    )

    assert list(user.get_accessible_branches()) == [branch]
    assert user.has_branch_access(branch)


@pytest.mark.django_db
def test_role_change_to_technician_creates_staff_and_technician_profiles(branch):
    user = User.objects.create_user(
        username="counter",
        email="counter@example.com",
        password="password",
        role="customer",
        first_name="Counter",
        last_name="Person",
    )

    user.role = "technician"
    user.branch = branch
    user.save()

    assert EmployeeProfile.objects.filter(user=user).exists()
    assert Technician.objects.filter(user=user).exists()


@pytest.mark.django_db
def test_technician_serializer_creates_linked_user_staff_and_technician(branch):
    serializer = TechnicianSerializer(data={
        "email": "linked.tech@example.com",
        "first_name": "Linked",
        "last_name": "Tech",
        "password": "StrongPass123",
        "branch": branch.id,
        "employee_id": "TECH-100",
        "hire_date": "2026-05-08",
        "hourly_rate": "45.50",
        "years_of_experience": 4,
    })

    assert serializer.is_valid(), serializer.errors
    technician = serializer.save()

    user = technician.user
    profile = user.employee_profile
    assert user.role == "technician"
    assert user.branch == branch
    assert user.employee_id == "TECH-100"
    assert user.is_staff is True
    assert profile.start_date == date(2026, 5, 8)
    assert profile.salary_type == "hourly"
    assert profile.base_salary == Decimal("45.50")


@pytest.mark.django_db
def test_staff_employment_status_controls_user_login(employee):
    serializer = EmployeeProfileSerializer(
        employee,
        data={"employment_status": "suspended"},
        partial=True,
    )

    assert serializer.is_valid(), serializer.errors
    serializer.save()
    employee.user.refresh_from_db()
    assert employee.user.is_active is False


@pytest.mark.django_db
def test_hiring_applicant_creates_employee_profile(api_client, admin_user, branch):
    department = Department.objects.create(name="Workshop", branch=branch)
    position = Position.objects.create(title="Mechanic", department=department)
    opening = JobOpening.objects.create(
        title="Mechanic",
        department=department,
        position=position,
        branch=branch,
        description="Repair vehicles",
        created_by=admin_user,
        status="open",
    )
    applicant = Applicant.objects.create(
        job_opening=opening,
        first_name="New",
        last_name="Hire",
        email="newhire@example.com",
        phone="5551234",
    )
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(
        reverse("api_hr:applicant-hire", args=[applicant.id]),
        {
            "password": "StrongPass123",
            "role": "technician",
            "base_salary": "1200.00",
            "start_date": "2026-05-04",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    applicant.refresh_from_db()
    profile = EmployeeProfile.objects.get(user__email="newhire@example.com")
    assert applicant.status == "hired"
    assert profile.department == department
    assert profile.position == position
    assert profile.user.branch == branch
    assert profile.base_salary == Decimal("1200.00")


@pytest.mark.django_db
@patch("apps.hr.statutory_contributions.StatutoryContributionService._auto_enabled", return_value=False)
def test_payroll_prorates_new_hire_and_deducts_unpaid_leave_and_absence(mock_auto_ssnit, employee, branch):
    employee.start_date = date(2026, 5, 18)
    employee.base_salary = Decimal("2100.00")
    employee.save(update_fields=["start_date", "base_salary", "updated_at"])
    unpaid_leave = LeaveType.objects.create(name="Unpaid", days_allowed=20, is_paid=False)
    LeaveRequest.objects.create(
        employee=employee,
        leave_type=unpaid_leave,
        start_date=date(2026, 5, 19),
        end_date=date(2026, 5, 19),
        days_count=Decimal("1.0"),
        status="approved",
    )
    Attendance.objects.create(
        employee=employee,
        branch=branch,
        date=date(2026, 5, 20),
        status="absent",
    )
    Attendance.objects.create(
        employee=employee,
        branch=branch,
        date=date(2026, 5, 21),
        status="half_day",
    )
    period = PayrollPeriod.objects.create(
        name="May 2026",
        start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 31),
        branch=branch,
        created_by=employee.user,
    )

    assert PayrollService.process_period(period, [employee]) == 1
    slip = period.payslips.get()

    assert slip.proration_factor == Decimal("0.4762")
    assert slip.basic_salary == Decimal("1000.02")
    assert slip.unpaid_leave_deduction == Decimal("100.00")
    assert slip.absence_deduction == Decimal("150.00")
    assert slip.net_pay == Decimal("750.02")


@pytest.mark.django_db
def test_payslip_numbers_are_generated(employee, branch):
    period = PayrollPeriod.objects.create(
        name="May 2026",
        start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 31),
        branch=branch,
        created_by=employee.user,
    )

    PaySlip.objects.create(payroll_period=period, employee=employee, basic_salary=Decimal("1000.00"))

    slip = period.payslips.get()
    assert slip.payslip_number.startswith("PS2026")


@pytest.mark.django_db
def test_payroll_approval_locks_payslips_and_blocks_edit(api_client, admin_user, employee, branch):
    period = PayrollPeriod.objects.create(
        name="May 2026",
        start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 31),
        branch=branch,
        created_by=admin_user,
        status="processing",
    )
    slip = PaySlip.objects.create(payroll_period=period, employee=employee, basic_salary=Decimal("1000.00"))
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(reverse("api_hr:payroll-period-approve", args=[period.id]))

    assert response.status_code == status.HTTP_200_OK
    slip.refresh_from_db()
    assert slip.status == "approved"
    assert slip.is_locked is True
    edit_response = api_client.patch(
        reverse("api_hr:payslip-detail", args=[slip.id]),
        {"basic_salary": "1200.00"},
        format="json",
    )
    assert edit_response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_payroll_mark_paid_posts_balanced_journal_and_reverse_reverses_it(api_client, admin_user, employee, branch):
    period = PayrollPeriod.objects.create(
        name="May 2026",
        start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 31),
        branch=branch,
        created_by=admin_user,
        status="approved",
        approved_by=admin_user,
        approved_at=timezone.now(),
    )
    PaySlip.objects.create(
        payroll_period=period,
        employee=employee,
        basic_salary=Decimal("1000.00"),
        unpaid_leave_deduction=Decimal("100.00"),
    )
    api_client.force_authenticate(user=admin_user)

    paid_response = api_client.post(
        reverse("api_hr:payroll-period-mark-paid", args=[period.id]),
        {
            "payment_date": "2026-05-31",
            "payment_reference": "BANK-001",
            "payment_batch_reference": "BATCH-001",
        },
        format="json",
    )

    assert paid_response.status_code == status.HTTP_200_OK
    period.refresh_from_db()
    slip = period.payslips.get()
    assert period.status == "paid"
    assert period.payment_batch_reference == "BATCH-001"
    assert slip.status == "paid"
    assert slip.is_locked is True
    assert paid_response.data["journal_entry_id"] is not None

    reverse_response = api_client.post(
        reverse("api_hr:payroll-period-reverse", args=[period.id]),
        {"reason": "Payment file rejected"},
        format="json",
    )

    assert reverse_response.status_code == status.HTTP_200_OK
    period.refresh_from_db()
    slip.refresh_from_db()
    assert period.status == "reversed"
    assert period.reversal_reason == "Payment file rejected"
    assert slip.status == "reversed"
    assert PayrollAuditLog.objects.filter(payroll_period=period, action="period_reversed").exists()
