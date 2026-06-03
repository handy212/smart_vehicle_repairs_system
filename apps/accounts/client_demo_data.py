from __future__ import annotations

import hashlib
import io
from dataclasses import asdict, dataclass, field
from datetime import date, time, timedelta
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.management import call_command
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import User


DEMO_MARKER = "[CLIENT_DEMO_DATA]"
DEMO_PREFIX = "CLIENT-DEMO"
DEMO_EMAIL_DOMAIN = "demo.local"

MODULES = [
    "customers",
    "vehicles",
    "technicians",
    "appointments",
    "workorders",
    "inspections",
    "diagnosis",
    "gatepass",
    "inventory",
    "billing",
    "accounting",
    "hr",
    "fixed_assets",
    "roadside",
    "subscriptions",
    "documents",
    "feedback",
    "chat",
]

PURGE_ORDER = [
    "chat",
    "documents",
    "gatepass",
    "billing",
    "accounting",
    "diagnosis",
    "inspections",
    "roadside",
    "subscriptions",
    "appointments",
    "workorders",
    "fixed_assets",
    "inventory",
    "technicians",
    "hr",
    "vehicles",
    "feedback",
    "customers",
]

ALLOWED_VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"

CUSTOMER_NAMES = [
    ("Kwame", "Mensah"),
    ("Ama", "Owusu"),
    ("Kofi", "Boateng"),
    ("Abena", "Asante"),
    ("Yaw", "Osei"),
    ("Akua", "Frimpong"),
    ("Kojo", "Agyeman"),
    ("Efua", "Adjei"),
    ("Nana", "Darko"),
    ("Esi", "Amoah"),
    ("John", "Carter"),
    ("Maria", "Gonzalez"),
    ("Aisha", "Johnson"),
    ("Daniel", "Brooks"),
    ("Priya", "Patel"),
    ("Grace", "Wilson"),
]

STAFF_NAMES = {
    "admin": ("Clara", "Bennett"),
    "manager": ("Michael", "Thompson"),
    "service_coordinator": ("Sarah", "Okafor"),
    "receptionist": ("Emily", "Reed"),
    "parts_manager": ("Victor", "Mensah"),
    "accountant": ("Linda", "Harris"),
}

TECHNICIAN_NAMES = [
    ("Samuel", "Addo"),
    ("Joseph", "Owusu"),
    ("Miriam", "Clark"),
    ("Peter", "Acheampong"),
    ("Hannah", "Stone"),
    ("Felix", "Arthur"),
    ("Diana", "Morrison"),
    ("Isaac", "Bediako"),
    ("Rachel", "Foster"),
    ("George", "Nkrumah"),
]

STREETS = [
    "Oxford Street",
    "Independence Avenue",
    "Ring Road Central",
    "Cantonments Road",
    "Spintex Road",
    "Liberation Road",
    "High Street",
    "Market Lane",
]

PART_NAMES = [
    "Oil Filter",
    "Brake Pad Set",
    "Air Filter",
    "Spark Plug Set",
    "Alternator",
    "Starter Motor",
    "Battery",
    "Radiator Hose",
    "Cabin Filter",
    "Fuel Pump",
]

ASSET_NAMES = [
    "Two-Post Vehicle Lift",
    "Wheel Balancer",
    "Diagnostic Scanner",
    "Air Compressor",
    "Hydraulic Jack",
    "Alignment Rack",
    "Parts Shelving Unit",
    "Workshop Laptop",
]

DOCUMENT_TITLES = [
    "Vehicle Intake Checklist",
    "Customer Authorization Form",
    "Inspection Summary",
    "Parts Warranty Record",
    "Repair Completion Note",
    "Fleet Service Agreement",
]


@dataclass
class ModuleSummary:
    module: str
    target: int = 0
    created: int = 0
    existing: int = 0
    purged: int = 0
    skipped: int = 0
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


def _stable_code(seed: str, length: int, alphabet: str) -> str:
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    out = []
    while len(out) < length:
        for b in digest:
            out.append(alphabet[b % len(alphabet)])
            if len(out) >= length:
                break
        digest = hashlib.sha256(digest).digest()
    return "".join(out)


def _vin(i: int) -> str:
    return _stable_code(f"{DEMO_PREFIX}:VIN:{i}", 17, ALLOWED_VIN_CHARS)


def _phone(i: int) -> str:
    return f"+1555{i:07d}"[:20]


def _money(i: int, base: int = 100) -> Decimal:
    return Decimal(base + (i % 75) * 10).quantize(Decimal("0.01"))


def _limit_count(count: int) -> int:
    return max(1, min(int(count), 1000))


class ClientDemoDataService:
    def __init__(self, *, count: int = 100, user: User | None = None):
        self.count = _limit_count(count)
        self.user = user
        self.now = timezone.now()
        self.today = timezone.localdate()
        self.summaries: dict[str, ModuleSummary] = {}

    def load(self, modules: list[str] | None = None) -> dict:
        modules = self._normalize_modules(modules)
        self._ensure_foundation()
        for module in modules:
            summary = ModuleSummary(module=module, target=self.count)
            self.summaries[module] = summary
            try:
                getattr(self, f"_load_{module}")(summary)
            except Exception as exc:  # pragma: no cover - summarized for API callers
                summary.errors.append(str(exc))
        return self._response("loaded", modules)

    def purge(self, modules: list[str] | None = None, *, permanent: bool = False) -> dict:
        modules = self._normalize_modules(modules)
        ordered_modules = [m for m in PURGE_ORDER if m in modules]
        for module in ordered_modules:
            summary = ModuleSummary(module=module)
            self.summaries[module] = summary
            try:
                if permanent:
                    self._permanent_purge_module(module, summary)
                else:
                    getattr(self, f"_purge_{module}")(summary)
            except Exception as exc:  # pragma: no cover - summarized for API callers
                summary.errors.append(str(exc))
        response = self._response("purged", ordered_modules)
        response["scope"] = "permanent" if permanent else "demo"
        return response

    def status(self, modules: list[str] | None = None) -> dict:
        modules = self._normalize_modules(modules)
        data = []
        for module in modules:
            summary = ModuleSummary(module=module, target=self.count)
            counter = getattr(self, f"_count_{module}", None)
            if counter:
                summary.existing = counter()
            data.append(summary.as_dict())
        return {"action": "status", "marker": DEMO_MARKER, "modules": data}

    def _response(self, action: str, modules: list[str]) -> dict:
        return {
            "action": action,
            "marker": DEMO_MARKER,
            "modules": [self.summaries[m].as_dict() for m in modules if m in self.summaries],
        }

    def _normalize_modules(self, modules: list[str] | None) -> list[str]:
        if not modules:
            return list(MODULES)
        normalized = []
        for module in modules:
            slug = str(module).strip().lower().replace("-", "_")
            if slug in MODULES and slug not in normalized:
                normalized.append(slug)
        return normalized or list(MODULES)

    def _delete_queryset(self, summary: ModuleSummary, queryset, *, label: str | None = None) -> None:
        count = queryset.count()
        if count:
            queryset.delete()
            summary.purged += count
            if label:
                summary.warnings.append(f"Deleted {count} {label} records.")

    def _permanent_purge_module(self, module: str, summary: ModuleSummary) -> None:
        """Delete real data for a module. System config/permissions/settings are preserved."""
        if module == "chat":
            from apps.chat.models import Conversation

            self._delete_queryset(summary, Conversation.objects.all(), label="chat")
            return

        if module == "documents":
            from apps.documents.models import Document

            self._delete_queryset(summary, Document.objects.all(), label="document")
            return

        if module == "gatepass":
            from apps.gatepass.models import GatePass

            self._delete_queryset(summary, GatePass.objects.all(), label="gate pass")
            return

        if module == "billing":
            from apps.billing.models import (
                Bill,
                BillPayment,
                CreditNote,
                Estimate,
                Invoice,
                Payment,
                Refund,
            )

            for model, label in [
                (Refund, "refund"),
                (BillPayment, "bill payment"),
                (Payment, "payment"),
                (CreditNote, "credit note"),
                (Bill, "bill"),
                (Invoice, "invoice"),
                (Estimate, "estimate"),
            ]:
                self._delete_queryset(summary, model.objects.all(), label=label)
            return

        if module == "accounting":
            from apps.accounting.models import Accrual, BankStatement, Budget, FundTransfer, JournalEntry

            for model, label in [
                (Accrual, "accrual"),
                (FundTransfer, "fund transfer"),
                (BankStatement, "bank statement"),
                (Budget, "budget"),
                (JournalEntry, "journal entry"),
            ]:
                self._delete_queryset(summary, model.objects.all(), label=label)
            return

        if module == "diagnosis":
            from apps.diagnosis.models import Diagnosis

            self._delete_queryset(summary, Diagnosis.objects.all(), label="diagnosis")
            return

        if module == "inspections":
            from apps.inspections.models import VehicleInspection

            self._delete_queryset(summary, VehicleInspection.objects.all(), label="inspection")
            return

        if module == "roadside":
            from apps.roadside.models import RoadsideRequest

            self._delete_queryset(summary, RoadsideRequest.objects.all(), label="roadside request")
            return

        if module == "subscriptions":
            from apps.subscriptions.models import Subscription, SubscriptionUsage

            self._delete_queryset(summary, SubscriptionUsage.objects.all(), label="subscription usage")
            self._delete_queryset(summary, Subscription.objects.all(), label="subscription")
            return

        if module == "appointments":
            from apps.appointments.models import Appointment, AppointmentReminder

            self._delete_queryset(summary, AppointmentReminder.objects.all(), label="appointment reminder")
            self._delete_queryset(summary, Appointment.objects.all(), label="appointment")
            return

        if module == "workorders":
            from apps.workorders.models import WorkOrder

            self._delete_queryset(summary, WorkOrder.objects.all(), label="work order")
            return

        if module == "fixed_assets":
            from apps.fixed_assets.models import AssetAcquisitionRequest, AssetMaintenance, FixedAsset

            self._delete_queryset(summary, AssetMaintenance.objects.all(), label="asset maintenance")
            self._delete_queryset(summary, AssetAcquisitionRequest.objects.all(), label="asset acquisition request")
            self._delete_queryset(summary, FixedAsset.objects.all(), label="fixed asset")
            return

        if module == "inventory":
            from apps.inventory.models import InventoryTransaction, Part, PurchaseOrder, StockAlert, Transfer

            for model, label in [
                (StockAlert, "stock alert"),
                (InventoryTransaction, "inventory transaction"),
                (Transfer, "transfer"),
                (PurchaseOrder, "purchase order"),
                (Part, "part"),
            ]:
                self._delete_queryset(summary, model.objects.all(), label=label)
            return

        if module == "technicians":
            from apps.technicians.models import Certification, Shift, Technician, TimeOffRequest

            self._delete_queryset(summary, Certification.objects.all(), label="certification")
            self._delete_queryset(summary, Shift.objects.all(), label="shift")
            self._delete_queryset(summary, TimeOffRequest.objects.all(), label="time off request")
            self._delete_queryset(summary, Technician.objects.all(), label="technician profile")
            return

        if module == "hr":
            from apps.hr.models import (
                Applicant,
                Attendance,
                ComplianceDocument,
                EmployeeProfile,
                EmployeeSalaryComponent,
                EmployeeTraining,
                Interview,
                JobOpening,
                LeaveBalance,
                LeaveRequest,
                PaySlip,
                PayrollPeriod,
                PerformanceReview,
            )

            for model, label in [
                (ComplianceDocument, "compliance document"),
                (EmployeeTraining, "employee training"),
                (PerformanceReview, "performance review"),
                (Interview, "interview"),
                (Applicant, "applicant"),
                (JobOpening, "job opening"),
                (PaySlip, "payslip"),
                (PayrollPeriod, "payroll period"),
                (EmployeeSalaryComponent, "employee salary component"),
                (Attendance, "attendance"),
                (LeaveRequest, "leave request"),
                (LeaveBalance, "leave balance"),
                (EmployeeProfile, "employee profile"),
            ]:
                self._delete_queryset(summary, model.objects.all(), label=label)
            return

        if module == "vehicles":
            self._permanent_purge_dependents(summary, exclude={"vehicles", "customers"})
            from apps.vehicles.models import Vehicle

            self._delete_queryset(summary, Vehicle.objects.all(), label="vehicle")
            return

        if module == "feedback":
            from apps.feedback.models import Feedback

            self._delete_queryset(summary, Feedback.objects.all(), label="feedback")
            return

        if module == "customers":
            self._permanent_purge_dependents(summary, exclude={"customers"})
            from apps.customers.models import Customer

            customer_users = User.objects.filter(role="customer")
            self._delete_queryset(summary, Customer.objects.all(), label="customer profile")
            self._delete_queryset(summary, customer_users, label="customer user")
            return

        summary.skipped += 1
        summary.warnings.append(f"No permanent cleanup handler for {module}.")

    def _permanent_purge_dependents(self, summary: ModuleSummary, *, exclude: set[str] | None = None) -> None:
        exclude = exclude or set()
        for module in PURGE_ORDER:
            if module in exclude:
                continue
            child = ModuleSummary(module=module)
            self._permanent_purge_module(module, child)
            if child.purged:
                summary.purged += child.purged
                summary.warnings.append(f"Deleted {child.purged} dependent {module} records first.")

    def _admin(self) -> User:
        user = self.user if self.user and self.user.is_authenticated else None
        if user:
            return user
        admin = User.objects.filter(Q(role="admin") | Q(is_superuser=True)).first()
        if admin:
            return admin
        admin = User.objects.create_user(
            username="client_demo_admin",
            email=f"client.demo.admin@{DEMO_EMAIL_DOMAIN}",
            password="demo12345",
            first_name="Clara",
            last_name="Bennett",
            role="admin",
            is_staff=True,
            is_superuser=True,
        )
        return admin

    def _branch(self):
        from apps.branches.models import Branch

        branch, _ = Branch.objects.get_or_create(
            code="CD-HQ",
            defaults={
                "name": "North Ridge Auto Service",
                "phone": "+15550000000",
                "email": f"client.demo.branch@{DEMO_EMAIL_DOMAIN}",
                "address": "100 Independence Avenue",
                "city": "Accra",
                "state": "DC",
                "zip_code": "00001",
                "country": "USA",
                "is_active": True,
                "is_headquarters": True,
                "created_by": self._admin(),
            },
        )
        return branch

    def _ensure_foundation(self) -> None:
        quiet = io.StringIO()
        from apps.accounts.admin_models import SystemModule
        from apps.accounts.permission_models import Permission, Role

        if not Permission.objects.exists() or not Role.objects.exists():
            call_command("init_permissions", verbosity=0, stdout=quiet)
        if not SystemModule.objects.exists():
            call_command("seed_modules", verbosity=0, stdout=quiet)
        self._branch()
        self._ensure_staff_users()
        self._ensure_customers(self.count)
        self._ensure_vehicles(self.count)

    def _ensure_staff_users(self) -> list[User]:
        users = []
        branch = self._branch()
        roles = ["admin", "manager", "service_coordinator", "receptionist", "parts_manager", "accountant"]
        for idx, role in enumerate(roles, start=1):
            email = f"client.demo.{role}@{DEMO_EMAIL_DOMAIN}"
            first_name, last_name = STAFF_NAMES[role]
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "username": f"client_demo_{role}",
                    "first_name": first_name,
                    "last_name": last_name,
                    "role": role,
                    "is_staff": True,
                    "is_active": True,
                    "branch": branch,
                    "phone": _phone(idx),
                },
            )
            if created:
                user.set_password("demo12345")
                user.save()
            else:
                updates = []
                if user.first_name != first_name:
                    user.first_name = first_name
                    updates.append("first_name")
                if user.last_name != last_name:
                    user.last_name = last_name
                    updates.append("last_name")
                if user.branch_id != branch.id:
                    user.branch = branch
                    updates.append("branch")
                if updates:
                    user.save(update_fields=updates)
            if user.branch_id != branch.id:
                user.branch = branch
                user.save(update_fields=["branch"])
            users.append(user)
        return users

    def _ensure_technician_users(self, total: int | None = None) -> list[User]:
        total = total or self.count
        branch = self._branch()
        users = []
        for i in range(1, total + 1):
            email = f"client.demo.technician{i:03d}@{DEMO_EMAIL_DOMAIN}"
            first_name, last_name = TECHNICIAN_NAMES[(i - 1) % len(TECHNICIAN_NAMES)]
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "username": f"client_demo_technician{i:03d}",
                    "first_name": first_name,
                    "last_name": last_name,
                    "role": "technician",
                    "is_staff": True,
                    "is_active": True,
                    "branch": branch,
                    "phone": _phone(2000 + i),
                },
            )
            if created:
                user.set_password("demo12345")
                user.save()
            else:
                updates = []
                if user.first_name != first_name:
                    user.first_name = first_name
                    updates.append("first_name")
                if user.last_name != last_name:
                    user.last_name = last_name
                    updates.append("last_name")
                if updates:
                    user.save(update_fields=updates)
            users.append(user)
        return users

    def _ensure_customers(self, total: int | None = None):
        from apps.customers.models import Customer

        total = total or self.count
        customers = []
        for i in range(1, total + 1):
            email = f"client.demo.customer{i:03d}@{DEMO_EMAIL_DOMAIN}"
            first_name, last_name = CUSTOMER_NAMES[(i - 1) % len(CUSTOMER_NAMES)]
            street = STREETS[(i - 1) % len(STREETS)]
            user, user_created = User.objects.get_or_create(
                email=email,
                defaults={
                    "username": f"client_demo_customer{i:03d}",
                    "first_name": first_name,
                    "last_name": last_name,
                    "role": "customer",
                    "is_active": True,
                    "phone": _phone(1000 + i),
                    "address": f"{100 + i} {street}",
                    "city": "Accra",
                    "state": "DC",
                    "zip_code": "00001",
                    "country": "USA",
                },
            )
            if user_created:
                user.set_password("demo12345")
                user.save()
            else:
                updates = []
                expected = {
                    "first_name": first_name,
                    "last_name": last_name,
                    "address": f"{100 + i} {street}",
                    "city": "Accra",
                }
                for field_name, value in expected.items():
                    if getattr(user, field_name) != value:
                        setattr(user, field_name, value)
                        updates.append(field_name)
                if updates:
                    user.save(update_fields=updates)
            customer, _ = Customer.objects.get_or_create(
                user=user,
                defaults={
                    "customer_number": f"CD-CUST-{i:04d}",
                    "customer_type": "individual",
                    "status": "active",
                    "preferred_contact_method": "email",
                    "marketing_emails": True,
                    "marketing_sms": False,
                    "notes": f"{DEMO_MARKER} Customer profile for service testing.",
                },
            )
            customers.append(customer)
        return customers

    def _ensure_vehicles(self, total: int | None = None):
        from apps.vehicles.models import Vehicle

        total = total or self.count
        customers = self._ensure_customers(total)
        vehicles = []
        makes = [("Toyota", "Camry"), ("Honda", "Civic"), ("Ford", "F-150"), ("Nissan", "Altima"), ("Chevrolet", "Malibu")]
        for i in range(1, total + 1):
            make, model = makes[(i - 1) % len(makes)]
            vehicle, _ = Vehicle.objects.get_or_create(
                vin=_vin(i),
                defaults={
                    "owner": customers[i - 1],
                    "year": 2018 + (i % 8),
                    "make": make,
                    "model": model,
                    "trim": ["SE", "LX", "Touring", "Sport"][i % 4],
                    "vehicle_type": "saloon",
                    "exterior_color": ["White", "Blue", "Silver", "Black"][i % 4],
                    "license_plate": f"CD{i:06d}"[:20],
                    "license_plate_state": "DC",
                    "current_mileage": 15000 + i * 321,
                    "mileage_unit": "miles",
                    "engine_type": "gasoline",
                    "transmission_type": "automatic",
                    "status": "active",
                    "notes": f"{DEMO_MARKER} Vehicle available for service workflow testing.",
                },
            )
            vehicles.append(vehicle)
        return vehicles

    def _load_customers(self, s: ModuleSummary) -> None:
        before = self._count_customers()
        self._ensure_customers(self.count)
        after = self._count_customers()
        s.existing = before
        s.created = max(0, after - before)

    def _count_customers(self) -> int:
        from apps.customers.models import Customer

        return Customer.objects.filter(user__email__startswith="client.demo.customer", user__email__endswith=f"@{DEMO_EMAIL_DOMAIN}").count()

    def _purge_customers(self, s: ModuleSummary) -> None:
        self._purge_demo_dependents(s, exclude={"customers", "vehicles", "technicians", "hr"})
        self._purge_vehicles(ModuleSummary(module="vehicles"))
        qs = User.objects.filter(email__startswith="client.demo.customer", email__endswith=f"@{DEMO_EMAIL_DOMAIN}")
        s.purged = qs.count()
        qs.delete()

    def _load_vehicles(self, s: ModuleSummary) -> None:
        before = self._count_vehicles()
        self._ensure_vehicles(self.count)
        after = self._count_vehicles()
        s.existing = before
        s.created = max(0, after - before)

    def _count_vehicles(self) -> int:
        from apps.vehicles.models import Vehicle

        return Vehicle.objects.filter(notes__contains=DEMO_MARKER).count()

    def _purge_vehicles(self, s: ModuleSummary) -> None:
        from apps.vehicles.models import Vehicle

        self._purge_demo_dependents(s, exclude={"customers", "vehicles", "technicians", "hr"})
        qs = Vehicle.objects.filter(notes__contains=DEMO_MARKER)
        s.purged = qs.count()
        qs.delete()

    def _purge_demo_dependents(self, s: ModuleSummary, *, exclude: set[str] | None = None) -> None:
        exclude = exclude or set()
        for module in PURGE_ORDER:
            if module in exclude:
                continue
            purger = getattr(self, f"_purge_{module}", None)
            if not purger:
                continue
            child_summary = ModuleSummary(module=module)
            purger(child_summary)
            if child_summary.purged:
                s.warnings.append(f"Purged {child_summary.purged} dependent demo {module} records first.")

    def _load_technicians(self, s: ModuleSummary) -> None:
        from apps.technicians.models import Skill, Technician

        before = self._count_technicians()
        skill, _ = Skill.objects.get_or_create(name=f"{DEMO_PREFIX} Diagnostics", defaults={"description": DEMO_MARKER})
        for user in self._ensure_technician_users(self.count):
            tech, created = Technician.objects.get_or_create(
                user=user,
                defaults={
                    "bio": f"{DEMO_MARKER} Experienced automotive technician assigned to service and repair workflows.",
                    "years_of_experience": 1 + (user.id % 12),
                    "current_status": "available",
                    "last_location_update": self.now,
                },
            )
            tech.skills.add(skill)
            if created:
                s.created += 1
        s.existing = before

    def _count_technicians(self) -> int:
        from apps.technicians.models import Technician

        return Technician.objects.filter(user__email__startswith="client.demo.technician").count()

    def _purge_technicians(self, s: ModuleSummary) -> None:
        qs = User.objects.filter(email__startswith="client.demo.technician", email__endswith=f"@{DEMO_EMAIL_DOMAIN}")
        s.purged = qs.count()
        qs.delete()

    def _load_appointments(self, s: ModuleSummary) -> None:
        from apps.appointments.models import Appointment, ServiceBay

        branch = self._branch()
        customers = self._ensure_customers(self.count)
        vehicles = self._ensure_vehicles(self.count)
        techs = self._ensure_technician_users(self.count)
        bay, _ = ServiceBay.objects.get_or_create(
            name=f"{DEMO_PREFIX} Bay",
            defaults={"bay_type": "general", "equipment_available": DEMO_MARKER, "is_active": True},
        )
        before = self._count_appointments()
        for i in range(1, self.count + 1):
            appt, created = Appointment.objects.get_or_create(
                appointment_number=f"CDA{i:06d}",
                defaults={
                    "branch": branch,
                    "customer": customers[i - 1],
                    "vehicle": vehicles[i - 1],
                    "appointment_date": self.today + timedelta(days=i % 30),
                    "appointment_time": time(8 + (i % 8), 0),
                    "estimated_duration": 60 + (i % 4) * 30,
                    "service_type": "maintenance",
                    "priority": ["low", "normal", "high"][i % 3],
                    "service_bay": bay if i % 8 == 0 else None,
                    "status": ["pending", "confirmed", "completed"][i % 3],
                    "customer_concerns": f"{DEMO_MARKER} Customer reports intermittent engine noise and requests routine service.",
                    "special_instructions": f"{DEMO_MARKER} Confirm pickup time with customer before closing job.",
                    "estimated_cost": _money(i, 120),
                    "created_by": self._admin(),
                },
            )
            appt.assigned_technicians.add(techs[i - 1])
            if created:
                s.created += 1
        s.existing = before

    def _count_appointments(self) -> int:
        from apps.appointments.models import Appointment

        return Appointment.objects.filter(customer_concerns__contains=DEMO_MARKER).count()

    def _purge_appointments(self, s: ModuleSummary) -> None:
        from apps.appointments.models import Appointment

        qs = Appointment.objects.filter(customer_concerns__contains=DEMO_MARKER)
        s.purged = qs.count()
        qs.delete()

    def _load_workorders(self, s: ModuleSummary) -> None:
        from apps.workorders.models import WorkOrder

        branch = self._branch()
        customers = self._ensure_customers(self.count)
        vehicles = self._ensure_vehicles(self.count)
        techs = self._ensure_technician_users(self.count)
        coordinator = User.objects.filter(email=f"client.demo.service_coordinator@{DEMO_EMAIL_DOMAIN}").first()
        before = self._count_workorders()
        statuses = ["draft", "assigned", "diagnosis", "approved", "in_progress", "completed", "closed"]
        for i in range(1, self.count + 1):
            wo, created = WorkOrder.objects.get_or_create(
                work_order_number=f"CDW{i:06d}",
                defaults={
                    "branch": branch,
                    "customer": customers[i - 1],
                    "vehicle": vehicles[i - 1],
                    "status": statuses[i % len(statuses)],
                    "priority": ["low", "normal", "high", "urgent"][i % 4],
                    "service_coordinator": coordinator,
                    "primary_technician": techs[i - 1],
                    "customer_concerns": f"{DEMO_MARKER} Check engine light, brake vibration, and scheduled maintenance request.",
                    "special_instructions": f"{DEMO_MARKER} Customer prefers email updates and afternoon pickup.",
                    "diagnosis_notes": f"{DEMO_MARKER} Initial scan and road test completed; service recommendations recorded.",
                    "odometer_in": 15000 + i * 321,
                    "created_by": self._admin(),
                    "estimated_labor_hours": Decimal("2.00"),
                    "estimated_labor_cost": _money(i, 180),
                    "estimated_parts_cost": _money(i, 80),
                    "actual_labor_hours": Decimal("1.50"),
                    "actual_labor_cost": _money(i, 150),
                    "actual_parts_cost": _money(i, 60),
                },
            )
            wo.assigned_technicians.add(techs[i - 1])
            if created:
                s.created += 1
        s.existing = before

    def _count_workorders(self) -> int:
        from apps.workorders.models import WorkOrder

        return WorkOrder.objects.filter(customer_concerns__contains=DEMO_MARKER).count()

    def _purge_workorders(self, s: ModuleSummary) -> None:
        from apps.workorders.models import WorkOrder

        qs = WorkOrder.objects.filter(customer_concerns__contains=DEMO_MARKER)
        s.purged = qs.count()
        qs.delete()

    def _inspection_template(self):
        from apps.inspections.models import InspectionCategory, InspectionItem, InspectionTemplate

        template, _ = InspectionTemplate.objects.get_or_create(
            name=f"{DEMO_PREFIX} Multipoint Inspection",
            defaults={"description": DEMO_MARKER, "is_active": True, "created_by": self._admin()},
        )
        category, _ = InspectionCategory.objects.get_or_create(
            template=template,
            name=f"{DEMO_PREFIX} Safety",
            defaults={"description": DEMO_MARKER, "order": 1},
        )
        InspectionItem.objects.get_or_create(category=category, name="Brakes", defaults={"order": 1, "is_critical": True})
        return template

    def _load_inspections(self, s: ModuleSummary) -> None:
        from apps.inspections.models import VehicleInspection

        branch = self._branch()
        template = self._inspection_template()
        vehicles = self._ensure_vehicles(self.count)
        techs = self._ensure_technician_users(self.count)
        before = self._count_inspections()
        for i in range(1, self.count + 1):
            _, created = VehicleInspection.objects.get_or_create(
                inspection_number=f"CDI{i:06d}",
                defaults={
                    "branch": branch,
                    "vehicle": vehicles[i - 1],
                    "template": template,
                    "performed_by": techs[i - 1],
                    "status": "completed",
                    "overall_result": ["pass", "pass_with_advisory", "needs_attention"][i % 3],
                    "odometer_reading": 15000 + i * 321,
                    "notes": f"{DEMO_MARKER} Multipoint inspection completed for customer review.",
                    "recommendations": f"{DEMO_MARKER} Replace worn brake pads and schedule next oil service.",
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_inspections(self) -> int:
        from apps.inspections.models import VehicleInspection

        return VehicleInspection.objects.filter(notes__contains=DEMO_MARKER).count()

    def _purge_inspections(self, s: ModuleSummary) -> None:
        from apps.inspections.models import VehicleInspection

        qs = VehicleInspection.objects.filter(notes__contains=DEMO_MARKER)
        s.purged = qs.count()
        qs.delete()

    def _load_diagnosis(self, s: ModuleSummary) -> None:
        from apps.diagnosis.models import Diagnosis
        from apps.workorders.models import WorkOrder

        self._load_workorders(ModuleSummary(module="workorders", target=self.count))
        workorders = list(WorkOrder.objects.filter(customer_concerns__contains=DEMO_MARKER).order_by("id")[: self.count])
        before = self._count_diagnosis()
        for i, wo in enumerate(workorders, start=1):
            _, created = Diagnosis.objects.get_or_create(
                work_order=wo,
                defaults={
                    "customer_complaint": f"{DEMO_MARKER} Vehicle loses power under acceleration and idles roughly.",
                    "status": "completed",
                    "technician": wo.primary_technician,
                    "started_at": self.now - timedelta(days=i % 10),
                    "completed_at": self.now,
                    "initial_observations": f"{DEMO_MARKER} Technician observed rough idle after warm start.",
                    "diagnostic_notes": f"{DEMO_MARKER} Scan results and visual checks indicate ignition and air intake service required.",
                    "root_cause": f"{DEMO_MARKER} Worn ignition components and restricted air filter.",
                    "is_completed": True,
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_diagnosis(self) -> int:
        from apps.diagnosis.models import Diagnosis

        return Diagnosis.objects.filter(customer_complaint__contains=DEMO_MARKER).count()

    def _purge_diagnosis(self, s: ModuleSummary) -> None:
        from apps.diagnosis.models import Diagnosis

        qs = Diagnosis.objects.filter(customer_complaint__contains=DEMO_MARKER)
        s.purged = qs.count()
        qs.delete()

    def _load_gatepass(self, s: ModuleSummary) -> None:
        from apps.gatepass.models import GatePass
        from apps.workorders.models import WorkOrder

        self._load_workorders(ModuleSummary(module="workorders", target=self.count))
        workorders = list(WorkOrder.objects.filter(customer_concerns__contains=DEMO_MARKER).order_by("id")[: self.count])
        before = self._count_gatepass()
        for i, wo in enumerate(workorders, start=1):
            if wo.status != "closed":
                wo.status = "closed"
                wo.save(update_fields=["status", "updated_at"])
            _, created = GatePass.objects.get_or_create(
                work_order=wo,
                defaults={
                    "branch": wo.branch or self._branch(),
                    "vehicle": wo.vehicle,
                    "customer": wo.customer,
                    "picked_up_by_customer": True,
                    "pickup_notes": f"{DEMO_MARKER} Vehicle released after invoice confirmation and customer ID check.",
                    "status": "issued",
                    "issued_at": self.now,
                    "issued_by": self._admin(),
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_gatepass(self) -> int:
        from apps.gatepass.models import GatePass

        return GatePass.objects.filter(pickup_notes__contains=DEMO_MARKER).count()

    def _purge_gatepass(self, s: ModuleSummary) -> None:
        from apps.gatepass.models import GatePass

        qs = GatePass.objects.filter(pickup_notes__contains=DEMO_MARKER)
        s.purged = qs.count()
        qs.delete()

    def _inventory_foundation(self):
        from apps.inventory.models import PartCategory, Supplier

        category, _ = PartCategory.objects.get_or_create(name=f"{DEMO_PREFIX} Parts", defaults={"description": DEMO_MARKER, "is_active": True})
        supplier, _ = Supplier.objects.get_or_create(
            supplier_code=f"{DEMO_PREFIX}-SUP",
            defaults={
                "name": "Atlantic Auto Parts",
                "supplier_type": "distributor",
                "email": f"client.demo.supplier@{DEMO_EMAIL_DOMAIN}",
                "phone": "+15550009999",
                "is_active": True,
                "is_preferred": True,
                "created_by": self._admin(),
            },
        )
        return category, supplier

    def _load_inventory(self, s: ModuleSummary) -> None:
        from apps.inventory.models import InventoryTransaction, Part

        branch = self._branch()
        category, supplier = self._inventory_foundation()
        before = self._count_inventory()
        for i in range(1, self.count + 1):
            part_name = PART_NAMES[(i - 1) % len(PART_NAMES)]
            part, created = Part.objects.get_or_create(
                part_number=f"CD-PART-{i:04d}",
                defaults={
                    "name": part_name,
                    "description": f"{DEMO_MARKER} Stock item used for repair and maintenance workflows.",
                    "category": category,
                    "branch": branch,
                    "manufacturer": ["Bosch", "Denso", "Monroe", "NGK", "ACDelco"][i % 5],
                    "quantity_in_stock": 25 + i,
                    "reorder_point": 10,
                    "reorder_quantity": 20,
                    "minimum_stock": 5,
                    "unit": "piece",
                    "cost_price": _money(i, 10),
                    "selling_price": _money(i, 25),
                    "bin_location": f"CD-{i:03d}",
                    "is_active": True,
                    "is_taxable": True,
                    "created_by": self._admin(),
                },
            )
            part.suppliers.add(supplier)
            InventoryTransaction.objects.get_or_create(
                part=part,
                transaction_type="purchase",
                reason=f"{DEMO_MARKER} Seed initial stock",
                defaults={
                    "quantity": 25 + i,
                    "balance_after": 25 + i,
                    "unit_cost": part.cost_price,
                    "total_cost": part.cost_price * Decimal(25 + i),
                    "branch": self._branch(),
                    "created_by": self._admin(),
                    "transaction_date": self.now,
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_inventory(self) -> int:
        from apps.inventory.models import Part

        return Part.objects.filter(part_number__startswith="CD-PART-").count()

    def _purge_inventory(self, s: ModuleSummary) -> None:
        from apps.inventory.models import InventoryTransaction, Part

        parts = Part.objects.filter(part_number__startswith="CD-PART-")
        InventoryTransaction.objects.filter(part__in=parts).delete()
        s.purged = parts.count()
        parts.delete()

    def _load_billing(self, s: ModuleSummary) -> None:
        from apps.billing.models import Invoice, Payment

        branch = self._branch()
        customers = self._ensure_customers(self.count)
        vehicles = self._ensure_vehicles(self.count)
        before = self._count_billing()
        for i in range(1, self.count + 1):
            total = _money(i, 300)
            invoice, created = Invoice.objects.get_or_create(
                invoice_number=f"CDINV{i:05d}",
                defaults={
                    "branch": branch,
                    "customer": customers[i - 1],
                    "vehicle": vehicles[i - 1],
                    "status": "paid" if i % 3 == 0 else "sent",
                    "invoice_date": self.today - timedelta(days=i % 20),
                    "due_date": self.today + timedelta(days=15),
                    "description": f"{DEMO_MARKER} Repair invoice for maintenance and diagnostic service.",
                    "notes": f"{DEMO_MARKER} Generated for client billing workflow testing.",
                    "subtotal": total,
                    "taxable_subtotal": total,
                    "tax_amount": Decimal("0.00"),
                    "total": total,
                    "amount_paid": total if i % 3 == 0 else Decimal("0.00"),
                    "amount_due": Decimal("0.00") if i % 3 == 0 else total,
                    "created_by": self._admin(),
                },
            )
            if created:
                s.created += 1
            if invoice.status == "paid":
                Payment.objects.get_or_create(
                    payment_number=f"CDPAY{i:05d}",
                    defaults={
                        "invoice": invoice,
                        "customer": invoice.customer,
                        "payment_method": "cash",
                        "status": "completed",
                        "amount": invoice.total,
                        "reference_number": f"CDPAY-REF-{i:05d}",
                        "notes": DEMO_MARKER,
                        "processed_by": self._admin(),
                    },
                )
        s.existing = before

    def _count_billing(self) -> int:
        from apps.billing.models import Invoice

        return Invoice.objects.filter(description__contains=DEMO_MARKER).count()

    def _purge_billing(self, s: ModuleSummary) -> None:
        from apps.billing.models import Invoice, Payment

        invoices = Invoice.objects.filter(description__contains=DEMO_MARKER)
        Payment.objects.filter(invoice__in=invoices).delete()
        s.purged = invoices.count()
        invoices.delete()

    def _load_accounting(self, s: ModuleSummary) -> None:
        from apps.accounting.models import Account, JournalEntry, Transaction

        cash, _ = Account.objects.get_or_create(code="CD1000", defaults={"name": "Workshop Cash Account", "account_type": "asset", "balance_type": "debit", "description": DEMO_MARKER})
        income, _ = Account.objects.get_or_create(code="CD4000", defaults={"name": "Service Labor Income", "account_type": "income", "balance_type": "credit", "description": DEMO_MARKER})
        before = self._count_accounting()
        for i in range(1, self.count + 1):
            je, created = JournalEntry.objects.get_or_create(
                reference=f"CDJE-{i:05d}",
                defaults={
                    "date": self.today - timedelta(days=i % 30),
                    "description": f"{DEMO_MARKER} Posted service revenue entry {i}.",
                    "created_by": self._admin(),
                    "branch": self._branch(),
                },
            )
            amount = _money(i, 200)
            Transaction.objects.get_or_create(journal_entry=je, account=cash, transaction_type="debit", defaults={"amount": amount, "description": DEMO_MARKER})
            Transaction.objects.get_or_create(journal_entry=je, account=income, transaction_type="credit", defaults={"amount": amount, "description": DEMO_MARKER})
            if created:
                s.created += 1
        s.existing = before

    def _count_accounting(self) -> int:
        from apps.accounting.models import JournalEntry

        return JournalEntry.objects.filter(description__contains=DEMO_MARKER).count()

    def _purge_accounting(self, s: ModuleSummary) -> None:
        from apps.accounting.models import JournalEntry

        qs = JournalEntry.objects.filter(description__contains=DEMO_MARKER)
        s.purged = qs.count()
        qs.delete()

    def _load_hr(self, s: ModuleSummary) -> None:
        from apps.hr.models import Department, EmployeeProfile, Position

        branch = self._branch()
        dept, _ = Department.objects.get_or_create(name=f"{DEMO_PREFIX} Workshop", branch=branch, defaults={"description": DEMO_MARKER})
        pos, _ = Position.objects.get_or_create(title=f"{DEMO_PREFIX} Technician", department=dept, defaults={"min_salary": Decimal("2000"), "max_salary": Decimal("8000")})
        before = self._count_hr()
        for i, user in enumerate(self._ensure_technician_users(self.count), start=1):
            _, created = EmployeeProfile.objects.get_or_create(
                user=user,
                defaults={
                    "department": dept,
                    "position": pos,
                    "employment_type": "full_time",
                    "employment_status": "active",
                    "start_date": self.today - timedelta(days=90 + i),
                    "base_salary": Decimal("3500.00") + Decimal(i),
                    "salary_type": "monthly",
                    "emergency_contact_name": f"{CUSTOMER_NAMES[i % len(CUSTOMER_NAMES)][0]} {CUSTOMER_NAMES[i % len(CUSTOMER_NAMES)][1]}",
                    "emergency_contact_phone": _phone(3000 + i),
                    "national_id": f"CD-NID-{i:05d}",
                    "tax_id": f"CD-TAX-{i:05d}",
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_hr(self) -> int:
        from apps.hr.models import EmployeeProfile

        return EmployeeProfile.objects.filter(user__email__startswith="client.demo.technician").count()

    def _purge_hr(self, s: ModuleSummary) -> None:
        from apps.hr.models import EmployeeProfile

        qs = EmployeeProfile.objects.filter(user__email__startswith="client.demo.technician")
        s.purged = qs.count()
        qs.delete()

    def _load_fixed_assets(self, s: ModuleSummary) -> None:
        from apps.fixed_assets.models import AssetCategory, FixedAsset

        category, _ = AssetCategory.objects.get_or_create(name=f"{DEMO_PREFIX} Equipment", defaults={"description": DEMO_MARKER, "default_useful_life_years": 5})
        branch = self._branch()
        before = self._count_fixed_assets()
        for i in range(1, self.count + 1):
            asset_name = ASSET_NAMES[(i - 1) % len(ASSET_NAMES)]
            _, created = FixedAsset.objects.get_or_create(
                asset_number=f"CD-ASSET-{i:04d}",
                defaults={
                    "name": asset_name,
                    "description": f"{DEMO_MARKER} Workshop asset used for maintenance and depreciation testing.",
                    "category": category,
                    "acquisition_cost": _money(i, 1000),
                    "acquisition_date": self.today - timedelta(days=365 + i),
                    "useful_life_years": 5,
                    "depreciation_start_date": self.today - timedelta(days=365 + i),
                    "branch": branch,
                    "location": "Main Workshop",
                    "manufacturer": ["Rotary", "Snap-on", "Bosch", "Hunter", "Ingersoll Rand"][i % 5],
                    "serial_number": f"CDSER{i:06d}",
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_fixed_assets(self) -> int:
        from apps.fixed_assets.models import FixedAsset

        return FixedAsset.objects.filter(asset_number__startswith="CD-ASSET-").count()

    def _purge_fixed_assets(self, s: ModuleSummary) -> None:
        from apps.fixed_assets.models import FixedAsset

        qs = FixedAsset.objects.filter(asset_number__startswith="CD-ASSET-")
        s.purged = qs.count()
        qs.delete()

    def _load_roadside(self, s: ModuleSummary) -> None:
        from apps.roadside.models import RoadsideRequest

        customers = self._ensure_customers(self.count)
        vehicles = self._ensure_vehicles(self.count)
        before = self._count_roadside()
        service_types = ["towing", "battery_boost", "flat_tyre", "key_lockout", "emergency_fuel"]
        for i in range(1, self.count + 1):
            _, created = RoadsideRequest.objects.get_or_create(
                request_number=f"CDRSA{i:05d}",
                defaults={
                    "customer": customers[i - 1],
                    "vehicle": vehicles[i - 1],
                    "branch": self._branch(),
                    "service_type": service_types[i % len(service_types)],
                    "status": ["requested", "dispatched", "completed"][i % 3],
                    "breakdown_location": f"{DEMO_MARKER} Near {STREETS[i % len(STREETS)]}, Accra.",
                    "description": f"{DEMO_MARKER} Customer requested roadside assistance after vehicle would not restart.",
                    "customer_phone": _phone(1000 + i),
                    "notes": DEMO_MARKER,
                    "created_by": self._admin(),
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_roadside(self) -> int:
        from apps.roadside.models import RoadsideRequest

        return RoadsideRequest.objects.filter(breakdown_location__contains=DEMO_MARKER).count()

    def _purge_roadside(self, s: ModuleSummary) -> None:
        from apps.roadside.models import RoadsideRequest

        qs = RoadsideRequest.objects.filter(breakdown_location__contains=DEMO_MARKER)
        s.purged = qs.count()
        qs.delete()

    def _load_subscriptions(self, s: ModuleSummary) -> None:
        from apps.subscriptions.models import Package, Subscription

        package, _ = Package.objects.get_or_create(
            code="CD-PKG",
            defaults={"name": "RoadCare Plus", "description": f"{DEMO_MARKER} Annual roadside and inspection membership.", "price": Decimal("499.00"), "created_by": self._admin(), "features": {"roadside_first_aid": 2}},
        )
        customers = self._ensure_customers(self.count)
        vehicles = self._ensure_vehicles(self.count)
        before = self._count_subscriptions()
        for i in range(1, self.count + 1):
            _, created = Subscription.objects.get_or_create(
                subscription_number=f"CDSUB{i:05d}",
                defaults={
                    "customer": customers[i - 1],
                    "package": package,
                    "vehicle": vehicles[i - 1],
                    "start_date": self.today - timedelta(days=i),
                    "end_date": self.today + timedelta(days=365 - (i % 30)),
                    "status": "active",
                    "payment_status": "paid",
                    "purchase_price": package.price,
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_subscriptions(self) -> int:
        from apps.subscriptions.models import Subscription

        return Subscription.objects.filter(subscription_number__startswith="CDSUB").count()

    def _purge_subscriptions(self, s: ModuleSummary) -> None:
        from apps.subscriptions.models import Subscription

        qs = Subscription.objects.filter(subscription_number__startswith="CDSUB")
        s.purged = qs.count()
        qs.delete()

    def _load_documents(self, s: ModuleSummary) -> None:
        from apps.documents.models import Document, DocumentCategory

        category, _ = DocumentCategory.objects.get_or_create(name="Service Records", defaults={"slug": "client-demo-documents", "description": DEMO_MARKER})
        customers = self._ensure_customers(self.count)
        before = self._count_documents()
        for i in range(1, self.count + 1):
            title = DOCUMENT_TITLES[(i - 1) % len(DOCUMENT_TITLES)]
            doc, created = Document.objects.get_or_create(
                document_number=f"CDDOC{i:05d}",
                defaults={
                    "title": title,
                    "description": f"{DEMO_MARKER} Uploaded document for customer and service workflow testing.",
                    "category": category,
                    "file": ContentFile(f"{DEMO_MARKER} {title}\n".encode("utf-8"), name=f"client-record-{i:03d}.txt"),
                    "file_size": 1,
                    "file_type": "text/plain",
                    "original_filename": f"client-record-{i:03d}.txt",
                    "tags": f"client-demo,{DEMO_MARKER}",
                    "customer": customers[i - 1],
                    "uploaded_by": self._admin(),
                },
            )
            if created:
                s.created += 1
            else:
                doc.tags = f"client-demo,{DEMO_MARKER}"
                doc.save(update_fields=["tags", "updated_at"])
        s.existing = before

    def _count_documents(self) -> int:
        from apps.documents.models import Document

        return Document.objects.filter(tags__contains=DEMO_MARKER).count()

    def _purge_documents(self, s: ModuleSummary) -> None:
        from apps.documents.models import Document

        qs = Document.objects.filter(tags__contains=DEMO_MARKER)
        s.purged = qs.count()
        qs.delete()

    def _load_feedback(self, s: ModuleSummary) -> None:
        from apps.feedback.models import Feedback

        before = self._count_feedback()
        for i in range(1, self.count + 1):
            first_name, last_name = CUSTOMER_NAMES[(i - 1) % len(CUSTOMER_NAMES)]
            _, created = Feedback.objects.get_or_create(
                email=f"client.demo.feedback{i:03d}@{DEMO_EMAIL_DOMAIN}",
                defaults={
                    "message": f"{DEMO_MARKER} Service advisor was helpful and the repair status updates were clear.",
                    "category": ["suggestion", "complaint", "compliment", "other"][i % 4],
                    "status": ["new", "in_progress", "resolved"][i % 3],
                    "branch": self._branch(),
                    "is_anonymous": False,
                    "name": f"{first_name} {last_name}",
                    "phone": _phone(4000 + i),
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_feedback(self) -> int:
        from apps.feedback.models import Feedback

        return Feedback.objects.filter(message__contains=DEMO_MARKER).count()

    def _purge_feedback(self, s: ModuleSummary) -> None:
        from apps.feedback.models import Feedback

        qs = Feedback.objects.filter(message__contains=DEMO_MARKER)
        s.purged = qs.count()
        qs.delete()

    def _load_chat(self, s: ModuleSummary) -> None:
        from apps.chat.models import ChatMembership, ChatMessage, Conversation

        techs = self._ensure_technician_users(self.count)
        admin = self._admin()
        before = self._count_chat()
        for i in range(1, self.count + 1):
            conv, created = Conversation.objects.get_or_create(
                room_id=f"client-demo-chat-{i:04d}",
                defaults={"type": "group", "title": f"{DEMO_MARKER} Service Follow-up {i:03d}", "related_object_type": "demo"},
            )
            ChatMembership.objects.get_or_create(conversation=conv, user=admin, defaults={"role": "admin"})
            ChatMembership.objects.get_or_create(conversation=conv, user=techs[i - 1], defaults={"role": "member"})
            ChatMessage.objects.get_or_create(conversation=conv, sender=admin, message=f"{DEMO_MARKER} Please confirm the customer pickup window and final invoice status.")
            if created:
                s.created += 1
        s.existing = before

    def _count_chat(self) -> int:
        from apps.chat.models import Conversation

        return Conversation.objects.filter(room_id__startswith="client-demo-chat-").count()

    def _purge_chat(self, s: ModuleSummary) -> None:
        from apps.chat.models import Conversation

        qs = Conversation.objects.filter(room_id__startswith="client-demo-chat-")
        s.purged = qs.count()
        qs.delete()
