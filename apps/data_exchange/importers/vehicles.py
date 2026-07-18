"""Vehicles-only importer adapter (native template with owner references)."""
from __future__ import annotations

from typing import Any

from apps.data_exchange.importers.base import BaseImporter, ImportCommitResult, ImportPreviewResult
from apps.data_exchange.importers.customers_vehicles import CustomersVehiclesImporter


class VehiclesImporter(BaseImporter):
    key = 'vehicles'
    label = 'Vehicles'
    description = (
        'Import vehicles from the native vehicle Excel template. '
        'Owner must already exist (email or customer ID).'
    )
    supports_export = True

    def __init__(self):
        self._delegate = CustomersVehiclesImporter()

    def default_options(self) -> dict[str, Any]:
        opts = self._delegate.default_options()
        opts['match_existing_customers'] = True
        opts['generate_placeholder_vin'] = False
        return opts

    def preview(self, file_obj, options: dict[str, Any] | None = None) -> ImportPreviewResult:
        return self._delegate.preview(file_obj, options)

    def commit(self, file_obj, options: dict[str, Any] | None = None) -> ImportCommitResult:
        return self._delegate.commit(file_obj, options)

    def rollback(self, created_refs: dict[str, list[int]]) -> dict[str, Any]:
        return self._delegate.rollback(created_refs)
