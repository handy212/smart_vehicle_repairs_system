from datetime import date, time, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.permission_models import Permission, Role
from apps.appointments.models import Appointment
from apps.billing.models import Estimate, Invoice
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.notifications_app.document_links import (
    build_public_document_pdf_url,
    build_signed_document_token,
    create_or_reuse_share_code,
    resolve_document_ref,
    unsign_document_token,
)
from apps.notifications_app.models import DocumentShareLink, NotificationTemplate
from apps.notifications_app.phone_utils import format_phone_display, normalize_phone_e164
from apps.notifications_app.whatsapp_share import (
    build_estimate_share,
    build_invoice_share,
    build_job_card_share,
)
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder


class PhoneNormalizeTests(SimpleTestCase):
    def test_ghana_local_to_e164(self):
        self.assertEqual(normalize_phone_e164('0244123456'), '233244123456')
        self.assertEqual(normalize_phone_e164('244123456'), '233244123456')
        self.assertEqual(normalize_phone_e164('+233 24 412 3456'), '233244123456')
        self.assertEqual(normalize_phone_e164('233244123456'), '233244123456')

    def test_display_format(self):
        self.assertEqual(format_phone_display('0244123456'), '+233 24 412 3456')


class SignedDocumentLinkTests(SimpleTestCase):
    def test_legacy_round_trip_token(self):
        token = build_signed_document_token('invoice', 42)
        data = unsign_document_token(token)
        self.assertEqual(data, {'document_type': 'invoice', 'object_id': 42})


class ShortDocumentLinkTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            username='short-doc-staff',
            email='short-doc-staff@example.com',
            password='testpass',
            role='admin',
            is_staff=True,
        )
        self.branch = Branch.objects.create(
            name='Short Doc Branch',
            code='SDB',
            created_by=self.staff,
        )
        self.customer_user = User.objects.create_user(
            username='short-doc-customer',
            email='short-doc-customer@example.com',
            password='testpass',
            role='customer',
            phone='0244123456',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            year=2021,
            make='Toyota',
            model='Corolla',
            vin='1HGBH41JXMN109197',
            license_plate='SHORT-1',
            current_mileage=10000,
        )
        self.invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='draft',
            total=Decimal('250.00'),
            amount_due=Decimal('250.00'),
            due_date=timezone.now().date() + timedelta(days=7),
            created_by=self.staff,
        )

    @patch('apps.notifications_app.document_links.get_site_url', return_value='https://shop.example.com')
    def test_public_url_is_short(self, _mock):
        url = build_public_document_pdf_url('invoice', self.invoice.id)
        self.assertRegex(url, r'^https://shop\.example\.com/d/[A-Za-z0-9]{8}/$')
        self.assertLess(len(url), 60)

    def test_reuse_existing_code(self):
        first = create_or_reuse_share_code('invoice', self.invoice.id)
        second = create_or_reuse_share_code('invoice', self.invoice.id)
        self.assertEqual(first, second)
        self.assertEqual(DocumentShareLink.objects.filter(document_type='invoice', object_id=self.invoice.id).count(), 1)

    def test_resolve_short_code_and_legacy_token(self):
        code = create_or_reuse_share_code('invoice', self.invoice.id)
        self.assertEqual(
            resolve_document_ref(code),
            {'document_type': 'invoice', 'object_id': self.invoice.id},
        )
        token = build_signed_document_token('invoice', self.invoice.id)
        self.assertEqual(
            resolve_document_ref(token),
            {'document_type': 'invoice', 'object_id': self.invoice.id},
        )

    @patch('apps.notifications_app.whatsapp_share.get_site_url', return_value='https://shop.example.com')
    def test_share_message_contains_short_url(self, _mock_url):
        share = build_invoice_share(self.invoice)
        self.assertRegex(share['document_pdf_url'], r'/d/[A-Za-z0-9]{8}/$')
        self.assertIn('/d/', share['message'])

    def test_short_url_endpoint_serves_pdf(self):
        code = create_or_reuse_share_code('invoice', self.invoice.id)
        with patch('apps.core.services.print_service.generate_invoice_pdf') as mock_pdf:
            from django.http import HttpResponse
            mock_pdf.return_value = HttpResponse(b'%PDF-1.4', content_type='application/pdf')
            public = APIClient()
            response = public.get(f'/d/{code}/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response['Content-Type'], 'application/pdf')
            mock_pdf.assert_called_once()


class WhatsAppShareHelpersTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            username='wa-share-staff2',
            email='wa-share-staff2@example.com',
            password='testpass',
            role='admin',
            is_staff=True,
        )
        self.branch = Branch.objects.create(
            name='WA Share Branch 2',
            code='WAS2',
            created_by=self.staff,
        )
        self.customer_user = User.objects.create_user(
            username='wa-share-customer2',
            email='wa-share-customer2@example.com',
            password='testpass',
            role='customer',
            phone='0244123456',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            year=2021,
            make='Toyota',
            model='Corolla',
            vin='1HGBH41JXMN109198',
            license_plate='WA-SHR2',
            current_mileage=10000,
        )

    @patch('apps.notifications_app.whatsapp_share.get_site_url', return_value='https://shop.example.com')
    def test_build_invoice_share_normalizes_phone_and_signed_pdf(self, _mock_url):
        invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='draft',
            total=Decimal('250.00'),
            amount_due=Decimal('250.00'),
            due_date=timezone.now().date() + timedelta(days=7),
            created_by=self.staff,
        )
        share = build_invoice_share(invoice)
        self.assertEqual(share['phone_number'], '233244123456')
        self.assertEqual(share['phone_display'], '+233 24 412 3456')
        self.assertRegex(share['document_pdf_url'], r'/d/[A-Za-z0-9]{8}/$')
        self.assertIn('Download PDF:', share['message'])
        self.assertIn(invoice.invoice_number, share['message'])

    @patch('apps.notifications_app.whatsapp_share.get_site_url', return_value='https://shop.example.com')
    def test_build_estimate_and_job_card_share(self, _mock_url):
        estimate = Estimate.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='draft',
            total=Decimal('180.00'),
            valid_until=timezone.now().date() + timedelta(days=14),
            created_by=self.staff,
        )
        wo = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='in_progress',
            odometer_in=10000,
            customer_concerns='Brake noise',
        )
        self.assertIn('Download PDF:', build_estimate_share(estimate)['message'])
        self.assertIn('Download PDF:', build_job_card_share(wo)['message'])


class TemplateRenderDocumentBranchScopeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        send_notifications, _ = Permission.objects.update_or_create(
            code='send_notifications',
            defaults={
                'name': 'Send Notifications',
                'category': 'notifications',
                'is_active': True,
            },
        )
        manager_role, _ = Role.objects.update_or_create(
            code='manager',
            defaults={
                'name': 'Manager',
                'is_active': True,
            },
        )
        manager_role.permissions.add(send_notifications)

        self.manager = User.objects.create_user(
            username='template-render-manager',
            email='template-render-manager@example.com',
            password='testpass',
            role='manager',
        )
        self.branch = Branch.objects.create(
            name='Template Render Branch',
            code='TRB',
            created_by=self.manager,
        )
        self.other_branch = Branch.objects.create(
            name='Template Render Other',
            code='TRO',
            created_by=self.manager,
        )
        self.manager.managed_branches.add(self.branch)
        self.client.force_authenticate(user=self.manager)

        self.customer = self._create_customer('same', '0244123456')
        self.other_customer = self._create_customer('other', '0202000000')
        self.vehicle = self._create_vehicle(self.customer, 'TR-SAME')
        self.other_vehicle = self._create_vehicle(self.other_customer, 'TR-OTHER')
        self.url = '/api/notifications/render-template/'

    def _create_customer(self, suffix, phone):
        user = User.objects.create_user(
            username=f'template-render-customer-{suffix}',
            email=f'template-render-customer-{suffix}@example.com',
            password='testpass',
            role='customer',
            phone=phone,
            first_name='Template',
            last_name=f'{suffix.title()} Customer',
        )
        return Customer.objects.create(user=user)

    def _create_vehicle(self, customer, plate):
        return Vehicle.objects.create(
            owner=customer,
            year=2021,
            make='Toyota',
            model='Corolla',
            vin=f'1HGBH41JXMN{customer.id:06d}',
            license_plate=plate,
            current_mileage=10000,
        )

    def _create_invoice(self, branch, customer, vehicle):
        return Invoice.objects.create(
            customer=customer,
            vehicle=vehicle,
            branch=branch,
            status='draft',
            total=Decimal('250.00'),
            amount_due=Decimal('250.00'),
            due_date=timezone.now().date() + timedelta(days=7),
            created_by=self.manager,
        )

    def _create_estimate(self, branch, customer, vehicle):
        return Estimate.objects.create(
            customer=customer,
            vehicle=vehicle,
            branch=branch,
            status='draft',
            total=Decimal('180.00'),
            valid_until=timezone.now().date() + timedelta(days=14),
            created_by=self.manager,
        )

    def _create_work_order(self, branch, customer, vehicle):
        return WorkOrder.objects.create(
            customer=customer,
            vehicle=vehicle,
            branch=branch,
            status='in_progress',
            odometer_in=10000,
            customer_concerns='Brake noise',
        )

    def _create_appointment(self, branch, customer, vehicle):
        return Appointment.objects.create(
            customer=customer,
            vehicle=vehicle,
            branch=branch,
            appointment_date=date.today(),
            appointment_time=time(9, 0),
            service_type='maintenance',
            status='confirmed',
            estimated_duration=60,
            customer_concerns='Oil change',
        )

    def _create_template(self, template_type, body):
        return NotificationTemplate.objects.create(
            name=f'Template {template_type}',
            template_type=template_type,
            channel='whatsapp_manual',
            body=body,
            is_active=True,
            created_by=self.manager,
        )

    @patch('apps.notifications_app.whatsapp_share.get_site_url', return_value='https://shop.example.com')
    def test_document_render_allows_same_branch_invoice(self, _mock_url):
        invoice = self._create_invoice(self.branch, self.customer, self.vehicle)

        response = self.client.post(
            self.url,
            {'template_type': 'invoice', 'object_id': invoice.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['phone_number'], '233244123456')
        self.assertIn('Download PDF:', response.data['message'])
        self.assertEqual(
            DocumentShareLink.objects.filter(document_type='invoice', object_id=invoice.id).count(),
            1,
        )

    @patch('apps.notifications_app.whatsapp_share.get_site_url', return_value='https://shop.example.com')
    def test_document_render_denies_other_branch_documents(self, _mock_url):
        invoice = self._create_invoice(self.other_branch, self.other_customer, self.other_vehicle)
        estimate = self._create_estimate(self.other_branch, self.other_customer, self.other_vehicle)
        work_order = self._create_work_order(self.other_branch, self.other_customer, self.other_vehicle)

        cases = [
            ('invoice', 'invoice', invoice.id),
            ('estimate', 'estimate', estimate.id),
            ('job_card', 'job_card', work_order.id),
        ]
        for template_type, document_type, object_id in cases:
            with self.subTest(template_type=template_type):
                response = self.client.post(
                    self.url,
                    {'template_type': template_type, 'object_id': object_id},
                    format='json',
                )

                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
                self.assertFalse(
                    DocumentShareLink.objects.filter(
                        document_type=document_type,
                        object_id=object_id,
                    ).exists()
                )

    def test_template_render_fallback_allows_same_branch_objects(self):
        appointment = self._create_appointment(self.branch, self.customer, self.vehicle)
        work_order = self._create_work_order(self.branch, self.customer, self.vehicle)
        invoice = self._create_invoice(self.branch, self.customer, self.vehicle)

        cases = [
            (
                'appointment_reminder',
                appointment.id,
                'Appointment for {customer_name} on {appointment_date}',
                'Appointment for Template Same Customer',
                '0244123456',
            ),
            (
                'work_order_completed',
                work_order.id,
                'Work order {wo_number} ready for {customer_name}',
                'Work order',
                '0244123456',
            ),
            (
                'invoice_due',
                invoice.id,
                'Invoice {invoice_number} total {total}',
                '250.00',
                '0244123456',
            ),
        ]
        for template_type, object_id, body, expected_message, expected_phone in cases:
            with self.subTest(template_type=template_type):
                self._create_template(template_type, body)
                response = self.client.post(
                    self.url,
                    {'template_type': template_type, 'object_id': object_id},
                    format='json',
                )

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertIn(expected_message, response.data['message'])
                self.assertEqual(response.data['phone_number'], expected_phone)

    def test_template_render_fallback_denies_other_branch_objects(self):
        appointment = self._create_appointment(
            self.other_branch,
            self.other_customer,
            self.other_vehicle,
        )
        work_order = self._create_work_order(
            self.other_branch,
            self.other_customer,
            self.other_vehicle,
        )
        invoice = self._create_invoice(
            self.other_branch,
            self.other_customer,
            self.other_vehicle,
        )

        cases = [
            (
                'appointment_reminder',
                appointment.id,
                'Appointment for {customer_name} on {appointment_date}',
            ),
            (
                'work_order_completed',
                work_order.id,
                'Work order {wo_number} ready for {customer_name}',
            ),
            (
                'invoice_due',
                invoice.id,
                'Invoice {invoice_number} total {total}',
            ),
        ]
        for template_type, object_id, body in cases:
            with self.subTest(template_type=template_type):
                self._create_template(template_type, body)
                response = self.client.post(
                    self.url,
                    {'template_type': template_type, 'object_id': object_id},
                    format='json',
                )

                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class WhatsAppSendApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        Permission.objects.update_or_create(
            code='edit_invoices',
            defaults={
                'name': 'Edit Invoices',
                'category': 'billing',
                'is_active': True,
            },
        )
        self.staff = User.objects.create_user(
            username='wa-api-staff2',
            email='wa-api-staff2@example.com',
            password='testpass',
            role='admin',
            is_staff=True,
        )
        self.branch = Branch.objects.create(
            name='WA API Branch 2',
            code='WAA2',
            created_by=self.staff,
        )
        self.customer_user = User.objects.create_user(
            username='wa-api-customer2',
            email='wa-api-customer2@example.com',
            password='testpass',
            role='customer',
            phone='0202000000',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            year=2019,
            make='Honda',
            model='Civic',
            vin='2HGBH41JXMN109189',
            license_plate='WA-API2',
            current_mileage=20000,
        )
        self.client.force_authenticate(user=self.staff)

    @patch('apps.notifications_app.whatsapp_share.get_site_url', return_value='https://shop.example.com')
    def test_invoice_whatsapp_preview_then_manual_confirm(self, _mock_url):
        invoice = Invoice.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='draft',
            total=Decimal('100.00'),
            amount_due=Decimal('100.00'),
            due_date=timezone.now().date() + timedelta(days=5),
            created_by=self.staff,
        )
        preview = self.client.post(f'/api/billing/invoices/{invoice.id}/send-whatsapp/', {})
        self.assertEqual(preview.status_code, status.HTTP_200_OK)
        self.assertEqual(preview.data['mode'], 'preview')
        self.assertEqual(preview.data['phone_number'], '233202000000')

        with patch('apps.notifications_app.whatsapp_service.get_whatsapp_service') as mock_get:
            mock_wa = MagicMock()
            mock_wa.is_available.return_value = False
            mock_get.return_value = mock_wa
            confirmed = self.client.post(
                f'/api/billing/invoices/{invoice.id}/send-whatsapp/',
                {'confirm': True},
                format='json',
            )
        self.assertEqual(confirmed.status_code, status.HTTP_200_OK)
        self.assertEqual(confirmed.data['mode'], 'manual')
        self.assertIn('Download PDF:', confirmed.data['message'])


class WhatsAppDocumentFallbackTests(SimpleTestCase):
    @patch('apps.notifications_app.services.get_whatsapp_service')
    def test_document_failure_falls_back_to_text(self, mock_get_service):
        from apps.notifications_app.services import NotificationService

        mock_wa = MagicMock()
        mock_wa.is_available.return_value = True
        mock_wa.send_document.return_value = (False, 'unreachable url')
        mock_wa.send_message.return_value = (True, 'wamid.text')
        mock_get_service.return_value = mock_wa

        notification = MagicMock()
        notification.channel = 'whatsapp'
        notification.notification_type = 'estimate'
        notification.message = 'Estimate ready'
        notification.data = {
            'document_pdf_url': 'https://shop.example.com/d/abc12345/',
            'filename': 'Estimate_1.pdf',
            'document_type': 'estimate',
        }
        notification.template = None
        recipient = MagicMock()
        pref = MagicMock()
        pref.phone_number = '0244123456'
        recipient.notification_preferences = pref
        notification.recipient = recipient

        result = NotificationService()._send_whatsapp(notification)
        self.assertTrue(result)
        mock_wa.send_document.assert_called()
        mock_wa.send_message.assert_called()
