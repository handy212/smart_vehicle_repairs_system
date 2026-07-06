from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.diagnosis.models import Diagnosis, RepairRecommendation
from apps.inventory.models import Part, PartCategory, StockItem
from apps.vehicles.models import Vehicle
from apps.workorders.models import ServiceTask, WorkOrder, WorkOrderPart

User = get_user_model()


class PartsIntegrationTests(TestCase):
    def setUp(self):
        self.technician = User.objects.create_user(
            username='tech',
            password='password',
            role='technician',
            email='tech@example.com',
        )
        self.manager = User.objects.create_user(
            username='manager',
            password='password',
            role='manager',
            email='manager@example.com',
        )

        self.branch = Branch.objects.create(name='Test Branch', created_by=self.manager)
        self.manager.managed_branches.add(self.branch)
        self.technician.branch = self.branch
        self.technician.save(update_fields=['branch'])
        self.customer = Customer.objects.create(
            user=User.objects.create_user(
                username='customer',
                password='password',
                email='cust@example.com',
            )
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.customer,
            vin='12345678901234567',
            make='Toyota',
            model='Camry',
            year=2020,
            current_mileage=10000,
        )
        self.work_order = WorkOrder.objects.create(
            customer=self.customer,
            vehicle=self.vehicle,
            branch=self.branch,
            status='diagnosis',
            primary_technician=self.technician,
            service_coordinator=self.manager,
            odometer_in=10000,
        )
        self.diagnosis = Diagnosis.objects.create(
            work_order=self.work_order,
            technician=self.technician,
            status='in_progress',
        )

        self.category = PartCategory.objects.create(name='Uncategorized')
        self.catalog_part = Part.objects.create(
            part_number='CAT-001',
            name='Catalog Oil Filter',
            category=self.category,
            branch=self.branch,
            quantity_in_stock=5,
            cost_price='22.00',
            selling_price='32.00',
            created_by=self.manager,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.manager)

    def create_recommendation(self, description, parts_data, recommendation_type='replace'):
        return RepairRecommendation.objects.create(
            diagnosis=self.diagnosis,
            recommendation_type=recommendation_type,
            description=description,
            parts_needed=parts_data,
            approval_status='approved',
            quotation_status='quoted',
        )

    def test_work_order_approval_requires_priced_recommendation_decisions(self):
        WorkOrder.objects.filter(pk=self.work_order.pk).update(
            status='awaiting_approval',
            requires_approval=True,
            approval_requested_at=timezone.now(),
        )

        recommendation = RepairRecommendation.objects.create(
            diagnosis=self.diagnosis,
            description='Replace front brake pads',
            priority='necessary',
            approval_status='pending_approval',
            quotation_status='quoted',
        )

        url = reverse('api_workorders:workorder-approve', args=[self.work_order.id])
        response = self.client.post(url, {
            'approval_method': 'phone',
            'approval_notes': 'Customer approved all recommended work.',
        }, format='json', HTTP_X_BRANCH_ID=str(self.branch.id))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('approve, defer, or decline', response.data['error'])

        recommendation.refresh_from_db()
        self.assertEqual(recommendation.approval_status, 'pending_approval')
        self.assertFalse(recommendation.customer_approved)

        recommendation.set_decision(
            'approved',
            acted_by=self.manager,
            method='phone',
            notes='Customer approved this item.',
        )

        response = self.client.post(url, {
            'approval_method': 'phone',
            'approval_notes': 'Customer approved selected work.',
        }, format='json', HTTP_X_BRANCH_ID=str(self.branch.id))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['recommendations_approved'], 0)

    def test_start_work_explains_recommendations_waiting_for_stores_quote(self):
        WorkOrder.objects.filter(pk=self.work_order.pk).update(
            status='approved',
            requires_approval=True,
            approved_by_customer=True,
            approved_at=timezone.now(),
        )

        RepairRecommendation.objects.create(
            diagnosis=self.diagnosis,
            description='Replace front brake pads',
            priority='necessary',
            approval_status='approved',
            quotation_status='not_requested',
        )

        self.client.force_authenticate(user=self.technician)
        url = reverse('api_workorders:workorder-start-work', args=[self.work_order.id])
        response = self.client.post(url, {}, format='json', HTTP_X_BRANCH_ID=str(self.branch.id))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('sent to stores for quotation', response.data['error'])

    def test_convert_recommendation_creates_catalog_and_work_order_parts_for_manual_entries(self):
        recommendation = self.create_recommendation(
            'Replace front brakes',
            [
                {'part_name': 'New Brake Pad', 'part_number': 'BP-001', 'quantity': 2, 'unit_cost': 50.0},
                {'part_name': 'New Rotor', 'part_number': 'RT-001', 'quantity': 2, 'unit_cost': 100.0},
            ],
        )

        tasks_created, parts_linked = self.work_order.convert_recommendations_to_tasks(user=self.manager)

        self.assertEqual(tasks_created, 2)
        self.assertEqual(parts_linked, 2)

        brake_task = ServiceTask.objects.get(work_order=self.work_order, description='Replace front brakes - New Brake Pad')
        rotor_task = ServiceTask.objects.get(work_order=self.work_order, description='Replace front brakes - New Rotor')
        recommendation.refresh_from_db()
        self.assertEqual(recommendation.converted_to_task_id, brake_task.id)

        brake_pad = WorkOrderPart.objects.get(work_order=self.work_order, part_number='BP-001')
        rotor = WorkOrderPart.objects.get(work_order=self.work_order, part_number='RT-001')

        self.assertEqual(brake_pad.task, brake_task)
        self.assertEqual(rotor.task, rotor_task)
        self.assertEqual(brake_pad.requested_by, self.manager)
        self.assertEqual(brake_pad.status, 'pending')
        self.assertIsNotNone(brake_pad.inventory_part)
        self.assertEqual(brake_pad.inventory_part.part_number, 'BP-001')
        self.assertTrue(Part.objects.filter(part_number='RT-001', name='New Rotor').exists())

    def test_convert_recommendation_links_existing_inventory_part(self):
        recommendation = self.create_recommendation(
            'Change oil filter',
            [
                {
                    'part_id': self.catalog_part.id,
                    'part_name': 'Catalog Oil Filter',
                    'part_number': 'CAT-001',
                    'quantity': 1,
                }
            ],
            recommendation_type='service',
        )

        tasks_created, parts_linked = self.work_order.convert_recommendations_to_tasks(user=self.manager)

        self.assertEqual(tasks_created, 1)
        self.assertEqual(parts_linked, 1)

        task = ServiceTask.objects.get(work_order=self.work_order, description='Change oil filter')
        work_order_part = WorkOrderPart.objects.get(work_order=self.work_order, part_number='CAT-001')

        self.assertEqual(work_order_part.inventory_part, self.catalog_part)
        self.assertEqual(work_order_part.task, task)
        self.assertEqual(work_order_part.part_name, self.catalog_part.name)
        self.assertEqual(str(work_order_part.unit_cost), '22.00')

        recommendation.refresh_from_db()
        self.assertEqual(recommendation.converted_to_task, task)

    def test_pending_store_parts_block_work_start_until_allocated(self):
        recommendation = self.create_recommendation(
            'Replace front brakes',
            [
                {'part_name': 'New Brake Pad', 'part_number': 'BP-READY', 'quantity': 1, 'unit_cost': 50.0},
            ],
        )
        self.work_order.status = 'approved'
        self.work_order.requires_approval = True
        self.work_order.approved_by_customer = True
        self.work_order.approved_at = timezone.now()
        self.work_order.save()

        self.work_order.convert_recommendations_to_tasks(user=self.manager)

        can_start, errors = self.work_order.can_start_work()
        self.assertFalse(can_start)
        self.assertIn('No repair task can start yet', '; '.join(errors))

        WorkOrderPart.objects.filter(work_order=self.work_order, part_number='BP-READY').update(status='ready')

        can_start, errors = self.work_order.can_start_work()
        self.assertTrue(can_start, errors)

    def test_full_recommendation_to_stores_parts_ready_start_work_flow(self):
        WorkOrder.objects.filter(pk=self.work_order.pk).update(
            status='approved',
            requires_approval=True,
            approved_by_customer=True,
            approved_at=timezone.now(),
        )
        recommendation = RepairRecommendation.objects.create(
            diagnosis=self.diagnosis,
            recommendation_type='service',
            description='Replace oil filter',
            parts_needed=[
                {
                    'part_id': self.catalog_part.id,
                    'part_name': self.catalog_part.name,
                    'part_number': self.catalog_part.part_number,
                    'quantity': 1,
                }
            ],
            approval_status='approved',
            quotation_status='not_requested',
        )

        quote_response = self.client.post(
            f'/api/diagnosis/diagnoses/{self.diagnosis.id}/submit_recommendations_for_quote/',
            {'recommendation_ids': [recommendation.id]},
            format='json',
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(quote_response.status_code, status.HTTP_200_OK)
        self.assertEqual(quote_response.data['parts_synced'], 1)

        part_request = WorkOrderPart.objects.get(
            work_order=self.work_order,
            part_number=self.catalog_part.part_number,
        )
        self.assertIsNone(part_request.task_id)
        self.assertEqual(part_request.status, 'pending')

        recommendation.refresh_from_db()
        self.assertEqual(recommendation.quotation_status, 'requested')

        mark_quoted_response = self.client.post(
            f'/api/diagnosis/diagnoses/{self.diagnosis.id}/mark_recommendations_quoted/',
            {'recommendation_ids': [recommendation.id]},
            format='json',
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(mark_quoted_response.status_code, status.HTTP_200_OK)

        convert_response = self.client.post(
            f'/api/diagnosis/diagnoses/{self.diagnosis.id}/convert_recommendations_to_tasks/',
            {'recommendation_ids': [recommendation.id]},
            format='json',
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(convert_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(convert_response.data['parts_linked'], 1)

        part_request.refresh_from_db()
        recommendation.refresh_from_db()
        self.assertEqual(part_request.task_id, recommendation.converted_to_task_id)
        self.assertEqual(part_request.status, 'pending')
        part_request.approved_by = self.manager
        part_request.approved_at = timezone.now()
        part_request.save(update_fields=['approved_by', 'approved_at', 'updated_at'])

        blocked_response = self.client.post(
            reverse('api_workorders:workorder-start-work', args=[self.work_order.id]),
            {},
            format='json',
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(blocked_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('required part(s) are not ready', blocked_response.data['error'])

        allocate_response = self.client.post(
            reverse('api_workorders:workorderpart-allocate', args=[part_request.id]),
            {},
            format='json',
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(allocate_response.status_code, status.HTTP_200_OK)

        start_response = self.client.post(
            reverse('api_workorders:workorder-start-work', args=[self.work_order.id]),
            {},
            format='json',
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)

    def test_partial_parts_readiness_allows_work_start_but_blocks_affected_task(self):
        bundled_recommendation = self.create_recommendation(
            'Service bundle',
            [
                {'part_id': self.catalog_part.id, 'part_name': self.catalog_part.name, 'part_number': 'CAT-001', 'quantity': 1},
                {'part_name': 'Brake Pad Set', 'part_number': 'BP-PENDING', 'quantity': 1, 'unit_cost': 50.0},
            ],
            recommendation_type='service',
        )

        self.work_order.status = 'approved'
        self.work_order.requires_approval = True
        self.work_order.approved_by_customer = True
        self.work_order.approved_at = timezone.now()
        self.work_order.save()

        self.work_order.convert_recommendations_to_tasks(user=self.manager)
        WorkOrderPart.objects.filter(work_order=self.work_order, part_number='CAT-001').update(status='ready')

        start_response = self.client.post(
            reverse('api_workorders:workorder-start-work', args=[self.work_order.id]),
            {},
            format='json',
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)

        ready_task = ServiceTask.objects.get(work_order=self.work_order, description='Service bundle - Catalog Oil Filter')
        blocked_task = ServiceTask.objects.get(work_order=self.work_order, description='Service bundle - Brake Pad Set')

        ready_task_response = self.client.post(
            reverse('api_workorders:servicetask-start', args=[ready_task.id]),
            {},
            format='json',
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(ready_task_response.status_code, status.HTTP_200_OK)

        blocked_task_response = self.client.post(
            reverse('api_workorders:servicetask-start', args=[blocked_task.id]),
            {},
            format='json',
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )
        self.assertEqual(blocked_task_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Parts must be allocated', blocked_task_response.data['error'])
        bundled_recommendation.refresh_from_db()
        self.assertEqual(bundled_recommendation.converted_to_task_id, ready_task.id)
        self.work_order.refresh_from_db()
        self.assertEqual(self.work_order.status, 'in_progress')

    def test_allocate_uses_branch_stock_item_before_deprecated_part_quantity(self):
        self.work_order.status = 'approved'
        self.work_order.requires_approval = True
        self.work_order.approved_by_customer = True
        self.work_order.approved_at = timezone.now()
        self.work_order.save(update_fields=[
            'status',
            'requires_approval',
            'approved_by_customer',
            'approved_at',
        ])
        self.catalog_part.quantity_in_stock = 0
        self.catalog_part.save(update_fields=['quantity_in_stock'])
        stock_item = StockItem.objects.create(
            part=self.catalog_part,
            branch=self.branch,
            quantity_in_stock=3,
            quantity_reserved=0,
        )
        part_request = WorkOrderPart.objects.create(
            work_order=self.work_order,
            inventory_part=self.catalog_part,
            part_name=self.catalog_part.name,
            part_number=self.catalog_part.part_number,
            quantity=2,
            unit_cost=self.catalog_part.cost_price,
            status='pending',
            approved_by=self.manager,
            approved_at=timezone.now(),
        )

        status_payload = part_request.get_inventory_status_payload()
        self.assertTrue(status_payload['available'])
        self.assertEqual(status_payload['quantity'], 3)

        response = self.client.post(
            reverse('api_workorders:workorderpart-allocate', args=[part_request.id]),
            {},
            format='json',
            HTTP_X_BRANCH_ID=str(self.branch.id),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        part_request.refresh_from_db()
        stock_item.refresh_from_db()
        self.assertEqual(part_request.status, 'ready')
        self.assertEqual(stock_item.quantity_in_stock, 1)

    def test_convert_recommendation_links_existing_unlinked_work_order_part_by_inventory_part(self):
        existing_part = WorkOrderPart.objects.create(
            work_order=self.work_order,
            inventory_part=self.catalog_part,
            part_name=self.catalog_part.name,
            part_number=self.catalog_part.part_number,
            quantity=1,
            unit_cost='22.00',
            status='draft',
        )

        self.create_recommendation(
            'Replace existing filter',
            [
                {
                    'part_id': self.catalog_part.id,
                    'part_name': self.catalog_part.name,
                    'part_number': self.catalog_part.part_number,
                    'quantity': 1,
                }
            ],
            recommendation_type='service',
        )

        tasks_created, parts_linked = self.work_order.convert_recommendations_to_tasks(user=self.manager)

        self.assertEqual(tasks_created, 1)
        self.assertEqual(parts_linked, 1)
        self.assertEqual(WorkOrderPart.objects.filter(work_order=self.work_order).count(), 1)

        existing_part.refresh_from_db()
        self.assertIsNotNone(existing_part.task)
        self.assertEqual(existing_part.inventory_part, self.catalog_part)

    def test_convert_recommendation_creates_new_work_order_part_if_existing_part_already_linked(self):
        other_task = ServiceTask.objects.create(work_order=self.work_order, description='Other Task')
        WorkOrderPart.objects.create(
            work_order=self.work_order,
            task=other_task,
            inventory_part=self.catalog_part,
            part_name=self.catalog_part.name,
            part_number=self.catalog_part.part_number,
            quantity=1,
            unit_cost='22.00',
            status='draft',
        )

        self.create_recommendation(
            'Replace filter again',
            [
                {
                    'part_id': self.catalog_part.id,
                    'part_name': self.catalog_part.name,
                    'part_number': self.catalog_part.part_number,
                    'quantity': 1,
                }
            ],
        )

        tasks_created, parts_linked = self.work_order.convert_recommendations_to_tasks(user=self.manager)

        self.assertEqual(tasks_created, 1)
        self.assertEqual(parts_linked, 1)
        self.assertEqual(
            WorkOrderPart.objects.filter(
                work_order=self.work_order,
                inventory_part=self.catalog_part,
            ).count(),
            2,
        )
