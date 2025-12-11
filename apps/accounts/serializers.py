"""
Serializers for accounts app
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model"""
    
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    customer_profile = serializers.SerializerMethodField()
    branch = serializers.SerializerMethodField()
    managed_branches = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    managed_branches_names = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
            'phone', 'role', 'profile_picture', 'date_of_birth',
            'address', 'city', 'state', 'zip_code', 'country',
            'email_notifications', 'sms_notifications',
            'is_active', 'created_at', 'updated_at', 'customer_profile',
            'branch', 'managed_branches', 'branch_name', 'managed_branches_names',
            'employee_id', 'hire_date', 'hourly_rate', 'permissions'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'password': {'write_only': True}
        }
    
    def get_customer_profile(self, obj):
        """Include customer profile if user is a customer"""
        if hasattr(obj, 'customer_profile'):
            return {
                'id': obj.customer_profile.id,
                'customer_type': obj.customer_profile.customer_type,
                'customer_number': getattr(obj.customer_profile, 'customer_number', None),
            }
        return None
    
    def get_branch(self, obj):
        """Return branch ID if user has a branch"""
        return obj.branch.id if obj.branch else None
    
    def get_managed_branches(self, obj):
        """Return list of managed branch IDs"""
        return list(obj.managed_branches.values_list('id', flat=True))
    
    def get_branch_name(self, obj):
        """Return branch name for display"""
        return obj.branch.name if obj.branch else None
    
    def get_permissions(self, obj):
        """Get user's permissions based on their role"""
        from apps.accounts.permissions import get_user_permissions
        return get_user_permissions(obj)
    
    def get_managed_branches_names(self, obj):
        """Return list of managed branch names"""
        return list(obj.managed_branches.values_list('name', flat=True))


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating users"""
    
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True, label='Confirm Password')
    
    class Meta:
        model = User
        fields = [
            'email', 'username', 'password', 'password2',
            'first_name', 'last_name', 'phone', 'role',
            'branch', 'managed_branches', 'employee_id', 'hire_date', 'hourly_rate',
            'is_active'
        ]
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Set queryset for branch fields dynamically
        from apps.branches.models import Branch
        branch_queryset = Branch.objects.filter(is_active=True)
        
        # Add branch field with queryset
        self.fields['branch'] = serializers.PrimaryKeyRelatedField(
            queryset=branch_queryset,
            required=False,
            allow_null=True,
            help_text="Single branch assignment for non-manager staff"
        )
        
        # Add managed_branches field with queryset
        self.fields['managed_branches'] = serializers.PrimaryKeyRelatedField(
            many=True,
            queryset=branch_queryset,
            required=False,
            help_text="Multiple branch assignment for managers"
        )
        
        # Add send_welcome_email field (not a model field, just a flag)
        self.fields['send_welcome_email'] = serializers.BooleanField(
            required=False,
            default=True,
            help_text="Send welcome email with login credentials"
        )
    
    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        
        role = attrs.get('role')
        branch = attrs.get('branch')
        managed_branches = attrs.get('managed_branches', [])
        
        # Validate branch assignment based on role
        if role == 'manager':
            # Managers should use managed_branches, not branch
            if branch:
                raise serializers.ValidationError({
                    "branch": "Managers should be assigned via managed_branches, not branch field."
                })
        elif role in ['receptionist', 'technician', 'parts_manager', 'service_coordinator', 'accountant']:
            # Staff should use branch, not managed_branches
            if managed_branches:
                raise serializers.ValidationError({
                    "managed_branches": f"{role} role should be assigned to a single branch, not multiple branches."
                })
        
        return attrs
    
    def create(self, validated_data):
        password2 = validated_data.pop('password2')
        managed_branches = validated_data.pop('managed_branches', [])
        branch = validated_data.pop('branch', None)
        password = validated_data.pop('password')  # Extract password before passing to create_user
        send_welcome_email = validated_data.pop('send_welcome_email', False)  # Default to False (send email) if not specified
        
        # Set is_staff for non-customer roles
        role = validated_data.get('role')
        if role != 'customer':
            validated_data['is_staff'] = True
        
        # Create user with password
        user = User.objects.create_user(password=password, **validated_data)
        
        # Assign branch based on role
        if role == 'manager' and managed_branches:
            user.managed_branches.set(managed_branches)
        elif branch and role in ['receptionist', 'technician', 'parts_manager', 'service_coordinator', 'accountant']:
            user.branch = branch
            user.save()
        
        # Send welcome email to the new user (only if requested)
        if send_welcome_email:
            try:
                self._send_welcome_email(user, password, role)
            except Exception as e:
                # Log error but don't fail user creation if email fails
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send welcome email to {user.email}: {str(e)}")
        
        return user
    
    def _send_welcome_email(self, user, password, role):
        """Send welcome email with login credentials to new user"""
        from apps.notifications_app.models import Notification, NotificationTemplate
        from apps.notifications_app.services import NotificationService
        
        # Try to get user welcome template, fallback to default message
        template = NotificationTemplate.objects.filter(
            template_type='user_welcome',
            channel='email',
            is_active=True
        ).first()
        
        # Build email content
        user_name = user.get_full_name() or user.first_name or "New User"
        request = self.context.get('request') if hasattr(self, 'context') and self.context else None
        if request:
            login_url = request.build_absolute_uri('/login')
        else:
            login_url = "/login"
        branch_info = ""
        if user.branch:
            branch_info = f"\nAssigned Branch: {user.branch.name}"
        elif user.managed_branches.exists():
            branches = ", ".join([b.name for b in user.managed_branches.all()])
            branch_info = f"\nManaged Branches: {branches}"
        
        from apps.accounts.settings_utils import get_setting
        company_name = get_setting('company_name', 'Smart Vehicle Repairs System')
        subject = f"Welcome to {company_name} - Your Account Details"
        body = f"""Dear {user_name},

Welcome to {company_name}! Your account has been created successfully.

Here are your login credentials:

Email/Username: {user.email}
Password: {password}

Role: {role.replace('_', ' ').title()}{branch_info}

Please log in using the following link:
{login_url}

For security reasons, we recommend changing your password after your first login.

If you have any questions or need assistance, please don't hesitate to contact us.

Best regards,
{company_name} Team"""

        html_body = f"""<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }}
        .content {{ background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }}
        .credentials {{ background-color: white; padding: 15px; border-left: 4px solid #2563eb; margin: 15px 0; }}
        .button {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }}
        .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to {company_name}</h1>
        </div>
        <div class="content">
            <p>Dear {user_name},</p>
            <p>Welcome to {company_name}! Your account has been created successfully.</p>
            
            <h3>Your Login Credentials:</h3>
            <div class="credentials">
                <p><strong>Email/Username:</strong> {user.email}</p>
                <p><strong>Password:</strong> {password}</p>
                <p><strong>Role:</strong> {role.replace('_', ' ').title()}{branch_info}</p>
            </div>
            
            <p>Please log in using the button below:</p>
            <a href="{login_url}" class="button">Log In Now</a>
            
            <p style="margin-top: 20px;"><strong>Important:</strong> For security reasons, we recommend changing your password after your first login.</p>
            
            <p>If you have any questions or need assistance, please don't hesitate to contact us.</p>
            
            <p>Best regards,<br>{company_name} Team</p>
        </div>
        <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
        </div>
    </div>
</body>
</html>"""
        
        # Create notification
        notification = Notification.objects.create(
            recipient=user,
            notification_type='system',
            channel='email',
            priority='normal',
            template=template,
            title=subject,
            message=body,
            data={
                'user_name': user_name,
                'email': user.email,
                'username': user.username,
                'password': password,
                'role': role,
                'login_url': login_url,
                'branch_info': branch_info,
            }
        )
        
        # Send the notification
        service = NotificationService()
        if not service.send_notification(notification):
            # If template-based sending fails, send directly via email
            from django.core.mail import EmailMultiAlternatives
            from django.conf import settings
            try:
                email = EmailMultiAlternatives(
                    subject=subject,
                    body=body,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    to=[user.email],
                )
                email.attach_alternative(html_body, "text/html")
                email.send()
                notification.mark_as_sent()
                notification.mark_as_delivered()
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send welcome email directly: {str(e)}")


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating user profile"""
    
    role = serializers.ChoiceField(choices=User.ROLE_CHOICES, required=False)
    is_active = serializers.BooleanField(required=False)
    
    class Meta:
        model = User
        fields = [
            'first_name', 'last_name', 'phone', 'profile_picture',
            'date_of_birth', 'address', 'city', 'state', 'zip_code', 'country',
            'email_notifications', 'sms_notifications', 'role', 'is_active',
            'branch', 'managed_branches', 'employee_id', 'hire_date', 'hourly_rate'
        ]
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Set queryset for branch fields dynamically
        from apps.branches.models import Branch
        branch_queryset = Branch.objects.filter(is_active=True)
        
        # Add branch field with queryset
        self.fields['branch'] = serializers.PrimaryKeyRelatedField(
            queryset=branch_queryset,
            required=False,
            allow_null=True,
            help_text="Single branch assignment for non-manager staff"
        )
        
        # Add managed_branches field with queryset
        self.fields['managed_branches'] = serializers.PrimaryKeyRelatedField(
            many=True,
            queryset=branch_queryset,
            required=False,
            help_text="Multiple branch assignment for managers"
        )
    
    def validate(self, attrs):
        role = attrs.get('role', self.instance.role if self.instance else None)
        branch = attrs.get('branch')
        managed_branches = attrs.get('managed_branches')
        
        # If role is being changed, validate branch assignment
        if role:
            if role == 'manager':
                # Managers should use managed_branches, not branch
                if branch is not None:
                    raise serializers.ValidationError({
                        "branch": "Managers should be assigned via managed_branches, not branch field."
                    })
                # Clear branch if switching to manager
                if self.instance and self.instance.branch:
                    attrs['branch'] = None
            elif role in ['receptionist', 'technician', 'parts_manager', 'service_coordinator', 'accountant']:
                # Staff should use branch, not managed_branches
                if managed_branches is not None and len(managed_branches) > 0:
                    raise serializers.ValidationError({
                        "managed_branches": f"{role} role should be assigned to a single branch, not multiple branches."
                    })
                # Clear managed_branches if switching to staff role
                if self.instance:
                    self.instance.managed_branches.clear()
        
        return attrs
    
    def update(self, instance, validated_data):
        managed_branches = validated_data.pop('managed_branches', None)
        role = validated_data.get('role', instance.role)
        
        # Update basic fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        instance.save()
        
        # Update branch assignments
        if managed_branches is not None:
            if role == 'manager':
                instance.managed_branches.set(managed_branches)
            else:
                instance.managed_branches.clear()
        
        # Update is_staff based on role
        if role != 'customer':
            instance.is_staff = True
        else:
            instance.is_staff = False
        instance.save()
        
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for password change"""
    
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, validators=[validate_password])
    new_password2 = serializers.CharField(required=True, write_only=True, label='Confirm New Password')
    
    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password2']:
            raise serializers.ValidationError({"new_password": "Password fields didn't match."})
        return attrs
    
    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value


class StaffUserSerializer(serializers.ModelSerializer):
    """Serializer for staff members with employment info"""
    
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    
    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
            'phone', 'role', 'profile_picture',
            'employee_id', 'hire_date', 'hourly_rate',
            'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class PublicUserSerializer(serializers.ModelSerializer):
    """Minimal serializer for public user info"""
    
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'first_name', 'last_name', 'full_name', 'role', 'profile_picture']
