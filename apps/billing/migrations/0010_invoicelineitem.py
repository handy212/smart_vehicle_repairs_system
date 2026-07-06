from django.db import migrations, models
import django.db.models.deletion
from decimal import Decimal


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0001_initial'),
        ('billing', '0009_tax_breakdown_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='InvoiceLineItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('item_type', models.CharField(choices=[('labor', 'Labor'), ('part', 'Part'), ('fee', 'Fee'), ('discount', 'Discount'), ('sublet', 'Sublet/Outsource'), ('other', 'Other')], max_length=20)),
                ('description', models.CharField(max_length=500)),
                ('notes', models.TextField(blank=True)),
                ('part_number', models.CharField(blank=True, max_length=100)),
                ('quantity', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('unit_price', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('total', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10)),
                ('labor_hours', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('labor_rate', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('is_taxable', models.BooleanField(default=True)),
                ('order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('invoice', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='line_items', to='billing.invoice')),
                ('part', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='inventory.part')),
            ],
            options={
                'ordering': ['order', 'id'],
            },
        ),
    ]


