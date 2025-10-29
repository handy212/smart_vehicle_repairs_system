# UI Testing Guide

## Quick Start

### 1. Start the Development Server
```bash
cd /home/handy/smart_vehicle_repairs_system
source .venv/bin/activate
python manage.py runserver
```

### 2. Access the Application
Open your browser and navigate to: **http://127.0.0.1:8000**

## Testing Checklist

### ✅ General Layout

**Desktop View (> 992px)**
- [ ] Sidebar is visible on the left
- [ ] Main content fills the remaining space
- [ ] Header is at the top with logo and user menu
- [ ] Footer is at the bottom

**Tablet View (768px - 992px)**
- [ ] Sidebar is still visible but narrower
- [ ] Content adjusts accordingly
- [ ] All elements remain accessible

**Mobile View (< 768px)**
- [ ] Sidebar is hidden by default
- [ ] Hamburger menu icon appears in header
- [ ] Content takes full width
- [ ] Tapping hamburger opens sidebar
- [ ] Tapping outside sidebar closes it

### ✅ Header Navigation

**Elements to Check:**
- [ ] Site logo/name displays correctly
- [ ] Notification bell icon is visible
- [ ] User dropdown menu works
  - [ ] Shows user's name
  - [ ] Profile link works
  - [ ] Settings link works (admin only)
  - [ ] Logout link works

### ✅ Sidebar Navigation

**Desktop:**
- [ ] All menu items are visible
- [ ] Icons are properly aligned
- [ ] Active page is highlighted
- [ ] Collapsible sections expand/collapse smoothly
- [ ] Submenu items are indented

**Mobile:**
- [ ] Sidebar slides in from left when toggled
- [ ] All menu items still accessible
- [ ] Closes when clicking outside

**Test Navigation:**
- [ ] Click "Dashboard" - loads dashboard
- [ ] Click "Customers" - loads customer list
- [ ] Click "Vehicles" - loads vehicle list
- [ ] Expand "Appointments" - shows submenu
- [ ] Expand "Work Orders" - shows submenu
- [ ] All submenu links work

### ✅ Dashboard Content

**Stat Cards (Top Row):**
- [ ] 8 stat cards display in grid
- [ ] Each card shows:
  - [ ] Colored icon circle
  - [ ] Title
  - [ ] Numeric value
  - [ ] Trend or subtitle (if applicable)
- [ ] Hover effect works (card lifts slightly)
- [ ] Clickable cards link to correct pages

**Charts Section:**
- [ ] Revenue Trend chart displays
  - [ ] Shows last 7 days
  - [ ] Line chart with proper styling
  - [ ] Tooltips show on hover
  - [ ] Y-axis shows $ values
- [ ] Work Orders by Status chart displays
  - [ ] Doughnut/pie chart
  - [ ] Legend on the right
  - [ ] Different colors for each status
  - [ ] Tooltips show count

**Lists Section:**

**Upcoming Appointments:**
- [ ] Table displays with proper headers
- [ ] Shows time, customer, vehicle, service
- [ ] "View All" button links to appointments page
- [ ] View icon button works for each appointment
- [ ] Empty state shows if no appointments

**Active Work Orders:**
- [ ] List shows work order number as link
- [ ] Shows customer and vehicle info
- [ ] Shows time since creation
- [ ] "View All" button works
- [ ] Empty state shows if no work orders

**Low Stock Alerts:**
- [ ] Shows items below minimum stock
- [ ] Displays part number, name, supplier, category
- [ ] Shows stock level badge
- [ ] "Reorder" button for each item
- [ ] "Manage Inventory" button links correctly

**Recent Notifications:**
- [ ] Shows last 3 notifications
- [ ] Displays title, description, timestamp
- [ ] "View All" button works
- [ ] "Mark all as read" link works
- [ ] Empty state if no notifications

**Quick Actions:**
- [ ] 4 action buttons in a row
- [ ] Each button shows:
  - [ ] Large icon
  - [ ] Action label
- [ ] Hover effect changes background
- [ ] All buttons link to correct pages:
  - [ ] Add Customer
  - [ ] Schedule Appointment
  - [ ] Create Work Order
  - [ ] Create Invoice

### ✅ Responsive Behavior

**Test at Different Widths:**

**1920px (Large Desktop):**
- [ ] Content centered with good spacing
- [ ] All 8 stat cards in one or two rows
- [ ] Charts side by side
- [ ] Lists in 2 columns

**1366px (Standard Laptop):**
- [ ] Layout still comfortable
- [ ] All elements visible
- [ ] No horizontal scroll

**768px (Tablet):**
- [ ] Stat cards stack to 2 columns
- [ ] Charts stack vertically
- [ ] Lists remain readable

**375px (Mobile):**
- [ ] Everything stacks vertically
- [ ] Stat cards are single column
- [ ] Tables scroll horizontally if needed
- [ ] Buttons are touch-friendly

### ✅ Browser Testing

Test in multiple browsers:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

**Check for:**
- [ ] Consistent appearance
- [ ] All features work
- [ ] No console errors
- [ ] Smooth animations

### ✅ Performance

**Loading:**
- [ ] Page loads in < 2 seconds
- [ ] No flash of unstyled content (FOUC)
- [ ] Charts render smoothly
- [ ] No lag when scrolling

**Network Tab (DevTools):**
- [ ] CSS files load successfully
- [ ] JS files load successfully
- [ ] No 404 errors
- [ ] Static files are cached

**Console Tab:**
- [ ] No JavaScript errors
- [ ] No warnings (except known Django debug)
- [ ] Charts initialize properly

### ✅ Accessibility

**Keyboard Navigation:**
- [ ] Tab key moves through elements logically
- [ ] Enter key activates links/buttons
- [ ] Escape closes dropdown menus
- [ ] Focus indicators are visible

**Screen Reader:**
- [ ] Menu items have descriptive labels
- [ ] Icons have alt text or aria-labels
- [ ] Charts have data tables fallback (if needed)

**Color Contrast:**
- [ ] Text is readable on backgrounds
- [ ] Links are distinguishable
- [ ] Buttons have clear states

## Common Issues & Fixes

### Issue: Sidebar not showing
**Fix:** Clear browser cache and refresh

### Issue: Charts not rendering
**Check:**
1. Chart.js CDN loaded
2. No JS console errors
3. Data is being passed from backend

### Issue: Styles not applied
**Fix:**
```bash
python manage.py collectstatic --noinput
```

### Issue: Mobile menu not working
**Check:**
1. main.js is loaded
2. No JS console errors
3. Bootstrap JS is loaded

### Issue: 404 on static files
**Check:**
1. Files exist in static/ directory
2. collectstatic has been run
3. STATIC_URL is correct in settings

## Automated Testing

### Run System Check
```bash
python manage.py check
```

### Run Tests
```bash
python manage.py test
```

### Check for Template Errors
```bash
python manage.py check --deploy
```

## Success Criteria

The UI modernization is successful when:
- ✅ All checklist items pass
- ✅ No console errors
- ✅ Responsive on all devices
- ✅ Charts display real data
- ✅ All links work correctly
- ✅ Page loads quickly
- ✅ Professional appearance
- ✅ Intuitive navigation

## Next Steps After Testing

Once all tests pass:
1. Take screenshots for documentation
2. Test with real user data
3. Get feedback from users
4. Address any issues found
5. Move on to modernizing other pages

---

**Need Help?**
- Check browser console for errors
- Review docs/UI_MODERNIZATION_SUMMARY.md
- Verify database has data for dashboard
- Ensure all dependencies are installed
