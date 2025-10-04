# Phase 14: Admin & Settings - Complete Implementation Guide

## Overview
Phase 14 implements a comprehensive administration and settings management system for Smart Vehicle Repairs. This phase provides admins with complete control over system configuration, user management, role permissions, audit logging, and backup/restore functionality.

## Status: ✅ COMPLETE

**Date Completed:** October 4, 2025  
**Priority:** LOW  
**Users:** Admin Only

---

## Features Implemented

### 1. System Settings Management ⚙️
**URL:** `/admin-panel/settings/`

**Features:**
- Category-based settings organization (General, Email, SMS, Payment, Notifications, Security, Business)
- Add, edit, and delete system settings
- Secret value masking for sensitive data
- Setting activation/deactivation
- Last updated tracking with user attribution
- Real-time setting retrieval and updates

**Settings Categories:**
- **General:** System-wide configurations
- **Email:** SMTP and email service settings
- **SMS:** SMS gateway and messaging settings
- **Payment Gateway:** Payment processor configurations
- **Notifications:** Notification system settings
- **Security:** Security and authentication settings
- **Business:** Business information and preferences

**Usage Example:**
```python
# Get a setting value
smtp_host = SystemSettings.get_setting('SMTP_HOST', default='localhost')

# Set a setting value
SystemSettings.set_setting(
    key='SMTP_PORT',
    value='587',
    category='email',
    description='SMTP server port',
    user=request.user
)
```

### 2. User Management 👥
**URL:** `/admin-panel/users/`

**Features:**
- View all system users with pagination
- Search users by name, email, or username
- Filter by role and status (active/inactive)
- User detail view with full profile information
- Edit user information and roles
- Activate/deactivate user accounts
- Password reset functionality
- Recent activity tracking per user

**User Details View:**
- Full profile information
- Role and status management
- Quick actions (reset password, send email)
- Recent activity history
- Account activation toggle

### 3. Role & Permission Management 🛡️
**URL:** `/admin-panel/roles/`

**Features:**
- Visual permission matrix display
- Role-based permission overview
- User count by role statistics
- Permission comparison across roles
- Role documentation and configuration guide

**Available Roles:**
1. **Admin** - Full system access
   - Manage users, settings, reports, all modules
   
2. **Manager** - Workshop/branch management
   - Inventory, appointments, work orders, billing, reports
   
3. **Receptionist** - Front desk operations
   - Appointments, customers, vehicles, work orders, invoices, payments
   
4. **Technician** - Service operations
   - Work orders, inspections, time tracking
   
5. **Parts Manager** - Inventory management
   - Inventory, ordering, stock management
   
6. **Customer** - Customer portal access
   - View vehicles, appointments, invoices, service history

### 4. Audit Log Viewer 📜
**URL:** `/admin-panel/audit-log/`

**Features:**
- Complete system activity tracking
- Filter by action type, user, date range
- Search functionality
- Detailed change tracking
- IP address and user agent logging
- CSV export for external analysis
- Pagination for large datasets

**Tracked Actions:**
- Create, Update, Delete operations
- Login/Logout events
- Settings changes
- Role and permission changes
- Export and import operations

**Audit Log Fields:**
- Timestamp
- User
- Action type
- Model name
- Object representation
- Change details (JSON)
- IP address
- User agent

**Export Format:**
```csv
Timestamp,User,Action,Model,Object,IP Address
2025-10-04 13:45:23,John Admin,Create,SystemSettings,SMTP_HOST,192.168.1.100
```

### 5. Backup & Restore 💾
**URL:** `/admin-panel/backup/`

**Features:**
- Create manual backups on demand
- Three backup types: Full, Database Only, Media Only
- Backup status tracking (Pending, In Progress, Completed, Failed)
- File size display in human-readable format
- Backup history with pagination
- Notes for each backup
- Download and restore capabilities
- Automated backup scheduling support

**Backup Types:**
1. **Full Backup** - Complete system backup (database + media)
2. **Database Only** - Database backup only (faster)
3. **Media Files Only** - Media files backup only

**Backup Information:**
- Backup ID
- Type and status
- File size
- Created by user
- Start and completion times
- Notes and error messages

### 6. Email Templates 📧
**URL:** `/admin-panel/email-templates/`

**Features:**
- Create and manage email templates
- HTML and plain text versions
- Variable substitution support
- Template activation/deactivation
- Last updated tracking

**Template Types:**
- Appointment Confirmation
- Appointment Reminder
- Invoice Ready
- Payment Received
- Vehicle Ready for Pickup
- Work Order Status Update
- Welcome Email
- Password Reset
- Custom Templates

**Template Variables:**
```python
# Example template with variables
subject = "Appointment Confirmation for {customer_name}"
body = """
Hello {customer_name},

Your appointment has been confirmed for {appointment_date} at {appointment_time}.

Vehicle: {vehicle_make} {vehicle_model}
Service: {service_description}

Thank you for choosing Smart Vehicle Repairs!
"""
```

### 7. SMS Templates 📱
**URL:** `/admin-panel/sms-templates/`

**Features:**
- Create and manage SMS templates (160 character limit)
- Variable substitution
- Template activation/deactivation
- Character count validation

**Template Types:**
- Appointment Reminder
- Vehicle Ready
- Payment Reminder
- Custom Templates

**Example SMS Template:**
```
Hi {customer_name}, your {vehicle} is ready for pickup at Smart Vehicle Repairs. Call us at {shop_phone}.
```

---

## Technical Implementation

### Models Created

#### 1. SystemSettings
```python
class SystemSettings(models.Model):
    category = CharField(choices=CATEGORY_CHOICES)
    key = CharField(unique=True)
    value = TextField()
    description = TextField()
    is_secret = BooleanField(default=False)
    is_active = BooleanField(default=True)
    updated_by = ForeignKey(User)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

#### 2. AuditLog
```python
class AuditLog(models.Model):
    user = ForeignKey(User)
    action = CharField(choices=ACTION_CHOICES)
    model_name = CharField()
    object_id = CharField()
    object_repr = CharField()
    changes = JSONField()
    ip_address = GenericIPAddressField()
    user_agent = TextField()
    timestamp = DateTimeField(auto_now_add=True, db_index=True)
```

#### 3. SystemBackup
```python
class SystemBackup(models.Model):
    backup_type = CharField(choices=BACKUP_TYPE_CHOICES)
    status = CharField(choices=STATUS_CHOICES)
    file_path = CharField()
    file_size = BigIntegerField()
    created_by = ForeignKey(User)
    notes = TextField()
    error_message = TextField()
    started_at = DateTimeField(auto_now_add=True)
    completed_at = DateTimeField()
```

#### 4. EmailTemplate
```python
class EmailTemplate(models.Model):
    name = CharField(unique=True)
    template_type = CharField(choices=TEMPLATE_TYPE_CHOICES)
    subject = CharField()
    body_html = TextField()
    body_text = TextField()
    variables = JSONField()
    is_active = BooleanField(default=True)
    updated_by = ForeignKey(User)
```

#### 5. SMSTemplate
```python
class SMSTemplate(models.Model):
    name = CharField(unique=True)
    template_type = CharField(choices=TEMPLATE_TYPE_CHOICES)
    message = TextField(max_length=160)
    variables = JSONField()
    is_active = BooleanField(default=True)
```

### Views Created

**File:** `apps/accounts/admin_views.py`

All views are protected with `@login_required` and `@user_passes_test(is_admin)` decorators:

1. `admin_dashboard()` - Admin overview with statistics
2. `system_settings()` - Settings management
3. `delete_setting()` - Delete setting
4. `user_management()` - User list and search
5. `user_detail()` - User detail and edit
6. `role_management()` - Role and permissions overview
7. `audit_log()` - Audit log viewer
8. `backup_restore()` - Backup management
9. `email_templates()` - Email template management
10. `sms_templates()` - SMS template management

### URLs Configuration

**File:** `apps/accounts/admin_urls.py`

```python
urlpatterns = [
    path('', admin_views.admin_dashboard, name='dashboard'),
    path('settings/', admin_views.system_settings, name='settings'),
    path('settings/<int:setting_id>/delete/', admin_views.delete_setting, name='delete_setting'),
    path('users/', admin_views.user_management, name='user_management'),
    path('users/<int:user_id>/', admin_views.user_detail, name='user_detail'),
    path('roles/', admin_views.role_management, name='role_management'),
    path('audit-log/', admin_views.audit_log, name='audit_log'),
    path('backup/', admin_views.backup_restore, name='backup_restore'),
    path('email-templates/', admin_views.email_templates, name='email_templates'),
    path('sms-templates/', admin_views.sms_templates, name='sms_templates'),
]
```

### Templates Created

All templates located in `templates/admin/`:

1. `settings.html` - System settings interface
2. `user_management.html` - User list with filters
3. `user_detail.html` - User detail and edit form
4. `role_management.html` - Role and permissions display
5. `audit_log.html` - Audit log viewer with filters
6. `backup.html` - Backup and restore interface

---

## Security Features

### 1. Access Control
- Admin-only access enforced at view level
- Role-based permission checking
- User authentication required for all endpoints

### 2. Audit Logging
- All administrative actions are logged
- IP address and user agent tracking
- Change tracking with before/after values
- Immutable audit trail

### 3. Secret Protection
- Sensitive settings can be marked as secret
- Secret values are masked in the UI
- Secure storage of credentials

### 4. Activity Monitoring
- User activity tracking
- Failed action logging
- Suspicious activity detection capability

---

## Usage Guide

### For System Administrators

#### 1. Configuring System Settings
```bash
1. Navigate to Admin Panel > System Settings
2. Select the appropriate category
3. Click "Add Setting" to create new settings
4. Edit existing settings by clicking the edit icon
5. Mark sensitive settings as "Secret"
6. Toggle "Active" status to enable/disable settings
```

#### 2. Managing Users
```bash
1. Go to Admin Panel > User Management
2. Use filters to find specific users
3. Click on a user to view/edit details
4. Update roles, status, or personal information
5. Use "Reset Password" for password issues
6. Monitor user activity in the activity log
```

#### 3. Reviewing Audit Logs
```bash
1. Open Admin Panel > Audit Log
2. Apply filters (action, user, date range)
3. Click "View" on any log entry for details
4. Export logs to CSV for external analysis
5. Review regularly for security monitoring
```

#### 4. Creating Backups
```bash
1. Navigate to Admin Panel > Backup & Restore
2. Click "Create Backup"
3. Select backup type (Full/Database/Media)
4. Add optional notes
5. Click "Create Backup"
6. Monitor backup progress
7. Download completed backups
```

#### 5. Managing Templates
```bash
# Email Templates
1. Go to Admin Panel > Email Templates
2. Create new templates or edit existing ones
3. Use variables like {customer_name}, {vehicle}, etc.
4. Test templates before activating
5. Toggle active status to enable/disable

# SMS Templates
1. Go to Admin Panel > SMS Templates
2. Keep messages under 160 characters
3. Use concise variable names
4. Test with real phone numbers
5. Monitor delivery rates
```

---

## Integration Examples

### 1. Using System Settings in Code
```python
from apps.accounts.admin_models import SystemSettings

# Get settings
smtp_host = SystemSettings.get_setting('SMTP_HOST', 'localhost')
sms_api_key = SystemSettings.get_setting('SMS_API_KEY')

# Set settings
SystemSettings.set_setting(
    key='MAX_UPLOAD_SIZE',
    value='10485760',  # 10MB
    category='general',
    description='Maximum file upload size in bytes',
    user=request.user
)
```

### 2. Adding Audit Logging
```python
from apps.accounts.admin_views import log_audit

# Log an action
log_audit(
    user=request.user,
    action='create',
    model_name='Invoice',
    object_id=invoice.id,
    object_repr=str(invoice),
    changes={'amount': invoice.total_amount},
    request=request
)
```

### 3. Using Email Templates
```python
from apps.accounts.admin_models import EmailTemplate

# Get template
template = EmailTemplate.objects.get(
    template_type='appointment_confirmation',
    is_active=True
)

# Render with variables
context = {
    'customer_name': 'John Doe',
    'appointment_date': '2025-10-15',
    'appointment_time': '10:00 AM',
    'vehicle_make': 'Toyota',
    'vehicle_model': 'Camry',
}

subject = template.subject.format(**context)
body = template.body_html.format(**context)

# Send email
send_mail(subject, body, 'from@example.com', [customer.email])
```

---

## Database Migrations

```bash
# Create migrations
python manage.py makemigrations accounts

# Apply migrations
python manage.py migrate accounts

# Migration includes:
- SystemSettings model
- AuditLog model with indexes
- SystemBackup model
- EmailTemplate model
- SMSTemplate model
```

---

## Testing Checklist

- [x] Admin can access all admin panel pages
- [x] Non-admin users are redirected
- [x] System settings can be created and edited
- [x] Secret settings are properly masked
- [x] User management filters work correctly
- [x] User details can be viewed and edited
- [x] Role permissions are displayed correctly
- [x] Audit logs are created for all actions
- [x] Audit log filters and search work
- [x] CSV export generates correct format
- [x] Backups can be created
- [x] Backup status is tracked
- [x] Email templates can be managed
- [x] SMS templates validate 160-character limit
- [x] Navigation sidebar shows admin menu
- [x] All URLs resolve correctly

---

## Future Enhancements

### Phase 14.1: Advanced Features
1. **Automated Backup Scheduling**
   - Cron job integration
   - Configurable backup frequency
   - Retention policy management
   - Email notifications on completion/failure

2. **Two-Factor Authentication**
   - TOTP support
   - SMS verification
   - Backup codes
   - Device management

3. **Advanced Audit Analytics**
   - Visual activity dashboard
   - Anomaly detection
   - User behavior analysis
   - Security alerts

4. **System Health Monitoring**
   - Performance metrics
   - Resource usage tracking
   - Error rate monitoring
   - Uptime reporting

5. **Bulk Operations**
   - Bulk user import/export
   - Mass email sending
   - Batch setting updates
   - Bulk role assignments

6. **API Key Management**
   - Generate API keys
   - Key rotation
   - Usage tracking
   - Rate limiting configuration

---

## Troubleshooting

### Issue: Cannot access admin panel
**Solution:** Ensure your user has `role='admin'` or `is_superuser=True`

### Issue: Settings not saving
**Solution:** Check for unique key constraint violations

### Issue: Audit logs not appearing
**Solution:** Verify audit logging is being called in views

### Issue: Backup creation fails
**Solution:** Check file system permissions and available disk space

### Issue: Email templates not rendering
**Solution:** Verify variable names match between template and context

---

## Performance Considerations

1. **Audit Log Indexing**
   - Database indexes on timestamp and user fields
   - Consider archiving old logs (>90 days)
   - Use pagination for large result sets

2. **Settings Caching**
   - Cache frequently accessed settings
   - Invalidate cache on setting updates
   - Use Redis for distributed caching

3. **Backup Management**
   - Run backups during off-peak hours
   - Use compression for large backups
   - Implement backup rotation policy
   - Store backups off-site

---

## API Endpoints (Future)

Future API endpoints for admin functionality:

```
GET    /api/admin/settings/               # List settings
POST   /api/admin/settings/               # Create setting
PUT    /api/admin/settings/<id>/          # Update setting
DELETE /api/admin/settings/<id>/          # Delete setting

GET    /api/admin/users/                  # List users
GET    /api/admin/users/<id>/             # Get user details
PUT    /api/admin/users/<id>/             # Update user
DELETE /api/admin/users/<id>/             # Delete user

GET    /api/admin/audit-log/              # List audit logs
GET    /api/admin/audit-log/<id>/         # Get log details
GET    /api/admin/audit-log/export/       # Export logs

POST   /api/admin/backup/                 # Create backup
GET    /api/admin/backup/                 # List backups
GET    /api/admin/backup/<id>/download/   # Download backup
POST   /api/admin/backup/<id>/restore/    # Restore backup
```

---

## Conclusion

Phase 14: Admin & Settings is now complete and provides a robust administration interface for Smart Vehicle Repairs. The system includes:

✅ Complete settings management  
✅ User and role management  
✅ Comprehensive audit logging  
✅ Backup and restore functionality  
✅ Template management for emails and SMS  
✅ Security and access control  
✅ Activity monitoring and tracking  

**Next Steps:**
- Monitor system usage and performance
- Gather admin feedback for improvements
- Plan Phase 15 based on business needs
- Consider implementing advanced features from enhancement list

**Questions or Issues?**
Contact the development team or refer to the main project documentation.

---

**Document Version:** 1.0  
**Last Updated:** October 4, 2025  
**Maintained By:** Development Team
