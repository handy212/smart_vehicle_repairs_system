"""
Admin URL Configuration
"""
from django.urls import path
from apps.accounts import admin_views

app_name = 'admin'

urlpatterns = [
    # Admin Dashboard
    path('', admin_views.admin_dashboard, name='dashboard'),
    
    # System Settings
    path('settings/', admin_views.system_settings, name='settings'),
    path('settings/<int:setting_id>/delete/', admin_views.delete_setting, name='delete_setting'),
    path('settings/bulk-update/', admin_views.settings_bulk_update, name='settings_bulk_update'),
    path('settings/upload-branding/', admin_views.upload_branding, name='upload_branding'),
    path('settings/test-email/', admin_views.test_email, name='test_email'),
    path('settings/test-sms/', admin_views.test_sms, name='test_sms'),
    
    # User Management
    path('users/', admin_views.user_management, name='user_management'),
    path('users/<int:user_id>/', admin_views.user_detail, name='user_detail'),
    
    # Role Management
    path('roles/', admin_views.role_management, name='role_management'),
    path('roles/<int:role_id>/edit/', admin_views.role_edit_api, name='role_edit_api'),
    
    # Audit Log
    path('audit-log/', admin_views.audit_log, name='audit_log'),
    
    # Backup & Restore
    path('backup/', admin_views.backup_restore, name='backup_restore'),
    path('backup/<int:backup_id>/download/', admin_views.download_backup, name='download_backup'),
    path('backup/<int:backup_id>/restore/', admin_views.restore_backup, name='restore_backup'),
    path('backup/<int:backup_id>/delete/', admin_views.delete_backup, name='delete_backup'),
    path('backup/<int:backup_id>/details/', admin_views.backup_details, name='backup_details'),
    
    # Email Templates
    path('email-templates/', admin_views.email_templates, name='email_templates'),
    
    # SMS Templates
    path('sms-templates/', admin_views.sms_templates, name='sms_templates'),
    
]
