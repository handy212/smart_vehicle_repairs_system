"""
HR Management Models for Smart Vehicle Repairs System
Covers: Employee Profiles, Departments, Positions, Leave Management,
        Attendance & Time Tracking, Payroll, Recruitment, Performance, Compliance
"""
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator, MaxValueValidator
from datetime import timedelta
from decimal import Decimal, InvalidOperation


# =============================================================================
# Department & Position
# =============================================================================

class Department(models.Model):
    """Organizational department (e.g., Workshop, Admin, Sales)"""
    name = models.CharField(_('department name'), max_length=100)
    description = models.TextField(_('description'), blank=True)
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='departments',
        verbose_name=_('branch'),
    )
    head = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='headed_departments',
        verbose_name=_('department head'),
    )
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('department')
        verbose_name_plural = _('departments')
        ordering = ['name']
        unique_together = ['name', 'branch']

    def __str__(self):
        return f"{self.name} ({self.branch.name})"

    @property
    def active_staff_count(self):
        """Property for use when queryset is not annotated"""
        return self.employee_profiles.filter(employment_status='active').count()


class Position(models.Model):
    """Job position / title within a department"""
    title = models.CharField(_('position title'), max_length=150)
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='positions',
        verbose_name=_('department'),
    )
    description = models.TextField(_('description'), blank=True)
    min_salary = models.DecimalField(
        _('minimum salary'), max_digits=12, decimal_places=2,
        null=True, blank=True,
    )
    max_salary = models.DecimalField(
        _('maximum salary'), max_digits=12, decimal_places=2,
        null=True, blank=True,
    )
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('position')
        verbose_name_plural = _('positions')
        ordering = ['title']

    def __str__(self):
        return f"{self.title} - {self.department.name}"


# =============================================================================
# Employee Profile
# =============================================================================

class EmployeeProfile(models.Model):
    """Extended employee profile linked to the User model"""

    EMPLOYMENT_TYPE_CHOICES = [
        ('full_time', 'Full Time'),
        ('part_time', 'Part Time'),
        ('contract', 'Contract'),
        ('intern', 'Intern'),
    ]

    EMPLOYMENT_STATUS_CHOICES = [
        ('active', 'Active'),
        ('probation', 'Probation'),
        ('suspended', 'Suspended'),
        ('terminated', 'Terminated'),
        ('resigned', 'Resigned'),
    ]

    SALARY_TYPE_CHOICES = [
        ('hourly', 'Hourly'),
        ('monthly', 'Monthly'),
        ('annual', 'Annual'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='employee_profile',
        verbose_name=_('user'),
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employee_profiles',
        verbose_name=_('department'),
    )
    position = models.ForeignKey(
        Position,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees',
        verbose_name=_('position'),
    )
    employment_type = models.CharField(
        _('employment type'),
        max_length=20,
        choices=EMPLOYMENT_TYPE_CHOICES,
        default='full_time',
    )
    employment_status = models.CharField(
        _('employment status'),
        max_length=20,
        choices=EMPLOYMENT_STATUS_CHOICES,
        default='active',
    )
    start_date = models.DateField(_('start date'), null=True, blank=True)
    end_date = models.DateField(_('end date'), null=True, blank=True)
    reporting_to = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='direct_reports',
        verbose_name=_('reporting to'),
    )

    # Compensation
    salary_type = models.CharField(
        _('salary type'),
        max_length=20,
        choices=SALARY_TYPE_CHOICES,
        default='monthly',
    )
    base_salary = models.DecimalField(
        _('base salary'), max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
    )

    # Banking
    bank_name = models.CharField(_('bank name'), max_length=150, blank=True)
    bank_account_number = models.CharField(
        _('bank account number'), max_length=50, blank=True,
    )
    bank_branch = models.CharField(_('bank branch'), max_length=150, blank=True)

    # Emergency contact
    emergency_contact_name = models.CharField(
        _('emergency contact name'), max_length=150, blank=True,
    )
    emergency_contact_phone = models.CharField(
        _('emergency contact phone'), max_length=20, blank=True,
    )
    emergency_contact_relationship = models.CharField(
        _('emergency contact relationship'), max_length=50, blank=True,
    )

    # Government / Tax
    national_id = models.CharField(_('national ID'), max_length=50, blank=True)
    tax_id = models.CharField(_('tax ID'), max_length=50, blank=True)

    # Internal
    notes = models.TextField(_('HR notes'), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('employee profile')
        verbose_name_plural = _('employee profiles')
        ordering = ['user__first_name', 'user__last_name']
        indexes = [
            models.Index(fields=['employment_status']),
            models.Index(fields=['employment_type']),
        ]

    def __str__(self):
        return f"{self.user.get_full_name()} ({self.get_employment_status_display()})"

    @property
    def branch(self):
        """Get branch from user"""
        return self.user.branch or (self.user.managed_branches.first() if self.user.role == 'manager' else None)

    @property
    def full_name(self):
        return self.user.get_full_name()

    @property
    def is_active_employee(self):
        return self.employment_status in ('active', 'probation')


# =============================================================================
# Leave Management
# =============================================================================

class LeaveType(models.Model):
    """Types of leave (Annual, Sick, Maternity, etc.)"""
    name = models.CharField(_('leave type'), max_length=100, unique=True)
    description = models.TextField(_('description'), blank=True)
    days_allowed = models.PositiveIntegerField(
        _('days allowed per year'), default=0,
    )
    is_paid = models.BooleanField(_('paid leave'), default=True)
    carry_forward = models.BooleanField(
        _('allow carry forward'), default=False,
    )
    max_carry_forward = models.PositiveIntegerField(
        _('max carry-forward days'), default=0,
    )
    requires_document = models.BooleanField(
        _('requires supporting document'), default=False,
    )
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('leave type')
        verbose_name_plural = _('leave types')
        ordering = ['name']

    def __str__(self):
        return self.name


class LeaveBalance(models.Model):
    """Tracks leave balances per employee per year"""
    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.CASCADE,
        related_name='leave_balances',
        verbose_name=_('employee'),
    )
    leave_type = models.ForeignKey(
        LeaveType,
        on_delete=models.CASCADE,
        related_name='balances',
        verbose_name=_('leave type'),
    )
    year = models.PositiveIntegerField(_('year'))
    total_days = models.DecimalField(
        _('total days'), max_digits=5, decimal_places=1, default=0,
    )
    used_days = models.DecimalField(
        _('used days'), max_digits=5, decimal_places=1, default=0,
    )
    carried_forward = models.DecimalField(
        _('carried forward'), max_digits=5, decimal_places=1, default=0,
    )

    class Meta:
        verbose_name = _('leave balance')
        verbose_name_plural = _('leave balances')
        unique_together = ['employee', 'leave_type', 'year']
        ordering = ['year', 'leave_type__name']

    def __str__(self):
        return f"{self.employee.full_name} - {self.leave_type.name} ({self.year})"

    @property
    def remaining_days(self):
        return self.total_days + self.carried_forward - self.used_days

    @property
    def utilization_percentage(self):
        total = self.total_days + self.carried_forward
        if total == 0:
            return 0
        return round((self.used_days / total) * 100, 1)


class LeaveRequest(models.Model):
    """Employee leave requests with approval workflow"""

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    ]

    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.CASCADE,
        related_name='leave_requests',
        verbose_name=_('employee'),
    )
    leave_type = models.ForeignKey(
        LeaveType,
        on_delete=models.CASCADE,
        related_name='requests',
        verbose_name=_('leave type'),
    )
    start_date = models.DateField(_('start date'))
    end_date = models.DateField(_('end date'))
    days_count = models.DecimalField(
        _('number of days'), max_digits=5, decimal_places=1,
    )
    reason = models.TextField(_('reason'))
    status = models.CharField(
        _('status'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_leave_requests',
        verbose_name=_('reviewed by'),
    )
    reviewed_at = models.DateTimeField(_('reviewed at'), null=True, blank=True)
    reviewer_notes = models.TextField(_('reviewer notes'), blank=True)
    document = models.FileField(
        _('supporting document'),
        upload_to='hr/leave_documents/',
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('leave request')
        verbose_name_plural = _('leave requests')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'start_date']),
            models.Index(fields=['employee', 'status']),
        ]

    def __str__(self):
        return f"{self.employee.full_name} - {self.leave_type.name} ({self.start_date} to {self.end_date})"

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValidationError({'end_date': _('End date must be after start date.')})
        if self.days_count is not None and self.days_count <= 0:
            raise ValidationError({'days_count': _('Leave days must be greater than zero.')})


# =============================================================================
# Attendance & Time Tracking
# =============================================================================

class AttendancePolicy(models.Model):
    """Configurable attendance policies per branch"""
    name = models.CharField(_('policy name'), max_length=100)
    work_start_time = models.TimeField(_('work start time'))
    work_end_time = models.TimeField(_('work end time'))
    late_threshold_minutes = models.PositiveIntegerField(
        _('late threshold (minutes)'), default=15,
        help_text=_('Minutes after start time before marked as late'),
    )
    half_day_hours = models.DecimalField(
        _('half-day hours'), max_digits=4, decimal_places=2, default=4,
    )
    overtime_multiplier = models.DecimalField(
        _('overtime multiplier'), max_digits=3, decimal_places=2, default=1.5,
    )
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='attendance_policies',
        verbose_name=_('branch'),
    )
    is_default = models.BooleanField(_('default policy'), default=False)
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('attendance policy')
        verbose_name_plural = _('attendance policies')
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.branch.name})"

    def save(self, *args, **kwargs):
        # If this is set as default, unset other defaults for same branch
        if self.is_default:
            AttendancePolicy.objects.filter(
                branch=self.branch, is_default=True,
            ).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class Attendance(models.Model):
    """Daily attendance records for employees"""

    STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
        ('half_day', 'Half Day'),
        ('on_leave', 'On Leave'),
    ]

    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.CASCADE,
        related_name='attendance_records',
        verbose_name=_('employee'),
    )
    date = models.DateField(_('date'))
    clock_in = models.DateTimeField(_('clock in'), null=True, blank=True)
    clock_out = models.DateTimeField(_('clock out'), null=True, blank=True)
    break_start = models.DateTimeField(_('break start'), null=True, blank=True)
    break_end = models.DateTimeField(_('break end'), null=True, blank=True)
    total_hours = models.DecimalField(
        _('total hours'), max_digits=5, decimal_places=2,
        null=True, blank=True,
    )
    overtime_hours = models.DecimalField(
        _('overtime hours'), max_digits=5, decimal_places=2, default=0,
    )
    status = models.CharField(
        _('status'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='present',
    )
    notes = models.TextField(_('notes'), blank=True)
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='attendance_records',
        verbose_name=_('branch'),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('attendance')
        verbose_name_plural = _('attendance records')
        ordering = ['-date', 'employee__user__first_name']
        unique_together = ['employee', 'date']
        indexes = [
            models.Index(fields=['date', 'status']),
            models.Index(fields=['employee', 'date']),
        ]

    def __str__(self):
        return f"{self.employee.full_name} - {self.date} ({self.get_status_display()})"

    def calculate_total_hours(self):
        """Calculate total working hours for the day"""
        if not self.clock_in or not self.clock_out:
            return None
        if self.clock_out <= self.clock_in:
            return None
        total = self.clock_out - self.clock_in
        # Subtract break time
        if self.break_start and self.break_end:
            if self.break_end <= self.break_start:
                return None
            total -= (self.break_end - self.break_start)
        if total.total_seconds() < 0:
            return None
        return round(total.total_seconds() / 3600, 2)

    def calculate_overtime(self, policy=None):
        """Calculate overtime based on attendance policy"""
        if not self.total_hours or not policy:
            return Decimal('0')
        from datetime import datetime, time
        scheduled = datetime.combine(self.date, policy.work_end_time) - datetime.combine(self.date, policy.work_start_time)
        scheduled_hours = Decimal(str(scheduled.total_seconds() / 3600))
        if self.total_hours > scheduled_hours:
            return self.total_hours - scheduled_hours
        return Decimal('0')

    def save(self, *args, **kwargs):
        # Auto-calculate total hours on save
        if self.clock_in and self.clock_out:
            hours = self.calculate_total_hours()
            if hours is not None:
                self.total_hours = Decimal(str(hours))
                policy = AttendancePolicy.objects.filter(
                    branch=self.branch,
                    is_default=True,
                    is_active=True,
                ).first()
                if policy:
                    self.overtime_hours = self.calculate_overtime(policy)
            else:
                from django.core.exceptions import ValidationError
                raise ValidationError({'clock_out': _('Clock out must be after clock in, and breaks must be valid.')})
        super().save(*args, **kwargs)


# =============================================================================
# Payroll
# =============================================================================

class SalaryComponent(models.Model):
    """Configurable salary components (allowances, deductions)"""

    COMPONENT_TYPE_CHOICES = [
        ('allowance', 'Allowance'),
        ('deduction', 'Deduction'),
    ]

    CALCULATION_TYPE_CHOICES = [
        ('fixed', 'Fixed Amount'),
        ('percentage', 'Percentage of Basic'),
    ]

    STATUTORY_CODE_CHOICES = [
        ('', 'None'),
        ('PAYE', 'PAYE'),
        ('SSNIT_EE', 'SSNIT Employee'),
        ('SSNIT_ER', 'SSNIT Employer'),
        ('TIER2', 'Tier 2 Pension (Employee)'),
        ('TIER2_ER', 'Tier 2 Pension (Employer)'),
        ('TIER3', 'Tier 3 Pension'),
        ('NHIS', 'NHIS'),
        ('OTHER', 'Other Statutory'),
    ]

    name = models.CharField(_('component name'), max_length=100)
    component_type = models.CharField(
        _('type'), max_length=20, choices=COMPONENT_TYPE_CHOICES,
    )
    calculation_type = models.CharField(
        _('calculation type'), max_length=20, choices=CALCULATION_TYPE_CHOICES,
        default='fixed',
    )
    amount = models.DecimalField(
        _('fixed amount'), max_digits=12, decimal_places=2,
        default=0, help_text=_('Used when calculation type is Fixed'),
    )
    percentage = models.DecimalField(
        _('percentage'), max_digits=5, decimal_places=2,
        default=0, help_text=_('Used when calculation type is Percentage'),
    )
    statutory_code = models.CharField(
        _('statutory code'), max_length=20,
        choices=STATUTORY_CODE_CHOICES, blank=True, default='',
        help_text=_('Maps this component to statutory filing reports.'),
    )
    is_taxable = models.BooleanField(_('taxable'), default=True)
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('salary component')
        verbose_name_plural = _('salary components')
        ordering = ['component_type', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_component_type_display()})"

    def calculate(self, basic_salary):
        """Calculate this component's value based on the basic salary"""
        if self.calculation_type == 'fixed':
            return self.amount
        else:
            return (basic_salary * self.percentage) / 100


class TaxRule(models.Model):
    """Progressive tax bracket rules"""
    name = models.CharField(_('rule name'), max_length=100)
    min_income = models.DecimalField(_('min income'), max_digits=12, decimal_places=2, default=0)
    max_income = models.DecimalField(_('max income'), max_digits=12, decimal_places=2, null=True, blank=True)
    rate = models.DecimalField(_('tax rate (%)'), max_digits=5, decimal_places=2)
    excess_amount = models.DecimalField(
        _('excess amount'), max_digits=12, decimal_places=2, default=0,
        help_text=_('Fixed amount to add to tax calculation'),
    )
    
    class Meta:
        verbose_name = _('tax rule')
        verbose_name_plural = _('tax rules')
        ordering = ['min_income']

    def __str__(self):
        return f"{self.name} ({self.min_income} - {self.max_income or 'Infinity'})"

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.max_income is not None and self.max_income <= self.min_income:
            raise ValidationError({'max_income': _('Max income must be greater than min income.')})
        if self.rate < 0:
            raise ValidationError({'rate': _('Tax rate cannot be negative.')})


class EmployeeSalaryComponent(models.Model):
    """Employee-specific salary components (allowances/deductions)"""
    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.CASCADE,
        related_name='salary_components',
        verbose_name=_('employee'),
    )
    component = models.ForeignKey(
        SalaryComponent,
        on_delete=models.CASCADE,
        related_name='employee_assignments',
        verbose_name=_('component'),
    )
    amount = models.DecimalField(
        _('amount'), max_digits=12, decimal_places=2, default=0,
        help_text=_('Override amount for this employee'),
    )
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('employee salary component')
        verbose_name_plural = _('employee salary components')
        unique_together = ['employee', 'component']

    def __str__(self):
        return f"{self.employee.full_name} - {self.component.name}"

class PayrollPeriod(models.Model):
    """A payroll processing period (usually monthly)"""

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('processing', 'Processing'),
        ('approved', 'Approved'),
        ('paid', 'Paid'),
        ('reversed', 'Reversed'),
    ]

    name = models.CharField(_('period name'), max_length=100)
    start_date = models.DateField(_('start date'))
    end_date = models.DateField(_('end date'))
    status = models.CharField(
        _('status'), max_length=20,
        choices=STATUS_CHOICES, default='draft',
    )
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='payroll_periods',
        verbose_name=_('branch'),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_payroll_periods',
        verbose_name=_('created by'),
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_payroll_periods',
        verbose_name=_('approved by'),
    )
    approved_at = models.DateTimeField(_('approved at'), null=True, blank=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='paid_payroll_periods',
        verbose_name=_('paid by'),
    )
    paid_at = models.DateTimeField(_('paid at'), null=True, blank=True)
    payment_batch_reference = models.CharField(_('payment batch reference'), max_length=100, blank=True)
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reversed_payroll_periods',
        verbose_name=_('reversed by'),
    )
    reversed_at = models.DateTimeField(_('reversed at'), null=True, blank=True)
    reversal_reason = models.TextField(_('reversal reason'), blank=True)
    notes = models.TextField(_('notes'), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('payroll period')
        verbose_name_plural = _('payroll periods')
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.name} ({self.start_date} - {self.end_date})"

    @property
    def total_payslips(self):
        return self.payslips.count()

    @property
    def total_net_pay(self):
        return self.payslips.aggregate(
            total=models.Sum('net_pay')
        )['total'] or Decimal('0')


class PaySlip(models.Model):
    """Individual employee payslip for a payroll period"""

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('approved', 'Approved'),
        ('paid', 'Paid'),
        ('reversed', 'Reversed'),
    ]

    payslip_number = models.CharField(_('payslip number'), max_length=30, unique=True, editable=False, null=True, blank=True)
    payroll_period = models.ForeignKey(
        PayrollPeriod,
        on_delete=models.CASCADE,
        related_name='payslips',
        verbose_name=_('payroll period'),
    )
    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.CASCADE,
        related_name='payslips',
        verbose_name=_('employee'),
    )
    basic_salary = models.DecimalField(
        _('basic salary'), max_digits=12, decimal_places=2,
    )
    overtime_pay = models.DecimalField(
        _('overtime pay'), max_digits=12, decimal_places=2, default=0,
    )
    unpaid_leave_deduction = models.DecimalField(
        _('unpaid leave deduction'), max_digits=12, decimal_places=2, default=0,
    )
    absence_deduction = models.DecimalField(
        _('absence deduction'), max_digits=12, decimal_places=2, default=0,
    )
    proration_factor = models.DecimalField(
        _('proration factor'), max_digits=6, decimal_places=4, default=1,
    )
    allowances = models.JSONField(
        _('allowances'), default=dict, blank=True,
        help_text=_('{"component_name": amount}'),
    )
    deductions = models.JSONField(
        _('deductions'), default=dict, blank=True,
        help_text=_('{"component_name": amount}'),
    )
    employer_contributions = models.JSONField(
        _('employer contributions'), default=dict, blank=True,
        help_text=_('{"SSNIT Employer (Tier 1)": amount} — not deducted from net pay'),
    )
    gross_pay = models.DecimalField(
        _('gross pay'), max_digits=12, decimal_places=2, default=0,
    )
    tax_amount = models.DecimalField(
        _('tax amount'), max_digits=12, decimal_places=2, default=0,
    )
    net_pay = models.DecimalField(
        _('net pay'), max_digits=12, decimal_places=2, default=0,
    )
    status = models.CharField(
        _('status'), max_length=20,
        choices=STATUS_CHOICES, default='draft',
    )
    payment_date = models.DateField(_('payment date'), null=True, blank=True)
    payment_reference = models.CharField(
        _('payment reference'), max_length=100, blank=True,
    )
    is_locked = models.BooleanField(_('locked'), default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('payslip')
        verbose_name_plural = _('payslips')
        ordering = ['-payroll_period__start_date', 'employee__user__last_name']
        unique_together = ['payroll_period', 'employee']
        indexes = [
            models.Index(fields=['payslip_number']),
            models.Index(fields=['status', 'is_locked']),
        ]

    def __str__(self):
        return f"{self.payslip_number or self.employee.full_name} - {self.payroll_period.name}"

    def calculate_pay(self):
        """Calculate gross and net pay based on components"""
        total_allowances = Decimal('0')
        allowances_data = self.allowances if isinstance(self.allowances, dict) else (self.allowances or [])
        # If it's a list (e.g. from JSON array), it might be [{'name': 'Housing', 'amount': 200}] or just values
        # But based on error 'list' object has no attribute 'values', it's definitely a list.
        # Let's normalize iteration:
        if isinstance(allowances_data, dict):
            iterator = allowances_data.values()
        elif isinstance(allowances_data, list):
            iterator = allowances_data
        else:
            iterator = []

        for v in iterator:
            # Handle if v is a dict (e.g. inside a list of records) or a scalar
            val = v.get('amount') if isinstance(v, dict) else v
            if val is not None and str(val).strip():
                try:
                    total_allowances += Decimal(str(val))
                except (ValueError, TypeError, InvalidOperation):
                    pass

        total_deductions = Decimal('0')
        deductions_data = self.deductions if isinstance(self.deductions, dict) else (self.deductions or [])
        if isinstance(deductions_data, dict):
            iterator = deductions_data.values()
        elif isinstance(deductions_data, list):
            iterator = deductions_data
        else:
            iterator = []

        for v in iterator:
            val = v.get('amount') if isinstance(v, dict) else v
            if val is not None and str(val).strip():
                try:
                    total_deductions += Decimal(str(val))
                except (ValueError, TypeError, InvalidOperation):
                    pass

        self.gross_pay = (self.basic_salary or Decimal('0')) + (self.overtime_pay or Decimal('0')) + total_allowances
        self.net_pay = (
            self.gross_pay
            - total_deductions
            - (self.tax_amount or Decimal('0'))
            - (self.unpaid_leave_deduction or Decimal('0'))
            - (self.absence_deduction or Decimal('0'))
        )

    def save(self, *args, **kwargs):
        allow_locked_update = kwargs.pop('_allow_locked_update', False)
        if self.pk:
            old = PaySlip.objects.filter(pk=self.pk).only('is_locked').first()
            if old and old.is_locked and not allow_locked_update:
                from django.core.exceptions import ValidationError
                raise ValidationError(_('Paid or approved payslips are locked. Reverse or reopen payroll before editing.'))
        if not self.payslip_number:
            year = self.payroll_period.end_date.year if self.payroll_period_id else timezone.now().year
            next_number = (PaySlip.objects.filter(payslip_number__startswith=f"PS{year}").count() or 0) + 1
            self.payslip_number = f"PS{year}{next_number:06d}"
        self.calculate_pay()
        super().save(*args, **kwargs)


class PayrollAuditLog(models.Model):
    """Payroll audit trail for sensitive compensation and payroll actions."""

    ACTION_CHOICES = [
        ('salary_component_created', 'Salary Component Created'),
        ('salary_component_updated', 'Salary Component Updated'),
        ('salary_component_deleted', 'Salary Component Deleted'),
        ('payslip_updated', 'Payslip Updated'),
        ('period_processed', 'Period Processed'),
        ('period_approved', 'Period Approved'),
        ('period_paid', 'Period Paid'),
        ('period_reversed', 'Period Reversed'),
    ]

    action = models.CharField(max_length=40, choices=ACTION_CHOICES)
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='payroll_audit_logs')
    payroll_period = models.ForeignKey(PayrollPeriod, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    payslip = models.ForeignKey(PaySlip, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='payroll_audit_logs')
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['action', 'created_at']),
            models.Index(fields=['employee', 'created_at']),
            models.Index(fields=['payroll_period', 'created_at']),
        ]


# =============================================================================
# Recruitment
# =============================================================================

class JobOpening(models.Model):
    """Job vacancy postings"""

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('open', 'Open'),
        ('on_hold', 'On Hold'),
        ('closed', 'Closed'),
    ]

    title = models.CharField(_('job title'), max_length=200)
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='job_openings',
        verbose_name=_('department'),
    )
    position = models.ForeignKey(
        Position,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='job_openings',
        verbose_name=_('position'),
    )
    description = models.TextField(_('job description'))
    requirements = models.TextField(_('requirements'), blank=True)
    employment_type = models.CharField(
        _('employment type'),
        max_length=20,
        choices=EmployeeProfile.EMPLOYMENT_TYPE_CHOICES,
        default='full_time',
    )
    salary_range_min = models.DecimalField(
        _('salary range min'), max_digits=12, decimal_places=2,
        null=True, blank=True,
    )
    salary_range_max = models.DecimalField(
        _('salary range max'), max_digits=12, decimal_places=2,
        null=True, blank=True,
    )
    status = models.CharField(
        _('status'), max_length=20,
        choices=STATUS_CHOICES, default='draft',
    )
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='job_openings',
        verbose_name=_('branch'),
    )
    posted_date = models.DateField(_('posted date'), null=True, blank=True)
    closing_date = models.DateField(_('closing date'), null=True, blank=True)
    vacancies = models.PositiveIntegerField(_('number of vacancies'), default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_job_openings',
        verbose_name=_('created by'),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('job opening')
        verbose_name_plural = _('job openings')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"

    @property
    def applicant_count(self):
        return self.applicants.count()


class Applicant(models.Model):
    """Job applicant tracking"""

    STATUS_CHOICES = [
        ('new', 'New'),
        ('screening', 'Screening'),
        ('interview', 'Interview'),
        ('offered', 'Offered'),
        ('hired', 'Hired'),
        ('rejected', 'Rejected'),
    ]

    SOURCE_CHOICES = [
        ('website', 'Website'),
        ('referral', 'Referral'),
        ('job_board', 'Job Board'),
        ('social_media', 'Social Media'),
        ('walk_in', 'Walk-in'),
        ('manual', 'Manual Entry'),
        ('other', 'Other'),
    ]

    job_opening = models.ForeignKey(
        JobOpening,
        on_delete=models.CASCADE,
        related_name='applicants',
        verbose_name=_('job opening'),
    )
    first_name = models.CharField(_('first name'), max_length=100)
    last_name = models.CharField(_('last name'), max_length=100)
    email = models.EmailField(_('email'))
    phone = models.CharField(_('phone'), max_length=20, blank=True)
    resume = models.FileField(
        _('resume'), upload_to='hr/resumes/', blank=True, null=True,
    )
    cover_letter = models.TextField(_('cover letter'), blank=True)
    status = models.CharField(
        _('status'), max_length=20,
        choices=STATUS_CHOICES, default='new',
    )
    source = models.CharField(
        _('source'), max_length=20,
        choices=SOURCE_CHOICES, default='website',
    )
    applied_date = models.DateField(_('applied date'), auto_now_add=True)
    notes = models.TextField(_('internal notes'), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('applicant')
        verbose_name_plural = _('applicants')
        ordering = ['-applied_date']

    def __str__(self):
        return f"{self.first_name} {self.last_name} - {self.job_opening.title}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


class Interview(models.Model):
    """Interview scheduling and feedback"""

    TYPE_CHOICES = [
        ('phone', 'Phone Screen'),
        ('in_person', 'In Person'),
        ('video', 'Video Call'),
        ('technical', 'Technical Assessment'),
    ]

    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('no_show', 'No Show'),
    ]

    applicant = models.ForeignKey(
        Applicant,
        on_delete=models.CASCADE,
        related_name='interviews',
        verbose_name=_('applicant'),
    )
    interviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='conducted_interviews',
        verbose_name=_('interviewer'),
    )
    scheduled_at = models.DateTimeField(_('scheduled at'))
    duration_minutes = models.PositiveIntegerField(
        _('duration (minutes)'), default=60,
    )
    interview_type = models.CharField(
        _('interview type'), max_length=20, choices=TYPE_CHOICES,
    )
    status = models.CharField(
        _('status'), max_length=20,
        choices=STATUS_CHOICES, default='scheduled',
    )
    location = models.CharField(_('location'), max_length=200, blank=True)
    meeting_link = models.URLField(_('meeting link'), blank=True)
    feedback = models.TextField(_('feedback'), blank=True)
    rating = models.PositiveIntegerField(
        _('rating'), null=True, blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('interview')
        verbose_name_plural = _('interviews')
        ordering = ['-scheduled_at']

    def __str__(self):
        return f"Interview: {self.applicant.full_name} - {self.get_interview_type_display()}"


# =============================================================================
# Performance Management
# =============================================================================

class PerformanceReview(models.Model):
    """Employee performance reviews"""

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('acknowledged', 'Acknowledged'),
    ]

    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.CASCADE,
        related_name='performance_reviews',
        verbose_name=_('employee'),
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='given_reviews',
        verbose_name=_('reviewer'),
    )
    review_period_start = models.DateField(_('period start'))
    review_period_end = models.DateField(_('period end'))
    overall_rating = models.PositiveIntegerField(
        _('overall rating'),
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        null=True, blank=True,
    )
    strengths = models.TextField(_('strengths'), blank=True)
    areas_for_improvement = models.TextField(_('areas for improvement'), blank=True)
    goals = models.TextField(_('goals for next period'), blank=True)
    employee_comments = models.TextField(_('employee comments'), blank=True)
    status = models.CharField(
        _('status'), max_length=20,
        choices=STATUS_CHOICES, default='draft',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('performance review')
        verbose_name_plural = _('performance reviews')
        ordering = ['-review_period_end']

    def __str__(self):
        return f"Review: {self.employee.full_name} ({self.review_period_start} - {self.review_period_end})"


# =============================================================================
# Training & Compliance
# =============================================================================

class TrainingProgram(models.Model):
    """Training programs and courses"""
    name = models.CharField(_('program name'), max_length=200)
    description = models.TextField(_('description'), blank=True)
    trainer = models.CharField(_('trainer'), max_length=200, blank=True)
    start_date = models.DateField(_('start date'), null=True, blank=True)
    end_date = models.DateField(_('end date'), null=True, blank=True)
    max_participants = models.PositiveIntegerField(
        _('max participants'), null=True, blank=True,
    )
    is_mandatory = models.BooleanField(_('mandatory'), default=False)
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='training_programs',
        verbose_name=_('department'),
    )
    is_active = models.BooleanField(_('active'), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('training program')
        verbose_name_plural = _('training programs')
        ordering = ['-start_date']

    def __str__(self):
        return self.name

    @property
    def enrolled_count(self):
        return self.enrollments.count()


class EmployeeTraining(models.Model):
    """Tracks employee enrollment in training programs"""

    STATUS_CHOICES = [
        ('enrolled', 'Enrolled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('withdrawn', 'Withdrawn'),
    ]

    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.CASCADE,
        related_name='training_records',
        verbose_name=_('employee'),
    )
    training = models.ForeignKey(
        TrainingProgram,
        on_delete=models.CASCADE,
        related_name='enrollments',
        verbose_name=_('training program'),
    )
    status = models.CharField(
        _('status'), max_length=20,
        choices=STATUS_CHOICES, default='enrolled',
    )
    enrolled_date = models.DateField(_('enrolled date'), auto_now_add=True)
    completion_date = models.DateField(_('completion date'), null=True, blank=True)
    certificate = models.FileField(
        _('certificate'), upload_to='hr/certificates/',
        blank=True, null=True,
    )
    score = models.DecimalField(
        _('score'), max_digits=5, decimal_places=2,
        null=True, blank=True,
    )
    notes = models.TextField(_('notes'), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('employee training')
        verbose_name_plural = _('employee training records')
        unique_together = ['employee', 'training']
        ordering = ['-enrolled_date']

    def __str__(self):
        return f"{self.employee.full_name} - {self.training.name}"


class ComplianceDocument(models.Model):
    """Employee compliance documents with expiry tracking"""

    DOCUMENT_TYPE_CHOICES = [
        ('license', 'License'),
        ('certification', 'Certification'),
        ('permit', 'Permit'),
        ('insurance', 'Insurance'),
        ('contract', 'Employment Contract'),
        ('nda', 'Non-Disclosure Agreement'),
        ('other', 'Other'),
    ]

    STATUS_CHOICES = [
        ('valid', 'Valid'),
        ('expiring_soon', 'Expiring Soon'),
        ('expired', 'Expired'),
    ]

    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.CASCADE,
        related_name='compliance_documents',
        verbose_name=_('employee'),
    )
    document_type = models.CharField(
        _('document type'), max_length=20,
        choices=DOCUMENT_TYPE_CHOICES,
    )
    name = models.CharField(_('document name'), max_length=200)
    document_number = models.CharField(_('document number'), max_length=100, blank=True)
    document_file = models.FileField(
        _('document file'), upload_to='hr/compliance/',
        blank=True, null=True,
    )
    issue_date = models.DateField(_('issue date'), null=True, blank=True)
    expiry_date = models.DateField(_('expiry date'), null=True, blank=True)
    status = models.CharField(
        _('status'), max_length=20,
        choices=STATUS_CHOICES, default='valid',
    )
    reminder_sent = models.BooleanField(_('reminder sent'), default=False)
    notes = models.TextField(_('notes'), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('compliance document')
        verbose_name_plural = _('compliance documents')
        ordering = ['expiry_date']
        indexes = [
            models.Index(fields=['status', 'expiry_date']),
            models.Index(fields=['employee', 'document_type']),
        ]

    def __str__(self):
        return f"{self.name} - {self.employee.full_name}"

    @property
    def is_expiring_soon(self):
        """Returns True if document expires within 30 days"""
        if not self.expiry_date:
            return False
        from django.utils import timezone
        return (
            self.expiry_date - timezone.now().date()
        ).days <= 30 and self.expiry_date >= timezone.now().date()

    @property
    def days_until_expiry(self):
        if not self.expiry_date:
            return None
        from django.utils import timezone
        return (self.expiry_date - timezone.now().date()).days

    @property
    def is_expired(self):
        if not self.expiry_date:
            return False
        from django.utils import timezone
        return self.expiry_date < timezone.now().date()

    def save(self, *args, **kwargs):
        """Auto-update status based on expiry date"""
        if self.expiry_date:
            if self.is_expired:
                self.status = 'expired'
            elif self.is_expiring_soon:
                self.status = 'expiring_soon'
            else:
                self.status = 'valid'
        super().save(*args, **kwargs)
