# Settings Page Color Scheme Fix

## Issue
The redesigned settings page was using `--brand-color` CSS variables that don't exist in the system, instead of the actual color scheme defined in `base.html`.

## Your Color System
The system uses these CSS variables (defined in `templates/base.html`):
```css
:root {
    /* Dynamic Brand Colors from Admin Settings */
    --primary: {{ PRIMARY_COLOR|default:'#4f46e5' }};
    --secondary: {{ SECONDARY_COLOR|default:'#6b7280' }};
    --success: {{ SUCCESS_COLOR|default:'#10b981' }};
    --danger: {{ DANGER_COLOR|default:'#ef4444' }};
    --warning: #f59e0b;
    --info: #3b82f6;
    
    /* Computed Colors */
    --primary-dark: color-mix(in srgb, var(--primary) 85%, black);
    --primary-light: color-mix(in srgb, var(--primary) 70%, white);
    --primary-rgb: {{ PRIMARY_COLOR|default:'79, 70, 229' }};
}
```

## What Was Wrong
I mistakenly used:
- ❌ `--brand-color` (doesn't exist)
- ❌ `--brand-color-dark` (doesn't exist)
- ❌ `--brand-color-rgb` (doesn't exist)

## What I Fixed
Changed all instances to use YOUR existing color system:
- ✅ `--primary` (your main brand color)
- ✅ `--primary-dark` (computed darker shade)
- ✅ `--primary-rgb` (RGB values for rgba())

## Changes Made

### 1. Active Tab Styles
```css
/* Before */
background: var(--brand-color);
box-shadow: 0 4px 12px rgba(var(--brand-color-rgb), 0.3);

/* After */
background: var(--primary);
box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.3);
```

### 2. Card Header Gradient
```css
/* Before */
background: linear-gradient(135deg, var(--brand-color) 0%, var(--brand-color-dark, #6366f1) 100%);

/* After */
background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
```

### 3. Setting Item Hover
```css
/* Before */
border-color: var(--brand-color);

/* After */
border-color: var(--primary);
```

### 4. Control Focus State
```css
/* Before */
border-color: var(--brand-color);
box-shadow: 0 0 0 3px rgba(var(--brand-color-rgb), 0.1);

/* After */
border-color: var(--primary);
box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.1);
```

### 5. Form Switch Checked
```css
/* Before */
background-color: var(--brand-color);
border-color: var(--brand-color);

/* After */
background-color: var(--primary);
border-color: var(--primary);
```

### 6. Save Button
```css
/* Before */
background: var(--brand-color);
box-shadow: 0 4px 12px rgba(var(--brand-color-rgb), 0.3);

/* After */
background: var(--primary);
box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.3);
```

### 7. Upload Area Hover
```css
/* Before */
border-color: var(--brand-color);

/* After */
border-color: var(--primary);
```

## Result
✅ Settings page now uses YOUR color scheme from Admin Settings
✅ All colors are dynamically controlled via SystemSettings model
✅ Consistent with the rest of the application
✅ When you change PRIMARY_COLOR in settings, the settings page will update too

## Files Modified
- `templates/admin/settings_new.html` - Replaced 9 instances of `--brand-color*` with `--primary*`

## Testing
The settings page should now:
- Use your actual brand color (default: #4f46e5 - indigo)
- Match colors with the rest of admin panel
- Respond to color changes in system settings
