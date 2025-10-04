from rest_framework import serializers
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.core.validators import MinValueValidator
from apps.billing.models import TaxRate, Estimate, EstimateLineItem, Invoice, Payment
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder
from apps.inventory.models import Part


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
            'quantity', 'unit_price', 'total',
            'labor_hours', 'labor_rate',
            'is_taxable', 'order',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['total', 'created_at', 'updated_at']


class EstimateLineItemCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating estimate line items"""
    
    class Meta:
        model = EstimateLineItem
        fields = [
            'item_type', 'description', 'notes',
            'part', 'part_number',
            'quantity', 'unit_price',
            'labor_hours', 'labor_rate',
            'is_taxable', 'order'
        ]
    
    def validate(self, data):
        # Ensure quantity and unit_price are positive
        if data.get('quantity', 0) <= 0:
            raise serializers.ValidationError({"quantity": "Quantity must be greater than 0"})
        if data.get('unit_price', 0) < 0:
            raise serializers.ValidationError({"unit_price": "Unit price cannot be negative"})
        
        # If item_type is labor, labor_hours and labor_rate should be provided
        if data.get('item_type') == 'labor':
            if not data.get('labor_hours'):
                raise serializers.ValidationError({"labor_hours": "Labor hours required for labor items"})
            if not data.get('labor_rate'):
                raise serializers.ValidationError({"labor_rate": "Labor rate required for labor items"})
        
        return data


# ============================================================================
# ESTIMATE SERIALIZERS
# ============================================================================

class EstimateListSerializer(serializers.ModelSerializer):
    """Serializer for listing estimates"""
    
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    vehicle_display = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    days_until_expiration = serializers.IntegerField(read_only=True)
    can_be_approved = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Estimate
        fields = [
            'id', 'estimate_number', 'customer', 'customer_name',
            'vehicle', 'vehicle_display', 'status', 'title',
            'estimate_date', 'valid_until', 'is_expired', 'days_until_expiration',
            'subtotal', 'discount_amount', 'tax_amount', 'total',
            'can_be_approved', 'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]
    
    def get_vehicle_display(self, obj):
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
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    sent_by_name = serializers.CharField(source='sent_by.get_full_name', read_only=True)
    
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
            'work_order', 'status', 'estimate_date', 'valid_until',
            'title', 'description', 'notes', 'customer_notes',
            'labor_subtotal', 'parts_subtotal', 'sublet_subtotal', 'subtotal',
            'discount_amount', 'discount_percentage', 'discount_reason',
            'tax_amount', 'shop_supplies_fee', 'environmental_fee', 'total',
            'line_items',
            'is_expired', 'days_until_expiration', 'can_be_approved', 'can_be_converted',
            'approved_date', 'declined_date', 'converted_date',
            'created_by', 'created_by_name',
            'approved_by', 'approved_by_name',
            'sent_by', 'sent_by_name', 'sent_at',
            'viewed_at', 'created_at', 'updated_at'
        ]
    
    def get_vehicle_display(self, obj):
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"


class EstimateCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating estimates"""
    
    line_items = EstimateLineItemCreateSerializer(many=True)
    
    class Meta:
        model = Estimate
        fields = [
            'customer', 'vehicle', 'title', 'description',
            'notes', 'customer_notes', 'estimate_date', 'valid_until',
            'discount_percentage', 'discount_reason',
            'tax_amount', 'shop_supplies_fee', 'environmental_fee',
            'line_items'
        ]
    
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
        
        # Create estimate
        estimate = Estimate.objects.create(**validated_data)
        
        # Create line items
        for item_data in line_items_data:
            EstimateLineItem.objects.create(estimate=estimate, **item_data)
        
        # Calculate totals
        estimate.calculate_totals()
        
        return estimate


class EstimateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating estimates"""
    
    class Meta:
        model = Estimate
        fields = [
            'title', 'description', 'notes', 'customer_notes',
            'estimate_date', 'valid_until',
            'discount_percentage', 'discount_reason',
            'tax_amount', 'shop_supplies_fee', 'environmental_fee'
        ]


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
    
    def get_vehicle_display(self, obj):
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"


class InvoiceDetailSerializer(serializers.ModelSerializer):
    """Serializer for invoice details"""
    
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_email = serializers.CharField(source='customer.email', read_only=True)
    customer_phone = serializers.CharField(source='customer.phone', read_only=True)
    customer_address = serializers.SerializerMethodField()
    
    vehicle_display = serializers.SerializerMethodField()
    vehicle_vin = serializers.CharField(source='vehicle.vin', read_only=True)
    
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    work_order_status = serializers.CharField(source='work_order.status', read_only=True)
    
    estimate_number = serializers.CharField(source='estimate.estimate_number', read_only=True)
    
    # Include payment history
    payments = serializers.SerializerMethodField()
    
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    sent_by_name = serializers.CharField(source='sent_by.get_full_name', read_only=True)
    voided_by_name = serializers.CharField(source='voided_by.get_full_name', read_only=True)
    
    is_overdue = serializers.BooleanField(read_only=True)
    days_overdue = serializers.IntegerField(read_only=True)
    days_until_due = serializers.IntegerField(read_only=True)
    is_paid = serializers.BooleanField(read_only=True)
    is_partially_paid = serializers.BooleanField(read_only=True)
    payment_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    
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
            'amount_paid', 'amount_due',
            'is_overdue', 'days_overdue', 'days_until_due',
            'is_paid', 'is_partially_paid', 'payment_percentage',
            'payments',
            'created_by', 'created_by_name',
            'sent_by', 'sent_by_name', 'sent_at',
            'viewed_at', 'paid_at',
            'voided_at', 'voided_by', 'voided_by_name', 'void_reason',
            'created_at', 'updated_at'
        ]
    
    def get_vehicle_display(self, obj):
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
    
    def get_customer_address(self, obj):
        parts = [obj.customer.address]
        if obj.customer.city:
            city_state_zip = f"{obj.customer.city}, {obj.customer.state} {obj.customer.zip_code}"
            parts.append(city_state_zip)
        return ", ".join(filter(None, parts))
    
    def get_payments(self, obj):
        from apps.billing.serializers import PaymentSerializer
        payments = obj.payments.filter(status='completed').order_by('-payment_date')
        return PaymentSerializer(payments, many=True).data


class InvoiceCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating invoices"""
    
    class Meta:
        model = Invoice
        fields = [
            'work_order', 'estimate',
            'invoice_date', 'due_date',
            'description', 'notes', 'customer_notes', 'terms',
            'discount_percentage', 'discount_reason',
            'tax_amount', 'shop_supplies_fee', 'environmental_fee'
        ]
    
    def validate(self, data):
        work_order = data.get('work_order')
        
        # Ensure work order exists
        if not work_order:
            raise serializers.ValidationError({"work_order": "Work order is required"})
        
        # Ensure work order is completed
        if work_order.status != 'completed':
            raise serializers.ValidationError({"work_order": "Work order must be completed before creating invoice"})
        
        # Check if invoice already exists for this work order
        if Invoice.objects.filter(work_order=work_order).exists():
            raise serializers.ValidationError({"work_order": "Invoice already exists for this work order"})
        
        # Ensure due_date is after invoice_date
        if data.get('due_date') and data.get('invoice_date'):
            if data['due_date'] < data['invoice_date']:
                raise serializers.ValidationError({"due_date": "Due date must be after invoice date"})
        
        return data
    
    def create(self, validated_data):
        work_order = validated_data['work_order']
        
        # Set created_by
        validated_data['created_by'] = self.context['request'].user
        
        # Get customer and vehicle from work order
        validated_data['customer'] = work_order.customer
        validated_data['vehicle'] = work_order.vehicle
        
        # Create invoice
        invoice = Invoice.objects.create(**validated_data)
        
        # Calculate totals from work order
        invoice.calculate_totals_from_work_order()
        
        return invoice


class InvoiceUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating invoices"""
    
    class Meta:
        model = Invoice
        fields = [
            'description', 'notes', 'customer_notes', 'terms',
            'invoice_date', 'due_date',
            'discount_percentage', 'discount_reason',
            'tax_amount', 'shop_supplies_fee', 'environmental_fee'
        ]


# ============================================================================
# PAYMENT SERIALIZERS
# ============================================================================

class PaymentSerializer(serializers.ModelSerializer):
    """Serializer for payments"""
    
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    processed_by_name = serializers.CharField(source='processed_by.get_full_name', read_only=True)
    refunded_by_name = serializers.CharField(source='refunded_by.get_full_name', read_only=True)
    
    net_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    is_refunded = serializers.BooleanField(read_only=True)
    is_partially_refunded = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Payment
        fields = [
            'id', 'payment_number', 'invoice', 'invoice_number',
            'customer', 'customer_name',
            'payment_method', 'status', 'amount', 'payment_date',
            'reference_number', 'card_last_four', 'card_type',
            'notes',
            'refund_amount', 'refund_date', 'refund_reason',
            'refunded_by', 'refunded_by_name',
            'net_amount', 'is_refunded', 'is_partially_refunded',
            'processed_by', 'processed_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class PaymentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating payments"""
    
    class Meta:
        model = Payment
        fields = [
            'invoice', 'payment_method', 'amount', 'payment_date',
            'reference_number', 'card_last_four', 'card_type', 'notes'
        ]
    
    def validate(self, data):
        invoice = data.get('invoice')
        amount = data.get('amount', 0)
        
        # Ensure amount is positive
        if amount <= 0:
            raise serializers.ValidationError({"amount": "Amount must be greater than 0"})
        
        # Warn if payment exceeds amount due (but allow it - overpayment)
        if invoice and amount > invoice.amount_due:
            # Could add a warning here if needed
            pass
        
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
            # Log but don't fail the payment creation
            print(f"Failed to send payment received notification: {e}")
        
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
