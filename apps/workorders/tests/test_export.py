import csv
from decimal import Decimal
from datetime import timedelta
from io import BytesIO, StringIO

import openpyxl
import pytest
from django.db.models.signals import post_save, pre_save
from django.utils import timezone
from model_bakery import baker

from apps.chat.signals import capture_original_status, work_order_status_update_notification
from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.branches.models import Branch
from apps.customers.models import Customer
from apps.diagnosis.models import Diagnosis, RepairRecommendation
from apps.vehicles.models import Vehicle
from apps.workorders.frontend_views import (
    WORKORDER_EXPORT_HEADERS,
    export_workorders_csv,
    export_workorders_excel,
)
from apps.workorders.models import TechnicianTimeLog, TriageForm, WorkOrder, WorkOrderNote, WorkOrderPart


EXPECTED_EXPORT_HEADERS = [
    'Date In', 'Work Order Number', 'Registration Number', 'Customer Code',
    'Customer Name', 'Customer Balance', 'Job Status', 'Phone Number',
    'Mileage In', 'Job Description', 'Contact Name', 'Received By', 'Needs By',
    'Payment Method', 'Created By', 'Work Hours', 'Labor Amount',
    'Parts Amount', 'Sublet Amount', 'Misc Amount', 'Paid Amount',
    'Tax Amount', 'Date Out', 'Last Note Date', 'Last Note', 'Status Date',
    'VAT Rate', 'Other Tax Rate', 'User Code', 'Changed Date',
    'Recommendations', 'Regular Service', 'Region Code', 'Region', 'Follow Up',
    'Feedback', 'Account To Bill', 'Service Category', 'Invoice Status',
    'Job Type', 'Approval/Diagnosis Comment', 'Repair By', 'Job Location',
    'Insurance Provider', 'Next Action By', 'Next Action On', 'Job Notes',
    'Parts Required', 'Parts Progress', 'Close Date', 'Approval Requested Date',
    'Approved Date', 'Job Hours', 'Invoice Comment', 'Customer Score',
    'Approval Status', 'Subcontract Amount', 'Test Drive By',
    'Quality/Diagnosis Comment', 'Return Reference Number', 'Invoice Date',
    'Mileage In/Out', 'Make', 'Model',
]


@pytest.fixture(autouse=True)
def mute_workorder_chat_signals():
    pre_save.disconnect(capture_original_status, sender=WorkOrder)
    post_save.disconnect(work_order_status_update_notification, sender=WorkOrder)
    try:
        yield
    finally:
        pre_save.connect(capture_original_status, sender=WorkOrder)
        post_save.connect(work_order_status_update_notification, sender=WorkOrder)


@pytest.mark.django_db
def test_workorder_csv_export_matches_clean_supported_columns():
    staff = baker.make(
        User,
        role='admin',
        first_name='Ama',
        last_name='Admin',
        username='ama-admin',
        email='ama.admin@example.com',
    )
    customer_user = baker.make(
        User,
        role='customer',
        first_name='Kwesi',
        last_name='Driver',
        username='kwesi-driver',
        email='kwesi.driver@example.com',
        phone='0240000000',
    )
    technician = baker.make(
        User,
        role='technician',
        first_name='Kojo',
        last_name='Tech',
        username='kojo-tech',
        email='kojo.tech@example.com',
    )
    service_coordinator = baker.make(
        User,
        role='service_coordinator',
        first_name='Akua',
        last_name='Coordinator',
        username='akua-coordinator',
        email='akua.coordinator@example.com',
    )
    branch = baker.make(
        Branch,
        name='Accra Central',
        code='ACC',
        phone='0300000000',
        address='1 Ring Road',
        city='Accra',
        state='Greater Accra',
        zip_code='00233',
        country='Ghana',
        created_by=staff,
    )
    customer = baker.make(
        Customer,
        user=customer_user,
        customer_number='CUST-001',
        company_name='Acme Fleet',
        contact_person_name='Fleet Desk',
        current_balance=Decimal('999.99'),
        default_payment_method='cash',
        customer_type='fleet',
        insurance_provider='Heritage Insurance',
    )
    created_at = timezone.now()
    vehicle = baker.make(
        Vehicle,
        owner=customer,
        vin='1HGBH41JXMN109186',
        license_plate='GT-1234-24',
        make='Toyota',
        model='Corolla',
        year=2022,
        current_mileage=12000,
        next_service_due_date=created_at.date() + timedelta(days=30),
    )

    completed_at = created_at + timedelta(hours=6)
    approved_at = created_at + timedelta(hours=2)

    workorder = baker.make(
        WorkOrder,
        branch=branch,
        customer=customer,
        vehicle=vehicle,
        created_by=staff,
        service_coordinator=service_coordinator,
        primary_technician=technician,
        customer_concerns='Brake noise and routine service',
        special_instructions='Call before extra work',
        diagnosis_notes='Front pads worn and rotor skim required',
        quality_check_notes='Road test completed without vibration',
        odometer_in=12000,
        odometer_out=12125,
        status='completed',
        maintenance_type='routine',
        created_at=created_at,
        completed_at=completed_at,
        updated_at=completed_at,
        estimated_completion=completed_at,
        approval_requested_at=created_at,
        approved_at=approved_at,
        approved_by_customer=True,
        approval_method='phone',
        customer_rating=5,
        customer_feedback='Service was fast and clear.',
    )
    WorkOrder.objects.filter(pk=workorder.pk).update(
        actual_labor_hours=Decimal('3.50'),
        actual_labor_cost=Decimal('350.00'),
        actual_parts_cost=Decimal('125.00'),
        actual_total=Decimal('475.00'),
    )
    workorder.refresh_from_db()

    diagnosis = baker.make(
        Diagnosis,
        work_order=workorder,
        technician=technician,
        customer_complaint='Brake noise',
    )
    baker.make(
        RepairRecommendation,
        diagnosis=diagnosis,
        description='Replace front brake pads',
    )
    baker.make(TriageForm, work_order=workorder, performed_by=service_coordinator)
    baker.make(
        WorkOrderNote,
        work_order=workorder,
        created_by=staff,
        note='Customer approved brake work by phone.',
    )
    baker.make(
        WorkOrderPart,
        work_order=workorder,
        part_name='Brake Pad Set',
        quantity=Decimal('1'),
        unit_cost=Decimal('125.00'),
        selling_price=Decimal('125.00'),
        status='installed',
    )
    baker.make(
        TechnicianTimeLog,
        work_order=workorder,
        technician=technician,
        clock_in=created_at,
        clock_out=created_at + timedelta(hours=3, minutes=30),
        duration_hours=Decimal('3.50'),
        description='Brake service and inspection',
        hourly_rate=Decimal('100.00'),
        labor_cost=Decimal('350.00'),
    )
    baker.make(
        Invoice,
        customer=customer,
        vehicle=vehicle,
        work_order=workorder,
        status='partial',
        total=Decimal('520.00'),
        amount_paid=Decimal('320.00'),
        amount_due=Decimal('200.00'),
        tax_amount=Decimal('45.00'),
        sublet_subtotal=Decimal('20.00'),
        shop_supplies_fee=Decimal('5.00'),
        environmental_fee=Decimal('2.00'),
        customer_notes='Customer to settle remaining balance next visit.',
        created_by=staff,
    )

    response = export_workorders_csv(WorkOrder.objects.filter(pk=workorder.pk))

    rows = list(csv.reader(StringIO(response.content.decode('utf-8'))))
    assert WORKORDER_EXPORT_HEADERS == EXPECTED_EXPORT_HEADERS
    assert rows[0] == EXPECTED_EXPORT_HEADERS
    assert 'PARTNERID' not in rows[0]
    assert 'TRIAL035' not in rows[0]
    assert 'STEERING' not in rows[0]
    assert 'Date In' in rows[0]

    header_index = {name: idx for idx, name in enumerate(rows[0])}
    data = rows[1]

    assert data[header_index['Work Order Number']] == workorder.work_order_number
    assert data[header_index['Registration Number']] == 'GT-1234-24'
    assert data[header_index['Customer Code']] == 'CUST-001'
    assert data[header_index['Customer Name']] == 'Acme Fleet'
    assert data[header_index['Customer Balance']] == '200.00'
    assert data[header_index['Job Status']] == 'Completed'
    assert data[header_index['Phone Number']] == '0240000000'
    assert data[header_index['Mileage In']] == '12000'
    assert data[header_index['Payment Method']] == 'Cash'
    assert data[header_index['Work Hours']] == '3.50'
    assert data[header_index['Labor Amount']] == '350.00'
    assert data[header_index['Parts Amount']] == '125.00'
    assert data[header_index['Sublet Amount']] == '20.00'
    assert data[header_index['Misc Amount']] == '7.00'
    assert data[header_index['Paid Amount']] == '320.00'
    assert data[header_index['Tax Amount']] == '45.00'
    assert data[header_index['Last Note']] == 'Customer approved brake work by phone.'
    assert data[header_index['Recommendations']] == 'Replace front brake pads'
    assert data[header_index['Regular Service']] == 'Y'
    assert data[header_index['Region Code']] == 'ACC'
    assert data[header_index['Region']] == 'Accra Central'
    assert data[header_index['Follow Up']] == 'Y'
    assert data[header_index['Feedback']] == 'Service was fast and clear.'
    assert data[header_index['Account To Bill']] == 'Y'
    assert data[header_index['Invoice Status']] == 'Partially Paid'
    assert data[header_index['Approval/Diagnosis Comment']] == 'Front pads worn and rotor skim required'
    assert data[header_index['Repair By']] == 'Kojo Tech'
    assert data[header_index['Job Location']] == '1 Ring Road, Accra, Greater Accra 00233, Ghana'
    assert data[header_index['Insurance Provider']] == 'Heritage Insurance'
    assert data[header_index['Next Action By']] == 'Akua Coordinator'
    assert data[header_index['Job Notes']] == 'Call before extra work'
    assert data[header_index['Parts Required']] == 'Brake Pad Set'
    assert data[header_index['Parts Progress']] == 'installed:1'
    assert data[header_index['Job Hours']] == '3.50'
    assert data[header_index['Invoice Comment']] == 'Customer to settle remaining balance next visit.'
    assert data[header_index['Customer Score']] == '5'
    assert data[header_index['Approval Status']] == 'Phone'
    assert data[header_index['Subcontract Amount']] == '20.00'
    assert data[header_index['Test Drive By']] == 'Akua Coordinator'
    assert data[header_index['Quality/Diagnosis Comment']] == 'Road test completed without vibration'
    assert data[header_index['Mileage In/Out']] == '12000/12125'
    assert data[header_index['Make']] == 'Toyota'
    assert data[header_index['Model']] == 'Corolla'


@pytest.mark.django_db
def test_workorder_excel_export_returns_xlsx_workbook():
    staff = baker.make(
        User,
        role='admin',
        first_name='Excel',
        last_name='User',
        username='excel-user',
        email='excel.user@example.com',
    )
    customer_user = baker.make(
        User,
        role='customer',
        first_name='Esi',
        last_name='Mensah',
        username='esi-mensah',
        email='esi.mensah@example.com',
    )
    customer = baker.make(Customer, user=customer_user, customer_number='CUST-XL')
    vehicle = baker.make(
        Vehicle,
        owner=customer,
        vin='1HGBH41JXMN109188',
        license_plate='AS-1000-24',
        make='Honda',
        model='Civic',
        year=2021,
        current_mileage=5000,
    )
    workorder = baker.make(
        WorkOrder,
        customer=customer,
        vehicle=vehicle,
        created_by=staff,
        customer_concerns='Excel export check',
        odometer_in=5000,
    )

    response = export_workorders_excel(WorkOrder.objects.filter(pk=workorder.pk))

    assert response['Content-Type'] == 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    workbook = openpyxl.load_workbook(filename=BytesIO(response.content))
    worksheet = workbook.active

    assert worksheet.title == 'Work Orders'
    assert [cell.value for cell in worksheet[1]] == EXPECTED_EXPORT_HEADERS
    assert worksheet['A1'].value == 'Date In'
    assert worksheet['B1'].value == 'Work Order Number'
    assert worksheet['B2'].value == workorder.work_order_number
    assert worksheet['C2'].value == 'AS-1000-24'
