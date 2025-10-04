# Backup & Restore Quick Start Guide

## 🚀 Quick Start (5 Minutes)

### Step 1: Access Backup Page
1. Login as **Admin**
2. Click **Admin** dropdown in sidebar
3. Select **Backup & Restore**
4. Or go to: `http://localhost:8000/admin-panel/backup/`

---

### Step 2: Create Your First Backup

#### Option A: Database Only (Recommended for Testing)
```
1. Click "Create Backup" button
2. Select: "Database Only"
3. Notes: "My first backup" (optional)
4. Click "Create Backup"
5. ✅ Success! Backup appears in list (~1 second)
```

#### Option B: Full Backup (Recommended for Production)
```
1. Click "Create Backup" button
2. Select: "Full Backup"
3. Notes: "Pre-deployment backup" (optional)
4. Click "Create Backup"
5. ✅ Success! Larger backup created (~5 seconds)
```

---

### Step 3: Verify Backup

**In the Backup List**:
- ✅ Green "Completed" badge
- 📊 File size displayed (e.g., "500.5 KB")
- 📅 Creation timestamp
- 👤 Your username as creator

**On Disk**:
```bash
ls -lh media/backups/
# You should see: database_backup_YYYYMMDD_HHMMSS.zip
```

---

### Step 4: Test Download

```
1. Find your backup in the list
2. Click the Download button (⬇️)
3. Confirm download dialog
4. ✅ ZIP file downloads to your computer
```

**Verify Downloaded File**:
- File size matches what's shown in list
- ZIP file can be opened/extracted
- Contains database or media files

---

### Step 5: View Backup Details

```
1. Click the View button (👁️) on any backup
2. See popup with:
   - Backup ID
   - Type (Full/Database/Media)
   - Status and size
   - Created by and timestamp
   - File exists status
```

---

## 🔄 Restore Process (Advanced)

### ⚠️ WARNING: Only in Development/Testing!

**Before You Restore**:
- ✅ Understand this replaces ALL current data
- ✅ Auto safety backup will be created
- ✅ You'll see TWO confirmation dialogs
- ✅ Server restart recommended after restore

### Restore Steps:
```
1. Identify the backup you want to restore to
2. Click Restore button (🔄)
3. Read warning dialog carefully
4. Click OK to confirm
5. Read FINAL confirmation dialog
6. Click OK to proceed
7. Wait for processing (~10 seconds)
8. See success messages:
   - "Database restored successfully"
   - "Media files restored successfully"
   - "Restore completed! Please restart server"
9. Check audit log for restore record
10. Restart development server (if needed)
```

### What Happens During Restore:
```
1. Auto safety backup created (pre_restore_YYYYMMDD_HHMMSS.zip)
2. Backup extracted to temp directory
3. Database file copied to db.sqlite3
4. Media files copied to media/ directory
5. Temp directory cleaned up
6. Audit log updated
7. Success message shown
```

---

## 🗑️ Delete Old Backups

### Safe Deletion:
```
1. Find backup you want to remove
2. Click Delete button (🗑️)
3. Confirm deletion
4. ✅ Both file and database record deleted
```

**What Gets Deleted**:
- ✅ Physical ZIP file from `media/backups/`
- ✅ Database record from SystemBackup table
- ✅ Logged in audit trail

---

## 📊 Backup Types Explained

### 1. Database Only
**Contains**: SQLite database file  
**Size**: ~500 KB - 5 MB  
**Time**: ~1 second  
**Use When**: 
- Quick backups during development
- Before database migrations
- Testing backup system

**Includes**:
- All user accounts
- All customer data
- All vehicle records
- All appointments, work orders, invoices
- Settings and templates

**Does NOT Include**:
- Uploaded documents
- Vehicle images
- Invoice PDFs
- Customer signatures

---

### 2. Media Files Only
**Contains**: All uploaded files  
**Size**: Varies (depends on uploads)  
**Time**: ~2-5 seconds  
**Use When**: 
- After bulk document uploads
- Before media cleanup
- Separate media archival

**Includes**:
- Customer documents
- Vehicle images
- Invoice PDFs
- Inspection photos
- Document uploads

**Does NOT Include**:
- Database data
- User accounts
- Settings

---

### 3. Full Backup ⭐ RECOMMENDED
**Contains**: Database + Media  
**Size**: Combined size  
**Time**: ~5 seconds  
**Use When**: 
- **Before deployments** ✅
- **Before major updates** ✅
- **Daily automated backups** ✅
- **Before data migrations** ✅

**Includes**:
- Everything from Database backup
- Everything from Media backup
- Complete system snapshot

**Best For**: Production safety!

---

## 📁 Backup File Locations

### Storage Directory
```
smart_vehicle_repairs_system/
└── media/
    └── backups/
        ├── database_backup_20251004_140530.zip
        ├── media_backup_20251004_140845.zip
        ├── full_backup_20251004_141223.zip
        └── pre_restore_20251004_142156.zip
```

### File Naming Convention
```
{type}_backup_{timestamp}.zip

Where:
- type: database | media | full | pre_restore
- timestamp: YYYYMMDD_HHMMSS
```

### Archive Contents

**Database Backup**:
```
database_backup_20251004_140530.zip
└── database_backup_20251004_140530.sqlite3
```

**Media Backup**:
```
media_backup_20251004_140845.zip
├── customer_documents/
├── vehicle_images/
└── invoices/
```

**Full Backup**:
```
full_backup_20251004_141223.zip
├── database/
│   └── db.sqlite3
└── media/
    ├── customer_documents/
    ├── vehicle_images/
    └── invoices/
```

---

## 🎯 Common Scenarios

### Scenario 1: Before Deployment
```
1. Create Full Backup
2. Notes: "Pre-deployment backup - v2.1.0"
3. Download backup to safe location
4. Proceed with deployment
5. If issues: Restore from backup
```

### Scenario 2: Before Data Migration
```
1. Create Database Backup
2. Notes: "Before customer import"
3. Run migration
4. If data corrupted: Restore backup
```

### Scenario 3: Regular Maintenance
```
Weekly:
1. Create Full Backup
2. Download to external storage
3. Delete backups older than 30 days
```

### Scenario 4: Testing Features
```
1. Create Database Backup ("Before feature test")
2. Test new feature
3. If test breaks data: Restore backup
4. If test succeeds: Keep backup for reference
```

### Scenario 5: Disaster Recovery
```
1. Identify last good backup
2. Click Restore
3. Confirm restoration
4. Restart server
5. Verify data integrity
6. Check audit log for issues
```

---

## ✅ Best Practices

### DO:
- ✅ Create backup before major changes
- ✅ Download critical backups to external storage
- ✅ Test restore process regularly
- ✅ Add descriptive notes to backups
- ✅ Monitor disk space usage
- ✅ Check audit log after operations
- ✅ Keep at least 3-5 recent backups

### DON'T:
- ❌ Delete all backups at once
- ❌ Restore in production without testing
- ❌ Skip confirmation dialogs
- ❌ Ignore error messages
- ❌ Store backups only on same server
- ❌ Forget to restart server after restore

---

## 🔍 Verification Checklist

After Creating Backup:
- [ ] Backup appears in list with "Completed" status
- [ ] File size is reasonable (not 0 bytes)
- [ ] Timestamp is correct
- [ ] Can click Download button
- [ ] Audit log shows creation record

After Downloading Backup:
- [ ] ZIP file downloaded successfully
- [ ] File size matches list
- [ ] Can extract ZIP file
- [ ] Contains expected files

After Restoring Backup:
- [ ] Safety backup was created
- [ ] Success messages appeared
- [ ] Data is from correct time period
- [ ] No error messages in audit log
- [ ] Application functions normally

---

## 📞 Troubleshooting

### Problem: "Backup file not found on disk"
**Solution**: 
```
1. Check media/backups/ directory exists
2. Verify file permissions
3. Delete orphaned database record
```

### Problem: Download button does nothing
**Solution**:
```
1. Check browser console for errors
2. Verify file still exists on disk
3. Check server logs for permission errors
```

### Problem: Restore hangs/fails
**Solution**:
```
1. Check disk space (need 2x backup size free)
2. Stop development server
3. Try restore again
4. Check restore_temp/ directory was cleaned up
5. Use safety backup if needed
```

### Problem: Backup takes too long
**Solution**:
```
1. Use Database Only instead of Full
2. Check disk I/O performance
3. Clean up old media files
4. Consider incremental backups (future feature)
```

---

## 🎓 Understanding Backup Status

| Status | Icon | Meaning | Actions Available |
|--------|------|---------|-------------------|
| **Completed** | ✅ | Backup successful | All (View/Download/Restore/Delete) |
| **In Progress** | ⏳ | Currently creating | View only |
| **Failed** | ❌ | Creation failed | View (shows error), Delete |
| **Pending** | ⏸️ | Queued/waiting | View, Delete |

---

## 📈 Monitoring & Maintenance

### Check Backup Health
```bash
# Count backups
ls media/backups/*.zip | wc -l

# Total backup storage
du -sh media/backups/

# List by size
ls -lhS media/backups/
```

### Recommended Schedule

**Development**:
- Before major features: Manual backup
- Weekly: Full backup + download

**Production**:
- Daily: Automated full backup (2 AM)
- Before deployments: Manual full backup
- Monthly: Download to off-site storage

### Retention Guidelines
- Keep last 7 daily backups
- Keep last 4 weekly backups
- Keep last 12 monthly backups
- Delete older backups manually

---

## 🚀 Next Steps

1. **Create your first backup** (5 minutes)
2. **Test download** (1 minute)
3. **Practice restore in development** (10 minutes)
4. **Set up backup routine** (ongoing)
5. **Consider automation** (future: Celery tasks)

---

## 📚 Related Documentation

- **Full Technical Docs**: `docs/BACKUP_RESTORE_COMPLETE.md`
- **Implementation Analysis**: `docs/BACKUP_RESTORE_ANALYSIS.md`
- **Audit Log Guide**: `docs/PHASE14_COMPLETE.md`
- **Admin Panel**: `docs/PHASE_14_IMPLEMENTATION_COMPLETE.md`

---

## ✨ Quick Command Reference

```bash
# Test backup system
./venv/bin/python test_backup_restore.py

# Check backups on disk
ls -lh media/backups/

# Access backup page (browser)
http://localhost:8000/admin-panel/backup/

# View audit log
http://localhost:8000/admin-panel/audit-log/

# Calculate storage usage
du -sh media/backups/
```

---

**That's it!** You now have a fully functional backup and restore system. Start with creating a test backup and go from there! 🎉
