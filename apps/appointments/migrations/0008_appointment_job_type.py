from django.db import migrations, models
import django.db.models.deletion


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


def backfill_appointment_job_types(apps, schema_editor):
    Appointment = apps.get_model('appointments', 'Appointment')
    JobType = apps.get_model('workorders', 'JobType')

    job_types_by_code = {jt.code: jt for jt in JobType.objects.all()}
    for appointment in Appointment.objects.filter(job_type__isnull=True).iterator():
        code = APPOINTMENT_SERVICE_TYPE_TO_JOB_TYPE.get(appointment.service_type, 'general_repairs')
        job_type = job_types_by_code.get(code)
        if job_type:
            appointment.job_type_id = job_type.id
            appointment.save(update_fields=['job_type'])


class Migration(migrations.Migration):

    dependencies = [
        ('workorders', '0041_job_types_and_workflow_profiles'),
        ('appointments', '0007_appointment_customer_feedback_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='appointment',
            name='job_type',
            field=models.ForeignKey(
                blank=True,
                help_text='Type of service requested',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='appointments',
                to='workorders.jobtype',
            ),
        ),
        migrations.RunPython(backfill_appointment_job_types, migrations.RunPython.noop),
    ]
