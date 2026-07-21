from io import BytesIO

import openpyxl
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.branches.models import Branch
from apps.data_exchange.importers.staff import StaffImporter
from apps.hr.models import EmployeeProfile

User = get_user_model()


def _xlsx_from_rows(headers, rows):
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    buffer.name = 'staff.xlsx'
    return buffer


class StaffImporterTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='admin@example.com',
            email='admin@example.com',
            password='pass12345',
            role='admin',
            is_staff=True,
        )
        self.branch = Branch.objects.create(
            name='HQ',
            code='HQ',
            is_active=True,
            is_headquarters=True,
            created_by=self.admin,
        )
        self.importer = StaffImporter()

    def _staff_row(self, email, role='technician', first_name='Import', last_name='User'):
        return [
            email,
            first_name,
            last_name,
            role,
            self.branch.code,
            'StrongPass123!',
        ]

    def test_update_existing_rejects_customer_account_without_mutating_access(self):
        customer = User.objects.create_user(
            username='customer@example.com',
            email='customer@example.com',
            password='pass12345',
            first_name='Original',
            last_name='Customer',
            role='customer',
            is_staff=False,
        )
        buffer = _xlsx_from_rows(
            ['email', 'first_name', 'last_name', 'role', 'branch', 'password'],
            [self._staff_row('customer@example.com', first_name='Imported', last_name='Technician')],
        )

        result = self.importer.commit(buffer, {'update_existing': True})

        self.assertEqual(result.summary['rows_failed'], 1)
        self.assertEqual(result.summary['staff_to_update'], 0)
        self.assertEqual(result.summary['staff_updated'], 0)
        self.assertTrue(any(issue.code == 'existing_non_staff_account' for issue in result.issues))
        customer.refresh_from_db()
        self.assertEqual(customer.role, 'customer')
        self.assertFalse(customer.is_staff)
        self.assertEqual(customer.first_name, 'Original')
        self.assertFalse(EmployeeProfile.objects.filter(user=customer).exists())

    def test_update_existing_allows_existing_staff_account(self):
        staff = User.objects.create_user(
            username='tech@example.com',
            email='tech@example.com',
            password='pass12345',
            first_name='Old',
            last_name='Name',
            role='technician',
            is_staff=True,
            branch=self.branch,
        )
        buffer = _xlsx_from_rows(
            ['email', 'first_name', 'last_name', 'role', 'branch', 'password'],
            [self._staff_row('tech@example.com', role='receptionist', first_name='New', last_name='Name')],
        )

        result = self.importer.commit(buffer, {'update_existing': True})

        self.assertEqual(result.summary['rows_failed'], 0)
        self.assertEqual(result.summary['staff_to_update'], 1)
        self.assertEqual(result.summary['staff_updated'], 1)
        staff.refresh_from_db()
        self.assertEqual(staff.role, 'receptionist')
        self.assertTrue(staff.is_staff)
        self.assertEqual(staff.first_name, 'New')
        self.assertTrue(EmployeeProfile.objects.filter(user=staff).exists())
