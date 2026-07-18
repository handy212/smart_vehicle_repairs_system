"""
Backfill vin_decoded_data for existing vehicles via NHTSA VPIC.

Usage:
  python manage.py enrich_vehicle_vin_data --dry-run
  python manage.py enrich_vehicle_vin_data --limit 50
  python manage.py enrich_vehicle_vin_data --missing-only --force
"""
from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Q
from django.db.models.functions import Length

from apps.vehicles.models import Vehicle
from apps.vehicles.vin_decoder import VehicleVINDecoder, apply_decoded_to_vehicle


class Command(BaseCommand):
    help = 'Decode VINs and store vin_decoded_data for vehicle profile specs'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--limit', type=int, default=0, help='Max vehicles to process (0=all)')
        parser.add_argument(
            '--all',
            action='store_true',
            help='Process all vehicles with a valid VIN, even if already decoded',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Overwrite existing make/model/year/engine scalar fields',
        )

    def handle(self, *args, **options):
        qs = (
            Vehicle.objects.exclude(vin='')
            .exclude(vin__isnull=True)
            .annotate(vin_len=Length('vin'))
            .filter(vin_len=17)
            .order_by('id')
        )
        if not options['all']:
            qs = qs.filter(Q(vin_decoded_data__isnull=True) | Q(vin_decoded_data={}))
        if options['limit']:
            qs = qs[: options['limit']]

        vehicles = list(qs)
        self.stdout.write(f'Candidates: {len(vehicles)}')
        if options['dry_run']:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes'))
            return

        decoder = VehicleVINDecoder()
        timeout = float(getattr(settings, 'VIN_DECODE_TIMEOUT_SECONDS', 5))
        ok = failed = skipped = 0
        for vehicle in vehicles:
            vin = (vehicle.vin or '').upper().strip()
            if len(vin) != 17 or any(c in vin for c in 'IOQ'):
                skipped += 1
                continue
            success, data = decoder.decode_vin(vin, timeout_seconds=timeout)
            if not success or not isinstance(data, dict):
                failed += 1
                self.stdout.write(self.style.ERROR(f'{vin}: {data}'))
                continue
            apply_decoded_to_vehicle(
                vehicle, data, only_blank=not options['force'], save=True
            )
            ok += 1
            if ok % 25 == 0:
                self.stdout.write(f'  … {ok} enriched')

        self.stdout.write(self.style.SUCCESS(
            f'Done. enriched={ok} failed={failed} skipped={skipped}'
        ))
