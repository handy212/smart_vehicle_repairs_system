from django.test import TestCase, override_settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.accounting.models import DocumentNumberSequence
from apps.branches.models import Branch
from apps.customers.models import Customer, CustomerContact
from apps.customers.serializers import CustomerCreateSerializer, CustomerUpdateSerializer
from rest_framework.test import APIClient
from datetime import timedelta

User = get_user_model()

@override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
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
        month_start = today.date().replace(day=1)
        for i in range(5):
            u = User.objects.create(username=f'cust{i}', email=f'c{i}@ex.com', role='customer')
            Customer.objects.create(
                user=u,
                customer_number=f'CUST-{i:05d}',
                status='active',
                customer_type='business' if i == 0 else 'individual',
                company_name='Acme Services' if i == 0 else '',
            )
            
        # Create some customers for last month
        last_month_end = month_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        last_month_mid = timezone.make_aware(
            timezone.datetime.combine(
                last_month_start + timedelta(days=10),
                timezone.datetime.min.time(),
            )
        )
        for i in range(3):
            u = User.objects.create(username=f'oldcust{i}', email=f'oc{i}@ex.com', role='customer')
            c = Customer.objects.create(user=u, customer_number=f'CUST-OLD-{i:05d}', status='active')
            Customer.objects.filter(id=c.id).update(created_at=last_month_mid)

    def test_dashboard_stats(self):
        response = self.client.get('/api/customers/customers/dashboard_stats/')
        self.assertEqual(response.status_code, 200)
        data = response.data
        
        self.assertEqual(data['total_customers'], 8)
        self.assertEqual(data['individual_customers'], 7)
        self.assertEqual(data['company_customers'], 1)
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


class CustomerNumberingTest(TestCase):
    def setUp(self):
        from apps.branches.models import Branch

        self.admin = User.objects.create_superuser(
            username='numbering_admin',
            email='numbering_admin@example.com',
            password='password123',
            role='admin',
        )
        self.branch = Branch.objects.create(
            name='Kumasi',
            code='KSI',
            phone='555-0100',
            address='1 High Street',
            city='Kumasi',
            region='Ashanti',
            zip_code='00233',
            country='Ghana',
            is_active=True,
            is_headquarters=True,
            created_by=self.admin,
        )

    def test_auto_customer_number_uses_short_global_sequence(self):
        user = User.objects.create_user(
            username='cust001',
            email='cust001@example.com',
            password='password123',
            role='customer',
        )
        customer = Customer(user=user, status='active')
        customer._numbering_branch = self.branch
        customer.save()

        self.assertRegex(customer.customer_number, r'^C\d+$')

    def test_create_serializer_assigns_short_customer_number(self):
        serializer = CustomerCreateSerializer(
            data={
                'email': 'newcust@example.com',
                'first_name': 'New',
                'last_name': 'Customer',
                'phone': '+233200000099',
                'customer_type': 'individual',
                'status': 'active',
            },
            context={'numbering_branch': self.branch},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        customer = serializer.save()
        self.assertEqual(customer.customer_number, 'C1')

        user2 = User.objects.create_user(
            username='cust002',
            email='cust002@example.com',
            password='password123',
            role='customer',
        )
        second = Customer(user=user2, status='active')
        second._numbering_branch = self.branch
        second.save()
        self.assertEqual(second.customer_number, 'C2')

    def test_customer_number_sequence_is_global_across_request_branches(self):
        other_branch = Branch.objects.create(
            name='Accra',
            code='ACC',
            phone='555-0200',
            address='2 Ring Road',
            city='Accra',
            region='Greater Accra',
            zip_code='00233',
            country='Ghana',
            is_active=True,
            created_by=self.admin,
        )

        first_user = User.objects.create_user(
            username='branch-cust-001',
            email='branch-cust-001@example.com',
            password='password123',
            role='customer',
        )
        first = Customer(user=first_user, status='active')
        first._numbering_branch = self.branch
        first.save()

        second_user = User.objects.create_user(
            username='branch-cust-002',
            email='branch-cust-002@example.com',
            password='password123',
            role='customer',
        )
        second = Customer(user=second_user, status='active')
        second._numbering_branch = other_branch
        second.save()

        self.assertEqual(first.customer_number, 'C1')
        self.assertEqual(second.customer_number, 'C2')
        self.assertEqual(
            DocumentNumberSequence.objects.filter(document_type='customer').count(),
            1,
        )
        sequence = DocumentNumberSequence.objects.get(document_type='customer')
        self.assertEqual(sequence.branch, self.branch)
        self.assertEqual(sequence.last_sequence, 2)


@override_settings(SKIP_MODULE_PERMISSION_CHECKS=True)
class CustomerAdvancedFilterTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='filter-admin',
            email='filter-admin@example.com',
            password='password123',
            role='admin',
        )
        self.branch = Branch.objects.create(
            name='Customer Filter Branch',
            code='CFB',
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)
        recent_user = User.objects.create_user(
            username='recent-customer',
            email='recent@example.com',
            role='customer',
        )
        old_user = User.objects.create_user(
            username='old-customer',
            email='old@example.com',
            role='customer',
        )
        self.recent = Customer.objects.create(user=recent_user, status='active')
        self.old = Customer.objects.create(user=old_user, status='active')
        Customer.objects.filter(pk=self.recent.pk).update(
            customer_since=timezone.localdate(),
            created_at=timezone.now().replace(hour=23, minute=30),
        )
        Customer.objects.filter(pk=self.old.pk).update(
            customer_since=timezone.localdate() - timedelta(days=90),
            created_at=timezone.now() - timedelta(days=90),
        )

    def test_customer_since_and_created_at_date_bounds(self):
        today = timezone.localdate()
        response = self.client.get('/api/customers/customers/', {
            'customer_since__gte': today,
            'customer_since__lte': today,
            'created_at__gte': today,
            'created_at__lte': today,
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [row['id'] for row in response.data['results']],
            [self.recent.id],
        )

    def test_custom_inactivity_days_must_be_within_safe_range(self):
        for value in ('custom_0', 'custom_-1', 'custom_3651', 'custom_not-a-number'):
            with self.subTest(value=value):
                response = self.client.get(
                    '/api/customers/customers/',
                    {'inactive_period': value},
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn('inactive_period', response.data)
