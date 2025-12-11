# Diagnosis Module

A modular diagnosis system for the Smart Vehicle Repairs System.

## Overview

This module implements a real-world diagnosis workflow for automotive repair shops. Unlike inspections (which are systematic checks), diagnosis is problem-driven, starting with customer complaints and iteratively investigating to find root causes.

## Models

### Diagnosis
- **One per work order** - Tracks the entire diagnostic session
- Links to WorkOrder via OneToOneField
- Tracks technician, timing, status
- Stores customer complaint, diagnostic notes, root cause
- Manages diagnostic fees and time tracking

### RepairRecommendation
- **Multiple per diagnosis** - Recommendations for what needs fixing
- Includes parts lists, labor estimates, cost breakdowns
- Priority levels: Critical, Necessary, Recommended, Advisory
- Can be approved by customers and converted to ServiceTasks

## API Endpoints

### Diagnoses
- `GET /api/diagnosis/diagnoses/` - List all diagnoses
- `GET /api/diagnosis/diagnoses/{id}/` - Get diagnosis details
- `POST /api/diagnosis/diagnoses/` - Create new diagnosis
- `PATCH /api/diagnosis/diagnoses/{id}/` - Update diagnosis
- `POST /api/diagnosis/diagnoses/{id}/complete/` - Mark as completed
- `GET /api/diagnosis/diagnoses/{id}/recommendations/` - Get recommendations
- `POST /api/diagnosis/diagnoses/{id}/add_recommendation/` - Add recommendation

### Repair Recommendations
- `GET /api/diagnosis/recommendations/` - List all recommendations
- `GET /api/diagnosis/recommendations/{id}/` - Get recommendation details
- `POST /api/diagnosis/recommendations/` - Create recommendation
- `PATCH /api/diagnosis/recommendations/{id}/` - Update recommendation
- `POST /api/diagnosis/recommendations/{id}/approve/` - Approve recommendation

## Status

Phase 1 (MVP) is complete:
- ✅ Diagnosis and RepairRecommendation models
- ✅ API serializers and ViewSets
- ✅ Admin interface
- ✅ URL routing

Next steps:
- [ ] Database migrations (run `python manage.py makemigrations diagnosis`)
- [ ] Frontend TypeScript interfaces
- [ ] Frontend API client
- [ ] Frontend Diagnosis detail page
- [ ] Integration with WorkOrder workflow

## Usage

1. Create a diagnosis for a work order:
```python
POST /api/diagnosis/diagnoses/
{
    "work_order": 123,
    "technician": 5,
    "customer_complaint": "Car won't start",
    "initial_observations": "No crank, battery voltage 12.4V",
    "diagnostic_fee": 75.00
}
```

2. Add repair recommendations:
```python
POST /api/diagnosis/diagnoses/1/add_recommendation/
{
    "recommendation_type": "replace",
    "description": "Replace battery",
    "priority": "necessary",
    "parts_needed": [
        {"part_name": "Battery", "quantity": 1, "unit_cost": 150.00}
    ],
    "estimated_parts_cost": 150.00,
    "estimated_labor_hours": 0.5,
    "estimated_labor_cost": 50.00
}
```

3. Complete diagnosis:
```python
POST /api/diagnosis/diagnoses/1/complete/
```

