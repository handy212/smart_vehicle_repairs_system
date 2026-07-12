"""
Admin configuration for accounts app
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _
from .models import User
from .terms_models import TermsAcceptance


@admin.register(TermsAcceptance)
class TermsAcceptanceAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'document_type', 'customer', 'acceptance_channel',
        'accepted_at', 'accepted_by_user', 'terms_key',
    ]
    list_filter = ['document_type', 'acceptance_channel', 'accepted_at']
    search_fields = ['customer__customer_number', 'terms_key', 'notes']
    readonly_fields = [
        'customer', 'document_type', 'terms_key', 'terms_text', 'accepted',
        'accepted_at', 'acceptance_channel', 'accepted_by_user',
        'work_order', 'estimate', 'ip_address', 'user_agent',
        'signature_data', 'notes',
    ]
    ordering = ['-accepted_at']


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Custom User admin"""
    
    list_display = ['email', 'username', 'first_name', 'last_name', 'role', 'is_active', 'is_staff', 'created_at']
    list_filter = ['role', 'is_active', 'is_staff', 'is_superuser', 'created_at']
    search_fields = ['email', 'username', 'first_name', 'last_name', 'phone', 'employee_id']
    ordering = ['-created_at']
    date_hierarchy = 'created_at'
    
    fieldsets = (
        (None, {'fields': ('email', 'username', 'password')}),
        (_('Personal info'), {
            'fields': ('first_name', 'last_name', 'phone', 'date_of_birth', 'profile_picture')
        }),
        (_('Address'), {
            'fields': ('address', 'city', 'region', 'area', 'country'),
            'classes': ('collapse',)
        }),
        (_('Role & Permissions'), {
            'fields': ('role', 'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')
        }),
        (_('Employment Info'), {
            'fields': ('employee_id', 'hire_date', 'hourly_rate'),
            'classes': ('collapse',)
        }),
        (_('Preferences'), {
            'fields': ('email_notifications', 'sms_notifications'),
            'classes': ('collapse',)
        }),
        (_('Important dates'), {
            'fields': ('last_login', 'date_joined', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'username', 'first_name', 'last_name', 'password1', 'password2', 'role'),
        }),
    )
    
    readonly_fields = ['created_at', 'updated_at', 'last_login', 'date_joined']
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(is_superuser=False)
