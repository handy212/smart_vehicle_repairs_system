# Diagnostic Code Library Setup

## Problem
The code library is empty, so lookups return 404. You need to populate the database with diagnostic codes.

## Solution: Run the Populate Command

### Step 1: Populate Comprehensive Code Library

Run this command to populate the library with 100+ common OBD-II codes:

```bash
python manage.py populate_code_library
```

This will create/update codes including:
- P0100-P0605 (Engine/Powertrain codes)
- P0300-P0306 (Misfire codes - **including P3005**)
- P0401-P0446 (EGR and EVAP codes)
- P0420-P0430 (Catalyst codes)
- P0505-P0520 (Idle and oil pressure codes)
- P0700-P0758 (Transmission codes)
- And many more...

### Step 2: Verify Codes Are Loaded

After running the command, you can verify by:

1. **Via Django shell:**
   ```bash
   python manage.py shell
   ```
   ```python
   from apps.diagnosis.models import DiagnosticCodeLibrary
   print(f"Total codes: {DiagnosticCodeLibrary.objects.filter(is_active=True).count()}")
   print(f"P3005 exists: {DiagnosticCodeLibrary.objects.filter(code_number='P3005').exists()}")
   ```

2. **Via API:**
   ```bash
   curl http://localhost:8000/api/diagnosis/code-library/lookup/?code_number=P3005&code_type=obd_ii
   ```

### Step 3: Test in Frontend

Once populated, the code lookup in the frontend should work:
- Type `P3005` in the code number field
- Click the lookup button
- Description should auto-populate

## Alternative: Use Test Data Command

If you want to use the smaller test data set (from `populate_diagnosis_test_data`):

```bash
python manage.py populate_diagnosis_test_data
```

This includes fewer codes but is sufficient for basic testing.

## Adding More Codes

The `populate_code_library` command can be extended with more codes. Add entries to the `codes` list in:
`apps/diagnosis/management/commands/populate_code_library.py`

## Code Sources

The codes in the populate command are based on:
- Standard SAE OBD-II diagnostic trouble codes
- Common automotive diagnostic codes
- Real-world frequently encountered codes

For a comprehensive database, consider:
- Purchasing a commercial OBD-II code database
- Using manufacturer-specific code databases
- Building your own database from service manuals

