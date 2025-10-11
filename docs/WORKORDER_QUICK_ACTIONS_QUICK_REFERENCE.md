# Work Order Quick Actions - Quick Reference

## User Guide

### Adding Service Templates
1. Navigate to work order creation page
2. Click **"Add from Template"** button (blue outline button with clipboard icon)
3. Browse available inspection templates
4. Click on desired template card
5. Template items automatically added to "Customer Concerns" field
6. Continue filling out work order as normal

**Note:** Templates are appended to existing content, not replaced.

### Scheduling Follow-up Appointments
1. First, select **Customer** and **Vehicle** from dropdowns
2. Click **"Schedule Appointment"** button (green outline button with calendar icon)
3. Fill in appointment details:
   - **Service Type** (required): Select from dropdown
   - **Priority**: Normal, Low, High, or Urgent
   - **Date** (required): Select date (cannot be in past)
   - **Time** (required): Select time
   - **Service Description**: Describe the service needed
   - **Special Instructions**: Any special requirements
   - **Send Confirmation**: Check to notify customer
4. Click **"Schedule Appointment"** button
5. Appointment created and note added to work order
6. Click link in success message to view appointment

## Developer Guide

### Adding Templates Feature to Other Pages

```javascript
// 1. Add button to your HTML
<button type="button" class="btn btn-outline-primary" id="add-from-template">
    <i class="fas fa-clipboard-list me-2"></i>Add from Template
</button>

// 2. Add click handler
$('#add-from-template').click(function() {
    loadServiceTemplates();
});

// 3. Copy these functions from workorder_create.html:
// - loadServiceTemplates()
// - showTemplateModal()
// - applyTemplate()
```

### Adding Appointment Scheduler to Other Pages

```javascript
// 1. Add button to your HTML
<button type="button" class="btn btn-outline-success" id="schedule-appointment">
    <i class="fas fa-calendar-plus me-2"></i>Schedule Appointment
</button>

// 2. Add click handler
$('#schedule-appointment').click(function() {
    showAppointmentScheduler();
});

// 3. Ensure customer and vehicle dropdowns have IDs:
<select id="customer" name="customer">...</select>
<select id="vehicle" name="vehicle">...</select>

// 4. Copy these functions from workorder_create.html:
// - showAppointmentScheduler()
// - scheduleAppointment()
```

## Troubleshooting

### Templates Not Loading
**Symptom:** Modal shows "No active service templates found"
**Solution:** Create inspection templates in Inspections module first
**Check:** Visit `/inspections/templates/` to manage templates

### "Please select customer and vehicle first" Alert
**Symptom:** Alert shows when clicking Schedule Appointment
**Solution:** Select customer and vehicle from dropdowns before clicking button
**Note:** Both fields are required for appointment scheduling

### Template Not Appearing in Customer Concerns
**Symptom:** Modal closes but field doesn't update
**Solution:** 
1. Check browser console for JavaScript errors
2. Verify API endpoint is accessible: `/inspections/templates/<id>/details/`
3. Ensure template has categories and items

### Appointment Not Creating
**Symptom:** Error message after clicking Schedule Appointment
**Possible Causes:**
1. Missing required fields (service type, date, time)
2. Invalid date (past date selected)
3. Customer or vehicle not found
4. CSRF token missing

**Solutions:**
1. Fill all required fields (marked with red asterisk)
2. Select today or future date
3. Verify customer and vehicle exist in database
4. Refresh page to get new CSRF token

### Modal Not Closing
**Symptom:** Modal stays open after action
**Solution:** Click close button (X) or Cancel button, or click outside modal

### Success Message Not Showing
**Symptom:** Action completes but no confirmation
**Solution:** Check if Bootstrap alerts are styled correctly in your theme

## API Reference (Quick)

### Get Templates List
```bash
curl http://localhost:8000/inspections/templates/api/
```

### Get Template Details
```bash
curl http://localhost:8000/inspections/templates/1/details/
```

### Create Appointment
```bash
curl -X POST http://localhost:8000/appointments/create/api/ \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: YOUR_TOKEN" \
  -d '{
    "customer_id": 1,
    "vehicle_id": 1,
    "service_type": "maintenance",
    "appointment_date": "2025-10-15",
    "appointment_time": "10:00",
    "priority": "normal"
  }'
```

## Common Customizations

### Change Template Display Format
Edit `applyTemplate()` function in `workorder_create.html`:
```javascript
let serviceText = `\n\n=== ${data.name} ===\n`;
// Change this format to match your needs
```

### Modify Appointment Form Fields
Edit modal HTML in `showAppointmentScheduler()` function:
```javascript
// Add new fields, remove existing ones, change labels, etc.
```

### Change Service Type Options
Update options in appointment modal:
```javascript
<option value="your_custom_type">Your Custom Type</option>
```

### Style Template Cards
Add CSS in `{% block extra_css %}`:
```css
.template-card {
    /* Your custom styling */
}
```

## Integration with Existing Systems

### Notifications
To enable appointment confirmations:
1. Implement notification sending in `create_appointment_api()`
2. Look for `# TODO: Implement notification sending`
3. Use your existing notification system (SMS, Email, Push)

### Work Order Linking
To link appointments to work orders:
1. Add `work_order` field to Appointment model (optional)
2. Pass work order ID when creating appointment
3. Update after work order is saved

## Performance Notes
- Templates loaded via AJAX (no page refresh)
- Modals created dynamically (not pre-loaded in HTML)
- Old modals removed before creating new ones (prevents memory leaks)
- API responses are lightweight JSON (no heavy HTML rendering)

## Browser Compatibility
- Tested on modern browsers (Chrome, Firefox, Safari, Edge)
- Requires JavaScript enabled
- Uses Bootstrap 5 modal functionality
- Uses jQuery 3.7.1

## Security Notes
- All API endpoints require authentication (`@login_required`)
- CSRF protection on POST requests
- Input validation on backend
- SQL injection protection via Django ORM
- XSS prevention via proper HTML escaping
