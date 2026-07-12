# Generated manually for Ghana address localization

from django.db import migrations, models

from apps.core.ghana import normalize_ghana_region


def normalize_customer_regions(apps, schema_editor):
    Customer = apps.get_model('customers', 'Customer')
    for customer in Customer.objects.all().iterator():
        updates = []
        new_service = normalize_ghana_region(customer.service_region, default='')
        if customer.service_region and new_service != customer.service_region:
            customer.service_region = new_service
            updates.append('service_region')
        elif customer.service_region and not new_service:
            customer.service_region = ''
            updates.append('service_region')
        new_billing = normalize_ghana_region(customer.billing_region, default='')
        if customer.billing_region and new_billing != customer.billing_region:
            customer.billing_region = new_billing
            updates.append('billing_region')
        if updates:
            customer.save(update_fields=updates)


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0012_alter_customer_customer_number'),
    ]

    operations = [
        migrations.RenameField(
            model_name='customer',
            old_name='service_state',
            new_name='service_region',
        ),
        migrations.RenameField(
            model_name='customer',
            old_name='billing_state',
            new_name='billing_region',
        ),
        migrations.AddField(
            model_name='customer',
            name='service_area',
            field=models.CharField(
                blank=True,
                help_text='Neighborhood / suburb / locality',
                max_length=150,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='customer',
            name='billing_area',
            field=models.CharField(
                blank=True,
                help_text='Neighborhood / suburb / locality',
                max_length=150,
            ),
        ),
        migrations.AlterField(
            model_name='customer',
            name='service_region',
            field=models.CharField(
                blank=True,
                help_text='Ghana administrative region',
                max_length=100,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name='customer',
            name='billing_region',
            field=models.CharField(
                blank=True,
                help_text='Ghana administrative region',
                max_length=100,
            ),
        ),
        migrations.RunPython(normalize_customer_regions, migrations.RunPython.noop),
    ]
