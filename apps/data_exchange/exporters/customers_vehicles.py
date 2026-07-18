"""Export customers and vehicles in an import-compatible workbook."""
from __future__ import annotations

from typing import Any

from apps.customers.models import Customer
from apps.data_exchange.exporters.base import BaseExporter
from apps.vehicles.models import Vehicle


class CustomersVehiclesExporter(BaseExporter):
    key = 'customers_vehicles'
    label = 'Customers + Vehicles'
    description = 'Export vehicles with owner email for re-import / backup.'

    def export(self, options: dict[str, Any] | None = None) -> tuple:
        headers = [
            'vin', 'make', 'model', 'year', 'license_plate', 'owner',
            'exterior_color', 'current_mileage', 'engine_type',
            'transmission_type', 'status', 'customer_name', 'phone', 'company_name',
        ]
        rows = []
        qs = (
            Vehicle.objects.select_related('owner', 'owner__user')
            .order_by('owner_id', 'id')
        )
        for vehicle in qs.iterator(chunk_size=500):
            owner = vehicle.owner
            user = owner.user if owner else None
            rows.append([
                vehicle.vin,
                vehicle.make,
                vehicle.model,
                vehicle.year,
                vehicle.license_plate,
                user.email if user else '',
                vehicle.exterior_color,
                vehicle.current_mileage,
                vehicle.engine_type,
                vehicle.transmission_type,
                vehicle.status,
                f'{user.first_name} {user.last_name}'.strip() if user else '',
                user.phone if user else '',
                owner.company_name if owner else '',
            ])
        buffer = self._workbook_from_rows(headers, rows, 'Customers Vehicles')
        return buffer, 'customers_vehicles_export.xlsx', (
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )


class CustomersExporter(BaseExporter):
    key = 'customers'
    label = 'Customers'
    description = 'Export customers in import-compatible format.'

    def export(self, options: dict[str, Any] | None = None) -> tuple:
        headers = [
            'first_name', 'last_name', 'email', 'phone', 'company_name',
            'customer_type', 'status',
            'service_address', 'service_region', 'service_city', 'service_area',
            'billing_address', 'billing_region', 'billing_city', 'billing_area',
            'payment_terms', 'preferred_contact_method', 'customer_number',
        ]
        rows = []
        for customer in Customer.objects.select_related('user').iterator(chunk_size=500):
            user = customer.user
            rows.append([
                user.first_name,
                user.last_name,
                user.email,
                user.phone,
                customer.company_name,
                customer.customer_type,
                customer.status,
                customer.service_address or '',
                customer.service_region or '',
                customer.service_city or '',
                customer.service_area or '',
                customer.billing_address or '',
                customer.billing_region or '',
                customer.billing_city or '',
                customer.billing_area or '',
                customer.payment_terms or '',
                customer.preferred_contact_method or '',
                customer.customer_number,
            ])
        buffer = self._workbook_from_rows(headers, rows, 'Customers')
        return buffer, 'customers_export.xlsx', (
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )


class VehiclesExporter(BaseExporter):
    key = 'vehicles'
    label = 'Vehicles'
    description = 'Export vehicles with owner email for re-import.'

    def export(self, options: dict[str, Any] | None = None) -> tuple:
        headers = [
            'vin', 'make', 'model', 'year', 'license_plate', 'owner',
            'exterior_color', 'current_mileage', 'engine_type',
            'transmission_type', 'status',
        ]
        rows = []
        for vehicle in Vehicle.objects.select_related('owner__user').iterator(chunk_size=500):
            rows.append([
                vehicle.vin,
                vehicle.make,
                vehicle.model,
                vehicle.year,
                vehicle.license_plate,
                vehicle.owner.user.email if vehicle.owner_id else '',
                vehicle.exterior_color,
                vehicle.current_mileage,
                vehicle.engine_type,
                vehicle.transmission_type,
                vehicle.status,
            ])
        buffer = self._workbook_from_rows(headers, rows, 'Vehicles')
        return buffer, 'vehicles_export.xlsx', (
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
