# Phase 14: Admin & Settings - Quick Reference

## 🚀 Quick Access URLs

```
Admin Dashboard:        /admin-panel/
System Settings:        /admin-panel/settings/
User Management:        /admin-panel/users/
Role Management:        /admin-panel/roles/
Audit Log:             /admin-panel/audit-log/
Backup & Restore:      /admin-panel/backup/
Email Templates:       /admin-panel/email-templates/
SMS Templates:         /admin-panel/sms-templates/
```

## 📋 Common Tasks

### Create a System Setting
```python
from apps.accounts.admin_models import SystemSettings

SystemSettings.set_setting(
    key='SMTP_HOST',
    value='smtp.gmail.com',
    category='email',
    description='SMTP server hostname',
    user=request.user
)
```

### Get a Setting Value
```python
smtp_host = SystemSettings.get_setting('SMTP_HOST', 'localhost')
```

### Log an Audit Event
```python
from apps.accounts.admin_views import log_audit

log_audit(
    user=request.user,
    action='create',
    model_name='Invoice',
    object_id=invoice.id,
    object_repr=f'Invoice #{invoice.id}',
    changes={'total': invoice.total_amount},
    request=request
)
```

### Create a Backup
1. Navigate to `/admin-panel/backup/`
2. Click "Create Backup"
3. Select backup type
4. Add notes (optional)
5. Submit

### Export Audit Logs
Visit: `/admin-panel/audit-log/?export=csv`

## 🔐 Security Checklist

- [ ] Only admin users can access admin panel
- [ ] All admin actions are logged
- [ ] Sensitive settings are marked as secret
- [ ] Regular backups are created
- [ ] Audit logs are reviewed weekly
- [ ] User roles are properly assigned

## 🎯 Key Features

### System Settings
- Category-based organization
- Secret value masking
- Active/inactive toggle
- Change tracking

### User Management
- Search and filter users
- Edit roles and permissions
- Account activation
- Password reset
- Activity monitoring

### Role Management
- Visual permission matrix
- User count statistics
- Role comparison

### Audit Log
- Complete action tracking
- Filter by user, action, date
- CSV export
- Change details

### Backup & Restore
- Full, Database, Media backups
- Status tracking
- Size information
- Download capability

## 📊 Admin Dashboard Stats

The admin dashboard displays:
- Total users count
- Active users count
- Total settings
- Recent audit logs (last 10)
- Recent backups (last 5)
- Users by role distribution

## 🛠️ Troubleshooting

**Cannot access admin panel:**
```python
# Check user role
user.role  # Should be 'admin'
user.is_superuser  # Or True
```

**Setting not found:**
```python
# Use default value
value = SystemSettings.get_setting('KEY', default='default_value')
```

**Backup fails:**
- Check disk space
- Verify file permissions
- Review error message in backup record

## 📝 Navigation

Admin menu in sidebar (Admin users only):
```
Admin & Settings
├── System Settings
├── User Management
├── Role Management
├── Audit Log
├── Backup & Restore
├── Email Templates
└── SMS Templates
```

## 🔔 Important Notes

1. **Admin Access Required:** All admin panel features require `role='admin'`
2. **Audit Logging:** All actions are automatically logged
3. **Secret Settings:** Mark sensitive data as secret to mask in UI
4. **Backup Retention:** Consider implementing backup rotation
5. **Regular Reviews:** Review audit logs and user activity regularly

## 📚 Related Documentation

- Full Implementation Guide: `docs/PHASE14_ADMIN_SETTINGS_COMPLETE.md`
- Role Configuration: `config/roles.py`
- Models: `apps/accounts/admin_models.py`
- Views: `apps/accounts/admin_views.py`
- URLs: `apps/accounts/admin_urls.py`

## 🚦 Status

✅ Phase 14 Complete  
✅ All templates created  
✅ All models migrated  
✅ Navigation integrated  
✅ Security implemented  
✅ Documentation complete

---

**Last Updated:** October 4, 2025
