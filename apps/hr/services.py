from decimal import Decimal, ROUND_HALF_UP
from django.db.models import Sum
from .models import TaxRule, PaySlip, EmployeeSalaryComponent, Attendance, AttendancePolicy, LeaveRequest
from django.utils import timezone
from datetime import timedelta

class TaxService:
    MONEY_QUANT = Decimal('0.01')

    @staticmethod
    def calculate_tax(gross_income):
        """
        Calculate tax based on progressive tax rules.
        """
        gross_income = Decimal(str(gross_income or 0))
        if gross_income <= 0:
            return Decimal('0.00')

        tax_payable = Decimal('0.00')
        rules = TaxRule.objects.all().order_by('min_income')

        if not rules.exists():
            return Decimal('0.00')

        # Accumulate tax by iterating through sorted brackets
        # Assuming rules are strictly ordered and non-overlapping ranges
        # e.g., 0-5000, 5001-10000, 10001-Infinity
        
        previous_max = Decimal('0.00')
        
        for rule in rules:
            if gross_income <= previous_max:
                break
                
            current_min = rule.min_income
            current_max = rule.max_income
            rate = rule.rate
            
            # Determine taxable amount in this bracket
            # The bracket size is (current_max - current_min)
            # Or if current_max is None (infinity), it's (gross_income - current_min)
            
            if current_max is None:
                bracket_income = max(Decimal('0'), gross_income - current_min)
                tax_payable += rule.excess_amount + (bracket_income * rate) / 100
                break
            else:
                # If income exceeds this bracket
                if gross_income > current_max:
                    bracket_income = current_max - current_min
                    tax_payable += rule.excess_amount + (bracket_income * rate) / 100
                    previous_max = current_max
                else:
                    # Income falls within this bracket
                    bracket_income = max(Decimal('0'), gross_income - current_min)
                    tax_payable += rule.excess_amount + (bracket_income * rate) / 100
                    break
        
        return tax_payable.quantize(TaxService.MONEY_QUANT, rounding=ROUND_HALF_UP)


class PayrollService:
    MONEY_QUANT = Decimal('0.01')

    @staticmethod
    def _business_days(start_date, end_date):
        count = 0
        current = start_date
        while current <= end_date:
            if current.weekday() < 5:
                count += 1
            current += timedelta(days=1)
        return Decimal(str(count))

    @staticmethod
    def _employee_payable_days(employee, period):
        period_days = PayrollService._business_days(period.start_date, period.end_date)
        if period_days <= 0:
            return Decimal('0'), Decimal('0')

        employee_start = max(employee.start_date or period.start_date, period.start_date)
        employee_end = min(employee.end_date or period.end_date, period.end_date)
        if employee_start > employee_end:
            return Decimal('0'), period_days

        payable_days = PayrollService._business_days(employee_start, employee_end)
        return payable_days, period_days

    @staticmethod
    def _daily_rate(employee, period):
        payable_days, period_days = PayrollService._employee_payable_days(employee, period)
        if period_days <= 0:
            return Decimal('0.00')
        return (employee.base_salary / period_days).quantize(PayrollService.MONEY_QUANT, rounding=ROUND_HALF_UP)

    @staticmethod
    def calculate_unpaid_leave_deduction(employee, period):
        daily_rate = PayrollService._daily_rate(employee, period)
        if daily_rate <= 0:
            return Decimal('0.00')
        unpaid_days = Decimal('0')
        leaves = LeaveRequest.objects.filter(
            employee=employee,
            status='approved',
            leave_type__is_paid=False,
            start_date__lte=period.end_date,
            end_date__gte=period.start_date,
        )
        for leave in leaves:
            start = max(leave.start_date, period.start_date)
            end = min(leave.end_date, period.end_date)
            unpaid_days += PayrollService._business_days(start, end)
        return (daily_rate * unpaid_days).quantize(PayrollService.MONEY_QUANT, rounding=ROUND_HALF_UP)

    @staticmethod
    def calculate_absence_deduction(employee, period):
        daily_rate = PayrollService._daily_rate(employee, period)
        if daily_rate <= 0:
            return Decimal('0.00')
        absent_days = Decimal(str(Attendance.objects.filter(
            employee=employee,
            date__range=[period.start_date, period.end_date],
            status='absent',
        ).count()))
        half_days = Decimal(str(Attendance.objects.filter(
            employee=employee,
            date__range=[period.start_date, period.end_date],
            status='half_day',
        ).count())) * Decimal('0.5')
        return (daily_rate * (absent_days + half_days)).quantize(PayrollService.MONEY_QUANT, rounding=ROUND_HALF_UP)

    @staticmethod
    def calculate_overtime_pay(employee, period_start, period_end):
        """
        Calculate overtime pay.
        """
        # Get total overtime hours
        attendance_agg = Attendance.objects.filter(
            employee=employee,
            date__range=[period_start, period_end]
        ).aggregate(total_ot=Sum('overtime_hours'))
        
        total_hours = attendance_agg['total_ot'] or Decimal('0.00')
        
        if total_hours <= 0:
            return Decimal('0.00')

        # Calculate Hourly Rate
        # Assuming 160 hours/month standard
        hourly_rate = employee.base_salary / Decimal('160')
        
        # Get Policy Multiplier
        # Try to find specific policy for branch, or default to 1.5
        policy = AttendancePolicy.objects.filter(branch=employee.user.branch).first()
        multiplier = policy.overtime_multiplier if policy else Decimal('1.5')
        
        return round(total_hours * hourly_rate * multiplier, 2)

    @staticmethod
    def process_period(period, employees):
        """
        Generate payslips for employees in the given period.
        """
        created_count = 0
        
        for emp in employees:
            if PaySlip.objects.filter(payroll_period=period, employee=emp).exists():
                continue

            payable_days, period_days = PayrollService._employee_payable_days(emp, period)
            if payable_days <= 0 or period_days <= 0:
                continue
            proration_factor = (payable_days / period_days).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
            basic_salary = (emp.base_salary * proration_factor).quantize(PayrollService.MONEY_QUANT, rounding=ROUND_HALF_UP)
            overtime_pay = PayrollService.calculate_overtime_pay(emp, period.start_date, period.end_date)
            unpaid_leave_deduction = PayrollService.calculate_unpaid_leave_deduction(emp, period)
            absence_deduction = PayrollService.calculate_absence_deduction(emp, period)
            
            allowances = {}
            deductions = {}
            total_allowances_amount = Decimal('0.00')
            total_deductions_amount = Decimal('0.00')
            taxable_allowances_amount = Decimal('0.00')

            # Get Employee Components
            emp_components = EmployeeSalaryComponent.objects.filter(
                employee=emp, is_active=True
            ).select_related('component')
            
            for ec in emp_components:
                comp = ec.component
                value = (ec.amount if ec.amount else comp.calculate(basic_salary)).quantize(
                    PayrollService.MONEY_QUANT,
                    rounding=ROUND_HALF_UP,
                )
                
                if comp.component_type == 'allowance':
                    allowances[comp.name] = str(value)
                    total_allowances_amount += value
                    if comp.is_taxable:
                        taxable_allowances_amount += value
                else:
                    deductions[comp.name] = str(value)
                    total_deductions_amount += value
            
            # Allowances might be taxable. For simplicity, assume all allowances are taxable gross income.
            gross_pay = basic_salary + overtime_pay + total_allowances_amount
            
            # Calculate Tax on taxable earnings only.
            tax_amount = TaxService.calculate_tax(basic_salary + overtime_pay + taxable_allowances_amount)
            
            # Create Payslip
            payslip = PaySlip.objects.create(
                payroll_period=period,
                employee=emp,
                basic_salary=basic_salary,
                overtime_pay=overtime_pay,
                unpaid_leave_deduction=unpaid_leave_deduction,
                absence_deduction=absence_deduction,
                proration_factor=proration_factor,
                allowances=allowances,
                deductions=deductions,
                gross_pay=gross_pay,
                tax_amount=tax_amount,
                # Net Pay will be calculated by model method or here
                net_pay=gross_pay - tax_amount - total_deductions_amount
            )
            created_count += 1
            
        return created_count
