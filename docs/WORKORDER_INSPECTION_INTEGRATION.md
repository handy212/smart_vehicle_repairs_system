# Work Order Inspection Integration

## Overview
This document describes the integration between Work Orders and Inspections, allowing seamless inspection workflows directly from work orders.

## Features

### 1. Start Inspection from Work Order
- Work orders in "draft" status have a "Start Initial Inspection" action
- Clicking this action redirects to the inspection creation page with pre-filled information

### 2. Auto-Filled Inspection Form
When starting an inspection from a work order:
- **Customer** is automatically selected (from work order)
- **Vehicle** is automatically selected (from work order)
- **Step 1** (Customer & Vehicle Selection) is skipped entirely
- Form starts directly at **Step 1: Inspection Details** (formerly Step 2)
- Work order information is displayed at the top for context

### 3. Automatic Work Order Update
After completing the inspection:
- Work order status is automatically updated to "intake"
- `inspection_completed` flag is set to `True` on the work order
- User is redirected back to the work order detail page
- Success message confirms both inspection creation and work order update

### 4. Workflow Enforcement
- Users cannot change work order status to "intake" unless inspection is completed
- Alert message is shown if attempting to skip inspection
- "Service Tasks" and "Parts Used" sections are hidden during inspection status
- "Service Tasks" only display after inspection is completed

## User Journey

### Starting an Inspection
1. Navigate to work order detail page (status: "draft")
2. Click Actions → "Start Initial Inspection"
3. Confirmation dialog: "Are you sure you want to change the status to 'inspection'? You will be redirected to perform the inspection."
4. Click "OK" to proceed

### Completing the Inspection
1. Redirected to inspection form with customer/vehicle pre-filled
2. See work order context card at top of form
3. Select inspection template and fill in details (Step 1)
4. Complete inspection checklist (Step 2)
5. Submit inspection
6. Automatically returned to work order (now in "intake" status)

## URL Structure
- Start inspection: `/inspections/start/?workorder=<id>`
- Create with pre-fill: `/inspections/create/?customer=<id>&vehicle=<id>&workorder=<id>`

## Database Changes
- `WorkOrder.inspection_completed` field tracks inspection status
- Links inspection to work order for audit trail

## Templates Modified
- `templates/workorders/workorder_detail.html` - Status change logic and conditional sections
- `templates/inspections/inspection_form_new.html` - Auto-fill and skip step logic

## Views Modified
- `apps/inspections/frontend_views.py`:
  - `inspection_start()` - New view to handle redirect from work order
  - `inspection_create()` - Updated to handle pre-filled data and work order linking

## Benefits
1. **Streamlined Workflow** - No manual data entry for customer/vehicle
2. **Reduced Errors** - Automatic data population eliminates mistakes
3. **Process Enforcement** - Cannot skip inspection step
4. **Better UX** - Contextual information always visible
5. **Audit Trail** - Clear link between work order and inspection

## Future Enhancements
- [ ] Allow multiple inspections per work order
- [ ] View inspection results directly in work order detail
- [ ] Re-inspection workflow for failed items
- [ ] Inspection history timeline in work order
