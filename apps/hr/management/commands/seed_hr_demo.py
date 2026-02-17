"""
Management command to seed comprehensive HR demo data for testing.

Usage:
    python3 manage.py seed_hr_demo
    python3 manage.py seed_hr_demo --clear   (wipe HR data first)

Creates demo data for ALL HR features:
  - Departments & Positions
  - Employee Profiles (linked to new demo users)
  - Leave Types, Balances & Requests
  - Attendance Policies & Records
  - Salary Components, Tax Rules & Employee Assignments
  - Payroll Periods & Payslips
  - Job Openings, Applicants & Interviews
  - Performance Reviews
  - Training Programs & Enrollments
  - Compliance Documents
"""
import random
from datetime import date, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

# ── helpers ──────────────────────────────────────────────────────────────────
NOW = timezone.now()
TODAY = date.today()
YEAR = TODAY.year


def _dt(d, t_obj):
    """Combine date + time into a timezone-aware datetime."""
    from datetime import datetime
    return timezone.make_aware(datetime.combine(d, t_obj))


class Command(BaseCommand):
    help = 'Seed demo data for every HR module feature.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear', action='store_true',
            help='Delete all existing HR data before seeding.',
        )

    # ─────────────────────────────────────────────────────────────────────────
    def handle(self, *args, **options):
        from apps.branches.models import Branch
        from apps.hr.models import (
            Department, Position, EmployeeProfile,
            LeaveType, LeaveBalance, LeaveRequest,
            AttendancePolicy, Attendance,
            SalaryComponent, TaxRule, EmployeeSalaryComponent,
            PayrollPeriod, PaySlip,
            JobOpening, Applicant, Interview,
            PerformanceReview, TrainingProgram, EmployeeTraining,
            ComplianceDocument,
        )

        if options['clear']:
            self.stdout.write(self.style.WARNING('Clearing existing HR data...'))

            # 1. Delete Journal Entries created by HR demo
            # We find them via the content_type linking to PayrollPeriod
            from apps.accounting.models import JournalEntry
            from django.contrib.contenttypes.models import ContentType
            from apps.hr.models import PayrollPeriod

            try:
                pp_content_type = ContentType.objects.get_for_model(PayrollPeriod)
                # Delete ALL JEs linked to ANY payroll period
                # Since we are wiping all HR data (including all PayrollPeriods), we must clean up their JEs
                JournalEntry.objects.filter(content_type=pp_content_type).delete()
            except Exception:
                pass # ContentType or model might not exist if first run

            # 2. Delete HR models
            models_to_clear = [
                ComplianceDocument, EmployeeTraining, TrainingProgram,
                PerformanceReview, Interview, Applicant, JobOpening,
                PaySlip, PayrollPeriod,
                EmployeeSalaryComponent, TaxRule, SalaryComponent,
                Attendance, AttendancePolicy,
                LeaveRequest, LeaveBalance, LeaveType,
                EmployeeProfile, Position, Department,
            ]
            for model in models_to_clear:
                model.objects.all().delete()
            # Delete demo users only
            User.objects.filter(email__endswith='@demo.svrs.com').delete()
            self.stdout.write(self.style.SUCCESS('  ✓ Cleared'))

        # ── 1. Get or create a branch ───────────────────────────────────────
        branch = Branch.objects.filter(is_active=True).first()
        if not branch:
            branch = Branch.objects.create(
                name='Main Branch', address='123 Demo St', city='Accra',
                phone='0201234567', is_active=True, is_headquarters=True,
            )
        self.stdout.write(f'Using branch: {branch.name}')

        # ── 2. Departments & Positions ──────────────────────────────────────
        self.stdout.write('Creating departments & positions...')
        dept_data = [
            ('Workshop', 'Vehicle servicing & repairs'),
            ('Administration', 'Office management and HR'),
            ('Sales', 'Customer relations & sales'),
            ('Parts', 'Parts procurement & inventory'),
        ]
        departments = []
        for name, desc in dept_data:
            dept, _ = Department.objects.get_or_create(
                name=name, branch=branch,
                defaults={'description': desc},
            )
            departments.append(dept)

        positions_data = {
            'Workshop': [
                ('Senior Mechanic', 4000, 6000),
                ('Junior Mechanic', 2000, 3500),
                ('Auto Electrician', 3500, 5500),
            ],
            'Administration': [
                ('HR Manager', 5000, 7000),
                ('Office Assistant', 1800, 2500),
            ],
            'Sales': [
                ('Sales Executive', 3000, 5000),
                ('Customer Service Rep', 2200, 3200),
            ],
            'Parts': [
                ('Parts Manager', 3500, 5000),
                ('Store Keeper', 1800, 2800),
            ],
        }
        positions = {}
        for dept in departments:
            for title, min_s, max_s in positions_data.get(dept.name, []):
                pos, _ = Position.objects.get_or_create(
                    title=title, department=dept,
                    defaults={
                        'min_salary': Decimal(str(min_s)),
                        'max_salary': Decimal(str(max_s)),
                    },
                )
                positions[title] = pos
        self.stdout.write(self.style.SUCCESS(
            f'  ✓ {len(departments)} departments, {len(positions)} positions'
        ))

        # ── 3. Demo Users & Employee Profiles ───────────────────────────────
        self.stdout.write('Creating demo employees...')
        employees_data = [
            ('Kwame', 'Asante', 'kwame@demo.svrs.com', 'manager', 'Workshop',
             'Senior Mechanic', 'full_time', 5500),
            ('Ama', 'Mensah', 'ama@demo.svrs.com', 'technician', 'Workshop',
             'Junior Mechanic', 'full_time', 2800),
            ('Kofi', 'Boateng', 'kofi@demo.svrs.com', 'technician', 'Workshop',
             'Auto Electrician', 'full_time', 4200),
            ('Abena', 'Osei', 'abena@demo.svrs.com', 'manager', 'Administration',
             'HR Manager', 'full_time', 6000),
            ('Yaw', 'Darko', 'yaw@demo.svrs.com', 'receptionist', 'Administration',
             'Office Assistant', 'full_time', 2200),
            ('Efua', 'Adjei', 'efua@demo.svrs.com', 'service_coordinator', 'Sales',
             'Sales Executive', 'full_time', 4000),
            ('Kojo', 'Agyeman', 'kojo@demo.svrs.com', 'parts_manager', 'Parts',
             'Parts Manager', 'full_time', 4500),
            ('Akua', 'Frimpong', 'akua@demo.svrs.com', 'technician', 'Workshop',
             'Junior Mechanic', 'part_time', 1800),
        ]

        profiles = []
        dept_map = {d.name: d for d in departments}

        for first, last, email, role, dept_name, pos_title, emp_type, salary in employees_data:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'username': email,
                    'first_name': first,
                    'last_name': last,
                    'role': role,
                    'phone': f'020{random.randint(1000000, 9999999)}',
                    'branch': branch,
                },
            )
            if created:
                user.set_password('demo1234')
                user.save()

            profile, _ = EmployeeProfile.objects.get_or_create(
                user=user,
                defaults={
                    'department': dept_map.get(dept_name),
                    'position': positions.get(pos_title),
                    'employment_type': emp_type,
                    'employment_status': 'active',
                    'start_date': TODAY - timedelta(days=random.randint(90, 730)),
                    'base_salary': Decimal(str(salary)),
                    'salary_type': 'monthly',
                    'bank_name': random.choice(['GCB Bank', 'Ecobank', 'Stanbic', 'CalBank']),
                    'bank_account_number': f'{random.randint(100000000, 999999999)}',
                    'emergency_contact_name': f'{first} Sr.',
                    'emergency_contact_phone': f'024{random.randint(1000000, 9999999)}',
                    'emergency_contact_relationship': 'Parent',
                    'national_id': f'GHA-{random.randint(100000000, 999999999)}',
                    'tax_id': f'TIN-{random.randint(10000000, 99999999)}',
                },
            )
            profiles.append(profile)

        # Set reporting structure
        manager_profile = profiles[0]  # Kwame (Workshop manager)
        for p in profiles[1:3]:  # Ama, Kofi report to Kwame
            p.reporting_to = manager_profile
            p.save()

        # Set department heads
        dept_map['Administration'].head = profiles[3].user
        dept_map['Administration'].save()
        dept_map['Workshop'].head = profiles[0].user
        dept_map['Workshop'].save()

        self.stdout.write(self.style.SUCCESS(f'  ✓ {len(profiles)} employees'))

        # ── 4. Leave Types & Balances ───────────────────────────────────────
        self.stdout.write('Creating leave types, balances & requests...')
        leave_types_data = [
            ('Annual Leave', 21, True, True, 5),
            ('Sick Leave', 10, True, False, 0),
            ('Maternity Leave', 84, True, False, 0),
            ('Compassionate Leave', 5, True, False, 0),
            ('Study Leave', 10, False, False, 0),
        ]
        leave_types = []
        for name, days, paid, carry, max_cf in leave_types_data:
            lt, _ = LeaveType.objects.get_or_create(
                name=name,
                defaults={
                    'days_allowed': days,
                    'is_paid': paid,
                    'carry_forward': carry,
                    'max_carry_forward': max_cf,
                    'requires_document': name == 'Sick Leave',
                },
            )
            leave_types.append(lt)

        # Create balances for each employee
        for profile in profiles:
            for lt in leave_types:
                used = Decimal(str(random.randint(0, min(5, lt.days_allowed))))
                LeaveBalance.objects.get_or_create(
                    employee=profile, leave_type=lt, year=YEAR,
                    defaults={
                        'total_days': Decimal(str(lt.days_allowed)),
                        'used_days': used,
                        'carried_forward': Decimal('2') if lt.carry_forward else Decimal('0'),
                    },
                )

        # Create a few leave requests
        statuses = ['approved', 'pending', 'rejected', 'approved']
        for i, profile in enumerate(profiles[:4]):
            lt = leave_types[i % len(leave_types)]
            start = TODAY + timedelta(days=random.randint(5, 30))
            end = start + timedelta(days=random.randint(1, 5))
            LeaveRequest.objects.get_or_create(
                employee=profile, leave_type=lt, start_date=start,
                defaults={
                    'end_date': end,
                    'days_count': (end - start).days + 1,
                    'reason': f'Demo leave request for {lt.name}',
                    'status': statuses[i],
                    'reviewed_by': profiles[3].user if statuses[i] != 'pending' else None,
                    'reviewed_at': NOW if statuses[i] != 'pending' else None,
                },
            )
        self.stdout.write(self.style.SUCCESS(
            f'  ✓ {len(leave_types)} types, balances for {len(profiles)} employees, 4 requests'
        ))

        # ── 5. Attendance ───────────────────────────────────────────────────
        self.stdout.write('Creating attendance policy & records...')
        policy, _ = AttendancePolicy.objects.get_or_create(
            name='Standard Policy', branch=branch,
            defaults={
                'work_start_time': time(8, 0),
                'work_end_time': time(17, 0),
                'late_threshold_minutes': 15,
                'half_day_hours': Decimal('4.0'),
                'overtime_multiplier': Decimal('1.5'),
                'is_default': True,
            },
        )

        # Create 7 days of attendance for each employee
        att_statuses = ['present', 'present', 'present', 'present', 'late', 'present', 'absent']
        for profile in profiles[:6]:
            for day_offset in range(7):
                d = TODAY - timedelta(days=day_offset)
                if d.weekday() >= 5:  # skip weekends
                    continue
                status = random.choice(att_statuses)
                clock_in_time = time(8, random.randint(0, 45))
                clock_out_time = time(17, random.randint(0, 59))
                total_hrs = Decimal(str(round(random.uniform(7.0, 9.5), 2)))
                ot_hrs = max(Decimal('0'), total_hrs - Decimal('8'))

                Attendance.objects.get_or_create(
                    employee=profile, date=d,
                    defaults={
                        'clock_in': _dt(d, clock_in_time),
                        'clock_out': _dt(d, clock_out_time),
                        'total_hours': total_hrs,
                        'overtime_hours': ot_hrs,
                        'status': 'late' if clock_in_time.minute > 15 else status,
                        'branch': branch,
                        'notes': '' if status == 'present' else 'Auto-generated demo',
                    },
                )
        self.stdout.write(self.style.SUCCESS('  ✓ Attendance policy + ~30 records'))

        # ── 6. Salary Components, Tax Rules & Assignments ───────────────────
        self.stdout.write('Creating salary components & tax rules...')
        components_data = [
            ('Housing Allowance', 'allowance', 'fixed', 500, True),
            ('Transport Allowance', 'allowance', 'fixed', 300, True),
            ('Medical Allowance', 'allowance', 'fixed', 200, False),
            ('SSNIT Employee', 'deduction', 'percentage', 5.5, False),
            ('Provident Fund', 'deduction', 'fixed', 150, False),
        ]
        components = []
        for name, comp_type, calc_type, amount, taxable in components_data:
            comp, _ = SalaryComponent.objects.get_or_create(
                name=name,
                defaults={
                    'component_type': comp_type,
                    'calculation_type': calc_type,
                    'amount': Decimal(str(amount)) if calc_type == 'fixed' else Decimal('0'),
                    'percentage': Decimal(str(amount)) if calc_type == 'percentage' else Decimal('0'),
                    'is_taxable': taxable,
                },
            )
            components.append(comp)

        # Ghana PAYE tax brackets
        tax_brackets = [
            ('First GHS 490', 0, 490, Decimal('0')),
            ('Next GHS 110', 490, 600, Decimal('5')),
            ('Next GHS 130', 600, 730, Decimal('10')),
            ('Next GHS 3166.67', 730, 3896.67, Decimal('17.5')),
            ('Next GHS 16395', 3896.67, 20291.67, Decimal('25')),
            ('Above GHS 20291.67', 20291.67, None, Decimal('30')),
        ]
        for name, min_inc, max_inc, rate in tax_brackets:
            TaxRule.objects.get_or_create(
                name=name,
                defaults={
                    'min_income': Decimal(str(min_inc)),
                    'max_income': Decimal(str(max_inc)) if max_inc else None,
                    'rate': rate,
                },
            )

        # Assign components to employees
        for profile in profiles[:6]:
            for comp in components[:3]:  # allowances
                EmployeeSalaryComponent.objects.get_or_create(
                    employee=profile, component=comp,
                    defaults={'amount': comp.amount, 'is_active': True},
                )
            for comp in components[3:]:  # deductions
                amt = comp.amount if comp.calculation_type == 'fixed' else (
                    profile.base_salary * comp.percentage / 100
                )
                EmployeeSalaryComponent.objects.get_or_create(
                    employee=profile, component=comp,
                    defaults={'amount': amt, 'is_active': True},
                )
        self.stdout.write(self.style.SUCCESS(
            f'  ✓ {len(components)} components, 6 tax brackets, assignments done'
        ))

        # ── 7. Payroll ──────────────────────────────────────────────────────
        self.stdout.write('Creating payroll period & payslips...')
        period_start = TODAY.replace(day=1)
        period_end = (period_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)

        period, _ = PayrollPeriod.objects.get_or_create(
            name=f'{period_start.strftime("%B %Y")} Payroll',
            branch=branch,
            defaults={
                'start_date': period_start,
                'end_date': period_end,
                'status': 'draft',
                'created_by': profiles[3].user,  # HR manager
            },
        )

        # Create payslips for first 6 employees
        for profile in profiles[:6]:
            basic = profile.base_salary
            allowances_total = sum(c.amount for c in components[:3])
            deductions_total = Decimal('150') + (basic * Decimal('5.5') / 100)
            gross = basic + allowances_total
            tax = gross * Decimal('0.15')  # simplified
            net = gross - tax - deductions_total

            PaySlip.objects.get_or_create(
                payroll_period=period, employee=profile,
                defaults={
                    'basic_salary': basic,
                    'overtime_pay': Decimal(str(random.randint(0, 500))),
                    'allowances': {c.name: str(c.amount) for c in components[:3]},
                    'deductions': {c.name: str(c.amount) for c in components[3:]},
                    'gross_pay': gross,
                    'tax_amount': round(tax, 2),
                    'net_pay': round(net, 2),
                    'status': 'draft',
                },
            )
        self.stdout.write(self.style.SUCCESS('  ✓ 1 payroll period, 6 payslips'))

        # ── 8. Recruitment ──────────────────────────────────────────────────
        self.stdout.write('Creating job openings, applicants & interviews...')
        job1, _ = JobOpening.objects.get_or_create(
            title='Senior Mechanic', branch=branch,
            defaults={
                'department': dept_map['Workshop'],
                'position': positions.get('Senior Mechanic'),
                'description': 'Experienced mechanic needed for our growing workshop.',
                'requirements': '5+ years experience with Japanese and European vehicles.',
                'employment_type': 'full_time',
                'salary_range_min': Decimal('4000'),
                'salary_range_max': Decimal('6000'),
                'status': 'open',
                'posted_date': TODAY - timedelta(days=14),
                'closing_date': TODAY + timedelta(days=16),
                'vacancies': 2,
                'created_by': profiles[3].user,
            },
        )
        job2, _ = JobOpening.objects.get_or_create(
            title='Customer Service Representative', branch=branch,
            defaults={
                'department': dept_map['Sales'],
                'position': positions.get('Customer Service Rep'),
                'description': 'Front-desk customer service role.',
                'requirements': 'Excellent communication skills, computer literacy.',
                'employment_type': 'full_time',
                'salary_range_min': Decimal('2200'),
                'salary_range_max': Decimal('3200'),
                'status': 'open',
                'posted_date': TODAY - timedelta(days=7),
                'closing_date': TODAY + timedelta(days=23),
                'vacancies': 1,
                'created_by': profiles[3].user,
            },
        )

        applicants_data = [
            ('Daniel', 'Tetteh', 'daniel.t@example.com', '0551234567', job1, 'screening'),
            ('Grace', 'Appiah', 'grace.a@example.com', '0559876543', job1, 'interview'),
            ('Samuel', 'Owusu', 'samuel.o@example.com', '0541112233', job1, 'offer'),
            ('Linda', 'Amoako', 'linda.a@example.com', '0262223344', job2, 'screening'),
            ('Peter', 'Nkrumah', 'peter.n@example.com', '0273334455', job2, 'interview'),
        ]
        applicants = []
        for first, last, email_addr, phone, job, status in applicants_data:
            app, _ = Applicant.objects.get_or_create(
                email=email_addr, job_opening=job,
                defaults={
                    'first_name': first,
                    'last_name': last,
                    'phone': phone,
                    'status': status,
                    'source': random.choice(['website', 'referral', 'linkedin']),
                    'notes': f'Demo applicant for {job.title}',
                },
            )
            applicants.append(app)

        # Create interviews for applicants in interview stage
        for app in [a for a in applicants if a.status == 'interview']:
            Interview.objects.get_or_create(
                applicant=app,
                defaults={
                    'interviewer': profiles[0].user,
                    'scheduled_at': NOW + timedelta(days=random.randint(2, 10)),
                    'duration_minutes': 45,
                    'interview_type': random.choice(['in_person', 'video']),
                    'status': 'scheduled',
                    'location': 'Main Office, Conference Room A',
                },
            )
        self.stdout.write(self.style.SUCCESS(
            f'  ✓ 2 job openings, {len(applicants)} applicants, interviews scheduled'
        ))

        # ── 9. Performance Reviews ──────────────────────────────────────────
        self.stdout.write('Creating performance reviews...')
        review_start = date(YEAR, 1, 1)
        review_end = date(YEAR, 6, 30)
        ratings = [4.5, 3.8, 4.2, 4.0, 3.5, 4.7]

        for i, profile in enumerate(profiles[:6]):
            PerformanceReview.objects.get_or_create(
                employee=profile, review_period_start=review_start,
                defaults={
                    'reviewer': profiles[3].user,
                    'review_period_end': review_end,
                    'overall_rating': Decimal(str(ratings[i])),
                    'strengths': 'Strong technical skills, reliable team player, good initiative.',
                    'areas_for_improvement': 'Time management could improve. Consider leadership training.',
                    'goals': 'Complete advanced certification by Q4. Mentor junior staff.',
                    'employee_comments': 'I appreciate the feedback and will work on the areas mentioned.',
                    'status': random.choice(['draft', 'submitted', 'acknowledged']),
                },
            )
        self.stdout.write(self.style.SUCCESS('  ✓ 6 performance reviews'))

        # ── 10. Training ────────────────────────────────────────────────────
        self.stdout.write('Creating training programs & enrollments...')
        training_data = [
            ('Safety & Compliance', 'Workplace safety standards and compliance.',
             True, 'Workshop'),
            ('Customer Service Excellence', 'Best practices in customer interaction.',
             False, 'Sales'),
            ('Advanced Diagnostics', 'OBD-II and modern vehicle diagnostics.',
             False, 'Workshop'),
        ]
        trainings = []
        for name, desc, mandatory, dept_name in training_data:
            tp, _ = TrainingProgram.objects.get_or_create(
                name=name,
                defaults={
                    'description': desc,
                    'trainer': 'External Trainer Inc.',
                    'start_date': TODAY + timedelta(days=random.randint(7, 30)),
                    'end_date': TODAY + timedelta(days=random.randint(31, 60)),
                    'max_participants': 20,
                    'is_mandatory': mandatory,
                    'department': dept_map.get(dept_name),
                    'is_active': True,
                },
            )
            trainings.append(tp)

        # Enroll employees in trainings
        enrollment_statuses = ['enrolled', 'in_progress', 'completed']
        for i, profile in enumerate(profiles[:6]):
            training = trainings[i % len(trainings)]
            EmployeeTraining.objects.get_or_create(
                employee=profile, training=training,
                defaults={
                    'status': enrollment_statuses[i % 3],
                    'score': Decimal(str(random.randint(65, 98))) if i % 3 == 2 else None,
                    'notes': 'Demo enrollment',
                },
            )
        self.stdout.write(self.style.SUCCESS(
            f'  ✓ {len(trainings)} programs, 6 enrollments'
        ))

        # ── 11. Compliance Documents ────────────────────────────────────────
        self.stdout.write('Creating compliance documents...')
        doc_types = [
            ('id_card', 'National ID Card'),
            ('driver_license', "Driver's License"),
            ('certification', 'Professional Certification'),
            ('health_certificate', 'Health Certificate'),
        ]

        for i, profile in enumerate(profiles[:6]):
            doc_type, doc_name = doc_types[i % len(doc_types)]
            days_until_exp = random.choice([-10, 30, 90, 180, 365])
            ComplianceDocument.objects.get_or_create(
                employee=profile, document_type=doc_type,
                name=doc_name,
                defaults={
                    'document_number': f'DOC-{random.randint(100000, 999999)}',
                    'issue_date': TODAY - timedelta(days=365),
                    'expiry_date': TODAY + timedelta(days=days_until_exp),
                    'status': 'expired' if days_until_exp < 0 else 'active',
                    'notes': 'Demo document',
                },
            )
        self.stdout.write(self.style.SUCCESS('  ✓ 6 compliance documents'))

        # ── Summary ─────────────────────────────────────────────────────────
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('═' * 50))
        self.stdout.write(self.style.SUCCESS('  HR Demo Data Seeded Successfully!'))
        self.stdout.write(self.style.SUCCESS('═' * 50))
        self.stdout.write(f'  Branch:        {branch.name}')
        self.stdout.write(f'  Departments:   {len(departments)}')
        self.stdout.write(f'  Positions:     {len(positions)}')
        self.stdout.write(f'  Employees:     {len(profiles)}')
        self.stdout.write(f'  Leave Types:   {len(leave_types)}')
        self.stdout.write(f'  Tax Brackets:  {len(tax_brackets)}')
        self.stdout.write(f'  Trainings:     {len(trainings)}')
        self.stdout.write(f'  Job Openings:  2')
        self.stdout.write(f'  Applicants:    {len(applicants)}')
        self.stdout.write('')
        self.stdout.write('  Demo login: any employee email with password "demo1234"')
        self.stdout.write('  Example:    kwame@demo.svrs.com / demo1234')
        self.stdout.write(self.style.SUCCESS('═' * 50))
