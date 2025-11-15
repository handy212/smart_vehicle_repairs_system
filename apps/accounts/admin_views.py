"""
Admin and Settings Views for Smart Vehicle Repairs System
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib import messages
from django.http import JsonResponse, HttpResponse, FileResponse
from django.db.models import Q, Count
from django.utils import timezone
from django.core.paginator import Paginator
from django.core.management import call_command
from django.contrib.auth import get_user_model
from django.conf import settings
from rolepermissions.decorators import has_permission_decorator
from rolepermissions.checkers import has_permission
from datetime import timedelta
import json
import csv
import os
import shutil
import zipfile
from io import StringIO

from .admin_models import SystemSettings, AuditLog, SystemBackup, EmailTemplate, SMSTemplate
from .models import User
from .permission_models import Permission, Role, UserPermissionOverride

User = get_user_model()


def is_admin(user):
    """Check if user is admin"""
    return user.is_authenticated and (user.is_superuser or user.role == 'admin')


def log_audit(user, action, model_name='', object_id='', object_repr='', changes=None, request=None):
    """Helper function to log audit entries"""
    ip_address = None
    user_agent = ''
    
    if request:
        ip_address = request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT', '')
    
    AuditLog.objects.create(
        user=user,
        action=action,
        model_name=model_name,
        object_id=str(object_id) if object_id else '',
        object_repr=object_repr,
        changes=changes or {},
        ip_address=ip_address,
        user_agent=user_agent
    )


@login_required
@user_passes_test(is_admin)
def admin_dashboard(request):
    """Admin dashboard overview"""
    context = {
        'total_users': User.objects.count(),
        'active_users': User.objects.filter(is_active=True).count(),
        'total_settings': SystemSettings.objects.count(),
        'recent_logs': AuditLog.objects.select_related('user')[:10],
        'recent_backups': SystemBackup.objects.all()[:5],
        'user_by_role': User.objects.values('role').annotate(count=Count('id')),
    }
    
    log_audit(request.user, 'view', 'AdminDashboard', request=request)
    
    return render(request, 'admin/dashboard.html', context)


@login_required
@user_passes_test(is_admin)
def system_settings(request):
    """System settings management"""
    category = request.GET.get('category', 'company')
    
    # Initialize default settings for the category if none exist
    from .settings_init import initialize_category_settings
    settings_count = SystemSettings.objects.filter(category=category).count()
    if settings_count == 0:
        initialized = initialize_category_settings(category)
        if initialized > 0:
            messages.info(request, f'Initialized {initialized} default settings for {dict(SystemSettings.CATEGORY_CHOICES).get(category, category)}.')
    
    if request.method == 'POST':
        setting_id = request.POST.get('setting_id')
        
        if setting_id:
            # Update existing setting
            setting = get_object_or_404(SystemSettings, id=setting_id)
            old_value = setting.value
            setting.value = request.POST.get('value', '')
            setting.description = request.POST.get('description', '')
            setting.is_active = request.POST.get('is_active') == 'on'
            setting.updated_by = request.user
            setting.save()
            
            log_audit(
                request.user, 
                'settings_change', 
                'SystemSettings',
                setting.id,
                setting.key,
                {'old_value': old_value, 'new_value': setting.value},
                request
            )
            
            messages.success(request, f'Setting "{setting.key}" updated successfully.')
        else:
            # Create new setting
            key = request.POST.get('key')
            if SystemSettings.objects.filter(key=key).exists():
                messages.error(request, f'Setting with key "{key}" already exists.')
            else:
                setting = SystemSettings.objects.create(
                    category=request.POST.get('category', 'general'),
                    key=key,
                    value=request.POST.get('value', ''),
                    description=request.POST.get('description', ''),
                    is_secret=request.POST.get('is_secret') == 'on',
                    is_active=request.POST.get('is_active') == 'on',
                    updated_by=request.user
                )
                
                log_audit(
                    request.user,
                    'create',
                    'SystemSettings',
                    setting.id,
                    setting.key,
                    request=request
                )
                
                messages.success(request, f'Setting "{key}" created successfully.')
        
        return redirect('admin_panel:settings')
    
    settings = SystemSettings.objects.filter(category=category).order_by('key')
    
    # Map categories with icons
    category_icons = {
        'company': 'fas fa-building',
        'branding': 'fas fa-palette',
        'email': 'fas fa-envelope',
        'sms': 'fas fa-sms',
        'payment': 'fas fa-credit-card',
        'notification': 'fas fa-bell',
        'security': 'fas fa-shield-alt',
        'business': 'fas fa-briefcase',
        'integration': 'fas fa-plug',
        'maintenance': 'fas fa-wrench',
    }
    
    # Format categories for template
    categories = [
        {
            'value': cat[0],
            'label': cat[1],
            'icon': category_icons.get(cat[0], 'fas fa-cog')
        }
        for cat in SystemSettings.CATEGORY_CHOICES
    ]
    
    current_category_label = dict(SystemSettings.CATEGORY_CHOICES).get(category, 'General')
    current_category_icon = category_icons.get(category, 'fas fa-cog')
    
    # Get currency symbol for display
    currency_symbol = SystemSettings.get_setting('currency_symbol', '$')
    
    context = {
        'settings': settings,
        'categories': categories,
        'current_category': category,
        'current_category_label': current_category_label,
        'current_category_icon': current_category_icon,
        'currency_symbol': currency_symbol,
    }
    
    return render(request, 'admin/settings_new.html', context)


@login_required
@user_passes_test(is_admin)
def delete_setting(request, setting_id):
    """Delete a system setting"""
    if request.method == 'POST':
        setting = get_object_or_404(SystemSettings, id=setting_id)
        key = setting.key
        setting.delete()
        
        log_audit(
            request.user,
            'delete',
            'SystemSettings',
            setting_id,
            key,
            request=request
        )
        
        messages.success(request, f'Setting "{key}" deleted successfully.')
    
    return redirect('admin_panel:settings')


@login_required
@user_passes_test(is_admin)
def user_management(request):
    """User management interface"""
    search_query = request.GET.get('search', '')
    role_filter = request.GET.get('role', '')
    status_filter = request.GET.get('status', '')
    
    users = User.objects.all().order_by('-date_joined')
    
    if search_query:
        users = users.filter(
            Q(email__icontains=search_query) |
            Q(first_name__icontains=search_query) |
            Q(last_name__icontains=search_query) |
            Q(username__icontains=search_query)
        )
    
    if role_filter:
        users = users.filter(role=role_filter)
    
    if status_filter == 'active':
        users = users.filter(is_active=True)
    elif status_filter == 'inactive':
        users = users.filter(is_active=False)
    
    paginator = Paginator(users, 25)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    context = {
        'page_obj': page_obj,
        'search_query': search_query,
        'role_filter': role_filter,
        'status_filter': status_filter,
        'roles': User.ROLE_CHOICES,
    }
    
    return render(request, 'admin/user_management.html', context)


@login_required
@user_passes_test(is_admin)
def user_detail(request, user_id):
    """User detail and edit"""
    user = get_object_or_404(User, id=user_id)
    
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'delete':
            # Prevent self-deletion
            if user.id == request.user.id:
                messages.error(request, 'You cannot delete your own account.')
                return redirect('admin_panel:user_detail', user_id=user.id)
            
            user_name = user.get_full_name()
            user_email = user.email
            
            log_audit(
                request.user,
                'delete',
                'User',
                user.id,
                f'{user_name} ({user_email})',
                request=request
            )
            
            user.delete()
            messages.success(request, f'User {user_name} deleted successfully.')
            return redirect('admin_panel:user_management')
        
        elif action == 'update':
            old_data = {
                'role': user.role,
                'is_active': user.is_active,
            }
            
            user.first_name = request.POST.get('first_name', '')
            user.last_name = request.POST.get('last_name', '')
            user.email = request.POST.get('email', '')
            user.phone = request.POST.get('phone', '')
            user.role = request.POST.get('role', 'customer')
            user.is_active = request.POST.get('is_active') == 'on'
            user.save()
            
            changes = {}
            if old_data['role'] != user.role:
                changes['role'] = {'old': old_data['role'], 'new': user.role}
            if old_data['is_active'] != user.is_active:
                changes['is_active'] = {'old': old_data['is_active'], 'new': user.is_active}
            
            log_audit(
                request.user,
                'update',
                'User',
                user.id,
                user.get_full_name(),
                changes,
                request
            )
            
            messages.success(request, f'User {user.get_full_name()} updated successfully.')
        
        elif action == 'reset_password':
            # In production, this would send a password reset email
            messages.info(request, f'Password reset email sent to {user.email}.')
            log_audit(
                request.user,
                'update',
                'User',
                user.id,
                f'Password reset for {user.get_full_name()}',
                request=request
            )
        
        return redirect('admin_panel:user_detail', user_id=user.id)
    
    recent_logs = AuditLog.objects.filter(user=user).order_by('-timestamp')[:20]
    
    context = {
        'user_obj': user,
        'recent_logs': recent_logs,
        'roles': User.ROLE_CHOICES,
    }
    
    return render(request, 'admin/user_detail.html', context)


@login_required
@user_passes_test(is_admin)
def role_management(request):
    """Role and permissions management"""
    # Auto-initialize roles and permissions if they don't exist
    roles_count = Role.objects.count()
    permissions_count = Permission.objects.count()
    
    if roles_count == 0 or permissions_count == 0:
        # Run the initialization command
        try:
            # Capture output to avoid printing to console
            out = StringIO()
            call_command('init_permissions', stdout=out, stderr=out)
            if roles_count == 0 and permissions_count == 0:
                messages.success(request, 'Initialized default roles and permissions.')
                # Redirect to refresh the page with new data
                return redirect('admin_panel:role_management')
        except Exception as e:
            # If command fails, show warning
            messages.warning(request, f'Could not auto-initialize permissions: {str(e)}. Please run: python manage.py init_permissions')
    
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'create_role':
            code = request.POST.get('code', '').strip().lower().replace(' ', '_')
            name = request.POST.get('name', '').strip()
            description = request.POST.get('description', '').strip()
            priority = int(request.POST.get('priority', 50))
            permission_ids = request.POST.getlist('permissions')
            
            if code and name:
                role, created = Role.objects.get_or_create(
                    code=code,
                    defaults={
                        'name': name,
                        'description': description,
                        'priority': priority,
                        'is_system': False,
                    }
                )
                
                if created:
                    role.permissions.set(permission_ids)
                    log_audit(request.user, 'create', 'Role', role.id, str(role), request=request)
                    messages.success(request, f'Role "{name}" created successfully.')
                else:
                    messages.error(request, f'Role with code "{code}" already exists.')
            else:
                messages.error(request, 'Role code and name are required.')
        
        elif action == 'update_role':
            role_id = request.POST.get('role_id')
            role = get_object_or_404(Role, id=role_id)
            
            old_data = {
                'name': role.name,
                'description': role.description,
                'priority': role.priority,
                'permission_count': role.permissions.count(),
            }
            
            role.name = request.POST.get('name', role.name)
            role.description = request.POST.get('description', '')
            role.priority = int(request.POST.get('priority', 50))
            role.is_active = request.POST.get('is_active') == 'on'
            role.save()
            
            permission_ids = request.POST.getlist('permissions')
            role.permissions.set(permission_ids)
            
            changes = {}
            if old_data['name'] != role.name:
                changes['name'] = {'old': old_data['name'], 'new': role.name}
            if old_data['permission_count'] != role.permissions.count():
                changes['permissions'] = {
                    'old': old_data['permission_count'],
                    'new': role.permissions.count()
                }
            
            log_audit(request.user, 'update', 'Role', role.id, str(role), changes, request)
            messages.success(request, f'Role "{role.name}" updated successfully.')
        
        elif action == 'delete_role':
            role_id = request.POST.get('role_id')
            role = get_object_or_404(Role, id=role_id)
            
            if role.is_system:
                messages.error(request, 'Cannot delete system roles.')
            elif role.user_count() > 0:
                messages.error(request, f'Cannot delete role with {role.user_count()} assigned users.')
            else:
                role_name = role.name
                log_audit(request.user, 'delete', 'Role', role.id, role_name, request=request)
                role.delete()
                messages.success(request, f'Role "{role_name}" deleted successfully.')
        
        elif action == 'create_permission':
            code = request.POST.get('code', '').strip().lower().replace(' ', '_')
            name = request.POST.get('name', '').strip()
            description = request.POST.get('description', '').strip()
            category = request.POST.get('category', 'system')
            
            if code and name:
                permission, created = Permission.objects.get_or_create(
                    code=code,
                    defaults={
                        'name': name,
                        'description': description,
                        'category': category,
                        'is_system': False,
                    }
                )
                
                if created:
                    log_audit(request.user, 'create', 'Permission', permission.id, str(permission), request=request)
                    messages.success(request, f'Permission "{name}" created successfully.')
                else:
                    messages.error(request, f'Permission with code "{code}" already exists.')
            else:
                messages.error(request, 'Permission code and name are required.')
        
        elif action == 'delete_permission':
            permission_id = request.POST.get('permission_id')
            permission = get_object_or_404(Permission, id=permission_id)
            
            if permission.is_system:
                messages.error(request, 'Cannot delete system permissions.')
            else:
                permission_name = permission.name
                log_audit(request.user, 'delete', 'Permission', permission.id, permission_name, request=request)
                permission.delete()
                messages.success(request, f'Permission "{permission_name}" deleted successfully.')
        
        return redirect('admin_panel:role_management')
    
    # Get all roles and permissions
    roles = Role.objects.prefetch_related('permissions').all()
    permissions = Permission.objects.all().order_by('category', 'name')
    
    # Group permissions by category
    permissions_by_category = {}
    for permission in permissions:
        category = permission.get_category_display()
        if category not in permissions_by_category:
            permissions_by_category[category] = []
        permissions_by_category[category].append(permission)
    
    # User counts by role
    user_counts = {}
    for role in roles:
        user_counts[role.code] = User.objects.filter(role=role.code).count()
    
    context = {
        'roles': roles,
        'permissions': permissions,
        'permissions_by_category': permissions_by_category,
        'permission_categories': Permission.CATEGORY_CHOICES,
        'user_counts': user_counts,
        'total_permissions': permissions.count(),
        'total_roles': roles.count(),
    }
    
    return render(request, 'admin/role_management.html', context)


@login_required
@user_passes_test(is_admin)
def role_edit_api(request, role_id):
    """API endpoint to get role data for editing"""
    role = get_object_or_404(Role, id=role_id)
    
    # Group all permissions by category
    all_permissions_by_category = {}
    for permission in Permission.objects.all().order_by('category', 'name'):
        category = permission.get_category_display()
        if category not in all_permissions_by_category:
            all_permissions_by_category[category] = []
        all_permissions_by_category[category].append({
            'id': permission.id,
            'name': permission.name,
            'code': permission.code,
            'description': permission.description,
        })
    
    data = {
        'id': role.id,
        'code': role.code,
        'name': role.name,
        'description': role.description,
        'priority': role.priority,
        'is_active': role.is_active,
        'is_system': role.is_system,
        'permission_ids': list(role.permissions.values_list('id', flat=True)),
        'all_permissions_by_category': all_permissions_by_category,
    }
    
    return JsonResponse(data)


@login_required
@user_passes_test(is_admin)
def audit_log(request):
    """Audit log viewer"""
    action_filter = request.GET.get('action', '')
    user_filter = request.GET.get('user', '')
    date_from = request.GET.get('date_from', '')
    date_to = request.GET.get('date_to', '')
    search_query = request.GET.get('search', '')
    
    logs = AuditLog.objects.select_related('user').all()
    
    if action_filter:
        logs = logs.filter(action=action_filter)
    
    if user_filter:
        logs = logs.filter(user_id=user_filter)
    
    if date_from:
        logs = logs.filter(timestamp__gte=date_from)
    
    if date_to:
        logs = logs.filter(timestamp__lte=date_to)
    
    if search_query:
        logs = logs.filter(
            Q(object_repr__icontains=search_query) |
            Q(model_name__icontains=search_query)
        )
    
    # Export functionality
    if request.GET.get('export') == 'csv':
        return export_audit_log_csv(logs)
    
    paginator = Paginator(logs, 50)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    context = {
        'page_obj': page_obj,
        'action_filter': action_filter,
        'user_filter': user_filter,
        'date_from': date_from,
        'date_to': date_to,
        'search_query': search_query,
        'actions': AuditLog.ACTION_CHOICES,
        'users': User.objects.filter(is_active=True).order_by('first_name', 'last_name'),
    }
    
    return render(request, 'admin/audit_log.html', context)


def export_audit_log_csv(logs):
    """Export audit logs to CSV"""
    output = StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow(['Timestamp', 'User', 'Action', 'Model', 'Object', 'IP Address'])
    
    # Write data
    for log in logs:
        writer.writerow([
            log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            log.user.get_full_name() if log.user else 'System',
            log.get_action_display(),
            log.model_name,
            log.object_repr,
            log.ip_address or 'N/A'
        ])
    
    # Create response
    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="audit_log_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'
    
    return response


@login_required
@user_passes_test(is_admin)
def backup_restore(request):
    """Backup and restore interface"""
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'create_backup':
            backup_type = request.POST.get('backup_type', 'full')
            notes = request.POST.get('notes', '')
            
            backup = SystemBackup.objects.create(
                backup_type=backup_type,
                created_by=request.user,
                notes=notes,
                status='in_progress'
            )
            
            try:
                # Create backup directory if it doesn't exist
                backup_dir = os.path.join(settings.MEDIA_ROOT, 'backups')
                os.makedirs(backup_dir, exist_ok=True)
                
                timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
                
                if backup_type == 'database':
                    # Database only backup
                    file_path, file_size = create_database_backup(backup_dir, timestamp)
                elif backup_type == 'media':
                    # Media files only backup
                    file_path, file_size = create_media_backup(backup_dir, timestamp)
                else:  # full
                    # Full backup (database + media)
                    file_path, file_size = create_full_backup(backup_dir, timestamp)
                
                backup.status = 'completed'
                backup.completed_at = timezone.now()
                backup.file_path = file_path
                backup.file_size = file_size
                backup.save()
                
                log_audit(
                    request.user,
                    'create',
                    'SystemBackup',
                    backup.id,
                    str(backup),
                    request=request
                )
                
                messages.success(request, f'Backup created successfully. Size: {backup.get_file_size_display()}')
                
            except Exception as e:
                backup.status = 'failed'
                backup.error_message = str(e)
                backup.save()
                messages.error(request, f'Backup failed: {str(e)}')
        
        return redirect('admin_panel:backup_restore')
    
    backups = SystemBackup.objects.all().order_by('-started_at')
    
    paginator = Paginator(backups, 20)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    context = {
        'page_obj': page_obj,
        'backup_types': SystemBackup.BACKUP_TYPE_CHOICES,
    }
    
    return render(request, 'admin/backup.html', context)


def create_database_backup(backup_dir, timestamp):
    """Create database backup"""
    db_path = settings.DATABASES['default']['NAME']
    backup_filename = f'database_backup_{timestamp}.sqlite3'
    backup_path = os.path.join(backup_dir, backup_filename)
    
    # Copy database file
    shutil.copy2(db_path, backup_path)
    
    # Compress it
    zip_filename = f'database_backup_{timestamp}.zip'
    zip_path = os.path.join(backup_dir, zip_filename)
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.write(backup_path, backup_filename)
    
    # Remove uncompressed file
    os.remove(backup_path)
    
    file_size = os.path.getsize(zip_path)
    return zip_path, file_size


def create_media_backup(backup_dir, timestamp):
    """Create media files backup"""
    zip_filename = f'media_backup_{timestamp}.zip'
    zip_path = os.path.join(backup_dir, zip_filename)
    
    media_root = settings.MEDIA_ROOT
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(media_root):
            # Skip the backups directory itself
            if 'backups' in root:
                continue
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, media_root)
                zipf.write(file_path, arcname)
    
    file_size = os.path.getsize(zip_path)
    return zip_path, file_size


def create_full_backup(backup_dir, timestamp):
    """Create full backup (database + media)"""
    zip_filename = f'full_backup_{timestamp}.zip'
    zip_path = os.path.join(backup_dir, zip_filename)
    
    db_path = settings.DATABASES['default']['NAME']
    media_root = settings.MEDIA_ROOT
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Add database
        zipf.write(db_path, 'database/db.sqlite3')
        
        # Add media files
        for root, dirs, files in os.walk(media_root):
            # Skip the backups directory itself
            if 'backups' in root:
                continue
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.join('media', os.path.relpath(file_path, media_root))
                zipf.write(file_path, arcname)
    
    file_size = os.path.getsize(zip_path)
    return zip_path, file_size


@login_required
@user_passes_test(is_admin)
def download_backup(request, backup_id):
    """Download backup file"""
    backup = get_object_or_404(SystemBackup, id=backup_id)
    
    if not os.path.exists(backup.file_path):
        messages.error(request, 'Backup file not found on disk.')
        return redirect('admin_panel:backup_restore')
    
    # Log the download
    log_audit(
        request.user,
        'export',
        'SystemBackup',
        backup.id,
        f'Downloaded backup: {backup}',
        request=request
    )
    
    # Serve file for download
    response = FileResponse(
        open(backup.file_path, 'rb'),
        as_attachment=True,
        filename=os.path.basename(backup.file_path)
    )
    
    return response


@login_required
@user_passes_test(is_admin)
def delete_backup(request, backup_id):
    """Delete backup file and record"""
    if request.method != 'POST':
        return redirect('admin_panel:backup_restore')
    
    backup = get_object_or_404(SystemBackup, id=backup_id)
    backup_repr = str(backup)
    
    # Delete file from disk
    if os.path.exists(backup.file_path):
        try:
            os.remove(backup.file_path)
        except Exception as e:
            messages.warning(request, f'File deletion failed: {str(e)}')
    
    # Delete database record
    backup.delete()
    
    log_audit(
        request.user,
        'delete',
        'SystemBackup',
        backup_id,
        backup_repr,
        request=request
    )
    
    messages.success(request, f'Backup deleted successfully.')
    return redirect('admin_panel:backup_restore')


@login_required
@user_passes_test(is_admin)
def restore_backup(request, backup_id):
    """Restore from backup"""
    if request.method != 'POST':
        return redirect('admin_panel:backup_restore')
    
    backup = get_object_or_404(SystemBackup, id=backup_id)
    
    if not os.path.exists(backup.file_path):
        messages.error(request, 'Backup file not found on disk.')
        return redirect('admin_panel:backup_restore')
    
    try:
        # Create a safety backup before restoring
        safety_backup_dir = os.path.join(settings.MEDIA_ROOT, 'backups')
        safety_timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
        safety_backup_path, safety_size = create_full_backup(safety_backup_dir, f'pre_restore_{safety_timestamp}')
        
        SystemBackup.objects.create(
            backup_type='full',
            created_by=request.user,
            notes=f'Auto-created before restoring backup #{backup.id}',
            status='completed',
            file_path=safety_backup_path,
            file_size=safety_size,
            completed_at=timezone.now()
        )
        
        # Extract and restore
        restore_dir = os.path.join(settings.MEDIA_ROOT, 'restore_temp')
        os.makedirs(restore_dir, exist_ok=True)
        
        with zipfile.ZipFile(backup.file_path, 'r') as zip_ref:
            zip_ref.extractall(restore_dir)
        
        # Restore database if present
        db_backup = os.path.join(restore_dir, 'database', 'db.sqlite3')
        if os.path.exists(db_backup):
            db_path = settings.DATABASES['default']['NAME']
            shutil.copy2(db_backup, db_path)
            messages.success(request, 'Database restored successfully.')
        
        # Restore media if present
        media_backup = os.path.join(restore_dir, 'media')
        if os.path.exists(media_backup):
            for item in os.listdir(media_backup):
                s = os.path.join(media_backup, item)
                d = os.path.join(settings.MEDIA_ROOT, item)
                if os.path.isdir(s):
                    if os.path.exists(d):
                        shutil.rmtree(d)
                    shutil.copytree(s, d)
                else:
                    shutil.copy2(s, d)
            messages.success(request, 'Media files restored successfully.')
        
        # Cleanup
        shutil.rmtree(restore_dir)
        
        log_audit(
            request.user,
            'import',
            'SystemBackup',
            backup.id,
            f'Restored backup: {backup}',
            request=request
        )
        
        messages.warning(request, 'Restore completed! Please restart the server for changes to take full effect.')
        
    except Exception as e:
        messages.error(request, f'Restore failed: {str(e)}')
        # Cleanup on error
        if os.path.exists(restore_dir):
            shutil.rmtree(restore_dir)
    
    return redirect('admin_panel:backup_restore')


@login_required
@user_passes_test(is_admin)
def backup_details(request, backup_id):
    """View backup details"""
    backup = get_object_or_404(SystemBackup, id=backup_id)
    
    details = {
        'id': backup.id,
        'type': backup.get_backup_type_display(),
        'status': backup.get_status_display(),
        'file_path': backup.file_path,
        'file_size': backup.get_file_size_display(),
        'file_exists': os.path.exists(backup.file_path) if backup.file_path else False,
        'created_by': backup.created_by.get_full_name() if backup.created_by else 'System',
        'notes': backup.notes,
        'error': backup.error_message,
        'started': backup.started_at.strftime('%Y-%m-%d %H:%M:%S'),
        'completed': backup.completed_at.strftime('%Y-%m-%d %H:%M:%S') if backup.completed_at else None,
    }
    
    return JsonResponse(details)


@login_required
@user_passes_test(is_admin)
def email_templates(request):
    """Email template management"""
    if request.method == 'POST':
        template_id = request.POST.get('template_id')
        
        if template_id:
            template = get_object_or_404(EmailTemplate, id=template_id)
            template.name = request.POST.get('name')
            template.subject = request.POST.get('subject')
            template.body_html = request.POST.get('body_html')
            template.body_text = request.POST.get('body_text', '')
            template.is_active = request.POST.get('is_active') == 'on'
            template.updated_by = request.user
            template.save()
            
            messages.success(request, f'Email template "{template.name}" updated.')
        else:
            EmailTemplate.objects.create(
                name=request.POST.get('name'),
                template_type=request.POST.get('template_type'),
                subject=request.POST.get('subject'),
                body_html=request.POST.get('body_html'),
                body_text=request.POST.get('body_text', ''),
                is_active=request.POST.get('is_active') == 'on',
                updated_by=request.user
            )
            messages.success(request, 'Email template created.')
        
        return redirect('admin_panel:email_templates')
    
    templates = EmailTemplate.objects.all().order_by('-updated_at')
    
    context = {
        'templates': templates,
        'template_types': EmailTemplate.TEMPLATE_TYPE_CHOICES,
    }
    
    return render(request, 'admin/email_templates.html', context)


@login_required
@user_passes_test(is_admin)
def sms_templates(request):
    """SMS template management"""
    if request.method == 'POST':
        template_id = request.POST.get('template_id')
        
        if template_id:
            template = get_object_or_404(SMSTemplate, id=template_id)
            template.name = request.POST.get('name')
            template.message = request.POST.get('message')
            template.is_active = request.POST.get('is_active') == 'on'
            template.save()
            
            messages.success(request, f'SMS template "{template.name}" updated.')
        else:
            SMSTemplate.objects.create(
                name=request.POST.get('name'),
                template_type=request.POST.get('template_type'),
                message=request.POST.get('message'),
                is_active=request.POST.get('is_active') == 'on'
            )
            messages.success(request, 'SMS template created.')
        
        return redirect('admin_panel:sms_templates')
    
    templates = SMSTemplate.objects.all().order_by('-updated_at')
    
    context = {
        'templates': templates,
        'template_types': SMSTemplate.TEMPLATE_TYPE_CHOICES,
    }
    
    return render(request, 'admin/sms_templates.html', context)


@login_required
@user_passes_test(is_admin)
def settings_bulk_update(request):
    """Bulk update settings from the enhanced UI"""
    if request.method == 'POST':
        category = request.POST.get('category', 'general')
        updated_count = 0
        
        for key, value in request.POST.items():
            if key.startswith('setting_'):
                setting_id = key.replace('setting_', '')
                try:
                    setting = SystemSettings.objects.get(id=setting_id)
                    old_value = setting.value
                    
                    # Handle boolean checkboxes
                    if f'setting_{setting_id}' in request.POST:
                        if value == 'true' or value == 'on':
                            new_value = 'true'
                        else:
                            new_value = value
                    else:
                        # Checkbox unchecked (boolean false)
                        new_value = 'false'
                    
                    # Check if is_active checkbox is set
                    is_active = f'active_{setting_id}' in request.POST
                    
                    if setting.value != new_value or setting.is_active != is_active:
                        setting.value = new_value
                        setting.is_active = is_active
                        setting.updated_by = request.user
                        setting.save()
                        
                        log_audit(
                            request.user,
                            'update',
                            'SystemSettings',
                            setting.id,
                            setting.key,
                            {'old_value': old_value, 'new_value': new_value},
                            request
                        )
                        updated_count += 1
                        
                except SystemSettings.DoesNotExist:
                    pass
        
        if updated_count > 0:
            messages.success(request, f'{updated_count} settings updated successfully.')
        else:
            messages.info(request, 'No changes were made.')
        
        return redirect(f'/admin-panel/settings/?category={category}')
    
    return redirect('admin_panel:settings')


@login_required
@user_passes_test(is_admin)
def upload_branding(request):
    """Upload branding assets (logo, favicon, login background)"""
    if request.method == 'POST' and request.FILES:
        uploaded_count = 0
        
        # Create media/branding directory if it doesn't exist
        branding_dir = os.path.join(settings.MEDIA_ROOT, 'branding')
        os.makedirs(branding_dir, exist_ok=True)
        
        # Handle logo upload
        if 'logo' in request.FILES:
            logo_file = request.FILES['logo']
            logo_path = os.path.join(branding_dir, f'logo_{logo_file.name}')
            with open(logo_path, 'wb+') as destination:
                for chunk in logo_file.chunks():
                    destination.write(chunk)
            
            # Update setting
            setting, created = SystemSettings.objects.get_or_create(
                key='logo_path',
                defaults={'category': 'branding', 'description': 'Company logo path'}
            )
            setting.value = f'logo_{logo_file.name}'
            setting.updated_by = request.user
            setting.save()
            uploaded_count += 1
            
            log_audit(request.user, 'upload', 'BrandingAsset', '', 'logo', request=request)
        
        # Handle dark logo upload
        if 'logo_dark' in request.FILES:
            logo_file = request.FILES['logo_dark']
            logo_path = os.path.join(branding_dir, f'logo_dark_{logo_file.name}')
            with open(logo_path, 'wb+') as destination:
                for chunk in logo_file.chunks():
                    destination.write(chunk)
            
            setting, created = SystemSettings.objects.get_or_create(
                key='logo_dark_path',
                defaults={'category': 'branding', 'description': 'Company logo for dark backgrounds'}
            )
            setting.value = f'logo_dark_{logo_file.name}'
            setting.updated_by = request.user
            setting.save()
            uploaded_count += 1
            
            log_audit(request.user, 'upload', 'BrandingAsset', '', 'logo_dark', request=request)
        
        # Handle favicon upload
        if 'favicon' in request.FILES:
            favicon_file = request.FILES['favicon']
            favicon_path = os.path.join(branding_dir, f'favicon_{favicon_file.name}')
            with open(favicon_path, 'wb+') as destination:
                for chunk in favicon_file.chunks():
                    destination.write(chunk)
            
            setting, created = SystemSettings.objects.get_or_create(
                key='favicon_path',
                defaults={'category': 'branding', 'description': 'Site favicon path'}
            )
            setting.value = f'favicon_{favicon_file.name}'
            setting.updated_by = request.user
            setting.save()
            uploaded_count += 1
            
            log_audit(request.user, 'upload', 'BrandingAsset', '', 'favicon', request=request)
        
        # Handle login background upload
        if 'login_background' in request.FILES:
            bg_file = request.FILES['login_background']
            bg_path = os.path.join(branding_dir, f'login_bg_{bg_file.name}')
            with open(bg_path, 'wb+') as destination:
                for chunk in bg_file.chunks():
                    destination.write(chunk)
            
            setting, created = SystemSettings.objects.get_or_create(
                key='login_background',
                defaults={'category': 'branding', 'description': 'Login page background image'}
            )
            setting.value = f'branding/login_bg_{bg_file.name}'
            setting.updated_by = request.user
            setting.save()
            uploaded_count += 1
            
            log_audit(request.user, 'upload', 'BrandingAsset', '', 'login_background', request=request)
        
        # Handle customer portal background upload
        if 'customer_login_background' in request.FILES:
            bg_file = request.FILES['customer_login_background']
            bg_path = os.path.join(branding_dir, f'customer_bg_{bg_file.name}')
            with open(bg_path, 'wb+') as destination:
                for chunk in bg_file.chunks():
                    destination.write(chunk)
            
            setting, created = SystemSettings.objects.get_or_create(
                key='customer_login_background',
                defaults={'category': 'branding', 'description': 'Customer portal login page background image'}
            )
            setting.value = f'branding/customer_bg_{bg_file.name}'
            setting.updated_by = request.user
            setting.save()
            uploaded_count += 1
            
            log_audit(request.user, 'upload', 'BrandingAsset', '', 'customer_login_background', request=request)
        
        # Handle staff portal background upload
        if 'staff_login_background' in request.FILES:
            bg_file = request.FILES['staff_login_background']
            bg_path = os.path.join(branding_dir, f'staff_bg_{bg_file.name}')
            with open(bg_path, 'wb+') as destination:
                for chunk in bg_file.chunks():
                    destination.write(chunk)
            
            setting, created = SystemSettings.objects.get_or_create(
                key='staff_login_background',
                defaults={'category': 'branding', 'description': 'Staff portal login page background image'}
            )
            setting.value = f'branding/staff_bg_{bg_file.name}'
            setting.updated_by = request.user
            setting.save()
            uploaded_count += 1
            
            log_audit(request.user, 'upload', 'BrandingAsset', '', 'staff_login_background', request=request)
        
        if uploaded_count > 0:
            messages.success(request, f'{uploaded_count} branding assets uploaded successfully.')
        else:
            messages.error(request, 'No files were uploaded.')
        
        return redirect('/admin-panel/settings/?category=branding')
    
    return redirect('admin_panel:settings')


@login_required
@user_passes_test(is_admin)
def test_email(request):
    """Send a test email to verify configuration"""
    if request.method == 'POST':
        from django.core.mail import send_mail
        from django.conf import settings as django_settings
        
        try:
            # Get email settings
            email_enabled = SystemSettings.get_setting('email_enabled', 'false') == 'true'
            if not email_enabled:
                return JsonResponse({'success': False, 'error': 'Email is disabled in settings'})
            
            from_email = SystemSettings.get_setting('email_from_address', django_settings.DEFAULT_FROM_EMAIL)
            to_email = request.user.email or SystemSettings.get_setting('company_email', '')
            
            if not to_email:
                return JsonResponse({'success': False, 'error': 'No recipient email address found'})
            
            # Send test email
            send_mail(
                subject='Test Email from Smart Vehicle Repairs System',
                message='This is a test email to verify your email configuration is working correctly.',
                from_email=from_email,
                recipient_list=[to_email],
                fail_silently=False,
            )
            
            log_audit(request.user, 'test_email', 'EmailConfiguration', '', to_email, request=request)
            
            return JsonResponse({'success': True, 'email': to_email})
            
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)})
    
    return JsonResponse({'success': False, 'error': 'Invalid request method'})


@login_required
@user_passes_test(is_admin)
def test_sms(request):
    """Send a test SMS to verify Hubtel configuration using the existing notification system"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            phone_number = data.get('phone', '')
            
            if not phone_number:
                return JsonResponse({'success': False, 'error': 'Phone number is required'})
            
            # Check if SMS is enabled in database (UI toggle)
            sms_enabled = SystemSettings.get_setting('sms_enabled', 'false') == 'true'
            if not sms_enabled:
                return JsonResponse({'success': False, 'error': 'SMS is disabled in settings. Enable it first.'})
            
            # Use the existing Hubtel SMS system from notifications app
            from apps.notifications_app.hubtel_sms import is_hubtel_available, send_sms, validate_phone_number
            
            # Check if Hubtel is available
            if not is_hubtel_available():
                return JsonResponse({
                    'success': False, 
                    'error': 'Hubtel SMS not configured. Set HUBTEL_SMS_ENABLED=True and add credentials in .env file'
                })
            
            # Validate phone number
            is_valid, formatted_phone, error = validate_phone_number(phone_number)
            if not is_valid:
                return JsonResponse({'success': False, 'error': f'Invalid phone number: {error}'})
            
            # Send test SMS using the existing notification system
            message = 'Test message from Smart Vehicle Repairs System. Your SMS configuration is working!'
            success, response = send_sms(formatted_phone, message)
            
            if success:
                log_audit(request.user, 'test_sms', 'SMSConfiguration', '', formatted_phone, request=request)
                return JsonResponse({
                    'success': True,
                    'message_id': response.get('message_id') if isinstance(response, dict) else None,
                    'phone': formatted_phone
                })
            else:
                return JsonResponse({'success': False, 'error': str(response)})
            
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)})
    
    return JsonResponse({'success': False, 'error': 'Invalid request method'})
