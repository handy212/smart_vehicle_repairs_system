"""
Tests for appointments app.
"""
from datetime import date, time, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.branches.models import Branch
from .models import Appointment, ServiceBay, AppointmentReminder

User = get_user_model()


class AppointmentModelTest(TestCase):
    """Test cases for Appointment model."""

    def setUp(self):
        """Set up test data."""
        self.admin_user = User.objects.create_user(
            email='admin@test.com',
            username='admin',
            password='test123',
            first_name='Admin',
            last_name='User',
            phone='0000000000',
            role='admin'
        )
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TST',
            phone='1234567890',
            address='123 Test St',
            city='Test City',
            state='Test State',
            zip_code='12345',
            created_by=self.admin_user
        )
        self.user = User.objects.create_user(
            email='customer@test.com',
            username='customer',
            password='test123',
            first_name='John',
            last_name='Doe',
            phone='1234567890',
            role='customer'
        )
        self.customer = Customer.objects.create(user=self.user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Camry',
            year=2020,
            vin='1HGBH41JXMN109186',
            license_plate='ABC123',
            exterior_color='Blue',
            current_mileage=50000,
            engine_type='gasoline',
            transmission_type='automatic'
        )

    def _create_appointment(self, **kwargs):
        """Helper to create an appointment with defaults."""
        tomorrow = date.today() + timedelta(days=1)
        defaults = {
            'customer': self.customer,
            'vehicle': self.vehicle,
            'branch': self.branch,
            'appointment_date': tomorrow,
            'appointment_time': time(10, 0),
            'service_type': 'maintenance',
            'customer_concerns': 'Regular service',
            'created_by': self.admin_user,
        }
        defaults.update(kwargs)
        return Appointment.objects.create(**defaults)

    def test_create_appointment(self):
        """Test creating an appointment generates a number."""
        appointment = self._create_appointment()
        self.assertIsNotNone(appointment.appointment_number)
        self.assertTrue(appointment.appointment_number.startswith('APT'))
        self.assertEqual(appointment.status, 'pending')

    def test_appointment_number_auto_increment(self):
        """Test that appointment numbers are sequential."""
        apt1 = self._create_appointment()
        apt2 = self._create_appointment(
            appointment_time=time(11, 0),
        )
        num1 = int(apt1.appointment_number.replace('APT', ''))
        num2 = int(apt2.appointment_number.replace('APT', ''))
        self.assertEqual(num2, num1 + 1)

    def test_appointment_number_unique(self):
        """Test that appointment numbers are unique."""
        apt1 = self._create_appointment()
        apt2 = self._create_appointment(appointment_time=time(11, 0))
        self.assertNotEqual(apt1.appointment_number, apt2.appointment_number)

    def test_end_time_calculation(self):
        """Test that end_time property calculates correctly."""
        appointment = self._create_appointment(
            appointment_time=time(10, 0),
            estimated_duration=90,
        )
        self.assertEqual(appointment.end_time, time(11, 30))

    def test_is_today_property(self):
        """Test is_today property returns correct value."""
        today_appointment = self._create_appointment(
            appointment_date=date.today(),
        )
        tomorrow_appointment = self._create_appointment(
            appointment_date=date.today() + timedelta(days=1),
            appointment_time=time(11, 0),
        )
        self.assertTrue(today_appointment.is_today)
        self.assertFalse(tomorrow_appointment.is_today)

    def test_is_past_property(self):
        """Test is_past property for past appointments."""
        past_appointment = self._create_appointment(
            appointment_date=date.today() - timedelta(days=1),
            appointment_time=time(10, 0),
        )
        future_appointment = self._create_appointment(
            appointment_date=date.today() + timedelta(days=1),
            appointment_time=time(10, 0),
        )
        self.assertTrue(past_appointment.is_past)
        self.assertFalse(future_appointment.is_past)

    def test_is_overdue_property(self):
        """Test is_overdue property for pending past appointments."""
        overdue = self._create_appointment(
            appointment_date=date.today() - timedelta(days=1),
            appointment_time=time(10, 0),
        )
        self.assertTrue(overdue.is_overdue)

        # Completed appointments are not overdue
        overdue.status = 'completed'
        overdue.save()
        self.assertFalse(overdue.is_overdue)

    def test_technician_names_property(self):
        """Test technician_names returns comma-separated names."""
        tech1 = User.objects.create_user(
            email='tech1@test.com', username='tech1', password='test123',
            first_name='Tech', last_name='One', phone='1111111111', role='technician'
        )
        tech2 = User.objects.create_user(
            email='tech2@test.com', username='tech2', password='test123',
            first_name='Tech', last_name='Two', phone='2222222222', role='technician'
        )
        appointment = self._create_appointment()
        appointment.assigned_technicians.add(tech1, tech2)
        names = appointment.technician_names
        self.assertIn('Tech One', names)
        self.assertIn('Tech Two', names)

    def test_str_representation(self):
        """Test string representation of appointment."""
        appointment = self._create_appointment()
        expected = f"{appointment.appointment_number} - {self.customer} - {appointment.appointment_date}"
        self.assertEqual(str(appointment), expected)


class ServiceBayModelTest(TestCase):
    """Test cases for ServiceBay model."""

    def test_create_service_bay(self):
        """Test creating a service bay."""
        bay = ServiceBay.objects.create(
            name='Bay 1',
            bay_type='general',
            status='available',
        )
        self.assertTrue(bay.is_available)
        self.assertEqual(str(bay), 'Bay 1 (General Service)')

    def test_is_available_property(self):
        """Test is_available property."""
        bay = ServiceBay.objects.create(name='Bay 2', bay_type='general')
        self.assertTrue(bay.is_available)

        bay.status = 'occupied'
        bay.save()
        self.assertFalse(bay.is_available)

        bay.status = 'available'
        bay.is_active = False
        bay.save()
        self.assertFalse(bay.is_available)


class AppointmentReminderModelTest(TestCase):
    """Test cases for AppointmentReminder model."""

    def setUp(self):
        """Set up test data."""
        self.admin_user = User.objects.create_user(
            email='admin2@test.com', username='admin2', password='test123',
            first_name='Admin', last_name='Two', phone='0000000001', role='admin'
        )
        self.branch = Branch.objects.create(
            name='Test Branch 2', code='TS2', phone='1234567890',
            address='456 Test Ave', city='Test City', state='TS',
            zip_code='12345', created_by=self.admin_user
        )
        self.user = User.objects.create_user(
            email='cust2@test.com', username='cust2', password='test123',
            first_name='Jane', last_name='Smith', phone='9876543210', role='customer'
        )
        self.customer = Customer.objects.create(user=self.user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer, make='Honda', model='Civic', year=2021,
            vin='2HGFC2F59JH123456', license_plate='XYZ789',
            exterior_color='Red', current_mileage=30000,
            engine_type='gasoline', transmission_type='automatic'
        )
        self.appointment = Appointment.objects.create(
            customer=self.customer, vehicle=self.vehicle, branch=self.branch,
            appointment_date=date.today() + timedelta(days=2),
            appointment_time=time(14, 0), service_type='inspection',
            customer_concerns='Check brakes', created_by=self.admin_user,
        )

    def test_create_reminder(self):
        """Test creating an appointment reminder."""
        reminder = AppointmentReminder.objects.create(
            appointment=self.appointment,
            reminder_type='email',
            scheduled_send_time=timezone.now(),
        )
        self.assertEqual(reminder.status, 'scheduled')
        self.assertIsNone(reminder.sent_at)

    def test_reminder_str(self):
        """Test string representation of reminder."""
        reminder = AppointmentReminder.objects.create(
            appointment=self.appointment,
            reminder_type='sms',
            scheduled_send_time=timezone.now(),
        )
        self.assertIn(self.appointment.appointment_number, str(reminder))
        self.assertIn('SMS', str(reminder))


class AppointmentAPITest(APITestCase):
    """Test cases for Appointment API endpoints."""

    def setUp(self):
        """Set up test data and authenticate."""
        self.admin_user = User.objects.create_user(
            email='apiadmin@test.com', username='apiadmin', password='test123',
            first_name='API', last_name='Admin', phone='5555555555', role='admin'
        )
        self.branch = Branch.objects.create(
            name='API Branch', code='API', phone='1234567890',
            address='789 API Blvd', city='API City', state='AP',
            zip_code='99999', created_by=self.admin_user
        )
        self.customer_user = User.objects.create_user(
            email='apicust@test.com', username='apicust', password='test123',
            first_name='API', last_name='Customer', phone='6666666666', role='customer'
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer, make='Ford', model='Mustang', year=2022,
            vin='3FAHP0HA1CR123456', license_plate='API001',
            exterior_color='Black', current_mileage=15000,
            engine_type='gasoline', transmission_type='automatic'
        )
        self.client.force_authenticate(user=self.admin_user)

        # Assign branch to admin user
        self.admin_user.branch = self.branch
        self.admin_user.save(update_fields=['branch'])

    def _create_appointment(self, **kwargs):
        """Helper to create test appointments."""
        tomorrow = date.today() + timedelta(days=1)
        defaults = {
            'customer': self.customer,
            'vehicle': self.vehicle,
            'branch': self.branch,
            'appointment_date': tomorrow,
            'appointment_time': time(10, 0),
            'service_type': 'maintenance',
            'customer_concerns': 'Regular service',
            'created_by': self.admin_user,
        }
        defaults.update(kwargs)
        return Appointment.objects.create(**defaults)

    def test_list_appointments(self):
        """Test listing appointments."""
        self._create_appointment()
        self._create_appointment(appointment_time=time(14, 0))
        response = self.client.get('/api/appointments/appointments/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['count'], 2)

    def test_retrieve_appointment(self):
        """Test retrieving a single appointment."""
        appointment = self._create_appointment()
        response = self.client.get(f'/api/appointments/appointments/{appointment.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['appointment_number'], appointment.appointment_number)

    def test_today_endpoint(self):
        """Test today's appointments endpoint."""
        self._create_appointment(appointment_date=date.today())
        self._create_appointment(
            appointment_date=date.today() + timedelta(days=1),
            appointment_time=time(11, 0)
        )
        response = self.client.get('/api/appointments/appointments/today/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_upcoming_endpoint(self):
        """Test upcoming appointments endpoint."""
        self._create_appointment()
        response = self.client.get('/api/appointments/appointments/upcoming/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_confirm_appointment(self):
        """Test confirming a pending appointment."""
        appointment = self._create_appointment()
        response = self.client.post(
            f'/api/appointments/appointments/{appointment.id}/confirm/',
            {'confirmation_method': 'email'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'confirmed')

    def test_confirm_non_pending_fails(self):
        """Test that confirming a non-pending appointment fails."""
        appointment = self._create_appointment()
        appointment.status = 'completed'
        appointment.save()
        response = self.client.post(
            f'/api/appointments/appointments/{appointment.id}/confirm/'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_check_in_appointment(self):
        """Test checking in for an appointment."""
        appointment = self._create_appointment()
        appointment.status = 'confirmed'
        appointment.save()
        response = self.client.post(
            f'/api/appointments/appointments/{appointment.id}/check_in/'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'in_progress')
        self.assertTrue(response.data['checked_in'])

    def test_complete_appointment(self):
        """Test completing an appointment."""
        appointment = self._create_appointment()
        appointment.status = 'in_progress'
        appointment.save()
        response = self.client.post(
            f'/api/appointments/appointments/{appointment.id}/complete/'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'completed')

    def test_complete_non_in_progress_fails(self):
        """Test that completing a non-in-progress appointment fails."""
        appointment = self._create_appointment()
        response = self.client.post(
            f'/api/appointments/appointments/{appointment.id}/complete/'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancel_appointment(self):
        """Test cancelling an appointment."""
        appointment = self._create_appointment()
        response = self.client.post(
            f'/api/appointments/appointments/{appointment.id}/cancel/',
            {'reason': 'Schedule conflict'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'cancelled')

    def test_cancel_completed_fails(self):
        """Test that cancelling a completed appointment fails."""
        appointment = self._create_appointment()
        appointment.status = 'completed'
        appointment.save()
        response = self.client.post(
            f'/api/appointments/appointments/{appointment.id}/cancel/'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reschedule_appointment(self):
        """Test rescheduling an appointment."""
        appointment = self._create_appointment()
        new_date = (date.today() + timedelta(days=3)).isoformat()
        response = self.client.post(
            f'/api/appointments/appointments/{appointment.id}/reschedule/',
            {'appointment_date': new_date, 'appointment_time': '14:00'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'rescheduled')

    def test_reschedule_to_past_fails(self):
        """Test that rescheduling to a past date fails."""
        appointment = self._create_appointment()
        past_date = (date.today() - timedelta(days=1)).isoformat()
        response = self.client.post(
            f'/api/appointments/appointments/{appointment.id}/reschedule/',
            {'appointment_date': past_date, 'appointment_time': '10:00'}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_calendar_endpoint(self):
        """Test calendar view returns grouped data."""
        self._create_appointment()
        start = date.today().isoformat()
        end = (date.today() + timedelta(days=7)).isoformat()
        response = self.client.get(
            f'/api/appointments/appointments/calendar/?start_date={start}&end_date={end}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 8)  # 8 days inclusive

    def test_available_slots_endpoint(self):
        """Test available slots returns time slots."""
        target_date = (date.today() + timedelta(days=1)).isoformat()
        response = self.client.get(
            f'/api/appointments/appointments/available_slots/?date={target_date}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('slots', response.data)


class ServiceBayAPITest(APITestCase):
    """Test cases for ServiceBay API endpoints."""

    def setUp(self):
        self.admin = User.objects.create_user(
            email='bayadmin@test.com', username='bayadmin', password='test123',
            first_name='Bay', last_name='Admin', phone='7777777777', role='admin'
        )
        self.client.force_authenticate(user=self.admin)

    def test_list_service_bays(self):
        """Test listing service bays."""
        ServiceBay.objects.create(name='Bay A', bay_type='general')
        ServiceBay.objects.create(name='Bay B', bay_type='diagnostic')
        response = self.client.get('/api/appointments/service-bays/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_available_bays_endpoint(self):
        """Test available bays filter."""
        ServiceBay.objects.create(name='Bay C', bay_type='general', status='available')
        ServiceBay.objects.create(name='Bay D', bay_type='general', status='occupied')
        response = self.client.get('/api/appointments/service-bays/available/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Only available bays should be returned
        for bay in response.data:
            self.assertEqual(bay['status'], 'available')
