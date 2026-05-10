from dateutil.relativedelta import relativedelta
from django.db import migrations


def remove_activation_delay(apps, schema_editor):
    Subscription = apps.get_model('subscriptions', 'Subscription')

    subscriptions = Subscription.objects.filter(
        status='active',
        payment_status='paid',
        activation_date__isnull=False,
        purchased_at__isnull=False,
    ).select_related('package')

    for subscription in subscriptions:
        purchase_date = subscription.purchased_at.date()
        if subscription.activation_date <= purchase_date:
            continue

        package = subscription.package
        if not package:
            continue

        subscription.start_date = purchase_date
        subscription.activation_date = purchase_date
        subscription.end_date = purchase_date + relativedelta(months=package.duration_months)
        subscription.save(update_fields=['start_date', 'activation_date', 'end_date', 'updated_at'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0006_align_paid_subscription_periods'),
    ]

    operations = [
        migrations.RunPython(remove_activation_delay, noop_reverse),
    ]
