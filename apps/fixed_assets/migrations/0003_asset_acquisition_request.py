# Manually authored migration for asset acquisition workflow

from decimal import Decimal

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('fixed_assets', '0002_fixedasset_assigned_to'),
    ]

    operations = [
        migrations.CreateModel(
            name='AssetAcquisitionRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('request_number', models.CharField(db_index=True, default='', editable=False, max_length=32, unique=True)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('pending_approval', 'Pending Approval'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('received', 'Received')], db_index=True, default='draft', max_length=32)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('proposed_asset_name', models.CharField(max_length=200)),
                ('expected_acquisition_cost', models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0.01'))])),
                ('salvage_value', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0.00'))])),
                ('depreciation_method', models.CharField(blank=True, choices=[('straight_line', 'Straight Line'), ('declining_balance', 'Declining Balance'), ('units_of_production', 'Units of Production'), ('none', 'No Depreciation')], help_text='Leave blank to use category default useful-life method mapping', max_length=32, null=True)),
                ('useful_life_years', models.PositiveIntegerField(blank=True, help_text='Leave blank to use category default useful life', null=True)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('rejected_at', models.DateTimeField(blank=True, null=True)),
                ('rejection_reason', models.TextField(blank=True)),
                ('received_at', models.DateTimeField(blank=True, null=True)),
                ('received_notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='asset_acquisitions_approved', to=settings.AUTH_USER_MODEL)),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='asset_acquisition_requests', to='branches.branch')),
                ('category', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='acquisition_requests', to='fixed_assets.assetcategory')),
                ('created_asset', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='source_acquisition_request', to='fixed_assets.fixedasset')),
                ('received_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='asset_acquisitions_received', to=settings.AUTH_USER_MODEL)),
                ('rejected_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='asset_acquisitions_rejected', to=settings.AUTH_USER_MODEL)),
                ('requested_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='asset_acquisition_requests_created', to=settings.AUTH_USER_MODEL)),
                ('supplier', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='asset_acquisition_requests', to='inventory.supplier')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='AssetAcquisitionApproval',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('cancelled', 'Cancelled')], db_index=True, default='pending', max_length=20)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('rejected_at', models.DateTimeField(blank=True, null=True)),
                ('rejection_reason', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('acquisition_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='approvals', to='fixed_assets.assetacquisitionrequest')),
                ('approver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='asset_acquisition_approvals', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['created_at', 'id'],
                'unique_together': {('acquisition_request', 'approver')},
            },
        ),
        migrations.AddIndex(
            model_name='assetacquisitionrequest',
            index=models.Index(fields=['status', 'branch'], name='fixed_assets_acq_req_status_branch_idx'),
        ),
        migrations.AddIndex(
            model_name='assetacquisitionrequest',
            index=models.Index(fields=['request_number'], name='fixed_assets_acq_req_number_idx'),
        ),
        migrations.AddIndex(
            model_name='assetacquisitionapproval',
            index=models.Index(fields=['acquisition_request', 'status'], name='fixed_assets_acq_appr_req_stat_idx'),
        ),
        migrations.AddIndex(
            model_name='assetacquisitionapproval',
            index=models.Index(fields=['approver', 'status'], name='fixed_assets_acq_appr_app_stat_idx'),
        ),
    ]
