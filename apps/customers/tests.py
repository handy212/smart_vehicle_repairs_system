from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.customers.models import Customer, CustomerContact
from apps.customers.serializers import CustomerCreateSerializer, CustomerUpdateSerializer
from rest_framework.test import APIClient
from datetime import timedelta

User = get_user_model()

class CustomerStatsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(
            username='admin',
            email='admin@example.com',
            password='password123',
            role='admin'
        )
        self.client.force_authenticate(user=self.user)
        
        # Create some customers for this month
        today = timezone.now()
        for i in range(5):
            u = User.objects.create(username=f'cust{i}', email=f'c{i}@ex.com', role='customer')
            Customer.objects.create(user=u, customer_number=f'CUST-{i:05d}', status='active')
            
        # Create some customers for last month
        last_month = today - timedelta(days=32)
        for i in range(3):
            u = User.objects.create(username=f'oldcust{i}', email=f'oc{i}@ex.com', role='customer')
            c = Customer.objects.create(user=u, customer_number=f'CUST-OLD-{i:05d}', status='active')
            # Manually update created_at since auto_now_add=True
            Customer.objects.filter(id=c.id).update(created_at=last_month)

    def test_dashboard_stats(self):
        response = self.client.get('/api/customers/customers/dashboard_stats/')
        self.assertEqual(response.status_code, 200)
        data = response.data
        
        self.assertEqual(data['total_customers'], 8)
        self.assertEqual(data['new_this_month'], 5)
        # 5 this month, 3 last month. Growth = (5-3)/3 * 100 = 66.7%
        self.assertEqual(data['growth_percentage'], 66.7)


class CustomerPrimaryContactCreationTest(TestCase):
    def test_business_customer_creation_adds_primary_contact_record(self):
        serializer = CustomerCreateSerializer(data={
            'email': 'fleet@example.com',
            'first_name': 'Jane',
            'last_name': 'Smith',
            'phone': '+233200000001',
            'customer_type': 'business',
            'company_name': 'Acme Fleet',
            'occupation': 'Fleet Manager',
            'status': 'active',
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        customer = serializer.save()

        self.assertEqual(customer.contact_person_name, 'Jane Smith')
        self.assertEqual(customer.contacts.count(), 1)

        contact = customer.contacts.first()
        self.assertIsNotNone(contact)
        self.assertEqual(contact.first_name, 'Jane')
        self.assertEqual(contact.last_name, 'Smith')
        self.assertEqual(contact.email, 'fleet@example.com')
        self.assertEqual(contact.phone, '+233200000001')
        self.assertEqual(contact.job_title, 'Fleet Manager')
        self.assertTrue(contact.is_primary)

    def test_individual_customer_creation_does_not_add_contact_record(self):
        serializer = CustomerCreateSerializer(data={
            'email': 'individual@example.com',
            'first_name': 'John',
            'last_name': 'Doe',
            'customer_type': 'individual',
            'status': 'active',
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        customer = serializer.save()

        self.assertEqual(CustomerContact.objects.filter(customer=customer).count(), 0)

    def test_business_customer_update_syncs_existing_primary_contact(self):
        create_serializer = CustomerCreateSerializer(data={
            'email': 'sync@example.com',
            'first_name': 'Jane',
            'last_name': 'Smith',
            'phone': '+233200000001',
            'customer_type': 'business',
            'company_name': 'Sync Fleet',
            'occupation': 'Fleet Manager',
            'status': 'active',
        })
        self.assertTrue(create_serializer.is_valid(), create_serializer.errors)
        customer = create_serializer.save()

        update_serializer = CustomerUpdateSerializer(
            instance=customer,
            data={
                'first_name': 'Janet',
                'last_name': 'Jones',
                'email': 'janet@example.com',
                'phone': '+233200000099',
                'occupation': 'Operations Lead',
                'contact_person_name': '',
                'customer_type': 'business',
            },
            partial=True,
        )
        self.assertTrue(update_serializer.is_valid(), update_serializer.errors)
        updated_customer = update_serializer.save()

        self.assertEqual(updated_customer.contact_person_name, 'Janet Jones')
        primary_contact = updated_customer.contacts.get(is_primary=True)
        self.assertEqual(primary_contact.first_name, 'Janet')
        self.assertEqual(primary_contact.last_name, 'Jones')
        self.assertEqual(primary_contact.email, 'janet@example.com')
        self.assertEqual(primary_contact.phone, '+233200000099')
        self.assertEqual(primary_contact.job_title, 'Operations Lead')

    def test_business_customer_update_creates_primary_contact_if_missing(self):
        create_serializer = CustomerCreateSerializer(data={
            'email': 'legacy@example.com',
            'first_name': 'Legacy',
            'last_name': 'Owner',
            'customer_type': 'business',
            'company_name': 'Legacy Fleet',
            'status': 'active',
        })
        self.assertTrue(create_serializer.is_valid(), create_serializer.errors)
        customer = create_serializer.save()
        customer.contacts.all().delete()

        update_serializer = CustomerUpdateSerializer(
            instance=customer,
            data={
                'first_name': 'Legacy',
                'last_name': 'Coordinator',
                'email': 'coordinator@example.com',
                'phone': '+233200000123',
                'occupation': 'Coordinator',
                'customer_type': 'business',
            },
            partial=True,
        )
        self.assertTrue(update_serializer.is_valid(), update_serializer.errors)
        updated_customer = update_serializer.save()

        self.assertEqual(updated_customer.contacts.count(), 1)
        primary_contact = updated_customer.contacts.get()
        self.assertTrue(primary_contact.is_primary)
        self.assertEqual(primary_contact.first_name, 'Legacy')
        self.assertEqual(primary_contact.last_name, 'Coordinator')

    def test_backfill_command_creates_missing_primary_contacts(self):
        user = User.objects.create_user(
            username='legacy-fleet',
            email='legacy-fleet@example.com',
            password='password123',
            first_name='Alex',
            last_name='Morgan',
            phone='+233200000222',
            role='customer',
        )
        customer = Customer.objects.create(
            user=user,
            customer_number='CUST-LEGACY-001',
            customer_type='fleet',
            company_name='Legacy Fleet Ltd',
            occupation='Fleet Supervisor',
            status='active',
        )

        from django.core.management import call_command

        call_command('sync_business_customer_contacts')

        customer.refresh_from_db()
        self.assertEqual(customer.contact_person_name, 'Alex Morgan')
        self.assertEqual(customer.contacts.count(), 1)
        contact = customer.contacts.get()
        self.assertTrue(contact.is_primary)
        self.assertEqual(contact.first_name, 'Alex')
        self.assertEqual(contact.last_name, 'Morgan')
        self.assertEqual(contact.email, 'legacy-fleet@example.com')
        self.assertEqual(contact.phone, '+233200000222')
        self.assertEqual(contact.job_title, 'Fleet Supervisor')
