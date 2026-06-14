"""
Serializers for customers app
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import transaction
from .models import Customer, CustomerNote, CustomerContact, CustomerReminder, CustomerDocument, CustomerContract
from .contact_services import (
    build_primary_contact_display_name,
    sync_primary_contact,
)

User = get_user_model()


class CustomerUserSerializer(serializers.ModelSerializer):
    """Nested serializer for user information"""
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'first_name', 'last_name', 
                  'full_name', 'phone', 'gender', 'date_of_birth', 'is_active']
        read_only_fields = ['id']


class CustomerListSerializer(serializers.ModelSerializer):
    """Serializer for customer list view"""
    full_name = serializers.CharField(source='user.get_full_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    vehicle_count = serializers.IntegerField(read_only=True)
    available_credit = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        read_only=True
    )
    last_visit_date = serializers.SerializerMethodField()
    days_since_last_visit = serializers.SerializerMethodField()
    is_inactive = serializers.SerializerMethodField()
    
    def get_last_visit_date(self, obj):
        return obj.get_last_visit_date()
    
    def get_days_since_last_visit(self, obj):
        return obj.get_days_since_last_visit()
    
    def get_is_inactive(self, obj):
        """Check if customer is inactive based on threshold (default 6 months)"""
        days = obj.get_days_since_last_visit()
        if days is None:
            return None  # Never visited
        # Default threshold: 180 days (6 months)
        threshold = self.context.get('inactive_threshold_days', 180)
        return days >= threshold
    
    class Meta:
        model = Customer
        fields = [
            'id', 'user_id', 'customer_number', 'full_name', 'email', 'phone',
            'company_name', 'customer_type', 'status', 'customer_since',
            'vehicle_count', 'current_balance', 'available_credit',
            'loyalty_points', 'loyalty_tier', 'created_at',
            'last_visit_date', 'days_since_last_visit', 'is_inactive'
        ]


class CustomerDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for customer"""
    user = CustomerUserSerializer(read_only=True)
    vehicle_count = serializers.IntegerField(read_only=True)
    available_credit = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        read_only=True
    )
    full_name = serializers.CharField(source='user.get_full_name', read_only=True)
    
    class Meta:
        model = Customer
        fields = '__all__'
        read_only_fields = [
            'id', 'customer_number', 'user', 'customer_since',
            'created_at', 'updated_at'
        ]


class CustomerCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating customer with user account"""
    # User fields
    email = serializers.EmailField(write_only=True)
    username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    first_name = serializers.CharField(write_only=True)
    last_name = serializers.CharField(write_only=True)
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    gender = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    date_of_birth = serializers.DateField(write_only=True, required=False, allow_null=True)
    grant_portal_access = serializers.BooleanField(write_only=True, required=False, default=False)
    send_welcome_email = serializers.BooleanField(write_only=True, required=False, default=False)
    
    class Meta:
        model = Customer
        fields = [
            'id', 'customer_number',
            # User fields
            'email', 'username', 'password', 'first_name', 'last_name', 'phone',
            'gender', 'date_of_birth', 'grant_portal_access', 'send_welcome_email',
            # Customer fields
            'company_name', 'business_type', 'tax_id', 'customer_type',
            'status', 'contact_person_name', 'company_email', 'company_phone',
            'service_address', 'service_city', 'service_state', 'service_zip_code',
            'billing_address', 'billing_city', 'billing_state', 'billing_zip_code',
            'payment_terms', 'credit_limit', 'default_payment_method',
            'preferred_contact_method',
            'emergency_contact_name', 'emergency_contact_phone', 
            'emergency_contact_relationship', 'insurance_provider',
            'insurance_policy_number', 'insurance_phone', 'notes', 'tags',
            'referred_by', 'marketing_emails', 'marketing_sms',
            'alternative_phone', 'occupation', 'assigned_manager'
        ]
        read_only_fields = ['id', 'customer_number']
    
    def to_internal_value(self, data):
        # Convert empty strings to None for nullable fields
        # Convert empty strings to None only for fields that require it (Dates, Choices, ForeginKeys)
        nullable_fields = [
            'gender', 'date_of_birth', 
            'payment_terms', 'default_payment_method', 'preferred_contact_method'
        ]
        
        if hasattr(data, 'copy'):
            data = data.copy()
        
        for field in nullable_fields:
            if field in data and data[field] == '':
                data[field] = None
                
        return super().to_internal_value(data)

    def validate_email(self, value):
        """Validate that email is unique"""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value
    
    def validate(self, attrs):
        """Additional validation"""
        customer_type = attrs.get('customer_type', 'individual')
        company_name = attrs.get('company_name', '')
        
        # Business and fleet customers must have company name
        if customer_type in ['business', 'fleet'] and not company_name:
            raise serializers.ValidationError({
                'company_name': 'Company name is required for business and fleet customers.'
            })
        
        return attrs

    def create(self, validated_data):
        # Extract user data
        email = validated_data.pop('email')
        username = validated_data.pop('username', email.split('@')[0])
        password = validated_data.pop('password', None)
        first_name = validated_data.pop('first_name')
        last_name = validated_data.pop('last_name')
        phone = validated_data.pop('phone', '')
        gender = validated_data.pop('gender', None)
        date_of_birth = validated_data.pop('date_of_birth', None)
        occupation = validated_data.get('occupation', '')
        grant_portal_access = validated_data.pop('grant_portal_access', False)
        send_welcome_email = validated_data.pop('send_welcome_email', False)
        contact_person_name = validated_data.get('contact_person_name')
        customer_type = validated_data.get('customer_type', 'individual')

        # Normalize empty strings coming from clients
        if username == '':
            username = email.split('@')[0]
        if password == '':
            password = None
        if customer_type in ['business', 'fleet']:
            validated_data['contact_person_name'] = build_primary_contact_display_name(
                first_name,
                last_name,
                contact_person_name,
            )
        
        # If portal access is granted, password is required
        if grant_portal_access and not password:
            import secrets
            import string
            # Generate secure password
            alphabet = string.ascii_letters + string.digits + string.punctuation
            password = ''.join(secrets.choice(alphabet) for i in range(16))
        
        with transaction.atomic():
            # Create user account
            user = User.objects.create_user(
                email=email,
                username=username,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                role='customer',
                is_active=grant_portal_access,  # Only active if portal access is granted
                gender=gender,
                date_of_birth=date_of_birth
            )

            # Set password if provided
            if password:
                user.set_password(password)
                user.save()

            # Create customer profile
            customer = Customer.objects.create(user=user, **validated_data)
            sync_primary_contact(customer)
        
        # Send welcome email if requested
        if send_welcome_email and grant_portal_access and password:
            try:
                self._send_welcome_email(user, password, email)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send welcome email to {email}: {str(e)}")
        
        return customer
    
    def _send_welcome_email(self, user, password, email):
        """Send welcome email to new customer"""
        from apps.notifications_app.triggers import NotificationTriggers
        
        triggers = NotificationTriggers()
        # Use user_welcome template for customers (customers are users with role='customer')
        triggers.user_welcome(user, password, 'customer', None)


class CustomerUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating customer information"""
    # User fields
    first_name = serializers.CharField(source='user.first_name', required=False)
    last_name = serializers.CharField(source='user.last_name', required=False)
    email = serializers.EmailField(source='user.email', required=False)
    phone = serializers.CharField(source='user.phone', required=False, allow_blank=True)
    gender = serializers.CharField(source='user.gender', required=False, allow_blank=True, allow_null=True)
    date_of_birth = serializers.DateField(source='user.date_of_birth', required=False, allow_null=True)
    
    class Meta:
        model = Customer
        fields = [
            # User fields
            'first_name', 'last_name', 'email', 'phone', 'gender', 'date_of_birth',
            # Customer fields
            'company_name', 'business_type', 'tax_id', 'customer_type',
            'service_address', 'service_city', 'service_state', 'service_zip_code',
            'billing_address', 'billing_city', 'billing_state', 'billing_zip_code',
            'payment_terms', 'credit_limit', 'current_balance', 'status',
            'default_payment_method', 'contact_person_name', 'company_email', 
            'company_phone', 'alternative_phone', 'occupation', 'assigned_manager',
            'preferred_contact_method', 'loyalty_points', 'loyalty_tier',
            'emergency_contact_name', 'emergency_contact_phone', 
            'emergency_contact_relationship', 'insurance_provider',
            'insurance_policy_number', 'insurance_phone', 'notes', 'tags',
            'marketing_emails', 'marketing_sms'
        ]

    def to_internal_value(self, data):
        # Convert empty strings to None only for fields that require it (Dates, Choices, ForeginKeys)
        nullable_fields = [
            'gender', 'date_of_birth', 
            'payment_terms', 'default_payment_method', 'preferred_contact_method'
        ]
        
        if hasattr(data, 'copy'):
            data = data.copy()
        
        for field in nullable_fields:
            if field in data and data[field] == '':
                data[field] = None
                
        return super().to_internal_value(data)

    def validate_email(self, value):
        """Validate that email is unique, excluding current user"""
        user = self.instance.user
        if User.objects.filter(email=value).exclude(id=user.id).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def update(self, instance, validated_data):
        # Update user fields if present (they are in nested 'user' dict due to source)
        user_data = validated_data.pop('user', {})
        if user_data:
            user = instance.user
            for key, value in user_data.items():
                setattr(user, key, value)
            user.save()

        incoming_customer_type = validated_data.get('customer_type', instance.customer_type)
        if incoming_customer_type in ['business', 'fleet']:
            first_name = user_data.get('first_name', instance.user.first_name)
            last_name = user_data.get('last_name', instance.user.last_name)
            contact_person_name = validated_data.get('contact_person_name', instance.contact_person_name)
            validated_data['contact_person_name'] = build_primary_contact_display_name(
                first_name,
                last_name,
                contact_person_name,
            )

        # Update customer fields
        customer = super().update(instance, validated_data)
        sync_primary_contact(customer)
        return customer


class CustomerNoteSerializer(serializers.ModelSerializer):
    """Serializer for customer notes"""
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', 
        read_only=True
    )
    
    class Meta:
        model = CustomerNote
        fields = [
            'id', 'customer', 'note_type', 'subject', 'note', 'content',
            'is_important', 'created_by', 'created_by_name', 'created_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at']


class CustomerStatsSerializer(serializers.Serializer):
    """Serializer for customer statistics"""
    total_spent = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_visits = serializers.IntegerField()
    last_visit_date = serializers.DateField()
    average_invoice = serializers.DecimalField(max_digits=10, decimal_places=2)
    vehicles_serviced = serializers.IntegerField()

class CustomerContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerContact
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

class CustomerReminderSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = CustomerReminder
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by']

class CustomerDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)
    extension = serializers.CharField(read_only=True)
    size = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = CustomerDocument
        fields = ['id', 'customer', 'name', 'file', 'description', 
                  'uploaded_by', 'uploaded_by_name', 'is_public', 
                  'created_at', 'extension', 'size']
        read_only_fields = ['id', 'uploaded_by', 'created_at', 'extension', 'size']


class CustomerContractSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = CustomerContract
        fields = '__all__'
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']
