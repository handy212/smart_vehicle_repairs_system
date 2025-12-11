# Code Library Deployment Guide

## ✅ **Automatic Population in Production**

**Good news!** You **DON'T need to manually run** `python manage.py populate_code_library` in production.

### How It Works

I've created a **data migration** (`0003_populate_initial_code_library.py`) that automatically populates the code library when you run migrations.

### Deployment Steps

1. **Deploy your code** (including the migration file)
2. **Run migrations:**
   ```bash
   python manage.py migrate
   ```
   This will automatically:
   - Create the code library table (if not exists)
   - Populate 100+ common OBD-II codes
   - Mark them as active

3. **Done!** No manual command needed.

### What Gets Populated

The migration includes **100+ common OBD-II codes**, including:
- P0100-P0605 (Engine/Powertrain codes)
- P0300-P0306 (Misfire codes - **including P3005**)
- P0401-P0446 (EGR and EVAP codes)
- P0420-P0430 (Catalyst codes)
- P0505-P0520 (Idle and oil pressure codes)
- P0700-P0758 (Transmission codes)
- And many more...

### Benefits

✅ **Automatic** - No manual steps needed  
✅ **Version controlled** - Migration is in git  
✅ **Idempotent** - Safe to run multiple times  
✅ **Trackable** - Can see when codes were added  
✅ **Rollbackable** - Can reverse if needed

### Manual Command (Optional)

The management command `populate_code_library` still exists for:
- Adding more codes manually
- Updating existing codes
- Development/testing scenarios
- Adding codes that aren't in the initial migration

### Adding More Codes Later

If you need to add more codes after initial deployment:

1. **Option 1:** Create a new data migration
   ```bash
   python manage.py makemigrations --empty diagnosis
   # Then edit the migration file
   ```

2. **Option 2:** Use the management command
   ```bash
   python manage.py populate_code_library
   ```
   Then update the command file and create a migration to sync production.

### Verification

After deployment, verify codes are loaded:

```bash
# Via Django shell
python manage.py shell
>>> from apps.diagnosis.models import DiagnosticCodeLibrary
>>> DiagnosticCodeLibrary.objects.filter(is_active=True).count()
>>> DiagnosticCodeLibrary.objects.filter(code_number='P3005').exists()
```

Or test via API:
```bash
curl http://your-domain/api/diagnosis/code-library/lookup/?code_number=P3005&code_type=obd_ii
```

---

## Summary

**For Production Deployment:**
1. Deploy code ✅
2. Run `python manage.py migrate` ✅
3. Codes are automatically populated ✅
4. **No manual command needed!** ✅

