from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0010_alter_customer_alternative_phone_and_more'),
        ('workorders', '0037_workordernote_status_note_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='workorder',
            name='brought_by_type',
            field=models.CharField(
                choices=[
                    ('account_holder', 'Account Holder'),
                    ('saved_contact', 'Saved Contact'),
                    ('third_party', 'Third Party / Driver'),
                ],
                default='account_holder',
                help_text='Who physically brought the vehicle for this work order',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='workorder',
            name='brought_by_contact',
            field=models.ForeignKey(
                blank=True,
                help_text='Saved business contact who brought the vehicle',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='work_orders_brought_in',
                to='customers.customercontact',
            ),
        ),
        migrations.AddField(
            model_name='workorder',
            name='brought_by_name',
            field=models.CharField(
                blank=True,
                help_text='Name of the person who brought the vehicle when not using the account holder directly',
                max_length=255,
            ),
        ),
        migrations.AddField(
            model_name='workorder',
            name='brought_by_phone',
            field=models.CharField(
                blank=True,
                help_text='Phone number for the person who brought the vehicle',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='workorder',
            name='brought_by_email',
            field=models.EmailField(
                blank=True,
                help_text='Email for the person who brought the vehicle',
                max_length=254,
            ),
        ),
        migrations.AddField(
            model_name='workorder',
            name='brought_by_relationship',
            field=models.CharField(
                blank=True,
                help_text='Relationship to the customer or business, e.g. Driver, Staff, Relative',
                max_length=100,
            ),
        ),
    ]
