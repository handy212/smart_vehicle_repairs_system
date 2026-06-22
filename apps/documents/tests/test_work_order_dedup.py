"""Tests for document upload deduplication on work orders."""
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.permission_models import Permission, Role
from apps.customers.models import Customer
from apps.documents.models import Document
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder

User = get_user_model()


class WorkOrderDocumentDedupTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='doc-dedup-user',
            email='doc-dedup@example.com',
            password='password',
            role='manager',
            is_staff=True,
        )
        upload_perm, _ = Permission.objects.update_or_create(
            code='upload_documents',
            defaults={'name': 'Upload Documents', 'category': 'documents', 'is_active': True},
        )
        view_perm, _ = Permission.objects.update_or_create(
            code='view_documents',
            defaults={'name': 'View Documents', 'category': 'documents', 'is_active': True},
        )
        role, _ = Role.objects.update_or_create(
            code='manager',
            defaults={'name': 'Manager', 'is_active': True},
        )
        role.permissions.add(upload_perm, view_perm)

        customer_user = User.objects.create_user(
            username='doc-dedup-cust',
            email='cust@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109188',
            license_plate='DOC-001',
            current_mileage=10000,
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            status='in_progress',
            customer_concerns='Noise',
            odometer_in=10000,
        )
        self.client.force_authenticate(user=self.user)

    def test_rejects_duplicate_filename_and_size_on_same_work_order(self):
        content = b'%PDF-1.4 duplicate test'
        upload = SimpleUploadedFile('report.pdf', content, content_type='application/pdf')
        Document.objects.create(
            title='Existing report',
            work_order=self.work_order,
            uploaded_by=self.user,
            file=SimpleUploadedFile('report.pdf', content, content_type='application/pdf'),
            file_size=len(content),
            file_type='application/pdf',
            original_filename='report.pdf',
        )

        response = self.client.post(
            '/api/documents/documents/',
            {
                'title': 'Duplicate report',
                'work_order': self.work_order.id,
                'file': upload,
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('file', response.data)
        self.assertEqual(Document.objects.filter(work_order=self.work_order).count(), 1)
