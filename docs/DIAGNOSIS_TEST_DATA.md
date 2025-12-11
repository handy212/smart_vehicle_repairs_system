# Diagnosis Test Data

This document describes the test data created for testing the diagnosis flow.

## Test Data Created

### Work Orders
- **3 work orders** in "diagnosis" status:
  - KSI-WO000027
  - KSI-WO000028  
  - KSI-WO000029

### Customers & Vehicles
1. **John Doe** - 2020 Toyota Camry (45,000 miles)
2. **Jane Smith** - 2019 Honda Civic (62,000 miles)
3. **Bob Johnson** - 2021 Ford F-150 (28,000 miles)

### Diagnostic Code Library
5 common OBD-II codes populated:
- **P0301** - Cylinder 1 Misfire Detected
- **P0420** - Catalyst System Efficiency Below Threshold
- **P0171** - System Too Lean (Bank 1)
- **P0442** - EVAP System Leak Detected (Small Leak)
- **P0128** - Coolant Thermostat Below Regulating Temperature

### Test Procedure Library
4 common diagnostic tests:
- **Compression Test** (Mechanical)
- **Battery Voltage Test** (Electrical)
- **Fuel Pressure Test** (Pressure)
- **Ignition Coil Test** (Electrical)

### Diagnosis Records
Each work order has:
- 1-2 diagnostic codes (from library)
- 1-2 diagnostic tests (from library)
- 1 diagnosis finding linking codes and tests

## How to Test

### 1. View Work Orders in Diagnosis Status

Navigate to the work orders list and filter by status "diagnosis". You should see 3 test work orders.

### 2. Open Diagnosis Page

Click on any work order with diagnosis status, then click "Open Diagnosis" button, or navigate to:
```
/workorders/{work_order_id}/diagnosis
```

### 3. Test Each Tab

#### Complaint Tab
- View customer complaint
- Edit initial observations
- Add diagnostic notes

#### Codes Tab
- View existing diagnostic codes
- Add new codes from library or manually
- Edit/delete codes

#### Tests Tab
- View existing diagnostic tests
- Add new tests from procedure library
- View test measurements
- Mark tests as pass/fail/inconclusive

#### Findings Tab
- View diagnosis findings
- Create new findings
- Link codes and tests to findings

#### Photos Tab
- Upload diagnosis photos
- Link photos to findings

#### Recommendations Tab
- View repair recommendations
- Create recommendations from findings

#### Summary Tab
- View complete diagnosis summary
- Complete diagnosis

### 4. Test Workflow

1. **Start Diagnosis** - Already started (work orders in diagnosis status)
2. **Add Codes** - Use scan tool or manual entry
3. **Perform Tests** - Add tests from library
4. **Document Findings** - Create findings linking codes/tests
5. **Take Photos** - Document visual evidence
6. **Create Recommendations** - Generate repair recommendations
7. **Complete Diagnosis** - Finish and create estimate

## Running the Command Again

To clear and recreate test data:

```bash
python manage.py populate_diagnosis_test_data --clear
```

To add more test data without clearing:

```bash
python manage.py populate_diagnosis_test_data
```

## Test User Credentials

- **Technician**: tech@test.com / test123
- **Customer users**: john.doe@test.com, jane.smith@test.com, bob.johnson@test.com / test123

## API Endpoints to Test

- `GET /api/diagnosis/` - List all diagnoses
- `GET /api/diagnosis/{id}/` - Get diagnosis details
- `GET /api/diagnosis/workorder/{work_order_id}/` - Get diagnosis by work order
- `POST /api/diagnosis/` - Create new diagnosis
- `PATCH /api/diagnosis/{id}/` - Update diagnosis
- `POST /api/diagnosis/{id}/complete/` - Complete diagnosis

- `GET /api/diagnosis/codes/` - List diagnostic codes
- `POST /api/diagnosis/codes/` - Create diagnostic code

- `GET /api/diagnosis/tests/` - List diagnostic tests
- `POST /api/diagnosis/tests/` - Create diagnostic test

- `GET /api/diagnosis/findings/` - List findings
- `POST /api/diagnosis/findings/` - Create finding

- `GET /api/diagnosis/code-library/` - List code library
- `GET /api/diagnosis/test-procedures/` - List test procedure library

