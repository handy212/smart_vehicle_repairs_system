"""
Serializers for customers app
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Customer, CustomerNote

User = get_user_model()


class CustomerUserSerializer(serializers.ModelSerializer):
    """Nested serializer for user information"""
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'first_name', 'last_name', 
                  'full_name', 'phone', 'is_active']
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
    
    class Meta:
        model = Customer
        fields = [
            'id', 'customer_number', 'full_name', 'email', 'phone',
            'company_name', 'customer_type', 'status', 'customer_since',
            'vehicle_count', 'current_balance', 'available_credit',
            'loyalty_points', 'loyalty_tier', 'created_at'
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
    username = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False)
    first_name = serializers.CharField(write_only=True)
    last_name = serializers.CharField(write_only=True)
    phone = serializers.CharField(write_only=True, required=False)
    grant_portal_access = serializers.BooleanField(write_only=True, required=False, default=False)
    send_welcome_email = serializers.BooleanField(write_only=True, required=False, default=False)
    
    class Meta:
        model = Customer
        fields = [
            # User fields
            'email', 'username', 'password', 'first_name', 'last_name', 'phone',
            'grant_portal_access', 'send_welcome_email',
            # Customer fields
            'company_name', 'business_type', 'tax_id', 'customer_type',
            'service_address', 'service_city', 'service_state', 'service_zip_code',
            'billing_address', 'billing_city', 'billing_state', 'billing_zip_code',
            'payment_terms', 'credit_limit', 'preferred_contact_method',
            'emergency_contact_name', 'emergency_contact_phone', 
            'emergency_contact_relationship', 'insurance_provider',
            'insurance_policy_number', 'insurance_phone', 'notes', 'tags',
            'referred_by', 'marketing_emails', 'marketing_sms'
        ]
    
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
        grant_portal_access = validated_data.pop('grant_portal_access', False)
        send_welcome_email = validated_data.pop('send_welcome_email', False)
        
        # If portal access is granted, password is required
        if grant_portal_access and not password:
            import secrets
            import string
            # Generate secure password
            alphabet = string.ascii_letters + string.digits + string.punctuation
            password = ''.join(secrets.choice(alphabet) for i in range(16))
        
        # Create user account
        user = User.objects.create_user(
            email=email,
            username=username,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            role='customer',
            is_active=grant_portal_access  # Only active if portal access is granted
        )
        
        # Set password if provided
        if password:
            user.set_password(password)
            user.save()
        
        # Create customer profile
        customer = Customer.objects.create(user=user, **validated_data)
        
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
    
    class Meta:
        model = Customer
        fields = [
            'company_name', 'business_type', 'tax_id', 'customer_type',
            'service_address', 'service_city', 'service_state', 'service_zip_code',
            'billing_address', 'billing_city', 'billing_state', 'billing_zip_code',
            'payment_terms', 'credit_limit', 'current_balance', 'status',
            'preferred_contact_method', 'loyalty_points', 'loyalty_tier',
            'emergency_contact_name', 'emergency_contact_phone', 
            'emergency_contact_relationship', 'insurance_provider',
            'insurance_policy_number', 'insurance_phone', 'notes', 'tags',
            'marketing_emails', 'marketing_sms'
        ]


class CustomerNoteSerializer(serializers.ModelSerializer):
    """Serializer for customer notes"""
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', 
        read_only=True
    )
    
    class Meta:
        model = CustomerNote
        fields = [
            'id', 'customer', 'note_type', 'subject', 'content',
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
