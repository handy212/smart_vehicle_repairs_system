# Diagnosis System - End-to-End Workflow Test Checklist

## 📋 Pre-Test Setup

- [ ] Ensure test data is populated (use `python manage.py populate_diagnosis_test_data`)
- [ ] Create a test work order in "diagnosis" status
- [ ] Ensure at least one user with "technician" role exists
- [ ] Ensure diagnostic code library has some entries
- [ ] Ensure test procedure library has some entries

---

## 🔄 Complete Diagnosis Workflow Test

### Step 1: Start Diagnosis
- [ ] Navigate to Work Order detail page
- [ ] Click "Start Diagnosis" button
- [ ] Verify diagnosis detail page loads
- [ ] Verify diagnosis status is "in_progress"
- [ ] Verify Work Order status remains "diagnosis"

### Step 2: Add Customer Complaint
- [ ] Go to "Complaint" tab
- [ ] Verify customer concerns are pre-filled from work order
- [ ] Edit/add customer complaint
- [ ] Click "Save"
- [ ] Verify complaint is saved

### Step 3: Add Diagnostic Codes
- [ ] Go to "Codes" tab
- [ ] Click "Add Code"
- [ ] **Test Code Library Integration:**
  - [ ] Type a code number (e.g., "P0301")
  - [ ] Verify autocomplete shows matching codes after 3+ characters
  - [ ] Click on a library code or click lookup button
  - [ ] Verify description auto-populates from library
  - [ ] Verify severity is set from library
- [ ] Complete code entry and save
- [ ] Verify code appears in the list
- [ ] Verify tab count shows correct number

### Step 4: Add Diagnostic Tests
- [ ] Go to "Tests" tab
- [ ] Click "Add Test"
- [ ] **Test Template Selection:**
  - [ ] Type test name in search box
  - [ ] Verify template suggestions appear below
  - [ ] Click on a template
  - [ ] Verify all fields auto-populate (procedure, expected result, tools, etc.)
- [ ] Enter actual result
- [ ] Set status (pass/fail/inconclusive)
- [ ] Save test
- [ ] Verify test appears in the list
- [ ] Verify tab count shows correct number

### Step 5: Add Findings
- [ ] Go to "Findings" tab
- [ ] Click "Add Finding"
- [ ] Fill in finding details (title, category, description, severity)
- [ ] Save finding
- [ ] Verify finding appears in the list
- [ ] Verify tab count shows correct number

### Step 6: Add Photos
- [ ] Go to "Photos" tab
- [ ] Click "Add Photo"
- [ ] Upload an image file
- [ ] Add caption and select photo type
- [ ] Optionally link to a finding
- [ ] Save photo
- [ ] Verify photo appears in grid
- [ ] Verify tab count shows correct number
- [ ] Test photo deletion

### Step 7: Add Recommendations
- [ ] Go to "Recommendations" tab
- [ ] Click "Add"
- [ ] Fill in recommendation (type, priority, description)
- [ ] Save recommendation
- [ ] Verify recommendation appears in "Pending Approval" section
- [ ] **Test Approval Workflow:**
  - [ ] Select recommendation(s) using checkbox
  - [ ] Click "Approve Selected"
  - [ ] Verify recommendation moves to "Approved - Ready to Convert" section
  - [ ] Test individual approve/decline buttons

### Step 8: Convert Recommendations to Tasks
- [ ] With approved recommendations visible
- [ ] Click "Convert to Tasks"
- [ ] Verify success message
- [ ] Verify redirected to work order page
- [ ] Check work order tasks - verify ServiceTasks were created
- [ ] Return to diagnosis page
- [ ] Verify recommendations show "✓ Task Created" badge
- [ ] Verify "Converted to Tasks" section shows converted recommendations

### Step 9: Prepare Estimate (Parts Tab)
- [ ] Go to "Parts" tab
- [ ] **Test Auto-Population:**
  - [ ] Verify "From Recommendations" card is visible
  - [ ] Verify approved recommendations are highlighted
  - [ ] Click "Auto-Populate All" button
  - [ ] Verify all parts and labor from approved recommendations are added to line items
  - [ ] OR manually add items per recommendation using "Add Parts" / "Add Labor" buttons
- [ ] Verify line items table shows all items
- [ ] Verify totals are calculated correctly
- [ ] Edit line items if needed (quantity, prices, etc.)
- [ ] Click "Create Estimate"
- [ ] Confirm in dialog
- [ ] Verify estimate is created
- [ ] Verify redirected to estimate edit page
- [ ] Verify estimate has all line items

### Step 10: Complete Diagnosis
- [ ] Return to diagnosis detail page
- [ ] Review "Summary" tab
- [ ] Click "Complete Diagnosis"
- [ ] **Test Workflow Sync:**
  - [ ] If `requires_approval = true`: Verify Work Order status changes to "awaiting_approval"
  - [ ] If `requires_approval = false`: Verify Work Order status changes to "in_progress" or "approved"
  - [ ] Verify `diagnosis_completed_at` is set on Work Order
  - [ ] Verify `diagnosis_by` is set from diagnosis technician
  - [ ] Verify `diagnosis_notes` is updated from root_cause
- [ ] Verify success message
- [ ] Verify redirected to work order page

---

## 🔍 Additional Tests

### Code Library Edge Cases
- [ ] Test lookup with code not in library (should allow manual entry)
- [ ] Test with different code types (OBD-II, manufacturer, ABS, etc.)
- [ ] Test with codes that have common causes/fixes data

### Test Template Edge Cases
- [ ] Test template search with no results
- [ ] Test template selection across different categories
- [ ] Verify template use count increments

### Recommendations Edge Cases
- [ ] Test bulk approval of multiple recommendations
- [ ] Test decline workflow
- [ ] Test conversion with mixed approved/unapproved recommendations
- [ ] Test conversion when some recommendations already converted

### Estimate Auto-Population Edge Cases
- [ ] Test with recommendations that have no parts/labor estimates
- [ ] Test with recommendations that have only parts or only labor
- [ ] Test manual addition after auto-population
- [ ] Test validation (empty line items, invalid quantities, etc.)

### Workflow State Transitions
- [ ] Test completing diagnosis without recommendations
- [ ] Test completing diagnosis without estimate
- [ ] Test status transitions based on approval requirements
- [ ] Test error handling (missing technician, etc.)

---

## ✅ Acceptance Criteria

All P0 fixes must pass:
- ✅ Diagnosis completion syncs with Work Order status
- ✅ Recommendations can be approved and converted to tasks
- ✅ Customer approval workflow functions correctly
- ✅ Code library lookup works and auto-populates
- ✅ Test template selection works and auto-populates
- ✅ Estimate can be created from recommendations
- ✅ All tab counts display correctly
- ✅ All data persists correctly

---

## 🐛 Known Issues / Notes

Document any issues found during testing here:

1. 
2. 
3. 

---

## 📊 Test Results Summary

- **Total Tests**: ___
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___

**Test Date**: _______________
**Tested By**: _______________

