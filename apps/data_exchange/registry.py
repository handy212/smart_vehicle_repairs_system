"""Importer/exporter registry for the centralized data exchange hub."""
from __future__ import annotations

from typing import Dict

from apps.data_exchange.exporters.base import BaseExporter
from apps.data_exchange.importers.base import BaseImporter

_IMPORTERS: Dict[str, BaseImporter] = {}
_EXPORTERS: Dict[str, BaseExporter] = {}
_LOADED = False


def register_importer(importer: BaseImporter) -> None:
    if not importer.key:
        raise ValueError('Importer key is required')
    _IMPORTERS[importer.key] = importer


def register_exporter(exporter: BaseExporter) -> None:
    if not exporter.key:
        raise ValueError('Exporter key is required')
    _EXPORTERS[exporter.key] = exporter


def get_importer(key: str) -> BaseImporter:
    autoload()
    try:
        return _IMPORTERS[key]
    except KeyError as exc:
        raise KeyError(f'Unknown import module: {key}') from exc


def get_exporter(key: str) -> BaseExporter:
    autoload()
    try:
        return _EXPORTERS[key]
    except KeyError as exc:
        raise KeyError(f'Unknown export module: {key}') from exc


def list_importers() -> list[dict]:
    autoload()
    return [
        {
            'key': importer.key,
            'label': importer.label,
            'description': importer.description,
            'supported_extensions': list(importer.supported_extensions),
            'default_options': importer.default_options(),
            'supports_export': importer.supports_export,
        }
        for importer in _IMPORTERS.values()
    ]


def list_exporters() -> list[dict]:
    autoload()
    return [
        {
            'key': exporter.key,
            'label': exporter.label,
            'description': exporter.description,
        }
        for exporter in _EXPORTERS.values()
    ]


def autoload() -> None:
    global _LOADED
    if _LOADED:
        return
    from apps.data_exchange.exporters.customers_vehicles import (
        CustomersExporter,
        CustomersVehiclesExporter,
        VehiclesExporter,
    )
    from apps.data_exchange.exporters.parts import PartsExporter
    from apps.data_exchange.exporters.staff import StaffExporter
    from apps.data_exchange.importers.customers import CustomersImporter
    from apps.data_exchange.importers.customers_vehicles import CustomersVehiclesImporter
    from apps.data_exchange.importers.parts import PartsImporter
    from apps.data_exchange.importers.staff import StaffImporter
    from apps.data_exchange.importers.vehicles import VehiclesImporter

    register_importer(CustomersVehiclesImporter())
    register_importer(CustomersImporter())
    register_importer(VehiclesImporter())
    register_importer(PartsImporter())
    register_importer(StaffImporter())

    register_exporter(CustomersVehiclesExporter())
    register_exporter(CustomersExporter())
    register_exporter(VehiclesExporter())
    register_exporter(PartsExporter())
    register_exporter(StaffExporter())
    _LOADED = True
