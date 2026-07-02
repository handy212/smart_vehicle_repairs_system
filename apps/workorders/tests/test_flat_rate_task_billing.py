from decimal import Decimal

from django.test import TestCase
from model_bakery import baker

from apps.accounting.models import RevenueProduct
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import ServiceTask, ServiceTaskType, WorkOrder
from apps.workorders.task_billing import (
    resolve_flat_unit_price_for_task,
    resolve_flat_unit_price_for_task_type,
)


class FlatRateTaskBillingTests(TestCase):
    def setUp(self):
        self.customer = baker.make(Customer)
        self.vehicle = baker.make(Vehicle, owner=self.customer)
        self.work_order = baker.make(
            WorkOrder,
            customer=self.customer,
            vehicle=self.vehicle,
            odometer_in=1000,
            customer_concerns='Spray bumper',
        )
        self.product = RevenueProduct.objects.create(
            code='labor_spraying',
            name='Spraying',
            owner_account_code='658',
            revenue_class='labor',
            default_billing_line_type='labor',
            default_unit_price=Decimal('120.00'),
            is_active=True,
        )
        self.task_type = ServiceTaskType.objects.create(
            code='spray_work',
            name='Spray work',
            revenue_product=self.product,
            default_labor_rate=Decimal('95.00'),
        )

    def test_task_type_prefers_configured_flat_fee_over_income_category(self):
        self.assertEqual(resolve_flat_unit_price_for_task_type(self.task_type), Decimal('95.00'))

    def test_task_type_falls_back_to_income_category_price(self):
        self.task_type.default_labor_rate = Decimal('0')
        self.task_type.save(update_fields=['default_labor_rate', 'updated_at'])
        self.assertEqual(resolve_flat_unit_price_for_task_type(self.task_type), Decimal('120.00'))

    def test_service_task_create_applies_flat_charge(self):
        from apps.workorders.serializers import ServiceTaskCreateSerializer

        serializer = ServiceTaskCreateSerializer(data={
            'work_order': self.work_order.pk,
            'task_type': 'spray_work',
            'description': 'Spray front bumper',
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        task = serializer.save()
        self.assertEqual(task.labor_cost, Decimal('95.00'))

    def test_resolve_flat_price_from_existing_task_cost(self):
        task = ServiceTask.objects.create(
            work_order=self.work_order,
            task_type='spray_work',
            description='Panel prep',
            labor_cost=Decimal('80.00'),
        )
        self.assertEqual(resolve_flat_unit_price_for_task(task), Decimal('80.00'))
