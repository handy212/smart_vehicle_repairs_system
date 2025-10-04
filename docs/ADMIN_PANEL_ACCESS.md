# Admin Panel Access Guide

## ⚠️ Important: URL Distinction

There are **TWO separate admin interfaces** in this system:

### 1. Django Built-in Admin (Django's Default)
- **URL**: `http://127.0.0.1:8000/admin/`
- **Purpose**: Django's built-in administrative interface for models
- **Features**: Model CRUD operations, user management (basic)
- **Use For**: Direct database manipulation, debugging

### 2. Custom Admin Panel (Our Enhanced Admin)
- **URL**: `http://127.0.0.1:8000/admin-panel/`
- **Purpose**: Smart Vehicle Repairs custom admin dashboard
- **Features**: 
  - ✅ Admin Dashboard with statistics
  - ✅ User Management (full CRUD)
  - ✅ Role & Permissions Management
  - ✅ System Settings (102 settings across 11 categories)
  - ✅ Backup & Restore
  - ✅ Audit Log
  - ✅ Email Templates
  - ✅ SMS Templates
- **Use For**: Day-to-day administration, settings configuration

## 🔗 Custom Admin Panel URLs

### Main Access Points
```
Dashboard:          http://127.0.0.1:8000/admin-panel/
Settings:           http://127.0.0.1:8000/admin-panel/settings/
User Management:    http://127.0.0.1:8000/admin-panel/users/
Role Management:    http://127.0.0.1:8000/admin-panel/roles/
Backup & Restore:   http://127.0.0.1:8000/admin-panel/backup/
Audit Log:          http://127.0.0.1:8000/admin-panel/audit-log/
Email Templates:    http://127.0.0.1:8000/admin-panel/email-templates/
SMS Templates:      http://127.0.0.1:8000/admin-panel/sms-templates/
```

### Settings by Category
```
Company Info:       http://127.0.0.1:8000/admin-panel/settings/?category=company
Branding:           http://127.0.0.1:8000/admin-panel/settings/?category=branding
Email:              http://127.0.0.1:8000/admin-panel/settings/?category=email
SMS:                http://127.0.0.1:8000/admin-panel/settings/?category=sms
Payment:            http://127.0.0.1:8000/admin-panel/settings/?category=payment
Notifications:      http://127.0.0.1:8000/admin-panel/settings/?category=notification
Security:           http://127.0.0.1:8000/admin-panel/settings/?category=security
Business:           http://127.0.0.1:8000/admin-panel/settings/?category=business
Maintenance:        http://127.0.0.1:8000/admin-panel/settings/?category=maintenance
Integrations:       http://127.0.0.1:8000/admin-panel/settings/?category=integration
General:            http://127.0.0.1:8000/admin-panel/settings/?category=general
```

## 🚀 Quick Access

### From Dashboard
1. Navigate to `http://127.0.0.1:8000/dashboard/`
2. Look for "Admin Panel" link in navigation menu

### Direct Access
1. Go to `http://127.0.0.1:8000/admin-panel/`
2. You'll see the admin dashboard with quick stats
3. Use the navigation menu to access different sections

## 🔐 Access Requirements

### Django Admin (`/admin/`)
- Requires superuser account
- Create with: `python manage.py createsuperuser`

### Custom Admin Panel (`/admin-panel/`)
- Requires admin role or superuser
- User role must be: `admin` OR `is_superuser=True`
- Configured in: `apps/accounts/admin_views.py` → `is_admin()` function

## 🎯 Most Common Tasks

### Configure System Settings
```
✅ URL: http://127.0.0.1:8000/admin-panel/settings/
```

### Manage Users
```
✅ URL: http://127.0.0.1:8000/admin-panel/users/
```

### Manage Roles & Permissions
```
✅ URL: http://127.0.0.1:8000/admin-panel/roles/
```

### Create Backup
```
✅ URL: http://127.0.0.1:8000/admin-panel/backup/
```

### View Audit Log
```
✅ URL: http://127.0.0.1:8000/admin-panel/audit-log/
```

## 🐛 Common Mistakes

### ❌ Wrong URL
```
http://127.0.0.1:8000/admin/settings/          (404 Error)
http://127.0.0.1:8000/admin-panel/setting/     (404 Error - missing 's')
http://127.0.0.1:8000/adminpanel/settings/     (404 Error - missing hyphen)
```

### ✅ Correct URL
```
http://127.0.0.1:8000/admin-panel/settings/    (Works!)
```

## 📱 Navigation Menu Structure

```
Smart Vehicle Repairs
├── Dashboard (/)
├── Customers (/customers/)
├── Vehicles (/vehicles/)
├── Appointments (/appointments/)
├── Work Orders (/workorders/)
├── Inventory (/inventory/)
├── Billing (/billing/)
├── Inspections (/inspections/)
├── Reporting (/reporting/)
├── Notifications (/notifications/)
└── Admin Panel (/admin-panel/)  ← Our custom admin
    ├── Dashboard
    ├── Settings
    ├── Users
    ├── Roles
    ├── Backup
    ├── Audit Log
    ├── Email Templates
    └── SMS Templates
```

## 🔧 URL Configuration

The URL patterns are defined in `config/urls.py`:

```python
# Django's built-in admin
path('admin/', admin.site.urls),

# Our custom admin panel
path('admin-panel/', include('apps.accounts.admin_urls', namespace='admin_panel')),
```

## 💡 Pro Tips

1. **Bookmark the correct URL**: Save `http://127.0.0.1:8000/admin-panel/` in your browser
2. **Check the URL bar**: Always verify you're using `/admin-panel/` not `/admin/`
3. **Use Django Reverse**: In code, use `{% url 'admin_panel:settings' %}` not hardcoded URLs
4. **Navigation Menu**: Always use the navigation menu instead of typing URLs manually

## 🆘 Troubleshooting

### "Page not found (404)" Error
**Problem**: You're accessing `/admin/settings/` instead of `/admin-panel/settings/`

**Solution**: Change the URL to include the hyphen:
```
http://127.0.0.1:8000/admin-panel/settings/
```

### "Permission Denied" Error
**Problem**: Your user doesn't have admin privileges

**Solution**: 
1. Make sure your user has role='admin' OR is_superuser=True
2. Check in Django admin: `http://127.0.0.1:8000/admin/accounts/user/`
3. Or create superuser: `python manage.py createsuperuser`

### Settings Page Loads But Shows Old Template
**Problem**: Browser cache or template cache

**Solution**:
1. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. Clear browser cache
3. Restart Django server

## 📚 Related Documentation

- [System Settings Complete](SYSTEM_SETTINGS_COMPLETE.md)
- [System Settings Quick Reference](SYSTEM_SETTINGS_QUICK_REF.md)
- [User Management](USER_DELETE_FEATURE.md)
- [Role & Permissions](ROLE_PERMISSIONS_COMPLETE.md)
- [Backup & Restore](BACKUP_RESTORE_COMPLETE.md)

## ✅ Quick Test

Open these URLs to verify your access:

1. **Dashboard**: http://127.0.0.1:8000/admin-panel/
   - Should show: Statistics cards, recent activity
   
2. **Settings**: http://127.0.0.1:8000/admin-panel/settings/
   - Should show: Category pills, settings list
   
3. **Branding**: http://127.0.0.1:8000/admin-panel/settings/?category=branding
   - Should show: Logo upload, color settings

If any of these show 404, check:
- ✅ Server is running: `python manage.py runserver`
- ✅ URL has hyphen: `/admin-panel/` not `/admin/`
- ✅ You're logged in as admin user

---

**Remember**: Always use `/admin-panel/` (with hyphen) for the custom admin panel!
