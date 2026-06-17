from rest_framework import serializers
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum
from django.core.validators import MinValueValidator
from drf_spectacular.utils import extend_schema_field, inline_serializer
from drf_spectacular.types import OpenApiTypes
from apps.billing.models import (
    TaxRate,
    Estimate,
    EstimateLineItem,
    Invoice,
    InvoiceLineItem,
    Payment,
    CashierTill,
    CashCount,
    TillCashMovement,
    PaymentAllocation,
    Refund,
    CreditNote,
    CreditNoteLineItem,
    CreditNoteApplication,
    VendorCredit,
    VendorCreditLineItem,
    VendorCreditApplication,
    Bill,
    BillLineItem,
    BillPayment,
)
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder
from apps.inventory.models import Part, PurchaseOrder
from apps.quickbooks_online.serializer_mixins import QBOSyncFieldsMixin
from apps.accounting.models import Account


BANK_SETTLEMENT_PAYMENT_METHODS = {
    'check', 'cheque', 'ach', 'wire', 'bank_transfer',
    'credit_card', 'debit_card', 'pos',
    'paypal', 'venmo', 'zelle',
    'mtn_momo', 'vodafone_cash', 'airteltigo_money', 'mobile_money',
    'hubtel_card', 'paystack', 'other',
}


def bank_account_queryset():
    return Account.objects.filter(
        is_active=True,
        account_type='asset',
        account_subtype__in=['bank', 'cash_equivalent'],
    )


def validate_bank_account(account):
    if not account:
        return account
    if (
        not account.is_active
        or account.account_type != 'asset'
        or account.account_subtype not in {'bank', 'cash_equivalent'}
        or not account.is_leaf
    ):
        raise serializers.ValidationError(
            "Select an active leaf Asset account classified as Bank or Cash Equivalent."
        )
    return account


def calculate_discounted_line_total(item):
    """Return line amount after inline discount; mirrors InvoiceLineItem.save() gross rules."""
    item_type = item.get('item_type', '')

    def dec(v):
        if v is None or v == '':
            return None
        d = Decimal(str(v))
        return d

    labor_hours = dec(item.get('labor_hours'))
    labor_rate = dec(item.get('labor_rate'))
    quantity = dec(item.get('quantity'))
    unit_price = dec(item.get('unit_price'))

    gross_total = Decimal('0')
    if item_type == 'labor' and labor_hours and labor_rate:
        gross_total = labor_hours * labor_rate
    elif quantity and unit_price:
        gross_total = quantity * unit_price
    elif unit_price:
        gross_total = unit_price

    discount_percentage = Decimal(str(item.get('discount_percentage', 0) or 0))
    discount_amount = Decimal('0')
    if discount_percentage > 0:
        discount_amount = (gross_total * discount_percentage / Decimal('100')).quantize(Decimal('0.01'))

    return max(gross_total - discount_amount, Decimal('0')).quantize(Decimal('0.01'))


def finalize_invoice_from_line_items(invoice, line_items_data):
    """Set invoice totals from line payloads and persist InvoiceLineItem rows (shared create path)."""
    labor_subtotal = Decimal('0')
    parts_subtotal = Decimal('0')
    sublet_subtotal = Decimal('0')
    taxable_before_discount = Decimal('0')

    for item in line_items_data:
        item_total = calculate_discounted_line_total(item)
        item_type = item.get('item_type', '')
        if item_type == 'labor':
            labor_subtotal += item_total
        elif item_type == 'part':
            parts_subtotal += item_total
        elif item_type == 'sublet':
            sublet_subtotal += item_total
        if item.get('is_taxable', True):
            taxable_before_discount += item_total

    invoice.labor_subtotal = labor_subtotal
    invoice.parts_subtotal = parts_subtotal
    invoice.sublet_subtotal = sublet_subtotal
    invoice.subtotal = labor_subtotal + parts_subtotal + sublet_subtotal

    discount_percentage = invoice.discount_percentage or Decimal('0')
    if discount_percentage > 0:
        invoice.discount_amount = (invoice.subtotal * discount_percentage / Decimal('100')).quantize(Decimal('0.01'))
    else:
        invoice.discount_amount = Decimal('0')

    discount_ratio = Decimal('0')
    if invoice.subtotal > 0 and invoice.discount_amount > 0:
        discount_ratio = invoice.discount_amount / invoice.subtotal
    taxable_discount = (taxable_before_discount * discount_ratio).quantize(Decimal('0.01')) if discount_ratio > 0 else Decimal('0')
    taxable_after_discount = max(taxable_before_discount - taxable_discount, Decimal('0'))

    from apps.billing.tax_service import TaxService
    breakdown = TaxService.calculate_breakdown(taxable_after_discount)
    invoice.taxable_subtotal = breakdown.taxable_subtotal
    invoice.tax_nhil_amount = breakdown.nhil_amount
    invoice.tax_getfund_amount = breakdown.getfund_amount
    invoice.tax_hrl_amount = Decimal('0')
    invoice.tax_vat_amount = breakdown.vat_amount
    invoice.tax_amount = breakdown.total_tax
    invoice.tax_regime = breakdown.regime

    invoice.total = (
        (invoice.subtotal - invoice.discount_amount)
        + invoice.tax_amount
        + invoice.shop_supplies_fee
        + invoice.environmental_fee
    ).quantize(Decimal('0.01'))
    invoice.amount_due = invoice.total
    invoice.save()

    for order, item in enumerate(line_items_data):
        item_data = item.copy()
        item_data.pop('total', None)
        item_data.pop('order', None)
        InvoiceLineItem.objects.create(
            invoice=invoice,
            order=order,
            **item_data
        )


# ============================================================================
# TAX RATE SERIALIZERS
# ============================================================================

class TaxRateSerializer(serializers.ModelSerializer):
    """Serializer for tax rates"""
    
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    is_valid = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = TaxRate
        fields = [
            'id', 'name', 'description', 'rate',
            'applies_to_labor', 'applies_to_parts', 'applies_to_sublet',
            'state', 'county', 'city', 'zip_code',
            'is_active', 'effective_date', 'expiration_date',
            'is_valid', 'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class TaxRateCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating tax rates"""
    
    class Meta:
        model = TaxRate
        fields = [
            'name', 'description', 'rate',
            'applies_to_labor', 'applies_to_parts', 'applies_to_sublet',
            'state', 'county', 'city', 'zip_code',
            'is_active', 'effective_date', 'expiration_date'
        ]
    
    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


# ============================================================================
# ESTIMATE LINE ITEM SERIALIZERS
# ============================================================================

class EstimateLineItemSerializer(serializers.ModelSerializer):
    """Serializer for estimate line items"""
    
    part_name = serializers.CharField(source='part.name', read_only=True)
    
    class Meta:
        model = EstimateLineItem
        fields = [
            'id', 'item_type', 'description', 'notes',
            'part', 'part_name', 'part_number',
            'quantity', 'unit_price', 'discount_percentage', 'discount_amount', 'total',
            'labor_hours', 'labor_rate',
            'is_taxable', 'order',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['discount_amount', 'total', 'created_at', 'updated_at']


class EstimateLineItemCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating estimate line items"""
    
    class Meta:
        model = EstimateLineItem
        fields = [
            'item_type', 'description', 'notes',
            'part', 'part_number',
            'quantity', 'unit_price', 'discount_percentage',
            'labor_hours', 'labor_rate',
            'is_taxable', 'order'
        ]
    
    def validate(self, data):
        item_type = data.get('item_type')
        
        # If item_type is labor, labor_hours and labor_rate should be provided
        if item_type == 'labor':
            labor_hours = data.get('labor_hours')
            labor_rate = data.get('labor_rate')
            if labor_hours is None or labor_hours <= 0:
                raise serializers.ValidationError({"labor_hours": "Labor hours must be greater than 0"})
            if labor_rate is None or (isinstance(labor_rate, str) and float(labor_rate) < 0) or (isinstance(labor_rate, (int, float)) and labor_rate < 0):
                raise serializers.ValidationError({"labor_rate": "Labor rate must be greater than or equal to 0"})
            # For labor items, quantity should match labor_hours
            if not data.get('quantity'):
                data['quantity'] = labor_hours
        else:
            # For non-labor items, ensure quantity and unit_price are valid
            quantity = data.get('quantity')
            if quantity is None or quantity <= 0:
                raise serializers.ValidationError({"quantity": "Quantity must be greater than 0"})
            
            unit_price = data.get('unit_price')
            if unit_price is not None:
                unit_price_val = float(unit_price) if isinstance(unit_price, str) else unit_price
                if unit_price_val < 0:
                    raise serializers.ValidationError({"unit_price": "Unit price cannot be negative"})
        
        return data


# ============================================================================
# ESTIMATE SERIALIZERS
# ============================================================================

class EstimateListSerializer(serializers.ModelSerializer):
    """Serializer for listing estimates"""
    
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    vehicle_display = serializers.SerializerMethodField()
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    work_order_status = serializers.CharField(source='work_order.status', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    days_until_expiration = serializers.IntegerField(read_only=True)
    can_be_approved = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Estimate
        fields = [
            'id', 'estimate_number', 'customer', 'customer_name',
            'vehicle', 'vehicle_display', 'work_order', 'work_order_number',
            'work_order_status', 'status', 'title', 'reference_number',
            'estimate_date', 'valid_until', 'is_expired', 'days_until_expiration',
            'subtotal', 'discount_amount', 'tax_amount', 'total',
            'can_be_approved', 'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_vehicle_display(self, obj):
        if not obj.vehicle:
            return None
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"


class EstimateDetailSerializer(serializers.ModelSerializer):
    """Serializer for estimate details"""
    
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_email = serializers.CharField(source='customer.email', read_only=True)
    customer_phone = serializers.CharField(source='customer.phone', read_only=True)
    
    vehicle_display = serializers.SerializerMethodField()
    vehicle_vin = serializers.CharField(source='vehicle.vin', read_only=True)
    
    line_items = EstimateLineItemSerializer(many=True, read_only=True)
    
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    sales_agent_name = serializers.CharField(source='sales_agent.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    sent_by_name = serializers.CharField(source='sent_by.get_full_name', read_only=True)
    tax_breakdown = serializers.SerializerMethodField()
    work_order_number = serializers.SerializerMethodField()
    work_order_status = serializers.CharField(source='work_order.status', read_only=True)
    work_order_quote_stage = serializers.SerializerMethodField()
    work_order_quote_stage_display = serializers.SerializerMethodField()
    can_mark_ready = serializers.SerializerMethodField()
    latest_invoice_summary = serializers.SerializerMethodField()
    
    is_expired = serializers.BooleanField(read_only=True)
    days_until_expiration = serializers.IntegerField(read_only=True)
    can_be_approved = serializers.BooleanField(read_only=True)
    can_be_converted = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Estimate
        fields = [
            'id', 'estimate_number', 'customer', 'customer_name', 
            'customer_email', 'customer_phone',
            'vehicle', 'vehicle_display', 'vehicle_vin',
            'work_order', 'work_order_number', 'work_order_status',
            'work_order_quote_stage', 'work_order_quote_stage_display', 'can_mark_ready',
            'status', 'estimate_date', 'valid_until',
            'title', 'description', 'reference_number', 'sales_agent', 'sales_agent_name',
            'notes', 'customer_notes',
            'labor_subtotal', 'parts_subtotal', 'sublet_subtotal', 'subtotal',
            'discount_amount', 'discount_percentage', 'discount_type', 'discount_reason',
            'tax_amount', 'shop_supplies_fee', 'environmental_fee', 'total',
            'taxable_subtotal', 'tax_breakdown', 'line_items',
            'latest_invoice_summary',
            'is_expired', 'days_until_expiration', 'can_be_approved', 'can_be_converted',
            'approved_date', 'declined_date', 'converted_date',
            'created_by', 'created_by_name',
            'approved_by', 'approved_by_name',
            'sent_by', 'sent_by_name', 'sent_at',
            'viewed_at', 'created_at', 'updated_at'
        ]
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_vehicle_display(self, obj):
        if obj.vehicle:
            return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
        return None
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_work_order_number(self, obj):
        """Get work order number if work order exists"""
        if obj.work_order:
            return obj.work_order.work_order_number
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_work_order_quote_stage(self, obj):
        work_order = getattr(obj, 'work_order', None)
        if not work_order:
            return None
        return work_order.get_current_quote_stage()

    @extend_schema_field(OpenApiTypes.STR)
    def get_work_order_quote_stage_display(self, obj):
        work_order = getattr(obj, 'work_order', None)
        if not work_order:
            return None
        return work_order.get_current_quote_stage_display()

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_can_mark_ready(self, obj):
        work_order = getattr(obj, 'work_order', None)
        if not work_order:
            return False
        return work_order.get_current_quote_stage() == 'waiting_for_stores_quotation'

    @extend_schema_field(serializers.DictField())
    def get_latest_invoice_summary(self, obj):
        invoice = obj.invoices.exclude(status='void').order_by('-created_at').first()
        if not invoice:
            return None

        return {
            'id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'status': invoice.status,
            'total': str(invoice.total),
            'amount_paid': str(invoice.amount_paid),
            'amount_due': str(invoice.amount_due),
        }

    @extend_schema_field(inline_serializer(
        name='TaxBreakdownEstimate',
        fields={
            'regime': serializers.CharField(),
            'taxable_subtotal': serializers.CharField(),
            'nhil_amount': serializers.CharField(),
            'getfund_amount': serializers.CharField(),
            'hrl_amount': serializers.CharField(),
            'vat_amount': serializers.CharField(),
            'total_tax': serializers.CharField(),
        }
    ))
    def get_tax_breakdown(self, obj):
        return {
            'regime': obj.tax_regime,
            'taxable_subtotal': str(obj.taxable_subtotal),
            'nhil_amount': str(obj.tax_nhil_amount),
            'getfund_amount': str(obj.tax_getfund_amount),
            'hrl_amount': str(obj.tax_hrl_amount),
            'vat_amount': str(obj.tax_vat_amount),
            'total_tax': str(obj.tax_amount),
        }


class EstimateCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating estimates"""
    
    line_items = EstimateLineItemCreateSerializer(many=True)
    
    class Meta:
        model = Estimate
        fields = [
            'id', 'estimate_number', 'customer', 'vehicle', 'work_order', 'status', 'title', 'description',
            'reference_number', 'sales_agent',
            'notes', 'customer_notes', 'estimate_date', 'valid_until',
            'discount_percentage', 'discount_type', 'discount_reason',
            'shop_supplies_fee', 'environmental_fee',
            'line_items'
        ]
        read_only_fields = ['id', 'estimate_number']
    
    def validate(self, data):
        # Ensure valid_until is in the future
        if data.get('valid_until') and data['valid_until'] < timezone.now().date():
            raise serializers.ValidationError({"valid_until": "Valid until date must be in the future"})
        
        # Ensure at least one line item
        if not data.get('line_items'):
            raise serializers.ValidationError({"line_items": "At least one line item is required"})
        
        return data
    
    @transaction.atomic
    def create(self, validated_data):
        line_items_data = validated_data.pop('line_items')
        
        # Set created_by
        validated_data['created_by'] = self.context['request'].user
        
        # Resolve branch from request if not provided
        if not validated_data.get('branch'):
            from apps.branches.utils import resolve_branch
            request = self.context['request']
            validated_data['branch'] = resolve_branch(request)
        
        # Create estimate
        estimate = Estimate.objects.create(**validated_data)
        
        # Create line items
        for item_data in line_items_data:
            EstimateLineItem.objects.create(estimate=estimate, **item_data)
        
        # Refresh estimate to get all line items
        estimate.refresh_from_db()
        
        # Calculate totals - this will save the estimate
        estimate.calculate_totals()
        
        # Refresh again to ensure we have the latest calculated totals
        estimate.refresh_from_db()
        
        # Sync parts to work order if estimate is linked to a work order
        # Sync parts to work order if estimate is linked to a work order
        if estimate.work_order_id:
            try:
                estimate.sync_parts_to_work_order()
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to sync parts to work order/estimate: {e}")
        
        return estimate


class EstimateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating estimates"""
    
    line_items = EstimateLineItemCreateSerializer(many=True, required=False)
    
    class Meta:
        model = Estimate
        fields = [
            'customer', 'vehicle', 'work_order',
            'title', 'description', 'reference_number', 'sales_agent',
            'notes', 'customer_notes',
            'estimate_date', 'valid_until',
            'discount_percentage', 'discount_type', 'discount_reason',
            'shop_supplies_fee', 'environmental_fee',
            'status', 'line_items'
        ]
        extra_kwargs = {
            'customer': {'required': False},
            'vehicle': {'required': False},
            'title': {'required': False},
            'description': {'required': False},
            'notes': {'required': False},
            'customer_notes': {'required': False},
            'estimate_date': {'required': False},
            'valid_until': {'required': False},
            'discount_percentage': {'required': False},
            'discount_type': {'required': False},
            'discount_reason': {'required': False},
            'shop_supplies_fee': {'required': False},
            'environmental_fee': {'required': False},
            'status': {'required': False},
        }
    
    @transaction.atomic
    def update(self, instance, validated_data):
        line_items_data = validated_data.pop('line_items', None)
        original_status = instance.status
        if (
            original_status in {'sent', 'viewed', 'approved', 'declined', 'expired'}
            and validated_data.get('status') == 'draft'
        ):
            validated_data['status'] = original_status

        total_affecting_fields = {
            'discount_percentage',
            'discount_type',
            'discount_reason',
            'shop_supplies_fee',
            'environmental_fee',
        }
        should_recalculate_totals = bool(total_affecting_fields.intersection(validated_data))
        
        # Track if work_order was updated
        work_order_updated = 'work_order' in validated_data
        
        # Update estimate fields
        instance = super().update(instance, validated_data)
        
        # If line items are provided, update them
        if line_items_data is not None:
            # Delete existing line items
            instance.line_items.all().delete()
            
            # Create new line items
            for item_data in line_items_data:
                EstimateLineItem.objects.create(estimate=instance, **item_data)
            
            # Recalculate totals
            instance.calculate_totals()
            
            # Refresh instance to get calculated totals
            instance.refresh_from_db()
        elif should_recalculate_totals:
            instance.calculate_totals()
            instance.refresh_from_db()
        
        # Keep the linked work order estimate fields current after any estimate change
        # that can affect totals, or when a work order is newly linked.
        if instance.work_order_id and (line_items_data is not None or should_recalculate_totals or work_order_updated):
            try:
                instance.sync_parts_to_work_order()
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to sync estimate {instance.id} to work order: {e}")
        
        return instance


# ============================================================================
# ============================================================================
# INVOICE LINE ITEM SERIALIZERS
# ============================================================================

class InvoiceLineItemSerializer(serializers.ModelSerializer):
    part_name = serializers.CharField(source='part.name', read_only=True)
    
    class Meta:
        model = InvoiceLineItem
        fields = [
            'id', 'item_type', 'description', 'notes',
            'part', 'part_name', 'part_number',
            'quantity', 'unit_price', 'discount_percentage', 'discount_amount', 'total',
            'labor_hours', 'labor_rate',
            'is_taxable', 'order',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['discount_amount', 'total', 'created_at', 'updated_at']


# ============================================================================
# INVOICE SERIALIZERS
# ============================================================================

class InvoiceListSerializer(serializers.ModelSerializer):
    """Serializer for listing invoices"""
    
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    vehicle_display = serializers.SerializerMethodField()
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    is_overdue = serializers.BooleanField(read_only=True)
    days_overdue = serializers.IntegerField(read_only=True)
    days_until_due = serializers.IntegerField(read_only=True)
    is_paid = serializers.BooleanField(read_only=True)
    payment_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    
    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'customer', 'customer_name',
            'vehicle', 'vehicle_display', 'work_order', 'work_order_number',
            'status', 'invoice_date', 'due_date',
            'subtotal', 'discount_amount', 'tax_amount', 'total',
            'amount_paid', 'amount_due',
            'is_overdue', 'days_overdue', 'days_until_due',
            'is_paid', 'payment_percentage',
            'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_vehicle_display(self, obj):
        if not obj.vehicle:
            return None
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"


class InvoiceDetailSerializer(QBOSyncFieldsMixin, serializers.ModelSerializer):
    """Serializer for invoice details"""
    
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    customer_address = serializers.SerializerMethodField()
    
    vehicle_display = serializers.SerializerMethodField()
    vehicle_vin = serializers.CharField(source='vehicle.vin', read_only=True)
    
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    work_order_status = serializers.CharField(source='work_order.status', read_only=True)
    
    estimate_number = serializers.CharField(source='estimate.estimate_number', read_only=True)
    
    # Include payment history and line items
    payments = serializers.SerializerMethodField()
    line_items = InvoiceLineItemSerializer(many=True, read_only=True)
    
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    sent_by_name = serializers.CharField(source='sent_by.get_full_name', read_only=True)
    voided_by_name = serializers.CharField(source='voided_by.get_full_name', read_only=True)
    tax_breakdown = serializers.SerializerMethodField()
    
    is_overdue = serializers.BooleanField(read_only=True)
    days_overdue = serializers.IntegerField(read_only=True)
    days_until_due = serializers.IntegerField(read_only=True)
    is_paid = serializers.BooleanField(read_only=True)
    is_partially_paid = serializers.BooleanField(read_only=True)
    payment_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    
    qbo_sync_status = serializers.SerializerMethodField()
    qbo_sync_error = serializers.SerializerMethodField()
    
    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'customer', 'customer_name', 
            'customer_email', 'customer_phone', 'customer_address',
            'vehicle', 'vehicle_display', 'vehicle_vin',
            'work_order', 'work_order_number', 'work_order_status',
            'estimate', 'estimate_number',
            'status', 'invoice_date', 'due_date',
            'description', 'notes', 'customer_notes', 'terms',
            'labor_subtotal', 'parts_subtotal', 'sublet_subtotal', 'subtotal',
            'discount_amount', 'discount_percentage', 'discount_reason',
            'tax_amount', 'shop_supplies_fee', 'environmental_fee', 'total',
            'taxable_subtotal', 'tax_breakdown',
            'amount_paid', 'amount_due',
            'is_overdue', 'days_overdue', 'days_until_due',
            'is_paid', 'is_partially_paid', 'payment_percentage',
            'qbo_sync_status', 'qbo_sync_error',
            'line_items',
            'payments',
            'created_by', 'created_by_name',
            'sent_by', 'sent_by_name', 'sent_at',
            'viewed_at', 'paid_at',
            'voided_at', 'voided_by', 'voided_by_name', 'void_reason',
            'created_at', 'updated_at'
        ]
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_vehicle_display(self, obj):
        if not obj.vehicle:
            return None
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_customer_name(self, obj):
        """Get customer name from user or company name"""
        customer = obj.customer
        if customer.company_name:
            return customer.company_name
        if hasattr(customer, 'user') and customer.user:
            return customer.user.get_full_name() or customer.user.username
        return str(customer)
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_customer_email(self, obj):
        """Get customer email from user"""
        customer = obj.customer
        if hasattr(customer, 'user') and customer.user:
            return customer.user.email or ''
        return ''
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_customer_phone(self, obj):
        """Get customer phone from user"""
        customer = obj.customer
        if hasattr(customer, 'user') and customer.user:
            return customer.user.phone or ''
        return ''
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_customer_address(self, obj):
        """Get customer address from service_address, billing_address, or user address"""
        customer = obj.customer
        parts = []
        
        # Try service address first
        if customer.service_address:
            parts.append(customer.service_address)
            if customer.service_city:
                city_state_zip = f"{customer.service_city}, {customer.service_state} {customer.service_zip_code}".strip()
                if city_state_zip and city_state_zip != ", ":
                    parts.append(city_state_zip)
        # Fall back to billing address
        elif customer.billing_address:
            parts.append(customer.billing_address)
            if customer.billing_city:
                city_state_zip = f"{customer.billing_city}, {customer.billing_state} {customer.billing_zip_code}".strip()
                if city_state_zip and city_state_zip != ", ":
                    parts.append(city_state_zip)
        # Fall back to user address
        elif hasattr(customer, 'user') and customer.user:
            user = customer.user
            if user.address:
                parts.append(user.address)
            if user.city:
                city_state_zip = f"{user.city}, {user.state} {user.zip_code}".strip()
                if city_state_zip and city_state_zip != ", ":
                    parts.append(city_state_zip)
        
        return ", ".join(filter(None, parts))
    
    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_payments(self, obj):
        from apps.billing.serializers import PaymentSerializer
        payments = obj.payments.filter(status='completed').order_by('-payment_date')
        return PaymentSerializer(payments, many=True).data

    @extend_schema_field(inline_serializer(
        name='TaxBreakdownInvoice',
        fields={
            'regime': serializers.CharField(),
            'taxable_subtotal': serializers.CharField(),
            'nhil_amount': serializers.CharField(),
            'getfund_amount': serializers.CharField(),
            'hrl_amount': serializers.CharField(),
            'vat_amount': serializers.CharField(),
            'total_tax': serializers.CharField(),
        }
    ))
    def get_tax_breakdown(self, obj):
        return {
            'regime': obj.tax_regime,
            'taxable_subtotal': str(obj.taxable_subtotal),
            'nhil_amount': str(obj.tax_nhil_amount),
            'getfund_amount': str(obj.tax_getfund_amount),
            'hrl_amount': str(obj.tax_hrl_amount),
            'vat_amount': str(obj.tax_vat_amount),
            'total_tax': str(obj.tax_amount),
        }

    def _get_qbo_mapping(self, obj):
        if not hasattr(self, '_qbo_mapping_cache'):
            self._qbo_mapping_cache = {}
        if obj.id not in self._qbo_mapping_cache:
            from apps.quickbooks_online.models import QBOMapping
            from django.contrib.contenttypes.models import ContentType
            self._qbo_mapping_cache[obj.id] = QBOMapping.objects.filter(
                content_type=ContentType.objects.get_for_model(obj),
                object_id=obj.id
            ).first()
        return self._qbo_mapping_cache[obj.id]


def _default_invoice_notes_from_work_order(work_order):
    """Human-readable notes when creating an invoice from a work order (API defaults)."""
    lines = [f"Work order {work_order.work_order_number}"]
    vehicle = work_order.vehicle
    if vehicle:
        plate = vehicle.license_plate or "no plate"
        lines.append(f"Vehicle: {vehicle.year} {vehicle.make} {vehicle.model} — {plate}")
    if work_order.customer_concerns:
        lines.append(f"Customer concern: {work_order.customer_concerns}")
    if work_order.status == "discontinued_pending_bill":
        reason = (work_order.customer_discontinuation_reason or "").strip()
        if reason:
            try:
                label = work_order.get_customer_discontinuation_reason_display()
            except Exception:
                label = reason
            lines.append(f"Customer discontinued: {label}")
        disc_notes = (work_order.customer_discontinuation_notes or "").strip()
        if disc_notes:
            lines.append(f"Discontinuation notes: {disc_notes}")
    return "\n".join(lines)


class InvoiceLineItemCreateSerializer(serializers.Serializer):
    """Serializer for invoice line items (used for standalone invoices)"""
    item_type = serializers.ChoiceField(choices=['labor', 'part', 'fee', 'discount', 'sublet', 'other'])
    description = serializers.CharField(max_length=500)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    labor_hours = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    labor_rate = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    discount_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, default=Decimal('0'), min_value=Decimal('0'), max_value=Decimal('100'))
    part = serializers.PrimaryKeyRelatedField(queryset=Part.objects.all(), required=False, allow_null=True)
    part_number = serializers.CharField(max_length=100, required=False, allow_blank=True)
    is_taxable = serializers.BooleanField(default=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)


class InvoiceCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating invoices"""
    
    line_items = InvoiceLineItemCreateSerializer(many=True, required=False)
    
    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number',
            'customer', 'vehicle', 'work_order', 'estimate',
            'invoice_date', 'due_date',
            'description', 'notes', 'customer_notes', 'terms',
            'discount_percentage', 'discount_reason',
            'shop_supplies_fee', 'environmental_fee',
            'status',
            'line_items'  # For standalone invoices without work order
        ]
        read_only_fields = ['id', 'invoice_number']
        extra_kwargs = {
            'customer': {'required': False},
            'vehicle': {'required': False},
            'work_order': {'required': False},
            'status': {'required': False},
        }
    
    def validate(self, data):
        work_order = data.get('work_order')
        customer = data.get('customer')
        vehicle = data.get('vehicle')
        line_items = data.get('line_items', [])
        
        # If work_order is provided, validate it
        if work_order:
            allowed_statuses = ('completed', 'discontinued_pending_bill')
            if work_order.status not in allowed_statuses:
                raise serializers.ValidationError({
                    "work_order": (
                        "Work order must be completed or marked "
                        "'Discontinued — Pending Invoice' before creating an invoice."
                    )
                })
            
            from apps.billing.work_order_invoices import active_invoice_exists_for_work_order

            if active_invoice_exists_for_work_order(work_order):
                raise serializers.ValidationError({
                    "work_order": (
                        "An active invoice already exists for this work order. "
                        "Void the current invoice before creating a revision."
                    ),
                })
        else:
            # For standalone invoices, customer and vehicle are required
            if not customer:
                raise serializers.ValidationError({"customer": "Customer is required when creating invoice without work order"})
            if not vehicle:
                raise serializers.ValidationError({"vehicle": "Vehicle is required when creating invoice without work order"})
            if not line_items:
                raise serializers.ValidationError({"line_items": "At least one line item is required when creating invoice without work order"})
        
        # Ensure due_date is after invoice_date
        if data.get('due_date') and data.get('invoice_date'):
            if data['due_date'] < data['invoice_date']:
                raise serializers.ValidationError({"due_date": "Due date must be after invoice date"})
        
        return data
    
    @transaction.atomic
    def create(self, validated_data):
        line_items_data = validated_data.pop('line_items', [])
        work_order = validated_data.get('work_order')

        if work_order:
            work_order = WorkOrder.objects.select_for_update().get(pk=work_order.pk)
            from apps.billing.work_order_invoices import active_invoice_exists_for_work_order

            if active_invoice_exists_for_work_order(work_order):
                raise serializers.ValidationError({
                    "work_order": (
                        "An active invoice already exists for this work order. "
                        "Open the existing invoice or void it before creating a revision."
                    ),
                })
            validated_data['work_order'] = work_order
        
        # Set created_by
        validated_data['created_by'] = self.context['request'].user
        
        # If work_order is provided, get customer and vehicle from it
        if work_order:
            validated_data['customer'] = work_order.customer
            validated_data['vehicle'] = work_order.vehicle
            
            # CRITICAL: Set branch from work_order for Django Ledger integration
            if not validated_data.get('branch') and work_order.branch:
                validated_data['branch'] = work_order.branch

            validated_data.setdefault(
                'description',
                f"Invoice for work order {work_order.work_order_number}",
            )
            if not (validated_data.get('notes') or '').strip():
                validated_data['notes'] = _default_invoice_notes_from_work_order(work_order)
        else:
            # For standalone invoices, resolve branch from request
            if not validated_data.get('branch'):
                from apps.branches.utils import resolve_branch
                request = self.context['request']
                validated_data['branch'] = resolve_branch(request)
        
        # Map payment_terms to terms if provided (frontend sends payment_terms)
        if 'payment_terms' in validated_data:
            payment_terms = validated_data.pop('payment_terms')
            if not validated_data.get('terms'):
                # Map enum values to readable text
                terms_map = {
                    'due_on_receipt': 'Due on Receipt',
                    'net_15': 'Net 15',
                    'net_30': 'Net 30',
                    'net_60': 'Net 60',
                }
                validated_data['terms'] = terms_map.get(payment_terms, payment_terms)
        
        billable_estimate = None
        if work_order and not line_items_data:
            from apps.billing.work_order_invoices import get_billable_estimate_for_work_order
            billable_estimate = get_billable_estimate_for_work_order(work_order)
            if billable_estimate:
                validated_data['estimate'] = billable_estimate
                if not validated_data.get('branch') and billable_estimate.branch_id:
                    validated_data['branch'] = billable_estimate.branch
                validated_data.setdefault(
                    'description',
                    f"Invoice from estimate {billable_estimate.estimate_number} "
                    f"for work order {work_order.work_order_number}",
                )

        invoice = Invoice.objects.create(**validated_data)

        if work_order and line_items_data:
            finalize_invoice_from_line_items(invoice, line_items_data)
        elif work_order and billable_estimate:
            billable_estimate.apply_quoted_prices_to_work_order()
            invoice.populate_from_estimate(billable_estimate, mark_converted=True)
        elif work_order:
            invoice.calculate_totals_from_work_order()
            invoice.save()
            invoice.populate_line_items_from_work_order()
        elif line_items_data:
            finalize_invoice_from_line_items(invoice, line_items_data)
        
        # The post_save signal will create the DL invoice automatically
        # But we need to ensure the invoice is saved again to trigger the signal
        # (signal fires on save, and we just saved above, so it should work)
        # However, if DL invoice wasn't created, we need to refresh from DB
        invoice.refresh_from_db()
        
        # Ensure Django Ledger invoice has matching line items
        try:
            from apps.billing.accounting_service import AccountingService
            AccountingService.create_dl_invoice(invoice)
        except Exception:
            pass

        return invoice


class InvoiceUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating invoices"""
    
    line_items = InvoiceLineItemCreateSerializer(many=True, required=False)
    
    class Meta:
        model = Invoice
        fields = [
            'status',  # Allow status updates
            'customer', 'vehicle',
            'description', 'notes', 'customer_notes', 'terms',
            'invoice_date', 'due_date',
            'discount_percentage', 'discount_reason',
            'shop_supplies_fee', 'environmental_fee',
            'line_items'
        ]
        extra_kwargs = {
            'customer': {'required': False},
            'vehicle': {'required': False},
            'description': {'required': False},
            'notes': {'required': False},
            'customer_notes': {'required': False},
            'terms': {'required': False},
            'invoice_date': {'required': False},
            'due_date': {'required': False},
            'discount_percentage': {'required': False},
            'discount_reason': {'required': False},
            'shop_supplies_fee': {'required': False},
            'environmental_fee': {'required': False},
            'status': {'required': False},
        }

    def _has_posted_journal(self, invoice):
        from django.contrib.contenttypes.models import ContentType
        from apps.accounting.models import JournalEntry

        return JournalEntry.objects.filter(
            content_type=ContentType.objects.get_for_model(invoice),
            object_id=invoice.id,
        ).exists()

    def validate(self, data):
        if self.instance is not None and self._has_posted_journal(self.instance):
            raise serializers.ValidationError({
                "detail": (
                    "Posted invoices cannot be edited. Void the invoice (if allowed) "
                    "or post correcting entries instead."
                )
            })
        return data
    
    @transaction.atomic
    def update(self, instance, validated_data):
        if self._has_posted_journal(instance):
            raise serializers.ValidationError({
                "detail": (
                    "Posted invoices cannot be edited. Void the invoice (if allowed) "
                    "or post correcting entries instead."
                )
            })

        line_items_data = validated_data.pop('line_items', None)
        discount_percentage_updated = 'discount_percentage' in validated_data
        
        instance = super().update(instance, validated_data)
        
        # If discount_percentage was updated, recalculate discount_amount
        if discount_percentage_updated:
            discount_percentage = instance.discount_percentage or Decimal('0')
            if discount_percentage > 0:
                instance.discount_amount = (instance.subtotal * discount_percentage / 100).quantize(Decimal('0.01'))
            else:
                # Explicitly reset discount_amount to 0 when discount_percentage is 0
                instance.discount_amount = Decimal('0')
            instance.save()
        
        if line_items_data is not None:
            if not instance.work_order and len(line_items_data) == 0:
                raise serializers.ValidationError({
                    "line_items": "At least one line item is required."
                })
            
            InvoiceLineItem.objects.filter(invoice=instance).delete()
            
            if line_items_data:
                labor_subtotal = Decimal('0')
                parts_subtotal = Decimal('0')
                sublet_subtotal = Decimal('0')
                taxable_before_discount = Decimal('0')
                
                for order, item in enumerate(line_items_data):
                    item_total = calculate_discounted_line_total(item)
                    
                    item_type = item.get('item_type', '')
                    
                    if item_type == 'labor':
                        labor_subtotal += item_total
                    elif item_type == 'part':
                        parts_subtotal += item_total
                    elif item_type == 'sublet':
                        sublet_subtotal += item_total
                    
                    if item.get('is_taxable', True):
                        taxable_before_discount += item_total
                    
                    item_data = item.copy()
                    item_data.pop('total', None)
                    InvoiceLineItem.objects.create(
                        invoice=instance,
                        order=order,
                        **item_data
                    )
                
                instance.labor_subtotal = labor_subtotal
                instance.parts_subtotal = parts_subtotal
                instance.sublet_subtotal = sublet_subtotal
                instance.subtotal = labor_subtotal + parts_subtotal + sublet_subtotal
                
                discount_percentage = instance.discount_percentage or Decimal('0')
                if discount_percentage > 0:
                    instance.discount_amount = (instance.subtotal * discount_percentage / 100).quantize(Decimal('0.01'))
                else:
                    # Explicitly reset discount_amount to 0 when discount_percentage is 0
                    instance.discount_amount = Decimal('0')
                subtotal_after_discount = instance.subtotal - instance.discount_amount
                
                discount_ratio = Decimal('0')
                if instance.subtotal > 0 and instance.discount_amount > 0:
                    discount_ratio = (instance.discount_amount / instance.subtotal)
                taxable_discount = (taxable_before_discount * discount_ratio).quantize(Decimal('0.01')) if discount_ratio > 0 else Decimal('0')
                taxable_after_discount = max(taxable_before_discount - taxable_discount, Decimal('0'))
                
                from apps.billing.tax_service import TaxService
                breakdown = TaxService.calculate_breakdown(taxable_after_discount)
                instance.taxable_subtotal = breakdown.taxable_subtotal
                instance.tax_nhil_amount = breakdown.nhil_amount
                instance.tax_getfund_amount = breakdown.getfund_amount
                instance.tax_hrl_amount = Decimal('0')  # breakdown.hrl_amount removed
                instance.tax_vat_amount = breakdown.vat_amount
                instance.tax_amount = breakdown.total_tax
                instance.tax_regime = breakdown.regime
                
                instance.total = (
                    subtotal_after_discount +
                    instance.tax_amount +
                    instance.shop_supplies_fee +
                    instance.environmental_fee
                ).quantize(Decimal('0.01'))
                from apps.billing.balance_utils import operational_collection_balances

                instance.amount_paid, instance.amount_due = operational_collection_balances(
                    instance.total,
                    instance.amount_paid,
                )
                instance.save()
            else:
                # No line items provided; fallback to work order totals if available
                if instance.work_order:
                    from apps.billing.work_order_invoices import get_billable_estimate_for_work_order
                    estimate = get_billable_estimate_for_work_order(instance.work_order)
                    if estimate and not instance.estimate_id:
                        estimate.apply_quoted_prices_to_work_order()
                        instance.populate_from_estimate(estimate, mark_converted=True)
                    else:
                        instance.calculate_totals_from_work_order()
                        instance.save()
        
        # try:
        #     from apps.billing.accounting_service import AccountingService
        #     AccountingService.create_dl_invoice(instance)
        # except Exception:
        #     pass
        pass
        
        return instance


# ============================================================================
# PAYMENT SERIALIZERS
# ============================================================================

class PaymentSerializer(serializers.ModelSerializer):
    """Serializer for payments"""
    
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    processed_by_name = serializers.CharField(source='processed_by.get_full_name', read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True, allow_null=True)
    till_account_name = serializers.CharField(source='till.till_account.name', read_only=True, allow_null=True)
    refunded_by_name = serializers.CharField(source='refunded_by.get_full_name', read_only=True)
    
    net_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    is_refunded = serializers.BooleanField(read_only=True)
    is_partially_refunded = serializers.BooleanField(read_only=True)
    allocated_total = serializers.SerializerMethodField()
    unallocated_balance = serializers.SerializerMethodField()
    
    class Meta:
        model = Payment
        fields = [
            'id', 'payment_number', 'invoice', 'invoice_number',
            'customer', 'customer_name',
            'till', 'till_account_name', 'bank_account', 'bank_account_name',
            'payment_method', 'status', 'amount', 'payment_date',
            'reference_number', 'card_last_four', 'card_type',
            'notes',
            'refund_amount', 'refund_date', 'refund_reason',
            'refunded_by', 'refunded_by_name',
            'net_amount', 'is_refunded', 'is_partially_refunded',
            'allocated_total', 'unallocated_balance',
            'processed_by', 'processed_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_allocated_total(self, obj):
        total = obj.allocations.aggregate(t=Sum('amount'))['t']
        return str(total or Decimal('0'))

    def get_unallocated_balance(self, obj):
        allocated = obj.allocations.aggregate(t=Sum('amount'))['t'] or Decimal('0')
        left = (obj.amount - allocated).quantize(Decimal('0.01'))
        if left < 0:
            left = Decimal('0')
        return str(left)


class PaymentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating payments"""
    cash_account = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.filter(is_till_enabled=True, is_active=True),
        required=False,
        write_only=True,
    )
    bank_account = serializers.PrimaryKeyRelatedField(
        queryset=bank_account_queryset(),
        required=False,
        allow_null=True,
    )
    
    class Meta:
        model = Payment
        fields = [
            'invoice', 'payment_method', 'amount', 'payment_date',
            'reference_number', 'card_last_four', 'card_type', 'notes',
            'cash_account', 'bank_account'
        ]
    
    def validate(self, data):
        invoice = data.get('invoice')
        amount = data.get('amount', 0)
        
        if not invoice:
            raise serializers.ValidationError({"invoice": "Invoice is required"})
        
        # Refresh invoice to get latest payment status
        invoice.refresh_from_db()
        
        # Ensure amount is positive
        if amount <= 0:
            raise serializers.ValidationError({"amount": "Amount must be greater than 0"})
        
        # Only prevent payments if invoice is explicitly marked as paid
        # This is the most reliable check - other statuses may still accept payments
        if invoice.status == 'paid':
            inv_num = getattr(invoice, 'invoice_number', f'#{invoice.id}')
            raise serializers.ValidationError(
                {"invoice": f"Invoice {inv_num} is already fully paid. Cannot record additional payments."}
            )

        amount_due = invoice.amount_due
        if amount > amount_due:
            from apps.accounting.models import AccountingControl

            controls = AccountingControl.get_settings()
            if not controls.customer_prepayment_account_id:
                raise serializers.ValidationError({
                    "amount": (
                        "Payment exceeds invoice balance. Configure a customer prepayment "
                        "account in Accounting Controls to record overpayments."
                    )
                })

        payment_method = data.get('payment_method')
        if payment_method == 'cash':
            request = self.context.get('request')
            cash_account = data.pop('cash_account', None)
            if cash_account is None:
                raise serializers.ValidationError({
                    "cash_account": "Select the till-enabled cash account for this cash payment."
                })
            invoice_branch_id = getattr(invoice, 'branch_id', None)
            open_till = None
            if request and cash_account:
                till_qs = CashierTill.objects.filter(status='open', till_account=cash_account)
                if invoice_branch_id:
                    till_qs = till_qs.filter(branch_id=invoice_branch_id)
                open_till = till_qs.select_related('branch', 'till_account').order_by('-opened_at').first()

            if not open_till:
                raise serializers.ValidationError({
                    "payment_method": "Open a till for the selected cash account before recording a cash payment."
                })

            if invoice_branch_id and open_till.branch_id != invoice_branch_id:
                raise serializers.ValidationError({
                    "payment_method": "The active till must belong to the invoice branch."
                })

            data['till'] = open_till
            data['bank_account'] = None
        elif payment_method in BANK_SETTLEMENT_PAYMENT_METHODS:
            bank_account = validate_bank_account(data.get('bank_account'))
            if bank_account is None:
                raise serializers.ValidationError({
                    "bank_account": "Select the bank or cash-equivalent account for this payment."
                })
            data['till'] = None
        
        return data
    
    def create(self, validated_data):
        # Set processed_by
        validated_data['processed_by'] = self.context['request'].user
        
        # Set customer from invoice
        validated_data['customer'] = validated_data['invoice'].customer
        
        # Set status to completed by default
        if 'status' not in validated_data:
            validated_data['status'] = 'completed'
        
        payment = super().create(validated_data)
        
        # Send payment received notification
        try:
            from apps.notifications_app.triggers import notification_triggers
            notification_triggers.payment_received(payment)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "Failed to send payment received notification: %s", e, exc_info=True
            )
        
        return payment


class RefundPaymentSerializer(serializers.Serializer):
    """Serializer for refunding a payment"""
    
    refund_amount = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    refund_reason = serializers.CharField(required=True)
    
    def validate_refund_amount(self, value):
        payment = self.context.get('payment')
        if value > (payment.amount - payment.refund_amount):
            raise serializers.ValidationError("Refund amount cannot exceed remaining payment amount")
        return value
    
# Till management serializers (CashierTill, CashCount, …)

class CashCountSerializer(serializers.ModelSerializer):
    """Serializer for cash count"""
    
    class Meta:
        model = CashCount
        fields = ['id', 'denomination', 'quantity', 'total', 'count_type']
        read_only_fields = ['total']


class CashierTillSerializer(serializers.ModelSerializer):
    """Serializer for cashier till"""
    
    cashier_name = serializers.CharField(source='cashier.get_full_name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    till_account_name = serializers.CharField(source='till_account.name', read_only=True)
    till_account_code = serializers.CharField(source='till_account.code', read_only=True)
    cash_counts = CashCountSerializer(many=True, read_only=True)
    duration = serializers.SerializerMethodField()
    cash_payments_total = serializers.SerializerMethodField()
    cash_refunds_total = serializers.SerializerMethodField()
    cash_bill_payments_total = serializers.SerializerMethodField()
    till_cash_movements_net = serializers.SerializerMethodField()
    current_expected_balance = serializers.SerializerMethodField()
    
    class Meta:
        model = CashierTill
        fields = [
            'id', 'branch', 'branch_name', 'cashier', 'cashier_name',
            'till_account', 'till_account_name', 'till_account_code',
            'opened_at', 'closed_at', 'status',
            'opening_balance', 'closing_balance', 'expected_balance', 'variance',
            'variance_approval_status', 'is_balanced', 'duration', 'notes', 'cash_counts',
            'cash_payments_total', 'cash_refunds_total', 'cash_bill_payments_total', 'till_cash_movements_net',
            'current_expected_balance'
        ]
        read_only_fields = ['opened_at', 'created_at', 'updated_at']
    
    def get_duration(self, obj):
        duration = obj.duration
        if duration:
            hours = duration.total_seconds() // 3600
            minutes = (duration.total_seconds() % 3600) // 60
            return f"{int(hours)}h {int(minutes)}m"
        return None

    def get_cash_payments_total(self, obj):
        return obj.cash_payments_total()

    def get_cash_refunds_total(self, obj):
        return obj.cash_refunds_total()

    def get_cash_bill_payments_total(self, obj):
        return obj.cash_bill_payments_total()

    def get_till_cash_movements_net(self, obj):
        return obj.till_cash_movements_net()

    def get_current_expected_balance(self, obj):
        return obj.calculate_expected_balance()


class OpenTillSerializer(serializers.Serializer):
    """Serializer for opening a till"""
    till_account = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.filter(is_till_enabled=True, is_active=True),
        required=True,
    )
    opening_balance = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0'))]
    )
    cash_counts = serializers.ListField(
        child=serializers.DictField(),
        required=False
    )

    def validate_cash_counts(self, value):
        return _validate_cash_count_lines(value)

    def validate(self, data):
        account = data['till_account']
        if not account.can_enable_till:
            raise serializers.ValidationError({
                'till_account': 'Select an active leaf Cash, Bank, or Cash Equivalent asset account.'
            })
        counts = data.get('cash_counts') or []
        if counts:
            counted_total = _sum_cash_count_lines(counts)
            if counted_total != data['opening_balance']:
                raise serializers.ValidationError({
                    "cash_counts": "Opening denomination counts must equal the opening balance."
                })
        return data


class CloseTillSerializer(serializers.Serializer):
    """Serializer for closing a till"""
    cash_counts = serializers.ListField(
        child=serializers.DictField(),
        required=False
    )
    counted_amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal('0'),
        required=False,
    )
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_cash_counts(self, value):
        return _validate_cash_count_lines(value)

    def validate(self, data):
        counts = data.get('cash_counts') or []
        counted_amount = data.get('counted_amount')
        if not counts and counted_amount is None:
            raise serializers.ValidationError(
                "Enter a physical cash count using denominations or total counted amount."
            )
        if counts and counted_amount is not None:
            count_total = _sum_cash_count_lines(counts)
            if count_total != counted_amount:
                raise serializers.ValidationError({
                    'counted_amount': 'Total counted amount must equal denomination count total.'
                })
        return data


class TillCashMovementSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True)

    class Meta:
        model = TillCashMovement
        fields = [
            'id', 'till', 'movement_type', 'amount', 'reason',
            'recorded_by', 'recorded_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'till', 'recorded_by', 'created_at']


class RecordTillMovementSerializer(serializers.Serializer):
    movement_type = serializers.ChoiceField(choices=['pay_in', 'pay_out'])
    amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal('0.01')
    )
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate(self, data):
        till = self.context['till']
        if till.status != 'open':
            raise serializers.ValidationError(
                {'non_field_errors': ['Till is not open.']}
            )
        if data['movement_type'] == 'pay_out':
            book = till.calculate_expected_balance()
            if book < data['amount']:
                raise serializers.ValidationError({
                    'amount': (
                        f'Pay out exceeds expected drawer balance ({book}). '
                        'Record sales/refunds and pay-ins first, or reduce the amount.'
                    ),
                })
        return data


def _validate_cash_count_lines(lines):
    cleaned = []
    for line in lines:
        try:
            denomination = Decimal(str(line['denomination']))
            quantity = int(line['quantity'])
        except (KeyError, TypeError, ValueError):
            raise serializers.ValidationError(
                "Each cash count line requires a valid denomination and quantity."
            )

        if denomination <= 0:
            raise serializers.ValidationError("Denomination must be greater than 0.")
        if quantity < 0:
            raise serializers.ValidationError("Quantity cannot be negative.")

        cleaned.append({
            'denomination': denomination,
            'quantity': quantity,
        })
    return cleaned


def _sum_cash_count_lines(lines):
    return sum(
        (line['denomination'] * line['quantity'] for line in lines),
        Decimal('0'),
    ).quantize(Decimal('0.01'))


class PaymentAllocationSerializer(serializers.ModelSerializer):
    """Serializer for payment allocation"""
    
    payment_number = serializers.CharField(source='payment.payment_number', read_only=True)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    allocated_by_name = serializers.CharField(source='allocated_by.get_full_name', read_only=True)
    
    class Meta:
        model = PaymentAllocation
        fields = [
            'id', 'payment', 'payment_number', 'invoice', 'invoice_number',
            'amount', 'allocated_at', 'allocated_by', 'allocated_by_name', 'notes'
        ]
        read_only_fields = ['allocated_at']


class RefundSerializer(serializers.ModelSerializer):
    """Serializer for refund"""
    
    customer_name = serializers.SerializerMethodField()
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True, allow_null=True)
    processed_by_name = serializers.CharField(source='processed_by.get_full_name', read_only=True, allow_null=True)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True, allow_null=True)
    till_account_name = serializers.CharField(source='till.till_account.name', read_only=True, allow_null=True)
    
    class Meta:
        model = Refund
        fields = [
            'id', 'refund_number', 'original_payment', 'invoice', 'customer', 'customer_name',
            'amount', 'reason', 'refund_method', 'reference_number', 'status',
            'requested_by', 'requested_by_name', 'requested_at',
            'approved_by', 'approved_by_name', 'approved_at',
            'processed_by', 'processed_by_name', 'processed_at',
            'till', 'till_account_name', 'bank_account', 'bank_account_name', 'notes'
        ]
        read_only_fields = ['refund_number', 'requested_at', 'approved_at', 'processed_at']
    
    def get_customer_name(self, obj):
        if obj.customer.user:
            return f"{obj.customer.user.first_name} {obj.customer.user.last_name}".strip()
        return obj.customer.company_name or "N/A"


class RefundCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating refunds"""
    bank_account = serializers.PrimaryKeyRelatedField(
        queryset=bank_account_queryset(),
        required=False,
        allow_null=True,
    )
    
    class Meta:
        model = Refund
        fields = [
            'original_payment', 'invoice', 'customer',
            'amount', 'reason', 'refund_method', 'reference_number', 'bank_account'
        ]

    def validate(self, data):
        payment = data.get('original_payment')
        amount = data.get('amount') or Decimal('0')
        if payment and amount > (payment.amount - (payment.refund_amount or Decimal('0'))):
            raise serializers.ValidationError({
                'amount': 'Refund amount cannot exceed the remaining refundable payment amount.'
            })
        refund_method = data.get('refund_method')
        if refund_method in BANK_SETTLEMENT_PAYMENT_METHODS:
            bank_account = validate_bank_account(data.get('bank_account'))
            if bank_account is None:
                raise serializers.ValidationError({
                    'bank_account': 'Select the bank or cash-equivalent account for this refund.'
                })
        return data

# ============================================================================
# CREDIT NOTE SERIALIZERS
# ============================================================================

class CreditNoteLineItemSerializer(serializers.ModelSerializer):
    """Serializer for credit note line items"""
    
    class Meta:
        model = CreditNoteLineItem
        fields = [
            'id', 'description', 'quantity', 
            'unit_price', 'total', 'is_taxable'
        ]
        read_only_fields = ['total']


class CreditNoteApplicationSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)

    class Meta:
        model = CreditNoteApplication
        fields = ['id', 'invoice', 'invoice_number', 'amount', 'applied_by', 'applied_at']
        read_only_fields = ['id', 'invoice_number', 'applied_by', 'applied_at']


class CreditNoteListSerializer(serializers.ModelSerializer):
    """Serializer for listing credit notes"""
    
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = CreditNote
        fields = [
            'id', 'credit_note_number', 'credit_date', 'status',
            'customer', 'customer_name', 'invoice', 'invoice_number',
            'amount', 'unused_amount', 'reason',
            'created_by', 'created_by_name', 'created_at'
        ]
        # Map 'amount' to 'total' for listing consistency
        extra_kwargs = {'amount': {'source': 'total', 'read_only': True}}


class CreditNoteDetailSerializer(serializers.ModelSerializer):
    """Serializer for credit note details"""
    
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    line_items = CreditNoteLineItemSerializer(many=True, read_only=True)
    applications = CreditNoteApplicationSerializer(many=True, read_only=True)

    class Meta:
        model = CreditNote
        fields = [
            'id', 'credit_note_number', 'credit_date', 'status',
            'customer', 'customer_name', 'invoice', 'invoice_number',
            'subtotal', 'tax_amount', 'total', 'unused_amount',
            'reason', 'notes', 'internal_notes',
            'line_items', 'applications',
            'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]


class CreditNoteCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating credit notes"""
    
    line_items = CreditNoteLineItemSerializer(many=True)
    
    class Meta:
        model = CreditNote
        fields = [
            'id',
            'credit_note_number',
            'status',
            'customer',
            'invoice',
            'credit_date',
            'reason',
            'notes',
            'internal_notes',
            'line_items',
        ]
        read_only_fields = ['id', 'credit_note_number', 'status']
    
    @transaction.atomic
    def create(self, validated_data):
        line_items_data = validated_data.pop('line_items')
        
        # Set created_by
        validated_data['created_by'] = self.context['request'].user
        
        # Resolve branch from request
        from apps.branches.utils import resolve_branch
        request = self.context['request']
        validated_data['branch'] = resolve_branch(request)
        
        # Create credit note
        credit_note = CreditNote.objects.create(**validated_data)
        
        # Create line items
        for item_data in line_items_data:
            CreditNoteLineItem.objects.create(credit_note=credit_note, **item_data)
            
        # Calculate totals
        credit_note.calculate_totals()
        
        return credit_note


class CreditNoteApplySerializer(serializers.Serializer):
    """Apply issued credit note balance to an open invoice (same customer)."""

    invoice = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        min_value=Decimal('0.01'),
    )

    def validate_invoice(self, value):
        if not Invoice.objects.filter(pk=value).exists():
            raise serializers.ValidationError('Invalid invoice.')
        return value


# ============================================================================
# VENDOR CREDIT SERIALIZERS
# ============================================================================

class VendorCreditLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorCreditLineItem
        fields = ['id', 'description', 'quantity', 'unit_price', 'total', 'is_taxable', 'inventory_item']
        read_only_fields = ['total']


class VendorCreditApplicationSerializer(serializers.ModelSerializer):
    bill_number = serializers.CharField(source='bill.bill_number', read_only=True)
    applied_by_name = serializers.CharField(source='applied_by.get_full_name', read_only=True)

    class Meta:
        model = VendorCreditApplication
        fields = ['id', 'bill', 'bill_number', 'amount', 'applied_by', 'applied_by_name', 'applied_at']
        read_only_fields = fields


class VendorCreditListSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    bill_number = serializers.CharField(source='bill.bill_number', read_only=True)

    class Meta:
        model = VendorCredit
        fields = [
            'id', 'credit_number', 'credit_date', 'status', 'vendor', 'vendor_name',
            'bill', 'bill_number', 'total', 'unused_amount', 'reason', 'created_at',
        ]


class VendorCreditDetailSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    bill_number = serializers.CharField(source='bill.bill_number', read_only=True)
    line_items = VendorCreditLineItemSerializer(many=True, read_only=True)
    applications = VendorCreditApplicationSerializer(many=True, read_only=True)

    class Meta:
        model = VendorCredit
        fields = [
            'id', 'credit_number', 'credit_date', 'status', 'vendor', 'vendor_name',
            'bill', 'bill_number', 'branch', 'subtotal', 'tax_amount', 'total',
            'unused_amount', 'reason', 'notes', 'line_items', 'applications',
            'created_by', 'created_at', 'updated_at',
        ]


class VendorCreditCreateSerializer(serializers.ModelSerializer):
    line_items = VendorCreditLineItemSerializer(many=True)

    class Meta:
        model = VendorCredit
        fields = [
            'id', 'credit_number', 'vendor', 'bill', 'credit_date', 'reason', 'notes', 'line_items',
        ]
        read_only_fields = ['id', 'credit_number']

    @transaction.atomic
    def create(self, validated_data):
        line_items_data = validated_data.pop('line_items')
        from apps.branches.utils import resolve_branch

        validated_data['created_by'] = self.context['request'].user
        validated_data['branch'] = resolve_branch(self.context['request'])
        vendor_credit = VendorCredit.objects.create(**validated_data)
        for item_data in line_items_data:
            VendorCreditLineItem.objects.create(vendor_credit=vendor_credit, **item_data)
        vendor_credit.calculate_totals()
        return vendor_credit


class VendorCreditApplySerializer(serializers.Serializer):
    bill = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        min_value=Decimal('0.01'),
    )

    def validate_bill(self, value):
        if not Bill.objects.filter(pk=value).exists():
            raise serializers.ValidationError('Invalid bill.')
        return value


# ============================================================================
# BILL SERIALIZERS
# ============================================================================

class BillLineItemSerializer(serializers.ModelSerializer):
    """Serializer for bill line items"""
    
    class Meta:
        model = BillLineItem
        fields = [
            'id', 'description', 'quantity', 'unit_price', 
            'total', 'is_taxable', 'expense_category', 'inventory_item',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['total', 'created_at', 'updated_at']


class BillLineItemCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating bill line items"""
    
    class Meta:
        model = BillLineItem
        fields = [
            'description', 'quantity', 'unit_price', 'is_taxable', 'expense_category',
            'inventory_item'
        ]


class BillSerializer(serializers.ModelSerializer):
    """Serializer for bills (list/detail)"""
    
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    purchase_order_number = serializers.CharField(source='purchase_order.po_number', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    assigned_approver_name = serializers.CharField(source='assigned_approver.get_full_name', read_only=True)
    submitted_by_name = serializers.CharField(source='submitted_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    rejected_by_name = serializers.CharField(source='rejected_by.get_full_name', read_only=True)
    line_items = BillLineItemSerializer(many=True, read_only=True)
    payments = serializers.SerializerMethodField()
    vendor_credit_applications = VendorCreditApplicationSerializer(many=True, read_only=True)
    
    class Meta:
        model = Bill
        fields = [
            'id', 'bill_number', 'vendor', 'vendor_name', 'branch',
            'purchase_order', 'purchase_order_number',
            'reference_number', 'bill_date', 'due_date',
            'terms', 'notes', 'status', 'currency',
            'subtotal', 'tax_amount', 'total', 
            'amount_paid', 'amount_due',
            'line_items', 'payments', 'vendor_credit_applications',
            'created_by', 'created_by_name',
            'submitted_by', 'submitted_by_name', 'submitted_at',
            'assigned_approver', 'assigned_approver_name',
            'approved_by', 'approved_by_name', 'approved_at',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'rejection_reason',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'bill_number', 'subtotal', 'total', 'amount_due',
            'created_by', 'created_at', 'updated_at'
        ]

    def get_payments(self, obj):
        return BillPaymentSerializer(obj.payments.all(), many=True).data
    
   


class BillCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating bills"""
    
    line_items = BillLineItemCreateSerializer(many=True)
    purchase_order = serializers.PrimaryKeyRelatedField(
        queryset=PurchaseOrder.objects.select_related('supplier', 'branch'),
        required=False,
        allow_null=True
    )
    
    class Meta:
        model = Bill
        fields = [
            'id', 'bill_number', 'vendor', 'branch',
            'purchase_order',
            'reference_number', 'bill_date', 'due_date',
            'terms', 'notes', 'status', 'currency',
            'line_items'
        ]
        read_only_fields = ['id', 'bill_number']

    def _has_posted_journal(self, bill):
        from django.contrib.contenttypes.models import ContentType
        from apps.accounting.models import JournalEntry

        return JournalEntry.objects.filter(
            content_type=ContentType.objects.get_for_model(bill),
            object_id=bill.id
        ).exists()
    
    def validate(self, data):
        line_items = data.get('line_items')
        if self.instance is None and not line_items:
            raise serializers.ValidationError({"line_items": "At least one line item is required"})
        if line_items is not None and not line_items:
            raise serializers.ValidationError({"line_items": "At least one line item is required"})

        if self.instance is not None:
            if self.instance.status not in {'draft', 'rejected'}:
                raise serializers.ValidationError({
                    "detail": "Only draft or rejected bills can be edited. Use the approval, payment, or void actions for workflow changes."
                })
            if 'status' in data and data['status'] != self.instance.status:
                raise serializers.ValidationError({
                    "status": "Bill status cannot be changed from the edit form. Use Submit Approval, Approve, Reject, Record Payment, or Void."
                })

        purchase_order = data.get(
            'purchase_order',
            self.instance.purchase_order if self.instance else None
        )
        requested_status = data.get('status', self.instance.status if self.instance else 'draft')
        if purchase_order:
            vendor = data.get('vendor', self.instance.vendor if self.instance else None)
            branch = data.get('branch', self.instance.branch if self.instance else None)
            if vendor and purchase_order.supplier_id != vendor.id:
                raise serializers.ValidationError({
                    "purchase_order": "Selected purchase order belongs to a different vendor."
                })
            if branch and purchase_order.branch_id and purchase_order.branch_id != branch.id:
                raise serializers.ValidationError({
                    "purchase_order": "Selected purchase order belongs to a different branch."
                })
            if purchase_order.status != 'received':
                raise serializers.ValidationError({
                    "purchase_order": "Purchase order must be fully received before creating a vendor bill."
                })

            existing_bills = Bill.objects.filter(purchase_order=purchase_order).exclude(status='void')
            if self.instance:
                existing_bills = existing_bills.exclude(pk=self.instance.pk)
            if existing_bills.exists():
                raise serializers.ValidationError({
                    "purchase_order": "A non-void bill already exists for this purchase order."
                })
            if self.instance is None and requested_status not in {'draft', 'open'}:
                raise serializers.ValidationError({
                    "status": "PO-linked bills can only be created as draft or open."
                })
        elif self.instance is None and requested_status != 'draft':
            raise serializers.ValidationError({
                "status": "Standalone bills must be created as draft, then submitted and approved through the approval workflow."
            })
        return data

    @transaction.atomic
    def create(self, validated_data):
        line_items_data = validated_data.pop('line_items')
        requested_status = validated_data.pop('status', 'draft')
        
        # Set created_by
        validated_data['created_by'] = self.context['request'].user
        # Keep the first save in draft so accounting signals do not post a
        # zero-total bill before line items have been created.
        validated_data['status'] = 'draft'
        
        # Create bill
        bill = Bill.objects.create(**validated_data)
        
        # Create line items
        for item_data in line_items_data:
            BillLineItem.objects.create(bill=bill, **item_data)
        
        # Calculate totals
        bill.calculate_totals()
        bill.refresh_from_db()

        if requested_status != bill.status:
            bill.status = requested_status
            bill.save()
            bill.refresh_from_db()
        
        return bill

    @transaction.atomic
    def update(self, instance, validated_data):
        if instance.amount_paid > 0 or self._has_posted_journal(instance):
            raise serializers.ValidationError({
                "detail": "Posted bills or bills with payments cannot be edited. Create a reversal/credit workflow instead."
            })

        line_items_data = validated_data.pop('line_items', None)
        
        # Update bill fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update line items if provided
        if line_items_data is not None:
            # For simplicity, replace all items
            instance.line_items.all().delete()
            for item_data in line_items_data:
                BillLineItem.objects.create(bill=instance, **item_data)
            
            instance.calculate_totals()
            instance.refresh_from_db()
            
        return instance


class BillPaymentSerializer(serializers.ModelSerializer):
    paid_by_name = serializers.CharField(source='paid_by.get_full_name', read_only=True)
    till_account_name = serializers.CharField(source='till.till_account.name', read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True, allow_null=True)

    class Meta:
        model = BillPayment
        fields = [
            'id', 'payment_number', 'bill', 'amount', 'payment_date',
            'payment_method', 'till', 'till_account_name', 'bank_account', 'bank_account_name',
            'reference_number', 'notes', 'paid_by',
            'paid_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'payment_number', 'bill', 'paid_by', 'paid_by_name',
            'created_at', 'updated_at'
        ]


class BillPaymentCreateSerializer(serializers.ModelSerializer):
    cash_account = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.filter(is_till_enabled=True, is_active=True),
        required=False,
        write_only=True,
    )
    bank_account = serializers.PrimaryKeyRelatedField(
        queryset=bank_account_queryset(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = BillPayment
        fields = ['amount', 'payment_date', 'payment_method', 'reference_number', 'notes', 'cash_account', 'bank_account']

    def validate(self, data):
        payment_method = data.get('payment_method')
        if payment_method == 'cash':
            request = self.context.get('request')
            bill = self.context.get('bill')
            cash_account = data.pop('cash_account', None)
            if cash_account is None:
                raise serializers.ValidationError({
                    'cash_account': 'Select the till-enabled cash account for this cash vendor payment.'
                })
            branch_id = getattr(bill, 'branch_id', None)
            till = None
            if cash_account:
                till_qs = CashierTill.objects.filter(status='open', till_account=cash_account)
                if branch_id:
                    till_qs = till_qs.filter(branch_id=branch_id)
                till = till_qs.select_related('till_account').order_by('-opened_at').first()
            if not till:
                raise serializers.ValidationError({
                    'payment_method': 'Open a till for the selected cash account before recording a cash vendor payment.'
                })
            data['till'] = till
            data['bank_account'] = None
        elif payment_method in BANK_SETTLEMENT_PAYMENT_METHODS:
            bank_account = validate_bank_account(data.get('bank_account'))
            if bank_account is None:
                raise serializers.ValidationError({
                    'bank_account': 'Select the bank or cash-equivalent account for this vendor payment.'
                })
            data['till'] = None
        return data
