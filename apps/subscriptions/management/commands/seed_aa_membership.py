from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from apps.subscriptions.models import Package
from apps.accounts.management.commands._auditlog_utils import disable_auditlog


class Command(BaseCommand):
    help = "Seed AA membership packages (Basic, Plus, Premier, Platinum) with allowances."

    PACKAGES = [
        {
            "name": "AA Basic",
            "code": "AA_BASIC",
            "price": 195,
            "duration_months": 12,
            "features": {
                # Allowances / service calls
                "roadside_first_aid": 2,
                "towing_services_km": 30,  # total km coverage
                "call_out_charges": 1,
                "emergency_fuel": 1,
                "key_lock_out": 1,
                "extrication": 0,
                "accident_estimate": 1,
                "pre_purchase_inspection": 1,
                "battery_boosts": 1,
                "flat_tyre_service": 1,
                "total_service_calls": 8,
            },
        },
        {
            "name": "AA Plus",
            "code": "AA_PLUS",
            "price": 295,
            "duration_months": 12,
            "features": {
                "roadside_first_aid": 3,
                "towing_services_km": 50,
                "call_out_charges": 1,
                "emergency_fuel": 1,
                "key_lock_out": 1,
                "extrication": 0,
                "accident_estimate": 1,
                "pre_purchase_inspection": 1,
                "battery_boosts": 1,
                "flat_tyre_service": 1,
                "total_service_calls": 9,
            },
        },
        {
            "name": "AA Premier",
            "code": "AA_PREMIER",
            "price": 395,
            "duration_months": 12,
            "features": {
                "roadside_first_aid": 4,
                "towing_services_km": 70,
                "call_out_charges": 1,
                "emergency_fuel": 1,
                "key_lock_out": 1,
                "extrication": 1,
                "accident_estimate": 1,
                "pre_purchase_inspection": 2,
                "battery_boosts": 2,
                "flat_tyre_service": 2,
                "total_service_calls": 14,
            },
        },
        {
            "name": "AA Platinum",
            "code": "AA_PLATINUM",
            "price": 595,
            "duration_months": 12,
            "features": {
                "roadside_first_aid": 7,
                "towing_services_km": 100,
                "call_out_charges": 3,
                "emergency_fuel": 3,
                "key_lock_out": 3,
                "extrication": 1,
                "accident_estimate": 2,
                "pre_purchase_inspection": 3,
                "battery_boosts": 2,
                "flat_tyre_service": 3,
                "total_service_calls": 24,
            },
        },
    ]

    def handle(self, *args, **options):
        with disable_auditlog():
            self._do_seed()

    def _do_seed(self):
        User = get_user_model()
        created_by = User.objects.filter(role="admin").order_by("id").first()
        if not created_by:
            raise CommandError("No admin user found to assign as created_by for packages.")

        for pkg in self.PACKAGES:
            obj, created = Package.objects.update_or_create(
                code=pkg["code"],
                defaults={
                    "name": pkg["name"],
                    "price": pkg["price"],
                    "duration_months": pkg["duration_months"],
                    "features": pkg["features"],
                    "created_by": created_by,
                    "is_active": True,
                    "metadata": {
                        "towing_coverage_km": pkg["features"].get("towing_services_km", 0),
                        "notes": "Seeded from AA membership terms",
                    },
                },
            )
            action = "Created" if created else "Updated"
            self.stdout.write(self.style.SUCCESS(f"{action} package: {obj.name}"))
