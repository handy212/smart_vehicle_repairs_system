import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0021_account_branch_settlement'),
        ('inventory', '0030_purchaseorderitem_qbo_line_id'),
        ('branches', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('billing', '0040_estimate_revenue_product'),
    ]

    operations = [
        migrations.AddField(
            model_name='billpayment',
            name='payment_batch',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                help_text='Groups multiple bill payments into one QBO BillPayment sync batch',
                max_length=64,
            ),
        ),
        migrations.CreateModel(
            name='VendorExpense',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('expense_number', models.CharField(editable=False, max_length=50, unique=True)),
                ('expense_date', models.DateField(default=django.utils.timezone.now)),
                ('payment_method', models.CharField(max_length=20)),
                ('reference_number', models.CharField(blank=True, max_length=100)),
                ('notes', models.TextField(blank=True)),
                ('status', models.CharField(default='draft', max_length=20)),
                ('subtotal', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12)),
                ('total', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'bank_account',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='vendor_expenses',
                        to='accounting.account',
                    ),
                ),
                (
                    'branch',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='vendor_expenses',
                        to='branches.branch',
                    ),
                ),
                (
                    'created_by',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='vendor_expenses_created',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    'till',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='vendor_expenses',
                        to='billing.cashiertill',
                    ),
                ),
                (
                    'vendor',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='vendor_expenses',
                        to='inventory.supplier',
                    ),
                ),
            ],
            options={
                'ordering': ['-expense_date', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='VendorExpenseLineItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('description', models.CharField(max_length=255)),
                (
                    'quantity',
                    models.DecimalField(
                        decimal_places=2,
                        default=Decimal('1'),
                        max_digits=12,
                        validators=[django.core.validators.MinValueValidator(Decimal('0.01'))],
                    ),
                ),
                (
                    'unit_price',
                    models.DecimalField(
                        decimal_places=2,
                        max_digits=12,
                        validators=[django.core.validators.MinValueValidator(Decimal('0.00'))],
                    ),
                ),
                ('total', models.DecimalField(decimal_places=2, editable=False, max_digits=12)),
                (
                    'expense_account',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='vendor_expense_lines',
                        to='accounting.account',
                    ),
                ),
                (
                    'inventory_item',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='vendor_expense_lines',
                        to='inventory.part',
                    ),
                ),
                (
                    'vendor_expense',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='line_items',
                        to='billing.vendorexpense',
                    ),
                ),
            ],
            options={
                'ordering': ['id'],
            },
        ),
        migrations.AddIndex(
            model_name='vendorexpense',
            index=models.Index(fields=['expense_number'], name='billing_ven_expense_7a1b0d_idx'),
        ),
        migrations.AddIndex(
            model_name='vendorexpense',
            index=models.Index(fields=['vendor', 'status'], name='billing_ven_vendor__8c2f1a_idx'),
        ),
        migrations.AddIndex(
            model_name='vendorexpense',
            index=models.Index(fields=['expense_date'], name='billing_ven_expense_91e4bc_idx'),
        ),
    ]
