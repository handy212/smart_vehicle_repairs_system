"""
Admin configuration for subscriptions app
"""
from django.contrib import admin
from .models import Package, Subscription, SubscriptionUsage


@admin.register(Package)
class PackageAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'price', 'duration_months', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'code', 'description']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ['subscription_number', 'customer', 'package', 'status', 'start_date', 'end_date', 'payment_status']
    list_filter = ['status', 'payment_status', 'auto_renew', 'start_date', 'end_date']
    search_fields = ['subscription_number', 'customer__customer_number', 'package__name']
    readonly_fields = ['subscription_number', 'purchased_at', 'created_at', 'updated_at']
    date_hierarchy = 'start_date'


@admin.register(SubscriptionUsage)
class SubscriptionUsageAdmin(admin.ModelAdmin):
    list_display = ['subscription', 'usage_type', 'quantity_used', 'service_date', 'created_at']
    list_filter = ['usage_type', 'service_date', 'created_at']
    search_fields = ['subscription__subscription_number', 'description']
    readonly_fields = ['created_at']

