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

from auditlog.models import LogEntry
from .admin_models import SystemSettings, SystemBackup, EmailTemplate, SMSTemplate
from .models import User
from .permission_models import Permission, Role, UserPermissionOverride

User = get_user_model()


def is_admin(user):
    """Check if user is admin"""
    return user.is_authenticated and (user.is_superuser or user.role == 'admin')


@login_required
@user_passes_test(is_admin)
def admin_dashboard(request):
    """Admin dashboard overview"""
    context = {
        'total_users': User.objects.count(),
        'active_users': User.objects.filter(is_active=True).count(),
        'total_settings': SystemSettings.objects.count(),
        'recent_logs': LogEntry.objects.select_related('actor', 'content_type')[:10],
        'recent_backups': SystemBackup.objects.all()[:5],
        'user_by_role': User.objects.values('role').annotate(count=Count('id')),
    }
    
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
            setting.value = request.POST.get('value', '')
            setting.description = request.POST.get('description', '')
            setting.is_active = request.POST.get('is_active') == 'on'
            setting.updated_by = request.user
            setting.save()
            
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
            
            user.delete()
            messages.success(request, f'User {user_name} deleted successfully.')
            return redirect('admin_panel:user_management')
        
        elif action == 'update':
            user.first_name = request.POST.get('first_name', '')
            user.last_name = request.POST.get('last_name', '')
            user.email = request.POST.get('email', '')
            user.phone = request.POST.get('phone', '')
            user.role = request.POST.get('role', 'customer')
            user.is_active = request.POST.get('is_active') == 'on'
            user.save()
            
            messages.success(request, f'User {user.get_full_name()} updated successfully.')
        
        elif action == 'reset_password':
            # In production, this would send a password reset email
            messages.info(request, f'Password reset email sent to {user.email}.')
        
        return redirect('admin_panel:user_detail', user_id=user.id)
    
    # Fetch audit logs using contenttypes to find LogEntries for this user
    from django.contrib.contenttypes.models import ContentType
    user_ct = ContentType.objects.get_for_model(User)
    recent_logs = LogEntry.objects.filter(
        content_type=user_ct, 
        object_id=user.id
    ).select_related('actor', 'content_type').order_by('-timestamp')[:20]
    
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
                    messages.success(request, f'Role "{name}" created successfully.')
                else:
                    messages.error(request, f'Role with code "{code}" already exists.')
            else:
                messages.error(request, 'Role code and name are required.')
        
        elif action == 'update_role':
            role_id = request.POST.get('role_id')
            role = get_object_or_404(Role, id=role_id)
            
            role.name = request.POST.get('name', role.name)
            role.description = request.POST.get('description', '')
            role.priority = int(request.POST.get('priority', 50))
            role.is_active = request.POST.get('is_active') == 'on'
            role.save()
            
            permission_ids = request.POST.getlist('permissions')
            role.permissions.set(permission_ids)
            
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
    
    logs = LogEntry.objects.select_related('actor', 'content_type').all()
    
    if action_filter:
        try:
             # Convert action string filter to int if possible, but django-auditlog action maps to smallint
             # 0=Create, 1=Update, 2=Delete
             action_map = {'create': 0, 'update': 1, 'delete': 2}
             action_val = action_map.get(action_filter)
             if action_val is not None:
                logs = logs.filter(action=action_val)
        except ValueError:
            pass
    
    if user_filter:
        logs = logs.filter(actor_id=user_filter)
    
    if date_from:
        logs = logs.filter(timestamp__gte=date_from)
    
    if date_to:
        logs = logs.filter(timestamp__lte=date_to + ' 23:59:59')
    
    if search_query:
        logs = logs.filter(
            Q(object_repr__icontains=search_query) 
        )
    
    # Export functionality
    if request.GET.get('export') == 'csv':
        return export_audit_log_csv(logs)
    
    paginator = Paginator(logs, 50)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    # Action choices for filter - Mapping back for UI
    ACTION_CHOICES = (
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
    )

    context = {
        'page_obj': page_obj,
        'action_filter': action_filter,
        'user_filter': user_filter,
        'date_from': date_from,
        'date_to': date_to,
        'search_query': search_query,
        'actions': ACTION_CHOICES, 
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
            log.actor.get_full_name() if log.actor else 'System',
            log.get_action_display(),
            log.content_type.model,
            log.object_repr,
            log.remote_addr or 'N/A'
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
    
    if backup.file_path and os.path.exists(backup.file_path):
        try:
            os.remove(backup.file_path)
        except Exception as e:
            messages.warning(request, f'Could not remove file: {str(e)}')
            
    backup.delete()
    messages.success(request, f'Backup "{backup_repr}" deleted successfully.')
    
    return redirect('admin_panel:backup_restore')
