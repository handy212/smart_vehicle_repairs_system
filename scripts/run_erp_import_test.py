#!/usr/bin/env python
"""Run a full ERP customers+vehicles import against the migration workbook."""
from __future__ import annotations

import os
import sys
import time

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from collections import Counter

from django.contrib.auth import get_user_model
from django.core.files import File
from django.db.models import Count

from apps.customers.models import Customer
from apps.data_exchange.models import ImportBatch
from apps.data_exchange.services import create_batch, run_commit, run_preview
from apps.vehicles.models import Vehicle

PATH = 'docs/migration/VEHICLES DATABASE 16_07_2026 ERPxlsx.xlsx'
LOG = '/tmp/erp_import_test.log'


def log(msg: str) -> None:
    line = f'{time.strftime("%H:%M:%S")} {msg}'
    print(line, flush=True)
    with open(LOG, 'a') as fh:
        fh.write(line + '\n')


def main() -> int:
    open(LOG, 'w').write('')
    User = get_user_model()
    admin = User.objects.filter(role__in=['admin', 'super-admin']).order_by('id').first()
    if not admin:
        log('ERROR: no admin user')
        return 1

    before_c = Customer.objects.count()
    before_v = Vehicle.objects.count()
    log(f'starting import as {admin.email}; before customers={before_c} vehicles={before_v}')

    with open(PATH, 'rb') as fh:
        batch = create_batch(
            module_key='customers_vehicles',
            upload=File(fh, name=os.path.basename(PATH)),
            user=admin,
            options={
                'generate_placeholder_vin': True,
                'default_year': 2000,
                'match_existing_customers': True,
                'decode_vin_for_missing_fields': True,
                'decode_vin_on_preview': False,
                'vin_decode_timeout_seconds': 3.0,
            },
        )
    log(f'created batch #{batch.id}')

    t0 = time.time()
    batch = run_preview(batch, for_background=True)
    log(
        f'preview done in {time.time()-t0:.1f}s status={batch.status} '
        f'customers_to_create={batch.summary.get("customers_to_create")} '
        f'vehicles_to_create={batch.summary.get("vehicles_to_create")} '
        f'pending_decode={batch.summary.get("make_model_pending_decode")} '
        f'skipped={batch.summary.get("vehicles_skipped")} failed={batch.summary.get("vehicles_failed")}'
    )
    if batch.status != ImportBatch.STATUS_PREVIEWED:
        log(f'ERROR preview failed: {batch.error_message}')
        return 2

    t1 = time.time()
    batch.status = ImportBatch.STATUS_COMMITTING
    batch.save(update_fields=['status'])
    batch = run_commit(batch, force=True, for_background=True)
    elapsed = time.time() - t1
    log(
        f'commit done in {elapsed:.1f}s status={batch.status} '
        f'customers_created={batch.summary.get("customers_created")} '
        f'vehicles_created={batch.summary.get("vehicles_created")} '
        f'vehicles_failed={batch.summary.get("vehicles_failed")} '
        f'vin_decoded_fields={batch.summary.get("vin_decoded_fields")} '
        f'error={batch.error_message!r}'
    )

    after_c = Customer.objects.count()
    after_v = Vehicle.objects.count()
    log(f'after customers={after_c} (+{after_c-before_c}) vehicles={after_v} (+{after_v-before_v})')

    # Integrity checks
    refs = batch.created_object_refs or {}
    cust_ids = refs.get('customer') or []
    veh_ids = refs.get('vehicle') or []
    orphan = Vehicle.objects.filter(id__in=veh_ids, owner_id__isnull=True).count()
    multi = (
        Vehicle.objects.filter(id__in=veh_ids)
        .values('owner_id')
        .annotate(n=Count('id'))
        .filter(n__gt=1)
        .count()
    )
    sample = list(
        Vehicle.objects.filter(id__in=veh_ids)
        .select_related('owner', 'owner__user')
        .order_by('owner_id')[:5]
        .values('license_plate', 'vin', 'make', 'model', 'owner__customer_number', 'owner__company_name')
    )
    log(f'created_refs customers={len(cust_ids)} vehicles={len(veh_ids)} multi_vehicle_owners={multi} orphans={orphan}')
    log(f'sample links: {sample}')

    phones = list(
        Customer.objects.filter(id__in=cust_ids).select_related('user').values_list('user__phone', flat=True)
    )
    phone_counts = Counter(p for p in phones if p)
    dup_phones = sum(1 for _p, c in phone_counts.items() if c > 1)
    log(f'created customers with duplicate phone values: {dup_phones}')

    ok = (
        batch.status == ImportBatch.STATUS_COMPLETED
        and batch.summary.get('customers_created', 0) > 4000
        and batch.summary.get('vehicles_created', 0) > 10000
        and orphan == 0
    )
    log('RESULT ' + ('PASS' if ok else 'FAIL'))
    return 0 if ok else 3


if __name__ == '__main__':
    raise SystemExit(main())
