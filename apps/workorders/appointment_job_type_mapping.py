"""Single source for legacy appointment service_type → job type code mapping."""

APPOINTMENT_SERVICE_TYPE_TO_JOB_TYPE = {
    'inspection': 'vehicle_inspection',
    'repair': 'general_repairs',
    'maintenance': 'routine_maintenance',
    'diagnostic': 'diagnostic_inspection',
    'tire_service': 'tyre_service',
    'oil_change': 'routine_maintenance',
    'brake_service': 'brake_service',
    'other': 'general_repairs',
}
