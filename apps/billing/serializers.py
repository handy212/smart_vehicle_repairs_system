from rest_framework import serializers
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.core.validators import MinValueValidator
from apps.billing.models import (
    TaxRate,
    Estimate,
    EstimateLineItem,
    Invoice,
    InvoiceLineItem,
    Payment,
    CashierTill,
    CashCount,
    PaymentAllocation,
    PaymentAllocation,
    Refund,
    CreditNote,
    CreditNoteLineItem,
    Bill,
    BillLineItem,
)
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
        item_type = data.get('item_type')
        
        # If item_type is labor, labor_hours and labor_rate should be provided
        if item_type == 'labor':
            labor_hours = data.get('labor_hours')
            labor_rate = data.get('labor_rate')
            if not labor_hours or labor_hours <= 0:
                raise serializers.ValidationError({"labor_hours": "Labor hours must be greater than 0"})
            if not labor_rate or (isinstance(labor_rate, str) and float(labor_rate) < 0) or (isinstance(labor_rate, (int, float)) and labor_rate < 0):
                raise serializers.ValidationError({"labor_rate": "Labor rate must be greater than or equal to 0"})
            # For labor items, quantity should match labor_hours
            if not data.get('quantity'):
                data['quantity'] = labor_hours
        else:
            # For non-labor items, ensure quantity and unit_price are valid
            quantity = data.get('quantity')
            if not quantity or quantity <= 0:
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
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    days_until_expiration = serializers.IntegerField(read_only=True)
    can_be_approved = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Estimate
        fields = [
            'id', 'estimate_number', 'customer', 'customer_name',
            'vehicle', 'vehicle_display', 'status', 'title', 'reference_number',
            'estimate_date', 'valid_until', 'is_expired', 'days_until_expiration',
            'subtotal', 'discount_amount', 'tax_amount', 'total',
            'can_be_approved', 'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]
    
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
            'work_order', 'work_order_number', 'status', 'estimate_date', 'valid_until',
            'title', 'description', 'reference_number', 'sales_agent', 'sales_agent_name',
            'notes', 'customer_notes',
            'labor_subtotal', 'parts_subtotal', 'sublet_subtotal', 'subtotal',
            'discount_amount', 'discount_percentage', 'discount_type', 'discount_reason',
            'tax_amount', 'shop_supplies_fee', 'environmental_fee', 'total',
            'taxable_subtotal', 'tax_breakdown', 'line_items',
            'is_expired', 'days_until_expiration', 'can_be_approved', 'can_be_converted',
            'approved_date', 'declined_date', 'converted_date',
            'created_by', 'created_by_name',
            'approved_by', 'approved_by_name',
            'sent_by', 'sent_by_name', 'sent_at',
            'viewed_at', 'created_at', 'updated_at'
        ]
    
    def get_vehicle_display(self, obj):
        if obj.vehicle:
            return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
        return None
    
    def get_work_order_number(self, obj):
        """Get work order number if work order exists"""
        if obj.work_order:
            return obj.work_order.work_order_number
        return None

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
            'id', 'estimate_number', 'customer', 'vehicle', 'work_order', 'title', 'description',
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
        discount_percentage_updated = 'discount_percentage' in validated_data
        
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
            
            # Sync parts to work order if linked
            if instance.work_order_id:
                try:
                    instance.sync_parts_to_work_order()
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Failed to sync parts to work order for estimate {instance.id}: {e}")
        elif discount_percentage_updated:
            # If only discount_percentage was updated, recalculate discount_amount
            discount_percentage = instance.discount_percentage or Decimal('0')
            if discount_percentage > 0:
                instance.discount_amount = (instance.subtotal * discount_percentage / 100).quantize(Decimal('0.01'))
            else:
                # Explicitly reset discount_amount to 0 when discount_percentage is 0
                instance.discount_amount = Decimal('0')
            instance.save()
        
        # Sync parts to work order if work_order was just linked (even if line items weren't updated)
        if work_order_updated and instance.work_order_id:
            # from apps.billing.accounting_service import AccountingService
            # try:
            #     # This logic would be replaced by the new accounting system
            #     pass
            # except Exception as e:
            #     logger.error(f"Failed to sync with accounting: {e}")
            pass # Original sync_parts_to_work_order call removed as per instruction.
        
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
            'quantity', 'unit_price', 'total',
            'labor_hours', 'labor_rate',
            'is_taxable', 'order',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['total', 'created_at', 'updated_at']


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
    
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    customer_address = serializers.SerializerMethodField()
    
    vehicle_display = serializers.SerializerMethodField()
    vehicle_vin = serializers.CharField(source='vehicle.vin', read_only=True)
    
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    work_order_status = serializers.CharField(source='work_order.status', read_only=True)
    
    estimate_number = serializers.CharField(source='estimate.estimate_number', read_only=True)
    
    # ledger_invoice = serializers.UUIDField(source='ledger_invoice.uuid', read_only=True, allow_null=True)
    # ledger_invoice_url = serializers.SerializerMethodField()
    
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
    
    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'customer', 'customer_name', 
            'customer_email', 'customer_phone', 'customer_address',
            'vehicle', 'vehicle_display', 'vehicle_vin',
            'work_order', 'work_order_number', 'work_order_status',
            'estimate', 'estimate_number',
            # 'ledger_invoice', 'ledger_invoice_url',
            'status', 'invoice_date', 'due_date',
            'description', 'notes', 'customer_notes', 'terms',
            'labor_subtotal', 'parts_subtotal', 'sublet_subtotal', 'subtotal',
            'discount_amount', 'discount_percentage', 'discount_reason',
            'tax_amount', 'shop_supplies_fee', 'environmental_fee', 'total',
            'taxable_subtotal', 'tax_breakdown',
            'amount_paid', 'amount_due',
            'is_overdue', 'days_overdue', 'days_until_due',
            'is_paid', 'is_partially_paid', 'payment_percentage',
            'line_items',
            'payments',
            'created_by', 'created_by_name',
            'sent_by', 'sent_by_name', 'sent_at',
            'viewed_at', 'paid_at',
            'voided_at', 'voided_by', 'voided_by_name', 'void_reason',
            'created_at', 'updated_at'
        ]
    
    def get_vehicle_display(self, obj):
        return f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
    
    def get_customer_name(self, obj):
        """Get customer name from user or company name"""
        customer = obj.customer
        if customer.company_name:
            return customer.company_name
        if hasattr(customer, 'user') and customer.user:
            return customer.user.get_full_name() or customer.user.username
        return str(customer)
    
    def get_customer_email(self, obj):
        """Get customer email from user"""
        customer = obj.customer
        if hasattr(customer, 'user') and customer.user:
            return customer.user.email or ''
        return ''
    
    def get_customer_phone(self, obj):
        """Get customer phone from user"""
        customer = obj.customer
        if hasattr(customer, 'user') and customer.user:
            return customer.user.phone or ''
        return ''
    
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
    
    # def get_ledger_invoice_url(self, obj):
    #     """Get URL to view invoice in Django Ledger"""
    #     if obj.ledger_invoice and obj.branch and hasattr(obj.branch, 'ledger_entity') and obj.branch.ledger_entity:
    #         entity_slug = obj.branch.ledger_entity.slug
    #         # Get request from context
    #         request = self.context.get('request')
    #         if request:
    #             # Build absolute URI from request
    #             # Django request.build_absolute_uri gives us the full URL including protocol and domain
    #             base_url = request.build_absolute_uri('/').rstrip('/')
    #             # If the request came through /api, replace it, otherwise use as-is
    #             if '/api' in base_url:
    #                 base_url = base_url.replace('/api', '')
    #             # Ensure we have the correct port (8000 for backend)
    #             # If request came from frontend (port 3000), we need to change it
    #             if ':3000' in base_url:
    #                 base_url = base_url.replace(':3000', ':8000')
    #             return f"{base_url}/ledger/invoice/{entity_slug}/detail/{obj.ledger_invoice.uuid}/"
    #         else:
    #             # Fallback: use environment variable or default to localhost:8000
    #             import os
    #             api_url = os.environ.get('NEXT_PUBLIC_API_URL', 'http://localhost:8000/api')
    #             base_url = api_url.replace('/api', '').rstrip('/')
    #             return f"{base_url}/ledger/invoice/{entity_slug}/detail/{obj.ledger_invoice.uuid}/"
    #     return None
    
    def get_payments(self, obj):
        from apps.billing.serializers import PaymentSerializer
        payments = obj.payments.filter(status='completed').order_by('-payment_date')
        return PaymentSerializer(payments, many=True).data

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


class InvoiceLineItemCreateSerializer(serializers.Serializer):
    """Serializer for invoice line items (used for standalone invoices)"""
    item_type = serializers.ChoiceField(choices=['labor', 'part', 'fee', 'discount', 'sublet', 'other'])
    description = serializers.CharField(max_length=500)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    labor_hours = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    labor_rate = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
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
            # Ensure work order is completed
            if work_order.status != 'completed':
                raise serializers.ValidationError({"work_order": "Work order must be completed before creating invoice"})
            
            # Check if invoice already exists for this work order
            if Invoice.objects.filter(work_order=work_order).exists():
                raise serializers.ValidationError({"work_order": "Invoice already exists for this work order"})
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
        
        # Set created_by
        validated_data['created_by'] = self.context['request'].user
        
        # If work_order is provided, get customer and vehicle from it
        if work_order:
            validated_data['customer'] = work_order.customer
            validated_data['vehicle'] = work_order.vehicle
            
            # CRITICAL: Set branch from work_order for Django Ledger integration
            if not validated_data.get('branch') and work_order.branch:
                validated_data['branch'] = work_order.branch
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
        
        # Create invoice
        invoice = Invoice.objects.create(**validated_data)
        
        # Calculate totals
        if work_order:
            # Calculate totals from work order
            invoice.calculate_totals_from_work_order()
            invoice.save()
        elif line_items_data:
            # Calculate totals from line items
            from decimal import Decimal
            labor_subtotal = Decimal('0')
            parts_subtotal = Decimal('0')
            sublet_subtotal = Decimal('0')
            
            taxable_before_discount = Decimal('0')
            
            for item in line_items_data:
                # Calculate item total from quantity and unit_price
                quantity = Decimal(str(item.get('quantity', 0) or 0))
                unit_price = Decimal(str(item.get('unit_price', 0) or 0))
                item_total = (quantity * unit_price).quantize(Decimal('0.01'))
                
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
            
            # Apply discount
            discount_percentage = validated_data.get('discount_percentage', Decimal('0'))
            if discount_percentage > 0:
                invoice.discount_amount = (invoice.subtotal * discount_percentage / 100).quantize(Decimal('0.01'))
            else:
                # Explicitly reset discount_amount to 0 when discount_percentage is 0
                invoice.discount_amount = Decimal('0')
            
            subtotal_after_discount = invoice.subtotal - invoice.discount_amount
            
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
            invoice.tax_hrl_amount = breakdown.hrl_amount
            invoice.tax_vat_amount = breakdown.vat_amount
            invoice.tax_amount = breakdown.total_tax
            invoice.tax_regime = breakdown.regime
            
            # Calculate total
            invoice.total = (
                subtotal_after_discount + 
                invoice.tax_amount + 
                invoice.shop_supplies_fee + 
                invoice.environmental_fee
            ).quantize(Decimal('0.01'))
            
            invoice.amount_due = invoice.total
            invoice.save()
            
            # Persist invoice line items
            for order, item in enumerate(line_items_data):
                item_data = item.copy()
                item_data.pop('total', None)
                InvoiceLineItem.objects.create(
                    invoice=invoice,
                    order=order,
                    **item_data
                )
        
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
    
    @transaction.atomic
    def update(self, instance, validated_data):
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
                    # Calculate item total from quantity and unit_price
                    quantity = Decimal(str(item.get('quantity', 0) or 0))
                    unit_price = Decimal(str(item.get('unit_price', 0) or 0))
                    item_total = (quantity * unit_price).quantize(Decimal('0.01'))
                    
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
                instance.tax_hrl_amount = breakdown.hrl_amount
                instance.tax_vat_amount = breakdown.vat_amount
                instance.tax_amount = breakdown.total_tax
                instance.tax_regime = breakdown.regime
                
                instance.total = (
                    subtotal_after_discount +
                    instance.tax_amount +
                    instance.shop_supplies_fee +
                    instance.environmental_fee
                ).quantize(Decimal('0.01'))
                instance.amount_due = (instance.total - instance.amount_paid).quantize(Decimal('0.01'))
                instance.save()
            else:
                # No line items provided; fallback to work order totals if available
                if instance.work_order:
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
# Phase 2 Till Management Serializers
# Add to apps/billing/serializers.py

from apps.billing.models import CashierTill, CashCount, PaymentAllocation, Refund


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
    cash_counts = CashCountSerializer(many=True, read_only=True)
    duration = serializers.SerializerMethodField()
    
    class Meta:
        model = CashierTill
        fields = [
            'id', 'branch', 'branch_name', 'cashier', 'cashier_name',
            'opened_at', 'closed_at', 'status',
            'opening_balance', 'closing_balance', 'expected_balance', 'variance',
            'is_balanced', 'duration', 'notes', 'cash_counts'
        ]
        read_only_fields = ['opened_at', 'created_at', 'updated_at']
    
    def get_duration(self, obj):
        duration = obj.duration
        if duration:
            hours = duration.total_seconds() // 3600
            minutes = (duration.total_seconds() % 3600) // 60
            return f"{int(hours)}h {int(minutes)}m"
        return None


class OpenTillSerializer(serializers.Serializer):
    """Serializer for opening a till"""
    opening_balance = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0'))]
    )


class CloseTillSerializer(serializers.Serializer):
    """Serializer for closing a till"""
    cash_counts = serializers.ListField(
        child=serializers.DictField(),
        required=True
    )
    notes = serializers.CharField(required=False, allow_blank=True)


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
    
    class Meta:
        model = Refund
        fields = [
            'id', 'refund_number', 'original_payment', 'invoice', 'customer', 'customer_name',
            'amount', 'reason', 'refund_method', 'reference_number', 'status',
            'requested_by', 'requested_by_name', 'requested_at',
            'approved_by', 'approved_by_name', 'approved_at',
            'processed_by', 'processed_by_name', 'processed_at',
            'till', 'notes'
        ]
        read_only_fields = ['refund_number', 'requested_at', 'approved_at', 'processed_at']
    
    def get_customer_name(self, obj):
        if obj.customer.user:
            return f"{obj.customer.user.first_name} {obj.customer.user.last_name}".strip()
        return obj.customer.company_name or "N/A"


class RefundCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating refunds"""
    
    class Meta:
        model = Refund
        fields = [
            'original_payment', 'invoice', 'customer',
            'amount', 'reason', 'refund_method', 'reference_number'
        ]

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
    
    class Meta:
        model = CreditNote
        fields = [
            'id', 'credit_note_number', 'credit_date', 'status',
            'customer', 'customer_name', 'invoice', 'invoice_number',
            'subtotal', 'tax_amount', 'total', 'unused_amount',
            'reason', 'notes', 'internal_notes',
            'line_items',
            'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]


class CreditNoteCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating credit notes"""
    
    line_items = CreditNoteLineItemSerializer(many=True)
    
    class Meta:
        model = CreditNote
        fields = [
            'customer', 'invoice', 'credit_date', 
            'reason', 'notes', 'internal_notes',
            'line_items'
        ]
    
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

# ============================================================================
# BILL SERIALIZERS
# ============================================================================

class BillLineItemSerializer(serializers.ModelSerializer):
    """Serializer for bill line items"""
    
    class Meta:
        model = BillLineItem
        fields = [
            'id', 'description', 'quantity', 'unit_price', 
            'total', 'expense_category',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['total', 'created_at', 'updated_at']


class BillLineItemCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating bill line items"""
    
    class Meta:
        model = BillLineItem
        fields = [
            'description', 'quantity', 'unit_price', 'expense_category'
        ]


class BillSerializer(serializers.ModelSerializer):
    """Serializer for bills (list/detail)"""
    
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    line_items = BillLineItemSerializer(many=True, read_only=True)
    ledger_bill_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Bill
        fields = [
            'id', 'bill_number', 'vendor', 'vendor_name', 'branch',
            'reference_number', 'bill_date', 'due_date',
            'terms', 'notes', 'status', 'currency',
            'subtotal', 'tax_amount', 'total', 
            'amount_paid', 'amount_due',
            'line_items', 'ledger_bill', 'ledger_bill_url',
            'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'bill_number', 'subtotal', 'total', 'amount_due',
            'ledger_bill', 'created_by', 'created_at', 'updated_at'
        ]
    
    def get_ledger_bill_url(self, obj):
        """Get URL to view bill in Django Ledger"""
        if obj.ledger_bill and obj.branch and hasattr(obj.branch, 'ledger_entity') and obj.branch.ledger_entity:
            entity_slug = obj.branch.ledger_entity.slug
            # Get request from context
            request = self.context.get('request')
            if request:
                base_url = request.build_absolute_uri('/').rstrip('/')
                if '/api' in base_url:
                    base_url = base_url.replace('/api', '')
                if ':3000' in base_url:
                    base_url = base_url.replace(':3000', ':8000')
                return f"{base_url}/ledger/bill/{entity_slug}/detail/{obj.ledger_bill.uuid}/"
        return None


class BillCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating bills"""
    
    line_items = BillLineItemCreateSerializer(many=True)
    
    class Meta:
        model = Bill
        fields = [
            'id', 'bill_number', 'vendor', 'branch',
            'reference_number', 'bill_date', 'due_date',
            'terms', 'notes', 'currency',
            'tax_amount',
            'line_items'
        ]
        read_only_fields = ['id', 'bill_number']
    
    def validate(self, data):
        if not data.get('line_items'):
            raise serializers.ValidationError({"line_items": "At least one line item is required"})
        return data

    @transaction.atomic
    def create(self, validated_data):
        line_items_data = validated_data.pop('line_items')
        
        # Set created_by
        validated_data['created_by'] = self.context['request'].user
        
        # Create bill
        bill = Bill.objects.create(**validated_data)
        
        # Create line items
        for item_data in line_items_data:
            BillLineItem.objects.create(bill=bill, **item_data)
        
        # Calculate totals
        bill.calculate_totals()
        bill.refresh_from_db()
        
        return bill

    @transaction.atomic
    def update(self, instance, validated_data):
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
