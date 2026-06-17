from __future__ import annotations

import hashlib
import io
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import date, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.db import transaction
from django.db.models import Q
from django.db.models.signals import post_save, pre_save
from django.test import override_settings
from django.utils import timezone

from apps.accounts.models import User


DEMO_MARKER = "[CLIENT_DEMO_DATA]"
DEMO_PREFIX = "CLIENT-DEMO"
DEMO_EMAIL_DOMAIN = "demo.local"

MODULES = [
    "accounts",
    "branches",
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
    "notifications_app",
    "reporting",
    "quickbooks_online",
    "portal",
]

PURGE_ORDER = [
    "notifications_app",
    "chat",
    "documents",
    "quickbooks_online",
    "gatepass",
    "billing",
    "reporting",
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
    "accounts",
    "branches",
]

MODULE_LABELS = {
    "accounts": "Accounts",
    "branches": "Branches",
    "customers": "Customers",
    "vehicles": "Vehicles",
    "technicians": "Technicians",
    "appointments": "Appointments",
    "workorders": "Work Orders",
    "inspections": "Inspections",
    "diagnosis": "Diagnosis",
    "gatepass": "Gate Pass",
    "inventory": "Inventory",
    "billing": "Billing",
    "accounting": "Accounting",
    "hr": "HR",
    "fixed_assets": "Fixed Assets",
    "roadside": "Roadside",
    "subscriptions": "Subscriptions",
    "documents": "Documents",
    "feedback": "Feedback",
    "chat": "Chat",
    "notifications_app": "Notifications",
    "reporting": "Reporting",
    "quickbooks_online": "QuickBooks Online",
    "portal": "Customer Portal",
    "workflows": "Workflows",
}

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
    label: str = ""
    installed: bool = True
    seedable: bool = True

    def as_dict(self) -> dict:
        if not self.label:
            self.label = MODULE_LABELS.get(self.module, self.module.replace("_", " ").title())
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
        self._side_effect_mute_depth = 0

    def load(self, modules: list[str] | None = None) -> dict:
        with self._muted_demo_side_effects():
            modules = self._normalize_modules(modules)
            self._ensure_foundation()
            for module in modules:
                summary = self._summary(module, target=self.count)
                self.summaries[module] = summary
                try:
                    getattr(self, f"_load_{module}")(summary)
                except Exception as exc:  # pragma: no cover - summarized for API callers
                    summary.errors.append(str(exc))
            return self._response("loaded", modules)

    def refresh(self, modules: list[str] | None = None) -> dict:
        with self._muted_demo_side_effects():
            modules = self._normalize_modules(modules)
            purge_result = self.purge(modules)
            load_result = self.load(modules)
        by_module = {item["module"]: item for item in purge_result["modules"]}
        refreshed = []
        for item in load_result["modules"]:
            purge_item = by_module.get(item["module"], {})
            merged = dict(item)
            merged["purged"] = purge_item.get("purged", 0)
            merged["warnings"] = list(purge_item.get("warnings", [])) + list(item.get("warnings", []))
            merged["errors"] = list(purge_item.get("errors", [])) + list(item.get("errors", []))
            refreshed.append(merged)
        return {"action": "refreshed", "marker": DEMO_MARKER, "modules": refreshed}

    @contextmanager
    def _muted_demo_side_effects(self):
        if self._side_effect_mute_depth > 0:
            self._side_effect_mute_depth += 1
            try:
                yield
            finally:
                self._side_effect_mute_depth -= 1
            return

        from apps.appointments.models import Appointment
        from apps.workorders.models import WorkOrder
        from apps.chat.signals import capture_original_status, work_order_status_update_notification
        from apps.notifications_app.signals import (
            appointment_notifications,
            cache_appointment_status,
            cache_work_order_status,
            work_order_status_notifications,
        )

        signal_pairs = [
            (pre_save, cache_work_order_status, WorkOrder),
            (post_save, work_order_status_notifications, WorkOrder),
            (pre_save, cache_appointment_status, Appointment),
            (post_save, appointment_notifications, Appointment),
            (pre_save, capture_original_status, WorkOrder),
            (post_save, work_order_status_update_notification, WorkOrder),
        ]
        self._side_effect_mute_depth = 1
        for signal, receiver, sender in signal_pairs:
            signal.disconnect(receiver, sender=sender)
        try:
            with override_settings(QUICKBOOKS_AUTO_SYNC_ENABLED=False):
                yield
        finally:
            for signal, receiver, sender in signal_pairs:
                signal.connect(receiver, sender=sender)
            self._side_effect_mute_depth = 0

    def purge(self, modules: list[str] | None = None, *, permanent: bool = False) -> dict:
        modules = self._normalize_modules(modules)
        ordered_modules = [m for m in PURGE_ORDER if m in modules]
        for module in ordered_modules:
            summary = self._summary(module)
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
            summary = self._summary(module, target=self.count)
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
        all_modules = list(MODULES)
        if "apps.workflows" in settings.INSTALLED_APPS:
            all_modules.append("workflows")
        if not modules:
            return all_modules
        normalized = []
        for module in modules:
            slug = str(module).strip().lower().replace("-", "_")
            if slug in all_modules and slug not in normalized:
                normalized.append(slug)
        return normalized or all_modules

    def _summary(self, module: str, *, target: int = 0) -> ModuleSummary:
        installed = self._module_installed(module)
        return ModuleSummary(
            module=module,
            label=MODULE_LABELS.get(module, module.replace("_", " ").title()),
            target=target,
            installed=installed,
            seedable=installed and hasattr(self, f"_load_{module}"),
        )

    def _module_installed(self, module: str) -> bool:
        app_name = "quickbooks_online" if module == "quickbooks_online" else module
        if module == "notifications_app":
            app_name = "notifications_app"
        if module == "portal":
            app_name = "portal"
        if module == "accounts":
            app_name = "accounts"
        return f"apps.{app_name}" in settings.INSTALLED_APPS or any(
            app.startswith(f"apps.{app_name}.") for app in settings.INSTALLED_APPS
        )

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

    def _load_accounts(self, s: ModuleSummary) -> None:
        before = self._count_accounts()
        self._ensure_staff_users()
        self._ensure_technician_users(self.count)
        self._ensure_customers(self.count)
        s.existing = before
        s.created = max(0, self._count_accounts() - before)

    def _count_accounts(self) -> int:
        return User.objects.filter(email__contains=f".demo.", email__endswith=f"@{DEMO_EMAIL_DOMAIN}").count()

    def _purge_accounts(self, s: ModuleSummary) -> None:
        s.existing = self._count_accounts()
        s.skipped += 1
        s.warnings.append("Demo account users are foundational and are preserved; purge dependent modules or use permanent cleanup if needed.")

    def _load_branches(self, s: ModuleSummary) -> None:
        before = self._count_branches()
        self._branch()
        s.existing = before
        s.created = max(0, self._count_branches() - before)

    def _count_branches(self) -> int:
        from apps.branches.models import Branch

        return Branch.objects.filter(code="CD-HQ").count()

    def _purge_branches(self, s: ModuleSummary) -> None:
        s.existing = self._count_branches()
        s.skipped += 1
        s.warnings.append("Demo branch is foundational and is preserved to avoid deleting protected references.")

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
        from apps.workorders.models import (
            ServiceTask,
            TechnicianTimeLog,
            TriageForm,
            WorkOrder,
            WorkOrderNote,
            WorkOrderPart,
        )

        branch = self._branch()
        customers = self._ensure_customers(self.count)
        vehicles = self._ensure_vehicles(self.count)
        techs = self._ensure_technician_users(self.count)
        coordinator = User.objects.filter(email=f"client.demo.service_coordinator@{DEMO_EMAIL_DOMAIN}").first()
        before = self._count_workorders()
        statuses = ["draft", "assigned", "diagnosis", "approved", "in_progress", "completed", "closed"]
        for i in range(1, self.count + 1):
            tech = techs[i - 1]
            wo, created = WorkOrder.objects.get_or_create(
                work_order_number=f"CDW{i:06d}",
                defaults={
                    "branch": branch,
                    "customer": customers[i - 1],
                    "vehicle": vehicles[i - 1],
                    "status": statuses[i % len(statuses)],
                    "priority": ["low", "normal", "high", "urgent"][i % 4],
                    "service_coordinator": coordinator,
                    "primary_technician": tech,
                    "customer_concerns": f"{DEMO_MARKER} Check engine light, brake vibration, and scheduled maintenance request.",
                    "special_instructions": f"{DEMO_MARKER} Customer prefers email updates and afternoon pickup.",
                    "diagnosis_notes": f"{DEMO_MARKER} Initial scan and road test completed; service recommendations recorded.",
                    "odometer_in": 15000 + i * 321,
                    "odometer_out": 15100 + i * 321 if i % 2 == 0 else None,
                    "created_by": self._admin(),
                    "estimated_labor_hours": Decimal("2.00"),
                    "estimated_labor_cost": _money(i, 180),
                    "estimated_parts_cost": _money(i, 80),
                    "actual_labor_hours": Decimal("1.50"),
                    "actual_labor_cost": _money(i, 150),
                    "actual_parts_cost": _money(i, 60),
                },
            )
            wo.assigned_technicians.add(tech)
            TriageForm.objects.get_or_create(
                work_order=wo,
                defaults={
                    "performed_by": coordinator or self._admin(),
                    "visual_inspection_notes": f"{DEMO_MARKER} Intake triage found brake vibration and service due indicators.",
                    "exterior_condition": "good",
                    "interior_condition": "good",
                },
            )
            for order, task_data in enumerate(
                [
                    ("diagnostic", "Scan vehicle and confirm customer concern", Decimal("0.75")),
                    ("repair", "Replace front brake pads and inspect rotors", Decimal("1.25")),
                ],
                start=1,
            ):
                task_type, description, hours = task_data
                task, _ = ServiceTask.objects.get_or_create(
                    work_order=wo,
                    description=f"{DEMO_MARKER} {description}",
                    defaults={
                        "task_type": task_type,
                        "status": "completed" if wo.status in {"completed", "closed"} else "in_progress",
                        "sequence_order": order,
                        "assigned_to": tech,
                        "estimated_hours": hours,
                        "actual_hours": hours if wo.status in {"completed", "closed"} else Decimal("0.50"),
                        "labor_rate": Decimal("95.00"),
                        "detailed_notes": f"{DEMO_MARKER} Demo service task for workflow testing.",
                    },
                )
                TechnicianTimeLog.objects.get_or_create(
                    work_order=wo,
                    task=task,
                    technician=tech,
                    description=f"{DEMO_MARKER} Time logged for {description.lower()}.",
                    defaults={
                        "clock_in": self.now - timedelta(hours=order + 2),
                        "clock_out": self.now - timedelta(hours=order),
                        "duration_hours": hours,
                        "hourly_rate": Decimal("95.00"),
                        "labor_cost": hours * Decimal("95.00"),
                        "is_billable": True,
                        "is_approved": True,
                        "approved_by": self._admin(),
                        "approved_at": self.now,
                    },
                )
            WorkOrderNote.objects.get_or_create(
                work_order=wo,
                note=f"{DEMO_MARKER} Customer approved recommended service and requested pickup notification.",
                defaults={"note_type": "customer", "created_by": coordinator or self._admin(), "is_customer_visible": True},
            )
            WorkOrderPart.objects.get_or_create(
                work_order=wo,
                part_number=f"CD-WOPART-{i:04d}",
                part_name="Brake Pad Set",
                defaults={
                    "quantity": Decimal("1.00"),
                    "unit_cost": Decimal("45.00"),
                    "markup_percentage": Decimal("25.00"),
                    "status": "installed" if wo.status in {"completed", "closed"} else "received",
                    "requested_by": coordinator or self._admin(),
                    "approved_by": self._admin(),
                    "approved_at": self.now,
                    "installed_by": tech,
                    "installed_at": self.now if wo.status in {"completed", "closed"} else None,
                    "description": f"{DEMO_MARKER} Demo work order part for repair workflow.",
                },
            )
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
        InspectionItem.objects.get_or_create(
            category=category,
            name="Tire tread depth",
            defaults={
                "order": 2,
                "item_type": "measurement",
                "measurement_unit": "mm",
                "min_acceptable": Decimal("3.00"),
                "is_critical": True,
            },
        )
        InspectionItem.objects.get_or_create(category=category, name="Exterior lights", defaults={"order": 3})
        return template

    def _load_inspections(self, s: ModuleSummary) -> None:
        from apps.inspections.models import InspectionItem, InspectionResult, VehicleInspection
        from apps.workorders.models import WorkOrder

        branch = self._branch()
        template = self._inspection_template()
        vehicles = self._ensure_vehicles(self.count)
        techs = self._ensure_technician_users(self.count)
        workorders = list(WorkOrder.objects.filter(customer_concerns__contains=DEMO_MARKER).order_by("id")[: self.count])
        before = self._count_inspections()
        for i in range(1, self.count + 1):
            inspection, created = VehicleInspection.objects.get_or_create(
                inspection_number=f"CDI{i:06d}",
                defaults={
                    "branch": branch,
                    "vehicle": vehicles[i - 1],
                    "work_order": workorders[i - 1] if i <= len(workorders) else None,
                    "template": template,
                    "performed_by": techs[i - 1],
                    "status": "completed",
                    "overall_result": ["pass", "pass_with_advisory", "needs_attention"][i % 3],
                    "odometer_reading": 15000 + i * 321,
                    "notes": f"{DEMO_MARKER} Multipoint inspection completed for customer review.",
                    "recommendations": f"{DEMO_MARKER} Replace worn brake pads and schedule next oil service.",
                },
            )
            for item in InspectionItem.objects.filter(category__template=template):
                result_value = "advisory" if item.name == "Tire tread depth" and i % 3 == 0 else "pass"
                InspectionResult.objects.get_or_create(
                    inspection=inspection,
                    inspection_item=item,
                    defaults={
                        "result": result_value,
                        "measurement_value": Decimal("4.50") if item.item_type == "measurement" else None,
                        "condition": "fair" if result_value == "advisory" else "good",
                        "text_note": f"{DEMO_MARKER} Item checked during demo inspection.",
                        "recommendation": f"{DEMO_MARKER} Monitor at next service." if result_value == "advisory" else "",
                        "estimated_cost": Decimal("75.00") if result_value == "advisory" else None,
                        "notes": DEMO_MARKER,
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
        from apps.diagnosis.models import Diagnosis, DiagnosisFinding, DiagnosticCode, RepairRecommendation
        from apps.workorders.models import WorkOrder

        self._load_workorders(ModuleSummary(module="workorders", target=self.count))
        workorders = list(WorkOrder.objects.filter(customer_concerns__contains=DEMO_MARKER).order_by("id")[: self.count])
        before = self._count_diagnosis()
        for i, wo in enumerate(workorders, start=1):
            diagnosis, created = Diagnosis.objects.get_or_create(
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
            code, _ = DiagnosticCode.objects.get_or_create(
                diagnosis=diagnosis,
                code_number=f"CDP{i:04d}",
                defaults={
                    "code_type": "obd_ii",
                    "description": f"{DEMO_MARKER} Random misfire detected for demo diagnosis workflow.",
                    "severity": "warning",
                    "status": "active",
                    "freeze_frame_data": {"rpm": 1850 + i, "speed": 30 + i},
                },
            )
            finding, _ = DiagnosisFinding.objects.get_or_create(
                diagnosis=diagnosis,
                finding_title=f"{DEMO_MARKER} Ignition service required {i:03d}",
                defaults={
                    "category": "engine",
                    "description": f"{DEMO_MARKER} Spark plug wear and restricted intake airflow confirmed during diagnostic checks.",
                    "severity": "major",
                    "root_cause": "Worn ignition parts",
                    "contributing_factors": "Delayed maintenance interval",
                    "status": "confirmed",
                },
            )
            finding.diagnostic_codes.add(code)
            recommendation, _ = RepairRecommendation.objects.get_or_create(
                diagnosis=diagnosis,
                description=f"{DEMO_MARKER} Replace spark plug set and engine air filter.",
                defaults={
                    "recommendation_type": "replace",
                    "priority": "necessary",
                    "estimated_parts_cost": _money(i, 80),
                    "estimated_labor_hours": Decimal("1.50"),
                    "estimated_labor_cost": _money(i, 120),
                    "estimated_total_cost": _money(i, 220),
                    "approval_status": "approved" if i % 3 != 0 else "pending_approval",
                    "decision_method": "phone" if i % 3 != 0 else "",
                    "decision_notes": f"{DEMO_MARKER} Customer decision captured for demo workflow.",
                    "decision_at": self.now if i % 3 != 0 else None,
                    "decision_by": self._admin() if i % 3 != 0 else None,
                    "customer_approved": i % 3 != 0,
                    "quotation_status": "quoted",
                    "quoted_at": self.now,
                    "quoted_by": self._admin(),
                },
            )
            recommendation.findings.add(finding)
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
        from apps.billing.models import Estimate, Invoice, InvoiceLineItem, Payment
        from apps.workorders.models import WorkOrder

        branch = self._branch()
        customers = self._ensure_customers(self.count)
        vehicles = self._ensure_vehicles(self.count)
        self._load_workorders(ModuleSummary(module="workorders", target=self.count))
        workorders = list(WorkOrder.objects.filter(customer_concerns__contains=DEMO_MARKER).order_by("id")[: self.count])
        before = self._count_billing()
        for i in range(1, self.count + 1):
            total = _money(i, 300)
            work_order = workorders[i - 1] if i <= len(workorders) else None
            estimate, _ = Estimate.objects.get_or_create(
                estimate_number=f"CDEST{i:05d}",
                defaults={
                    "branch": branch,
                    "customer": customers[i - 1],
                    "vehicle": vehicles[i - 1],
                    "work_order": work_order,
                    "status": "approved",
                    "estimate_date": self.today - timedelta(days=i % 15),
                    "valid_until": self.today + timedelta(days=15),
                    "title": f"{DEMO_MARKER} Service estimate",
                    "description": f"{DEMO_MARKER} Estimate for diagnostic and repair service.",
                    "labor_subtotal": total * Decimal("0.55"),
                    "parts_subtotal": total * Decimal("0.35"),
                    "subtotal": total,
                    "total": total,
                    "created_by": self._admin(),
                    "approved_by": self._admin(),
                    "approved_date": self.now,
                },
            )
            invoice, created = Invoice.objects.get_or_create(
                invoice_number=f"CDINV{i:05d}",
                defaults={
                    "branch": branch,
                    "customer": customers[i - 1],
                    "vehicle": vehicles[i - 1],
                    "work_order": work_order,
                    "estimate": estimate,
                    "status": "draft",
                    "invoice_date": self.today - timedelta(days=i % 20),
                    "due_date": self.today + timedelta(days=15),
                    "description": f"{DEMO_MARKER} Repair invoice for maintenance and diagnostic service.",
                    "notes": f"{DEMO_MARKER} Generated for client billing workflow testing.",
                    "subtotal": total,
                    "taxable_subtotal": total,
                    "tax_amount": Decimal("0.00"),
                    "total": total,
                    "amount_paid": Decimal("0.00"),
                    "amount_due": total,
                    "created_by": self._admin(),
                },
            )
            if created and invoice.status == "draft":
                Invoice.objects.filter(pk=invoice.pk).update(status="sent", amount_due=total)
                invoice.refresh_from_db(fields=["status", "amount_due", "amount_paid", "total"])
            InvoiceLineItem.objects.get_or_create(
                invoice=invoice,
                description=f"{DEMO_MARKER} Labor service",
                defaults={
                    "item_type": "labor",
                    "quantity": Decimal("1.00"),
                    "unit_price": total * Decimal("0.55"),
                    "labor_hours": Decimal("2.00"),
                    "labor_rate": (total * Decimal("0.55")) / Decimal("2.00"),
                    "is_taxable": True,
                    "order": 1,
                },
            )
            InvoiceLineItem.objects.get_or_create(
                invoice=invoice,
                description=f"{DEMO_MARKER} Repair parts",
                defaults={
                    "item_type": "part",
                    "quantity": Decimal("1.00"),
                    "unit_price": total * Decimal("0.35"),
                    "is_taxable": True,
                    "order": 2,
                },
            )
            if created:
                s.created += 1
            if i % 2 == 0 and not invoice.is_paid:
                from apps.accounting.models import AccountingControl

                Payment.objects.get_or_create(
                    payment_number=f"CDPAY{i:05d}",
                    defaults={
                        "invoice": invoice,
                        "customer": invoice.customer,
                        "payment_method": "check",
                        "bank_account": AccountingControl.get_settings().default_bank_account,
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
        from apps.accounting.demo_gl_cleanup import purge_demo_journal_entries

        s.purged = purge_demo_journal_entries()

    def _load_hr(self, s: ModuleSummary) -> None:
        from apps.hr.models import (
            Attendance,
            ComplianceDocument,
            Department,
            EmployeeProfile,
            EmployeeTraining,
            PerformanceReview,
            Position,
            TrainingProgram,
        )

        branch = self._branch()
        dept, _ = Department.objects.get_or_create(name=f"{DEMO_PREFIX} Workshop", branch=branch, defaults={"description": DEMO_MARKER})
        pos, _ = Position.objects.get_or_create(title=f"{DEMO_PREFIX} Technician", department=dept, defaults={"min_salary": Decimal("2000"), "max_salary": Decimal("8000")})
        training, _ = TrainingProgram.objects.get_or_create(
            name=f"{DEMO_PREFIX} Safety & Diagnostics",
            defaults={
                "description": f"{DEMO_MARKER} Workshop safety and diagnostic process training.",
                "trainer": "Demo Training Team",
                "start_date": self.today - timedelta(days=20),
                "end_date": self.today - timedelta(days=18),
                "department": dept,
                "is_mandatory": True,
            },
        )
        before = self._count_hr()
        for i, user in enumerate(self._ensure_technician_users(self.count), start=1):
            employee, created = EmployeeProfile.objects.get_or_create(
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
            Attendance.objects.get_or_create(
                employee=employee,
                date=self.today - timedelta(days=i % 7),
                defaults={
                    "clock_in": self.now - timedelta(days=i % 7, hours=8),
                    "clock_out": self.now - timedelta(days=i % 7),
                    "total_hours": Decimal("8.00"),
                    "status": "present",
                    "notes": f"{DEMO_MARKER} Demo attendance record.",
                    "branch": branch,
                },
            )
            EmployeeTraining.objects.get_or_create(
                employee=employee,
                training=training,
                defaults={
                    "status": "completed",
                    "completion_date": self.today - timedelta(days=18),
                    "score": Decimal("88.00") + Decimal(i % 10),
                    "notes": f"{DEMO_MARKER} Demo training completion.",
                },
            )
            PerformanceReview.objects.get_or_create(
                employee=employee,
                review_period_start=self.today - timedelta(days=120),
                review_period_end=self.today - timedelta(days=30),
                defaults={
                    "reviewer": self._admin(),
                    "overall_rating": 4,
                    "strengths": f"{DEMO_MARKER} Strong diagnostic workflow and customer communication.",
                    "areas_for_improvement": "Continue improving estimate documentation.",
                    "goals": "Complete advanced electrical diagnostics training.",
                    "status": "submitted",
                    "submitted_at": self.now,
                },
            )
            ComplianceDocument.objects.get_or_create(
                employee=employee,
                name=f"{DEMO_MARKER} Technician Certification {i:03d}",
                defaults={
                    "document_type": "certification",
                    "document_number": f"CD-CERT-{i:05d}",
                    "issue_date": self.today - timedelta(days=120),
                    "expiry_date": self.today + timedelta(days=365),
                    "status": "valid",
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
        from apps.billing.models import Invoice
        from apps.documents.models import Document, DocumentAccess, DocumentCategory, DocumentShare, DocumentSignature, DocumentVersion
        from apps.workorders.models import WorkOrder

        category, _ = DocumentCategory.objects.update_or_create(
            slug="client-demo-documents",
            defaults={"name": f"{DEMO_PREFIX} Service Records", "description": DEMO_MARKER},
        )
        customers = self._ensure_customers(self.count)
        vehicles = self._ensure_vehicles(self.count)
        workorders = list(WorkOrder.objects.filter(customer_concerns__contains=DEMO_MARKER).order_by("id")[: self.count])
        invoices = list(Invoice.objects.filter(description__contains=DEMO_MARKER).order_by("id")[: self.count])
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
                    "vehicle": vehicles[i - 1],
                    "work_order": workorders[i - 1] if i <= len(workorders) else None,
                    "invoice": invoices[i - 1] if i <= len(invoices) else None,
                    "uploaded_by": self._admin(),
                },
            )
            DocumentVersion.objects.get_or_create(
                document=doc,
                version_number=1,
                defaults={
                    "file": ContentFile(f"{DEMO_MARKER} {title} v1\n".encode("utf-8"), name=f"client-record-{i:03d}-v1.txt"),
                    "file_size": 1,
                    "file_type": "text/plain",
                    "original_filename": f"client-record-{i:03d}-v1.txt",
                    "changes_description": f"{DEMO_MARKER} Initial demo document version.",
                    "uploaded_by": self._admin(),
                },
            )
            share, _ = DocumentShare.objects.get_or_create(
                document=doc,
                shared_with_email=customers[i - 1].user.email,
                defaults={
                    "shared_by": self._admin(),
                    "access_code": f"CD{i:04d}"[:20],
                    "expires_at": self.now + timedelta(days=30),
                    "max_views": 10,
                },
            )
            DocumentAccess.objects.get_or_create(
                document=doc,
                user=self._admin(),
                action="viewed",
                notes=f"{DEMO_MARKER} Demo access log.",
                defaults={"share_link": share, "ip_address": "127.0.0.1", "user_agent": "client-demo-data"},
            )
            DocumentSignature.objects.get_or_create(
                document=doc,
                signer_email=customers[i - 1].user.email,
                defaults={
                    "signer_name": customers[i - 1].user.get_full_name() or customers[i - 1].user.email,
                    "status": "pending",
                    "expires_at": self.now + timedelta(days=14),
                    "notes": f"{DEMO_MARKER} Demo signature request.",
                    "requested_by": self._admin(),
                },
            )
            if created:
                s.created += 1
            else:
                doc.tags = f"client-demo,{DEMO_MARKER}"
                update_fields = ["tags", "updated_at"]
                if not doc.description or DEMO_MARKER not in doc.description:
                    doc.description = f"{DEMO_MARKER} Uploaded document for customer and service workflow testing."
                    update_fields.append("description")
                doc.save(update_fields=update_fields)
        s.existing = before

    def _count_documents(self) -> int:
        from apps.documents.models import Document

        return Document.objects.filter(Q(tags__contains=DEMO_MARKER) | Q(document_number__startswith="CDDOC")).count()

    def _purge_documents(self, s: ModuleSummary) -> None:
        from apps.documents.models import Document

        qs = Document.objects.filter(Q(tags__contains=DEMO_MARKER) | Q(document_number__startswith="CDDOC"))
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

    def _load_notifications_app(self, s: ModuleSummary) -> None:
        from apps.notifications_app.models import Notification, NotificationLog, NotificationPreference, NotificationTemplate

        admin = self._admin()
        users = self._ensure_staff_users() + self._ensure_technician_users(min(self.count, 5))
        before = self._count_notifications_app()
        template, _ = NotificationTemplate.objects.get_or_create(
            name=f"{DEMO_PREFIX} Work Order Update",
            channel="email",
            defaults={
                "template_type": "work_order_completed",
                "subject": "Demo work order update",
                "body": f"{DEMO_MARKER} Work order {{work_order_number}} is ready for review.",
                "html_body": f"<p>{DEMO_MARKER} Work order update.</p>",
                "variables": {"work_order_number": "CDW000001"},
                "is_active": True,
                "created_by": admin,
            },
        )
        for i, user in enumerate(users[: self.count], start=1):
            NotificationPreference.objects.get_or_create(
                user=user,
                defaults={
                    "email_enabled": True,
                    "sms_enabled": False,
                    "push_enabled": True,
                    "in_app_enabled": True,
                    "phone_number": _phone(5000 + i),
                },
            )
            notification, created = Notification.objects.get_or_create(
                recipient=user,
                title=f"{DEMO_MARKER} Demo service update {i:03d}",
                channel="in_app",
                defaults={
                    "notification_type": "work_order",
                    "priority": "normal",
                    "message": f"{DEMO_MARKER} Your demo work order has moved to the next workflow step.",
                    "status": "delivered",
                    "is_read": i % 2 == 0,
                    "sent_at": self.now,
                    "delivered_at": self.now,
                    "related_object_type": "workorder",
                    "related_object_id": i,
                    "template": template,
                    "data": {"demo": True, "marker": DEMO_MARKER},
                },
            )
            NotificationLog.objects.get_or_create(
                notification=notification,
                action="delivered",
                defaults={"details": f"{DEMO_MARKER} In-app demo notification delivered.", "metadata": {"demo": True}},
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_notifications_app(self) -> int:
        from apps.notifications_app.models import Notification

        return Notification.objects.filter(message__contains=DEMO_MARKER).count()

    def _purge_notifications_app(self, s: ModuleSummary) -> None:
        from apps.notifications_app.models import Notification, NotificationTemplate

        notifications = Notification.objects.filter(message__contains=DEMO_MARKER)
        templates = NotificationTemplate.objects.filter(body__contains=DEMO_MARKER)
        s.purged = notifications.count() + templates.count()
        notifications.delete()
        templates.delete()

    def _load_reporting(self, s: ModuleSummary) -> None:
        from apps.reporting.models import DashboardWidget, ReportExportLog, ReportSchedule, SavedReport

        admin = self._admin()
        before = self._count_reporting()
        for i in range(1, min(self.count, 12) + 1):
            _, created_schedule = ReportSchedule.objects.get_or_create(
                name=f"{DEMO_PREFIX} Weekly Operations {i:03d}",
                defaults={
                    "report_type": ["work_orders", "revenue", "inventory", "technician_performance"][i % 4],
                    "frequency": "weekly",
                    "email_recipients": admin.email,
                    "is_active": True,
                    "next_run_date": self.now + timedelta(days=i),
                    "parameters": {"marker": DEMO_MARKER, "demo": True},
                    "created_by": admin,
                },
            )
            _, created_saved = SavedReport.objects.get_or_create(
                name=f"{DEMO_PREFIX} Saved Dashboard {i:03d}",
                created_by=admin,
                defaults={
                    "report_type": "dashboard_overview",
                    "description": f"{DEMO_MARKER} Saved report for demo analytics.",
                    "parameters": {"marker": DEMO_MARKER, "date_range": "last_30_days"},
                    "is_public": True,
                },
            )
            DashboardWidget.objects.get_or_create(
                user=admin,
                widget_type=["revenue_today", "appointments_today", "active_work_orders", "low_stock"][i % 4],
                defaults={"position": i, "width": 6, "height": 4, "settings": {"marker": DEMO_MARKER}, "is_visible": True},
            )
            ReportExportLog.objects.get_or_create(
                report_type="dashboard_overview",
                report_name=f"{DEMO_PREFIX} Export {i:03d}",
                file_name=f"client-demo-report-{i:03d}.xlsx",
                defaults={
                    "export_format": "xlsx",
                    "status": "completed",
                    "parameters": {"marker": DEMO_MARKER},
                    "created_by": admin,
                    "ip_address": "127.0.0.1",
                    "user_agent": "client-demo-data",
                },
            )
            if created_schedule or created_saved:
                s.created += int(created_schedule) + int(created_saved)
        s.existing = before

    def _count_reporting(self) -> int:
        from apps.reporting.models import ReportSchedule, SavedReport

        return (
            ReportSchedule.objects.filter(parameters__marker=DEMO_MARKER).count()
            + SavedReport.objects.filter(parameters__marker=DEMO_MARKER).count()
        )

    def _purge_reporting(self, s: ModuleSummary) -> None:
        from apps.reporting.models import DashboardWidget, ReportExportLog, ReportSchedule, SavedReport

        schedules = ReportSchedule.objects.filter(parameters__marker=DEMO_MARKER)
        saved = SavedReport.objects.filter(parameters__marker=DEMO_MARKER)
        widgets = DashboardWidget.objects.filter(settings__marker=DEMO_MARKER)
        logs = ReportExportLog.objects.filter(parameters__marker=DEMO_MARKER)
        s.purged = schedules.count() + saved.count() + widgets.count() + logs.count()
        schedules.delete()
        saved.delete()
        widgets.delete()
        logs.delete()

    def _load_quickbooks_online(self, s: ModuleSummary) -> None:
        from django.contrib.contenttypes.models import ContentType
        from apps.billing.models import Invoice
        from apps.quickbooks_online.models import QBOConfig, QBOMapping, QBOSyncLog

        admin = self._admin()
        self._load_billing(ModuleSummary(module="billing", target=self.count))
        before = self._count_quickbooks_online()
        config, created_config = QBOConfig.objects.get_or_create(
            client_id="client-demo-qbo",
            defaults={
                "client_secret": "client-demo-secret",
                "realm_id": "client-demo-realm",
                "is_sandbox": True,
                "is_active": False,
            },
        )
        invoice = Invoice.objects.filter(description__contains=DEMO_MARKER).first()
        if invoice:
            QBOMapping.objects.get_or_create(
                content_type=ContentType.objects.get_for_model(Invoice),
                object_id=invoice.id,
                defaults={"qbo_id": "CD-QBO-INVOICE-001", "qbo_sync_token": "0", "status": "pending", "error_message": DEMO_MARKER},
            )
        _, created_log = QBOSyncLog.objects.get_or_create(
            entity_type="invoice",
            error_message=DEMO_MARKER,
            defaults={
                "finished_at": self.now,
                "records_pulled": 0,
                "records_created": 0,
                "records_updated": 0,
                "records_skipped": 1,
                "status": "success",
                "triggered_by": admin,
            },
        )
        s.existing = before
        s.created = int(created_config) + int(created_log)
        if config.is_active:
            s.warnings.append("Demo QuickBooks config was found active; seed does not call external APIs.")

    def _count_quickbooks_online(self) -> int:
        from apps.quickbooks_online.models import QBOConfig, QBOSyncLog

        return QBOConfig.objects.filter(client_id="client-demo-qbo").count() + QBOSyncLog.objects.filter(error_message=DEMO_MARKER).count()

    def _purge_quickbooks_online(self, s: ModuleSummary) -> None:
        from apps.quickbooks_online.models import QBOConfig, QBOMapping, QBOSyncLog

        configs = QBOConfig.objects.filter(client_id="client-demo-qbo")
        logs = QBOSyncLog.objects.filter(error_message=DEMO_MARKER)
        mappings = QBOMapping.objects.filter(error_message=DEMO_MARKER)
        s.purged = configs.count() + logs.count() + mappings.count()
        mappings.delete()
        logs.delete()
        configs.delete()

    def _load_portal(self, s: ModuleSummary) -> None:
        self._ensure_customers(self.count)
        self._ensure_vehicles(self.count)
        self._load_appointments(ModuleSummary(module="appointments", target=self.count))
        self._load_workorders(ModuleSummary(module="workorders", target=self.count))
        self._load_inspections(ModuleSummary(module="inspections", target=self.count))
        self._load_billing(ModuleSummary(module="billing", target=self.count))
        s.existing = self._count_portal()
        s.created = 0
        s.warnings.append("Portal has no dedicated persistent model; demo coverage comes from customer vehicles, bookings, history, inspections, and invoices.")

    def _count_portal(self) -> int:
        from apps.billing.models import Invoice
        from apps.workorders.models import WorkOrder

        return WorkOrder.objects.filter(customer_concerns__contains=DEMO_MARKER).count() + Invoice.objects.filter(description__contains=DEMO_MARKER).count()

    def _purge_portal(self, s: ModuleSummary) -> None:
        s.existing = self._count_portal()
        s.skipped += 1
        s.warnings.append("Portal data is purged through customers, vehicles, appointments, workorders, inspections, and billing modules.")
