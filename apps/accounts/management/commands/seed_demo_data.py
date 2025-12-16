"""
Seed demo users + demo data (customers, vehicles, inventory) for testing.

Creates 2 users per role (by default) and safe to re-run:
- Users are created/updated by deterministic email
- Customers/vehicles/parts are created with deterministic identifiers
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from decimal import Decimal

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.customers.models import Customer, CustomerNote
from apps.inventory.models import InventoryTransaction, Part, PartCategory, Supplier
from apps.vehicles.models import Vehicle


ALLOWED_VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"  # excludes I, O, Q


def _stable_code(seed: str, length: int, alphabet: str) -> str:
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    out = []
    for b in digest:
        out.append(alphabet[b % len(alphabet)])
        if len(out) >= length:
            break
    return "".join(out)


def _stable_vin(seed: str) -> str:
    return _stable_code(seed, 17, ALLOWED_VIN_CHARS)


def _stable_plate(seed: str) -> str:
    # Keep it simple and readable; not constrained by validator in the model.
    token = _stable_code(seed, 6, "ABCDEFGHJKLMNPRSTUVWXYZ0123456789")
    return f"DM{token}"


@dataclass(frozen=True)
class DemoUserSpec:
    role: str
    idx: int
    email: str
    username: str
    first_name: str
    last_name: str


class Command(BaseCommand):
    help = "Seed demo users (2 per role) and demo data for customers, vehicles, and inventory."

    def add_arguments(self, parser):
        parser.add_argument("--users-per-role", type=int, default=2)
        parser.add_argument("--password", type=str, default="demo12345")
        parser.add_argument("--email-domain", type=str, default="demo.local")
        parser.add_argument("--prefix", type=str, default="demo")
        parser.add_argument(
            "--skip-init-permissions",
            action="store_true",
            help="Skip running init_permissions (only seed data).",
        )

    def handle(self, *args, **options):
        users_per_role: int = options["users_per_role"]
        password: str = options["password"]
        email_domain: str = options["email_domain"]
        prefix: str = options["prefix"]
        skip_init_permissions: bool = options["skip_init_permissions"]

        if users_per_role < 1:
            self.stdout.write(self.style.WARNING("Nothing to do: --users-per-role < 1"))
            return

        roles = [
            "admin",
            "manager",
            "service_coordinator",
            "receptionist",
            "technician",
            "parts_manager",
            "accountant",
            "customer",
        ]

        with transaction.atomic():
            if not skip_init_permissions:
                # Ensures Role/Permission rows exist for permission checks.
                call_command("init_permissions")

            # 1) Users (2 per role)
            user_specs: list[DemoUserSpec] = []
            for role in roles:
                for i in range(1, users_per_role + 1):
                    email = f"{prefix}.{role}{i}@{email_domain}".lower()
                    username = f"{prefix}_{role}{i}"
                    user_specs.append(
                        DemoUserSpec(
                            role=role,
                            idx=i,
                            email=email,
                            username=username,
                            first_name=role.replace("_", " ").title(),
                            last_name=f"User{i}",
                        )
                    )

            users_by_role: dict[str, list[User]] = {r: [] for r in roles}
            created_users = 0
            updated_users = 0

            for spec in user_specs:
                defaults = {
                    "username": spec.username,
                    "role": spec.role,
                    "first_name": spec.first_name,
                    "last_name": spec.last_name,
                    "is_active": True,
                    "is_staff": spec.role != "customer",
                }

                user, created = User.objects.get_or_create(email=spec.email, defaults=defaults)
                changed = False
                for k, v in defaults.items():
                    if getattr(user, k) != v:
                        setattr(user, k, v)
                        changed = True

                # Ensure password is set (but do not rotate it if user already has one
                # unless it looks unset).
                if created or not user.password:
                    user.set_password(password)
                    changed = True

                if changed:
                    user.save()

                if spec.role == "admin":
                    # Make demo admins actual superusers for convenience.
                    if not user.is_superuser:
                        user.is_superuser = True
                        user.is_staff = True
                        user.save(update_fields=["is_superuser", "is_staff"])

                if created:
                    created_users += 1
                else:
                    updated_users += 1

                users_by_role[spec.role].append(user)

            # 2) Branches (required for staff + inventory)
            admin0 = users_by_role["admin"][0]
            hq, _ = Branch.objects.get_or_create(
                code="HQ",
                defaults={
                    "name": "Demo Headquarters",
                    "phone": "555-0100",
                    "email": f"hq@{email_domain}",
                    "address": "100 Demo Ave",
                    "city": "Demo City",
                    "state": "DC",
                    "zip_code": "00001",
                    "country": "USA",
                    "is_active": True,
                    "is_headquarters": True,
                    "created_by": admin0,
                },
            )
            west, _ = Branch.objects.get_or_create(
                code="WEST",
                defaults={
                    "name": "Demo West Branch",
                    "phone": "555-0200",
                    "email": f"west@{email_domain}",
                    "address": "200 Demo Blvd",
                    "city": "Demo City",
                    "state": "DC",
                    "zip_code": "00002",
                    "country": "USA",
                    "is_active": True,
                    "is_headquarters": False,
                    "created_by": admin0,
                },
            )

            # 3) Staff branch assignments
            # - managers: access both branches (managed_branches)
            # - other staff: alternate between HQ and WEST
            for mgr in users_by_role["manager"]:
                mgr.managed_branches.set([hq, west])

            staff_roles_single_branch = [
                "service_coordinator",
                "receptionist",
                "technician",
                "parts_manager",
                "accountant",
            ]
            for role in staff_roles_single_branch:
                for idx, user in enumerate(users_by_role[role]):
                    user.branch = hq if idx % 2 == 0 else west
                    user.save(update_fields=["branch"])

            # 4) Customers module demo data
            customers: list[Customer] = []
            created_customers = 0
            for u in users_by_role["customer"]:
                cust, created = Customer.objects.get_or_create(
                    user=u,
                    defaults={
                        "status": "active",
                        "customer_type": "individual",
                        "preferred_contact_method": "email",
                        "marketing_emails": True,
                        "marketing_sms": False,
                    },
                )
                customers.append(cust)
                if created:
                    created_customers += 1

            # Add one note per customer (idempotent on (customer, subject))
            sc0 = users_by_role["service_coordinator"][0]
            for cust in customers:
                CustomerNote.objects.get_or_create(
                    customer=cust,
                    subject="Demo customer note",
                    defaults={
                        "note_type": "general",
                        "note": "This is seeded demo data for testing.",
                        "created_by": sc0,
                        "is_important": False,
                    },
                )

            # 5) Vehicles module demo data (2 vehicles per customer)
            created_vehicles = 0
            for cust_idx, cust in enumerate(customers, start=1):
                for v_idx in range(1, 3):
                    seed = f"{prefix}:{cust.user.email}:vehicle:{v_idx}"
                    vin = _stable_vin(seed)
                    plate = _stable_plate(seed)
                    year = 2018 + ((cust_idx + v_idx) % 7)  # 2018..2024
                    make = ["Toyota", "Ford", "Honda", "Nissan", "Chevrolet"][((cust_idx + v_idx) % 5)]
                    model = ["Camry", "F-150", "Civic", "Altima", "Malibu"][((cust_idx + v_idx) % 5)]
                    mileage = 20000 + ((cust_idx * 10000) + (v_idx * 3500))

                    vehicle, created = Vehicle.objects.get_or_create(
                        vin=vin,
                        defaults={
                            "owner": cust,
                            "year": year,
                            "make": make,
                            "model": model,
                            "trim": "SE" if (v_idx % 2 == 0) else "",
                            "license_plate": plate,
                            "license_plate_state": "DC",
                            "current_mileage": mileage,
                            "mileage_unit": "miles",
                            "engine_type": "gasoline",
                            "transmission_type": "automatic",
                            "status": "active",
                            "notes": "Seeded demo vehicle",
                        },
                    )
                    # Keep ownership correct if re-run.
                    if vehicle.owner_id != cust.id:
                        vehicle.owner = cust
                        vehicle.save(update_fields=["owner"])
                    if created:
                        created_vehicles += 1

            # 6) Inventory module demo data
            pm0 = users_by_role["parts_manager"][0]
            categories = {}
            for name, desc in [
                ("Engine", "Engine components"),
                ("Brakes", "Brake system components"),
                ("Electrical", "Electrical components"),
            ]:
                cat, _ = PartCategory.objects.get_or_create(name=name, defaults={"description": desc, "is_active": True})
                categories[name] = cat

            supplier, _ = Supplier.objects.get_or_create(
                supplier_code="DEMO-SUP-001",
                defaults={
                    "name": "Demo Parts Supplier",
                    "supplier_type": "distributor",
                    "email": f"parts@supplier.{email_domain}",
                    "phone": "555-0300",
                    "is_active": True,
                    "is_preferred": True,
                    "created_by": pm0,
                },
            )

            parts_seed = [
                ("DEMO-ENG-001", "Oil Filter", "Engine", Decimal("6.50"), Decimal("12.99"), hq),
                ("DEMO-ENG-002", "Air Filter", "Engine", Decimal("9.25"), Decimal("18.99"), hq),
                ("DEMO-BRK-001", "Brake Pads (Front)", "Brakes", Decimal("24.00"), Decimal("49.99"), west),
                ("DEMO-ELC-001", "Battery 12V", "Electrical", Decimal("79.00"), Decimal("129.99"), west),
            ]

            created_parts = 0
            created_tx = 0
            for part_number, name, cat_name, cost, sell, branch in parts_seed:
                part, created = Part.objects.get_or_create(
                    part_number=part_number,
                    defaults={
                        "name": name,
                        "description": f"Seeded demo part: {name}",
                        "category": categories[cat_name],
                        "branch": branch,
                        "manufacturer": "DemoCo",
                        "quantity_in_stock": 0,
                        "quantity_reserved": 0,
                        "quantity_on_order": 0,
                        "reorder_point": 10,
                        "reorder_quantity": 20,
                        "minimum_stock": 5,
                        "unit": "piece",
                        "cost_price": cost,
                        "selling_price": sell,
                        "markup_percentage": Decimal("0.00"),
                        "bin_location": "A1",
                        "shelf": "1",
                        "is_active": True,
                        "is_taxable": True,
                        "is_core": False,
                        "core_charge": Decimal("0.00"),
                        "created_by": pm0,
                    },
                )
                if created:
                    created_parts += 1

                # Ensure supplier relationship exists (idempotent).
                part.suppliers.add(supplier)
                if part.preferred_supplier_id != supplier.id:
                    part.preferred_supplier = supplier
                    part.save(update_fields=["preferred_supplier"])

                # Seed a purchase transaction once per part (idempotent by (part, type, reason)).
                if not InventoryTransaction.objects.filter(
                    part=part, transaction_type="purchase", reason="Seed initial stock"
                ).exists():
                    InventoryTransaction.objects.create(
                        part=part,
                        transaction_type="purchase",
                        quantity=50,
                        unit_cost=part.cost_price,
                        reason="Seed initial stock",
                        notes="Seeded demo inventory transaction",
                        created_by=pm0,
                        transaction_date=timezone.now(),
                    )
                    created_tx += 1

            self.stdout.write(self.style.SUCCESS("✅ Demo seeding complete"))
            self.stdout.write(f"- Users: {created_users} created, {updated_users} existing/updated")
            self.stdout.write(f"- Customers: {created_customers} created (profiles)")
            self.stdout.write(f"- Vehicles: {created_vehicles} created")
            self.stdout.write(f"- Inventory: {created_parts} parts created, {created_tx} stock transactions created")


