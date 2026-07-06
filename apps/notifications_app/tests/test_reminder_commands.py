from datetime import date, time, timedelta
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.appointments.models import Appointment
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.vehicles.models import ServiceType, Vehicle, VehicleServiceSchedule


class SendAppointmentRemindersCommandTests(TestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username='appointment-reminder-staff',
            email='appointment.reminder.staff@example.com',
            password='password123',
            role='manager',
        )
        self.branch = Branch.objects.create(
            name='Appointment Branch',
            code='APR',
            created_by=self.staff_user,
        )
        self.customer_user = User.objects.create_user(
            username='appointment-reminder-customer',
            email='appointment.reminder.customer@example.com',
            password='password123',
            role='customer',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Toyota',
            model='Corolla',
            year=2022,
            vin='2T1BURHE0JC123456',
            license_plate='APT123',
            current_mileage=22000,
            engine_type='gasoline',
            transmission_type='automatic',
        )
        self.appointment = Appointment.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            appointment_date=timezone.now().date(),
            appointment_time=time(10, 30),
            service_type='maintenance',
            customer_concerns='Oil change and brake check',
            status='confirmed',
            created_by=self.staff_user,
        )

    @patch('apps.notifications_app.management.commands.send_appointment_reminders.notification_triggers.appointment_reminder')
    def test_command_routes_sms_channel_to_appointment_reminder(self, mock_reminder):
        call_command(
            'send_appointment_reminders',
            hours_ahead=24,
            channel='sms',
            verbosity=0,
        )

        mock_reminder.assert_called_once_with(self.appointment, channel='sms')


class SendServiceRemindersCommandTests(TestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username='service-reminder-staff',
            email='service.reminder.staff@example.com',
            password='password123',
            role='manager',
        )
        self.branch = Branch.objects.create(
            name='Service Branch',
            code='SRM',
            created_by=self.staff_user,
        )
        self.customer_user = User.objects.create_user(
            username='service-reminder-customer',
            email='service.reminder.customer@example.com',
            password='password123',
            role='customer',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Nissan',
            model='Altima',
            year=2021,
            vin='1N4AL3AP7JC654321',
            license_plate='SRV456',
            current_mileage=18000,
            engine_type='gasoline',
            transmission_type='automatic',
            status='active',
        )
        self.service_type = ServiceType.objects.create(
            name='Oil Change',
            default_interval_months=6,
            default_interval_miles=5000,
            created_by=self.staff_user,
        )
        self.schedule = VehicleServiceSchedule.objects.create(
            vehicle=self.vehicle,
            service_type=self.service_type,
            last_service_date=date.today() - timedelta(days=180),
            last_service_mileage=13000,
            next_service_due_date=date.today() + timedelta(days=3),
            next_service_due_mileage=18500,
            is_active=True,
        )

    @patch('apps.notifications_app.management.commands.send_service_reminders.notification_triggers.service_due_reminder')
    def test_command_routes_sms_channel_to_service_reminder(self, mock_reminder):
        call_command(
            'send_service_reminders',
            days_ahead=7,
            channel='sms',
            verbosity=0,
        )

        mock_reminder.assert_called_once_with(self.schedule, channel='sms')
