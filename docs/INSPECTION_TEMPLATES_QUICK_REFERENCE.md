# Quick Reference: Inspection Templates

## ✅ Successfully Created - 6 Templates

| # | Template Name | Categories | Items | Critical | Time | Use Case |
|---|--------------|------------|-------|----------|------|----------|
| 1 | **Basic Safety Inspection** | 5 | 15 | 7 | 10 min | Quick safety check, routine inspection |
| 2 | **Comprehensive Multi-Point** | 9 | 54 | 17 | 60 min | Annual service, full assessment |
| 3 | **Pre-Purchase Vehicle** | 6 | 37 | 9 | 45 min | Buying used cars, evaluation |
| 4 | **Oil Change Service** | 4 | 18 | 0 | 10 min | Oil change service check |
| 5 | **Brake System Inspection** | 4 | 24 | 15 | 30 min | Brake service, safety concern |
| 6 | **Emission/Smog Test** | 4 | 21 | 13 | 20 min | Smog testing, compliance |

## How to Use

### View Templates
```
Navigate to: Inspections → Templates
```

### Create Inspection
```
1. Go to: Inspections → Create New
2. Select template from dropdown
3. Fill in inspection details
4. Complete checklist items
5. Save and sign
```

### Manage Templates
```
Access from template detail page:
- Add categories
- Add items
- Edit existing items
- Delete items/categories
```

## Command Reference

### Create Templates
```bash
python manage.py create_inspection_templates
```

### Delete All Templates
```python
python manage.py shell -c "from apps.inspections.models import InspectionTemplate; InspectionTemplate.objects.all().delete()"
```

### List Templates
```python
python manage.py shell -c "from apps.inspections.models import InspectionTemplate; [print(t.name) for t in InspectionTemplate.objects.all()]"
```

## Template Details

### 1. Basic Safety Inspection
- **Lights & Signals** (4) - All exterior lights
- **Tires & Wheels** (3) - Tread, pressure, condition
- **Brakes** (3) - Pedal, fluid, parking brake
- **Fluid Levels** (3) - Oil, coolant, washer
- **Safety Equipment** (2) - Wipers, horn

### 2. Comprehensive Multi-Point
- **Engine System** (7) - Oil, filters, belts, hoses
- **Cooling System** (5) - Coolant, radiator, fan
- **Brake System** (7) - Pads, rotors, fluid, lines
- **Suspension & Steering** (7) - Shocks, joints, steering
- **Tires & Wheels** (7) - All 4 tires, spare
- **Exhaust System** (5) - Manifold, cat, muffler
- **Electrical System** (5) - Battery, alternator, lights
- **Interior Components** (6) - Belts, airbag, HVAC
- **Underbody Inspection** (5) - Frame, trans, leaks

### 3. Pre-Purchase Vehicle
- **Exterior Condition** (6) - Body, paint, rust, damage
- **Mechanical Assessment** (8) - Engine, trans, leaks
- **Test Drive Evaluation** (6) - Performance checks
- **Electronics & Features** (7) - All systems check
- **Maintenance & History** (5) - Records, title, odometer
- **Overall Assessment** (5) - Rating, recommendations

### 4. Oil Change Service
- **Oil Change Service** (5) - Oil, filter replacement
- **Fluid Levels** (5) - All fluid checks
- **Visual Inspection** (5) - Quick visual check
- **Lights Check** (3) - Essential lights

### 5. Brake System Inspection
- **Front Brake System** (7) - Pads, rotors, calipers
- **Rear Brake System** (5) - Pads/shoes, drums/rotors
- **Brake Fluid System** (6) - Fluid, master cylinder
- **Brake Performance** (6) - Pedal feel, ABS

### 6. Emission/Smog Test
- **Visual Inspection** (7) - Emission components
- **OBD-II Diagnostic** (5) - Codes, monitors
- **Emission Test Results** (5) - HC, CO, NOx levels
- **Test Conclusion** (4) - Pass/fail, repairs

## Item Types

| Type | Description | Example |
|------|-------------|---------|
| **pass_fail** | Simple checkbox | "Headlights working" |
| **rating** | 1-5 scale | "Tire condition: 4/5" |
| **measurement** | Number + unit | "Brake pads: 8mm" |
| **text** | Free notes | "Engine noise description" |
| **condition** | Status assessment | "Belt: Good/Fair/Poor" |

## Critical Items (⚠️)

Items marked as critical require immediate attention if failed:
- Brake components (pads, rotors, fluid)
- All lights and signals
- Tire tread depth
- Safety equipment
- Emission controls
- Structural components

## Next Steps

1. ✅ Templates created
2. 🔄 Navigate to Inspections → Templates
3. 📝 Create your first inspection
4. 🎯 Customize templates as needed

## Support

For full documentation, see:
- `docs/INSPECTION_TEMPLATES_GUIDE.md` - Complete guide
- `docs/PHASE_9_IMPLEMENTATION_STATUS.md` - Phase 9 status
- Frontend URL: `/inspections/templates/`
