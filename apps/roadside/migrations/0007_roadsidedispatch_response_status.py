from django.db import migrations, models
from django.utils import timezone


def accept_existing_dispatches(apps, schema_editor):
    RoadsideDispatch = apps.get_model('roadside', 'RoadsideDispatch')
    RoadsideDispatch.objects.all().update(
        response_status='accepted',
        responded_at=timezone.now(),
    )


class Migration(migrations.Migration):

    dependencies = [
        ('roadside', '0006_roadsidenote_roadsidephoto'),
    ]

    operations = [
        migrations.AddField(
            model_name='roadsidedispatch',
            name='response_status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('accepted', 'Accepted'),
                    ('rejected', 'Rejected'),
                ],
                default='pending',
                help_text='Technician accept/reject for this assignment',
                max_length=20,
                verbose_name='response status',
            ),
        ),
        migrations.AddField(
            model_name='roadsidedispatch',
            name='responded_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='responded at'),
        ),
        migrations.AddField(
            model_name='roadsidedispatch',
            name='rejection_reason',
            field=models.TextField(blank=True, verbose_name='rejection reason'),
        ),
        migrations.RunPython(accept_existing_dispatches, migrations.RunPython.noop),
    ]
