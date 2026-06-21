"""Chat REST API tests."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.chat.models import ChatMembership, ChatMessage, Conversation, MessageReadReceipt
from apps.customers.models import Customer
from apps.workorders.models import WorkOrder
from apps.branches.models import Branch
from apps.vehicles.models import Vehicle

User = get_user_model()


class ChatAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username='chat-staff',
            email='chat-staff@example.com',
            password='password',
            role='service_coordinator',
            is_staff=True,
        )
        self.other_staff = User.objects.create_user(
            username='chat-tech',
            email='chat-tech@example.com',
            password='password',
            role='technician',
            is_staff=True,
        )
        self.customer_user = User.objects.create_user(
            username='chat-customer',
            email='chat-customer@example.com',
            password='password',
            role='customer',
        )
        self.customer = Customer.objects.create(user=self.customer_user)
        self.branch = Branch.objects.create(
            name='Chat Branch',
            code='CHAT',
            created_by=self.staff,
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            make='Honda',
            model='Civic',
            year=2019,
            vin='1HGBH41JXMNCHAT01',
            license_plate='CHAT-1',
            current_mileage=20000,
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='in_progress',
            customer_concerns='Chat test WO',
            odometer_in=20000,
            service_coordinator=self.staff,
            created_by=self.staff,
        )

    def test_create_conversation_adds_admin_and_participants(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            '/api/chat/conversations/',
            {'title': 'Team chat', 'participant_ids': [self.other_staff.id]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        conv_id = response.data['id']
        self.assertTrue(
            ChatMembership.objects.filter(
                conversation_id=conv_id, user=self.staff, role='admin'
            ).exists()
        )
        self.assertTrue(
            ChatMembership.objects.filter(
                conversation_id=conv_id, user=self.other_staff, role='member'
            ).exists()
        )

    def test_discovery_customer_sees_limited_staff(self):
        self.client.force_authenticate(self.customer_user)
        response = self.client.get('/api/chat/conversations/discovery/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        staff_ids = {u['id'] for u in response.data['staff']}
        self.assertIn(self.staff.id, staff_ids)
        self.assertNotIn(self.other_staff.id, staff_ids)
        self.assertEqual(response.data['clients'], [])

    def test_get_or_create_by_object_workorder_adds_members(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            '/api/chat/conversations/get_or_create_by_object/',
            {'related_object_type': 'workorder', 'related_object_id': self.work_order.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        conv = Conversation.objects.get(pk=response.data['id'])
        member_ids = set(conv.participants.values_list('id', flat=True))
        self.assertIn(self.staff.id, member_ids)
        self.assertIn(self.customer_user.id, member_ids)

    def test_mark_as_read_creates_receipt(self):
        conv = Conversation.objects.create(title='Read test')
        ChatMembership.objects.create(user=self.staff, conversation=conv, role='admin')
        ChatMembership.objects.create(user=self.customer_user, conversation=conv, role='member')
        message = ChatMessage.objects.create(
            conversation=conv,
            sender=self.customer_user,
            message='Hello staff',
        )
        self.client.force_authenticate(self.staff)
        response = self.client.post(f'/api/chat/messages/{message.id}/mark_as_read/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            MessageReadReceipt.objects.filter(message=message, user=self.staff).exists()
        )

    def test_archive_requires_admin(self):
        conv = Conversation.objects.create(title='Archive test')
        ChatMembership.objects.create(user=self.staff, conversation=conv, role='member')
        ChatMembership.objects.create(user=self.other_staff, conversation=conv, role='admin')
        self.client.force_authenticate(self.staff)
        response = self.client.post(f'/api/chat/conversations/{conv.id}/archive/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.other_staff)
        response = self.client.post(f'/api/chat/conversations/{conv.id}/archive/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        conv.refresh_from_db()
        self.assertTrue(conv.is_archived)
