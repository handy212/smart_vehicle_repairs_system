from dateutil.relativedelta import relativedelta
from django.db import migrations, models


def align_paid_subscription_periods(apps, schema_editor):
    Subscription = apps.get_model('subscriptions', 'Subscription')

    subscriptions = Subscription.objects.filter(
        status='active',
        payment_status='paid',
        activation_date__isnull=False,
        start_date__lt=models.F('activation_date'),
    ).select_related('package')

    for subscription in subscriptions:
        package = subscription.package
        if not package:
            continue

        subscription.start_date = subscription.activation_date
        subscription.end_date = subscription.start_date + relativedelta(months=package.duration_months)
        subscription.save(update_fields=['start_date', 'end_date', 'updated_at'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0005_add_aa_compliance_fields'),
    ]

    operations = [
        migrations.RunPython(align_paid_subscription_periods, noop_reverse),
    ]
