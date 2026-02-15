from decimal import Decimal
from django.db.models import Sum
from .models import TaxRule, PaySlip, EmployeeSalaryComponent, SalaryComponent, Attendance, AttendancePolicy
from django.utils import timezone

class TaxService:
    @staticmethod
    def calculate_tax(gross_income):
        """
        Calculate tax based on progressive tax rules.
        """
        if gross_income <= 0:
            return Decimal('0.00')

        tax_payable = Decimal('0.00')
        remaining_income = gross_income
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
                tax_payable += (bracket_income * rate) / 100
                break
            else:
                # If income exceeds this bracket
                if gross_income > current_max:
                    bracket_income = current_max - current_min
                    tax_payable += (bracket_income * rate) / 100
                    previous_max = current_max
                else:
                    # Income falls within this bracket
                    bracket_income = max(Decimal('0'), gross_income - current_min)
                    tax_payable += (bracket_income * rate) / 100
                    break
        
        return round(tax_payable, 2)


class PayrollService:
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

            basic_salary = emp.base_salary
            overtime_pay = PayrollService.calculate_overtime_pay(emp, period.start_date, period.end_date)
            
            allowances = {}
            deductions = {}
            total_allowances_amount = Decimal('0.00')
            total_deductions_amount = Decimal('0.00')

            # Get Employee Components
            emp_components = EmployeeSalaryComponent.objects.filter(
                employee=emp, is_active=True
            ).select_related('component')
            
            for ec in emp_components:
                comp = ec.component
                value = ec.amount
                
                if comp.component_type == 'allowance':
                    allowances[comp.name] = str(value)
                    total_allowances_amount += value
                else:
                    deductions[comp.name] = str(value)
                    total_deductions_amount += value
            
            # Allowances might be taxable. For simplicity, assume all allowances are taxable gross income.
            gross_pay = basic_salary + overtime_pay + total_allowances_amount
            
            # Calculate Tax
            tax_amount = TaxService.calculate_tax(gross_pay)
            
            # Create Payslip
            payslip = PaySlip.objects.create(
                payroll_period=period,
                employee=emp,
                basic_salary=basic_salary,
                overtime_pay=overtime_pay,
                allowances=allowances,
                deductions=deductions,
                gross_pay=gross_pay,
                tax_amount=tax_amount,
                # Net Pay will be calculated by model method or here
                net_pay=gross_pay - tax_amount - total_deductions_amount
            )
            created_count += 1
            
        return created_count
