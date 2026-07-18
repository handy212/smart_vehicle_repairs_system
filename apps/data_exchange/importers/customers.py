"""Customers-only importer adapter (native template)."""
from __future__ import annotations

from typing import Any

from apps.data_exchange.importers.base import BaseImporter, ImportCommitResult, ImportPreviewResult
from apps.data_exchange.importers.customers_vehicles import CustomersVehiclesImporter


class CustomersImporter(BaseImporter):
    key = 'customers'
    label = 'Customers'
    description = 'Import customers from the native customer Excel template.'
    supports_export = True

    def __init__(self):
        self._delegate = CustomersVehiclesImporter()

    def default_options(self) -> dict[str, Any]:
        opts = self._delegate.default_options()
        opts['customers_only'] = True
        return opts

    def preview(self, file_obj, options: dict[str, Any] | None = None) -> ImportPreviewResult:
        # Reuse joint parser; vehicle columns may be absent — use customers native format path
        return self._delegate.preview(file_obj, options)

    def commit(self, file_obj, options: dict[str, Any] | None = None) -> ImportCommitResult:
        return self._delegate.commit(file_obj, options)

    def rollback(self, created_refs: dict[str, list[int]]) -> dict[str, Any]:
        return self._delegate.rollback(created_refs)
