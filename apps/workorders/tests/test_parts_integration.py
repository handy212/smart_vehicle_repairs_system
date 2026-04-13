from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.diagnosis.models import Diagnosis, RepairRecommendation
from apps.inventory.models import Part, PartCategory
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
            cost_price='22.00',
            selling_price='32.00',
            created_by=self.manager,
        )

    def create_recommendation(self, description, parts_data, recommendation_type='replace'):
        return RepairRecommendation.objects.create(
            diagnosis=self.diagnosis,
            recommendation_type=recommendation_type,
            description=description,
            parts_needed=parts_data,
            approval_status='approved',
            quotation_status='quoted',
        )

    def test_convert_recommendation_creates_catalog_and_work_order_parts_for_manual_entries(self):
        recommendation = self.create_recommendation(
            'Replace front brakes',
            [
                {'part_name': 'New Brake Pad', 'part_number': 'BP-001', 'quantity': 2, 'unit_cost': 50.0},
                {'part_name': 'New Rotor', 'part_number': 'RT-001', 'quantity': 2, 'unit_cost': 100.0},
            ],
        )

        tasks_created, parts_linked = self.work_order.convert_recommendations_to_tasks(user=self.manager)

        self.assertEqual(tasks_created, 1)
        self.assertEqual(parts_linked, 2)

        task = ServiceTask.objects.get(work_order=self.work_order, description='Replace front brakes')
        recommendation.refresh_from_db()
        self.assertEqual(recommendation.converted_to_task_id, task.id)

        brake_pad = WorkOrderPart.objects.get(work_order=self.work_order, part_number='BP-001')
        rotor = WorkOrderPart.objects.get(work_order=self.work_order, part_number='RT-001')

        self.assertEqual(brake_pad.task, task)
        self.assertEqual(rotor.task, task)
        self.assertEqual(brake_pad.requested_by, self.manager)
        self.assertEqual(brake_pad.status, 'draft')
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
