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
from apps.accounts.seed_identity import (
    SEED_BRANCH_CODE,
    SEED_EMAIL_DOMAIN,
    SEED_MARKER,
    SEED_PASSWORD,
    SEED_TAG,
    seed_customers_qs,
    seed_email,
    seed_invoices_qs,
    seed_person_email,
    seed_staff_email,
    seed_users_qs,
    seed_vehicles_qs,
    seed_workorders_qs,
    tagged,
    username_from_name,
    DEMO_EMAIL_DOMAIN,
    DEMO_MARKER,
    DEMO_PREFIX,
)

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
    return _stable_code(f"SEED:VIN:{i}", 17, ALLOWED_VIN_CHARS)


def _phone(i: int) -> str:
    return f"+23330{i:07d}"[:15]


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
        return {"action": "refreshed", "seed": SEED_TAG, "modules": refreshed}

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
        with self._muted_demo_side_effects():
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
            response["scope"] = "permanent" if permanent else "seed"
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
        return {"action": "status", "seed": SEED_TAG, "modules": data}

    def _response(self, action: str, modules: list[str]) -> dict:
        return {
            "action": action,
            "seed": SEED_TAG,
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
                CashCount,
                CashierTill,
                CreditNote,
                CreditNoteApplication,
                Estimate,
                Invoice,
                Payment,
                PaymentAllocation,
                Refund,
                SalesOrder,
                TillCashMovement,
                VendorCredit,
                VendorCreditApplication,
            )

            for model, label in [
                (Refund, "refund"),
                (PaymentAllocation, "payment allocation"),
                (BillPayment, "bill payment"),
                (Payment, "payment"),
                (CreditNoteApplication, "credit note application"),
                (VendorCreditApplication, "vendor credit application"),
                (VendorCredit, "vendor credit"),
                (CreditNote, "credit note"),
                (TillCashMovement, "till cash movement"),
                (CashCount, "cash count"),
                (CashierTill, "cashier till"),
                (Bill, "bill"),
                (SalesOrder, "sales order"),
                (Invoice, "invoice"),
                (Estimate, "estimate"),
            ]:
                self._delete_queryset(summary, model.objects.all(), label=label)
            return

        if module == "accounting":
            from apps.accounting.models import (
                Accrual,
                AccountingControl,
                AuditLog,
                BankStatement,
                BankStatementLine,
                Budget,
                BudgetLine,
                FundTransfer,
                JournalEntry,
                RevenueProduct,
                Transaction,
                VatReturn,
            )

            controls = AccountingControl.get_settings()
            if controls.period_lock_date:
                controls.period_lock_date = None
                controls.save(update_fields=["period_lock_date"])
                summary.warnings.append("Cleared accounting period lock to allow GL purge.")

            for model, label in [
                (AuditLog, "accounting audit log"),
                (VatReturn, "VAT return"),
                (Accrual, "accrual"),
                (FundTransfer, "fund transfer"),
                (BankStatementLine, "bank statement line"),
                (BankStatement, "bank statement"),
                (BudgetLine, "budget line"),
                (Budget, "budget"),
                (Transaction, "GL transaction line"),
                (JournalEntry, "journal entry"),
                (RevenueProduct, "revenue product"),
            ]:
                self._delete_queryset(summary, model.objects.all(), label=label)
            return

        if module == "diagnosis":
            from apps.diagnosis.models import Diagnosis

            self._delete_queryset(summary, Diagnosis.objects.all(), label="diagnosis")
            return

        if module == "inspections":
            from apps.inspections.models import (
                InspectionCategory,
                InspectionItem,
                InspectionPhoto,
                InspectionResult,
                InspectionTemplate,
                VehicleInspection,
            )

            for model, label in [
                (InspectionPhoto, "inspection photo"),
                (InspectionResult, "inspection result"),
                (VehicleInspection, "inspection"),
                (InspectionItem, "inspection template item"),
                (InspectionCategory, "inspection template category"),
                (InspectionTemplate, "inspection template"),
            ]:
                self._delete_queryset(summary, model.objects.all(), label=label)
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
            from apps.inventory.models import (
                InventoryTransaction,
                Part,
                PartCategory,
                PhysicalCountItem,
                PhysicalCountSession,
                PurchaseOrder,
                PurchaseOrderApproval,
                PurchaseOrderItem,
                ServiceBundle,
                ServiceBundleItem,
                ServicePackage,
                ServicePackagePart,
                StockAlert,
                StockItem,
                Supplier,
                Transfer,
                TransferApproval,
                TransferItem,
            )

            for model, label in [
                (StockAlert, "stock alert"),
                (InventoryTransaction, "inventory transaction"),
                (PhysicalCountItem, "physical count item"),
                (PhysicalCountSession, "physical count session"),
                (TransferItem, "transfer item"),
                (TransferApproval, "transfer approval"),
                (Transfer, "transfer"),
                (PurchaseOrderItem, "purchase order item"),
                (PurchaseOrderApproval, "purchase order approval"),
                (PurchaseOrder, "purchase order"),
                (StockItem, "stock item"),
                (ServiceBundleItem, "service bundle item"),
                (ServiceBundle, "service bundle"),
                (ServicePackagePart, "service package part"),
                (ServicePackage, "service package"),
                (Part, "part"),
                (Supplier, "supplier"),
                (PartCategory, "part category"),
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
            from apps.vehicles.models import (
                Vehicle,
                VehicleDocument,
                VehicleMileageHistory,
                VehicleOwnershipHistory,
                VehiclePhoto,
                VehicleServiceSchedule,
            )

            self._delete_queryset(summary, VehicleOwnershipHistory.objects.all(), label="vehicle ownership history")
            self._permanent_purge_dependents(summary, exclude={"vehicles", "customers"})
            for model, label in [
                (VehicleMileageHistory, "vehicle mileage history"),
                (VehicleDocument, "vehicle document"),
                (VehiclePhoto, "vehicle photo"),
                (VehicleServiceSchedule, "vehicle service schedule"),
                (Vehicle, "vehicle"),
            ]:
                self._delete_queryset(summary, model.objects.all(), label=label)
            return

        if module == "feedback":
            from apps.feedback.models import Feedback

            self._delete_queryset(summary, Feedback.objects.all(), label="feedback")
            return

        if module == "customers":
            from apps.customers.models import Customer
            from apps.vehicles.models import Vehicle, VehicleOwnershipHistory

            self._permanent_purge_dependents(summary, exclude={"customers", "vehicles"})
            self._delete_queryset(summary, VehicleOwnershipHistory.objects.all(), label="vehicle ownership history")
            self._delete_queryset(summary, Vehicle.objects.all(), label="vehicle")
            customer_users = User.objects.filter(role="customer")
            self._delete_queryset(summary, Customer.objects.all(), label="customer profile")
            self._delete_queryset(summary, customer_users, label="customer user")
            return

        if module == "notifications_app":
            from apps.notifications_app.models import (
                Notification,
                NotificationLog,
                NotificationPreference,
                WebPushSubscription,
            )

            for model, label in [
                (NotificationLog, "notification log"),
                (Notification, "notification"),
                (WebPushSubscription, "web push subscription"),
                (NotificationPreference, "notification preference"),
            ]:
                self._delete_queryset(summary, model.objects.all(), label=label)
            return

        if module == "reporting":
            from apps.reporting.models import DashboardWidget, ReportExportLog, ReportSchedule, SavedReport

            for model, label in [
                (ReportExportLog, "report export log"),
                (DashboardWidget, "dashboard widget"),
                (SavedReport, "saved report"),
                (ReportSchedule, "report schedule"),
            ]:
                self._delete_queryset(summary, model.objects.all(), label=label)
            return

        if module == "quickbooks_online":
            from apps.quickbooks_online.models import (
                QBOAccountMapping,
                QBOConfig,
                QBOMapping,
                QBOSyncLog,
                QBOToken,
            )

            self._delete_queryset(summary, QBOSyncLog.objects.all(), label="QBO sync log")
            self._delete_queryset(summary, QBOMapping.objects.all(), label="QBO mapping")
            self._delete_queryset(summary, QBOAccountMapping.objects.all(), label="QBO account mapping")
            self._delete_queryset(summary, QBOToken.objects.all(), label="QBO token")
            for config in QBOConfig.objects.all():
                config.realm_id = ""
                config.is_active = False
                config.save(update_fields=["realm_id", "is_active"])
            summary.warnings.append("QBO credentials in Integrations settings were preserved; reconnect QuickBooks after cleanup.")
            return

        if module == "accounts":
            staff_users = User.objects.filter(is_superuser=False)
            self._delete_queryset(summary, staff_users, label="non-superuser account")
            summary.warnings.append("Superuser accounts were preserved so you can still sign in.")
            return

        if module == "branches":
            from apps.branches.models import Branch

            self._delete_queryset(summary, Branch.objects.all(), label="branch")
            return

        if module == "portal":
            summary.warnings.append("Portal data is removed through customers, vehicles, work orders, and billing cleanup.")
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
            username="clara.bennett",
            email=seed_email("admin"),
            password=SEED_PASSWORD,
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
            code=SEED_BRANCH_CODE,
            defaults={
                "name": "North Ridge Auto Service",
                "phone": "+233302000000",
                "email": seed_email("workshop"),
                "address": "100 Independence Avenue",
                "city": "Accra",
                "state": "Greater Accra",
                "zip_code": "GA-100",
                "country": "Ghana",
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
            first_name, last_name = STAFF_NAMES[role]
            email = seed_staff_email(role, STAFF_NAMES)
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "username": username_from_name(first_name, last_name),
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
                user.set_password(SEED_PASSWORD)
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
            first_name, last_name = TECHNICIAN_NAMES[(i - 1) % len(TECHNICIAN_NAMES)]
            email = seed_person_email(first_name, last_name, i)
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "username": username_from_name(first_name, last_name, suffix=f"+{i:03d}"),
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
                user.set_password(SEED_PASSWORD)
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
            first_name, last_name = CUSTOMER_NAMES[(i - 1) % len(CUSTOMER_NAMES)]
            email = seed_person_email(first_name, last_name, i)
            street = STREETS[(i - 1) % len(STREETS)]
            user, user_created = User.objects.get_or_create(
                email=email,
                defaults={
                    "username": username_from_name(first_name, last_name, suffix=f"+{i:03d}"),
                    "first_name": first_name,
                    "last_name": last_name,
                    "role": "customer",
                    "is_active": True,
                    "phone": _phone(1000 + i),
                    "address": f"{100 + i} {street}",
                    "city": "Accra",
                    "state": "Greater Accra",
                    "zip_code": "GA-100",
                    "country": "Ghana",
                },
            )
            if user_created:
                user.set_password(SEED_PASSWORD)
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
                    "customer_type": "individual",
                    "status": "active",
                    "preferred_contact_method": "email",
                    "marketing_emails": True,
                    "marketing_sms": False,
                    "notes": f"Prefers email updates for service appointments.",
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
                    "license_plate": f"GR-{i:05d}"[:20],
                    "license_plate_state": "GR",
                    "current_mileage": 15000 + i * 321,
                    "mileage_unit": "miles",
                    "engine_type": "gasoline",
                    "transmission_type": "automatic",
                    "status": "active",
                    "notes": f"Vehicle registered for routine service.",
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
        return seed_users_qs().count()

    def _purge_accounts(self, s: ModuleSummary) -> None:
        s.existing = self._count_accounts()
        s.skipped += 1
        s.warnings.append("Seed account users are foundational and are preserved; purge dependent modules or use permanent cleanup if needed.")

    def _load_branches(self, s: ModuleSummary) -> None:
        before = self._count_branches()
        self._branch()
        s.existing = before
        s.created = max(0, self._count_branches() - before)

    def _count_branches(self) -> int:
        from apps.branches.models import Branch

        return Branch.objects.filter(code=SEED_BRANCH_CODE).count()

    def _purge_branches(self, s: ModuleSummary) -> None:
        s.existing = self._count_branches()
        s.skipped += 1
        s.warnings.append("Seed branch is foundational and is preserved to avoid deleting protected references.")

    def _load_customers(self, s: ModuleSummary) -> None:
        before = self._count_customers()
        self._ensure_customers(self.count)
        after = self._count_customers()
        s.existing = before
        s.created = max(0, after - before)

    def _count_customers(self) -> int:
        from apps.customers.models import Customer

        return seed_customers_qs().count()

    def _purge_customers(self, s: ModuleSummary) -> None:
        self._purge_demo_dependents(s, exclude={"customers", "vehicles", "technicians", "hr"})
        self._purge_vehicles(ModuleSummary(module="vehicles"))
        qs = seed_users_qs().filter(role="customer")
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

        return seed_vehicles_qs().count()

    def _purge_vehicles(self, s: ModuleSummary) -> None:
        from apps.vehicles.models import Vehicle

        self._purge_demo_dependents(s, exclude={"customers", "vehicles", "technicians", "hr"})
        qs = seed_vehicles_qs()
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
                s.warnings.append(f"Purged {child_summary.purged} dependent seed {module} records first.")

    def _load_technicians(self, s: ModuleSummary) -> None:
        from apps.technicians.models import Skill, Technician

        before = self._count_technicians()
        skill, _ = Skill.objects.get_or_create(name="Advanced Diagnostics", defaults={"description": "Workshop operations and service records."})
        for user in self._ensure_technician_users(self.count):
            tech, created = Technician.objects.get_or_create(
                user=user,
                defaults={
                    "bio": f"Experienced automotive technician assigned to service and repair workflows.",
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

        return seed_users_qs().filter(role="technician").count()

    def _purge_technicians(self, s: ModuleSummary) -> None:
        qs = seed_users_qs().filter(role="technician")
        s.purged = qs.count()
        qs.delete()

    def _load_appointments(self, s: ModuleSummary) -> None:
        from apps.appointments.models import Appointment, ServiceBay

        branch = self._branch()
        customers = self._ensure_customers(self.count)
        vehicles = self._ensure_vehicles(self.count)
        techs = self._ensure_technician_users(self.count)
        bay, _ = ServiceBay.objects.get_or_create(
            name=f"Bay",
            defaults={"bay_type": "general", "equipment_available": "Lift, air tools, diagnostic scanner", "is_active": True},
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
                    "customer_concerns": f"Customer reports intermittent engine noise and requests routine service.",
                    "special_instructions": f"Confirm pickup time with customer before closing job.",
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

        return Appointment.objects.filter(customer__in=seed_customers_qs()).count()

    def _purge_appointments(self, s: ModuleSummary) -> None:
        from apps.appointments.models import Appointment

        qs = Appointment.objects.filter(customer__in=seed_customers_qs())
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
        coordinator = seed_users_qs().filter(role="service_coordinator").first()
        before = self._count_workorders()
        statuses = ["draft", "assigned", "diagnosis", "approved", "in_progress", "completed", "closed"]
        for i in range(1, self.count + 1):
            tech = techs[i - 1]
            wo, created = WorkOrder.objects.get_or_create(
                work_order_number=f"WO-{self.today.year}-{i:06d}",
                defaults={
                    "branch": branch,
                    "customer": customers[i - 1],
                    "vehicle": vehicles[i - 1],
                    "status": statuses[i % len(statuses)],
                    "priority": ["low", "normal", "high", "urgent"][i % 4],
                    "service_coordinator": coordinator,
                    "primary_technician": tech,
                    "customer_concerns": f"Check engine light, brake vibration, and scheduled maintenance request.",
                    "special_instructions": f"Customer prefers email updates and afternoon pickup.",
                    "diagnosis_notes": f"Initial scan and road test completed; service recommendations recorded.",
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
                    "visual_inspection_notes": f"Intake triage found brake vibration and service due indicators.",
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
                    description=f"{description}",
                    defaults={
                        "task_type": task_type,
                        "status": "completed" if wo.status in {"completed", "closed"} else "in_progress",
                        "sequence_order": order,
                        "assigned_to": tech,
                        "estimated_hours": hours,
                        "actual_hours": hours if wo.status in {"completed", "closed"} else Decimal("0.50"),
                        "labor_rate": Decimal("95.00"),
                        "detailed_notes": f"Scheduled service task for routine maintenance.",
                    },
                )
                TechnicianTimeLog.objects.get_or_create(
                    work_order=wo,
                    task=task,
                    technician=tech,
                    description=f"Time logged for {description.lower()}.",
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
                note=f"Customer approved recommended service and requested pickup notification.",
                defaults={"note_type": "customer", "created_by": coordinator or self._admin(), "is_customer_visible": True},
            )
            WorkOrderPart.objects.get_or_create(
                work_order=wo,
                part_number=f"WOP-{i:04d}",
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
                    "description": f"Replacement part for scheduled repair.",
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_workorders(self) -> int:
        from apps.workorders.models import WorkOrder

        return seed_workorders_qs().count()

    def _purge_workorders(self, s: ModuleSummary) -> None:
        from apps.workorders.models import WorkOrder

        qs = seed_workorders_qs()
        s.purged = qs.count()
        qs.delete()

    def _inspection_template(self):
        from apps.inspections.models import InspectionCategory, InspectionItem, InspectionTemplate

        template, _ = InspectionTemplate.objects.get_or_create(
            name=f"Multipoint Inspection",
            defaults={"description": "Workshop operations and service records.", "is_active": True, "created_by": self._admin()},
        )
        category, _ = InspectionCategory.objects.get_or_create(
            template=template,
            name=f"Safety",
            defaults={"description": "Workshop operations and service records.", "order": 1},
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
        workorders = list(seed_workorders_qs().order_by("id")[: self.count])
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
                    "notes": f"Multipoint inspection completed for customer review.",
                    "recommendations": f"Replace worn brake pads and schedule next oil service.",
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
                        "text_note": f"Item checked during multipoint inspection.",
                        "recommendation": f"Monitor at next service." if result_value == "advisory" else "",
                        "estimated_cost": Decimal("75.00") if result_value == "advisory" else None,
                        "notes": "Recorded during service visit.",
                    },
                )
            if created:
                s.created += 1
        s.existing = before

    def _count_inspections(self) -> int:
        from apps.inspections.models import VehicleInspection

        return VehicleInspection.objects.filter(vehicle__in=seed_vehicles_qs()).count()

    def _purge_inspections(self, s: ModuleSummary) -> None:
        from apps.inspections.models import VehicleInspection

        qs = VehicleInspection.objects.filter(vehicle__in=seed_vehicles_qs())
        s.purged = qs.count()
        qs.delete()

    def _load_diagnosis(self, s: ModuleSummary) -> None:
        from apps.diagnosis.models import Diagnosis, DiagnosisFinding, DiagnosticCode, RepairRecommendation
        from apps.workorders.models import WorkOrder

        self._load_workorders(ModuleSummary(module="workorders", target=self.count))
        workorders = list(seed_workorders_qs().order_by("id")[: self.count])
        before = self._count_diagnosis()
        for i, wo in enumerate(workorders, start=1):
            diagnosis, created = Diagnosis.objects.get_or_create(
                work_order=wo,
                defaults={
                    "customer_complaint": f"Vehicle loses power under acceleration and idles roughly.",
                    "status": "completed",
                    "technician": wo.primary_technician,
                    "started_at": self.now - timedelta(days=i % 10),
                    "completed_at": self.now,
                    "initial_observations": f"Technician observed rough idle after warm start.",
                    "diagnostic_notes": f"Scan results and visual checks indicate ignition and air intake service required.",
                    "root_cause": f"Worn ignition components and restricted air filter.",
                    "is_completed": True,
                },
            )
            code, _ = DiagnosticCode.objects.get_or_create(
                diagnosis=diagnosis,
                code_number=f"CDP{i:04d}",
                defaults={
                    "code_type": "obd_ii",
                    "description": f"Random misfire detected during diagnostic scan.",
                    "severity": "warning",
                    "status": "active",
                    "freeze_frame_data": {"rpm": 1850 + i, "speed": 30 + i},
                },
            )
            finding, _ = DiagnosisFinding.objects.get_or_create(
                diagnosis=diagnosis,
                finding_title=f"Ignition service required {i:03d}",
                defaults={
                    "category": "engine",
                    "description": f"Spark plug wear and restricted intake airflow confirmed during diagnostic checks.",
                    "severity": "major",
                    "root_cause": "Worn ignition parts",
                    "contributing_factors": "Delayed maintenance interval",
                    "status": "confirmed",
                },
            )
            finding.diagnostic_codes.add(code)
            recommendation, _ = RepairRecommendation.objects.get_or_create(
                diagnosis=diagnosis,
                description=f"Replace spark plug set and engine air filter.",
                defaults={
                    "recommendation_type": "replace",
                    "priority": "necessary",
                    "estimated_parts_cost": _money(i, 80),
                    "estimated_labor_hours": Decimal("1.50"),
                    "estimated_labor_cost": _money(i, 120),
                    "estimated_total_cost": _money(i, 220),
                    "approval_status": "approved" if i % 3 != 0 else "pending_approval",
                    "decision_method": "phone" if i % 3 != 0 else "",
                    "decision_notes": f"Customer decision recorded.",
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

        return Diagnosis.objects.filter(work_order__in=seed_workorders_qs()).count()

    def _purge_diagnosis(self, s: ModuleSummary) -> None:
        from apps.diagnosis.models import Diagnosis

        qs = Diagnosis.objects.filter(work_order__in=seed_workorders_qs())
        s.purged = qs.count()
        qs.delete()

    def _load_gatepass(self, s: ModuleSummary) -> None:
        from apps.gatepass.models import GatePass
        from apps.workorders.models import WorkOrder

        self._load_workorders(ModuleSummary(module="workorders", target=self.count))
        workorders = list(seed_workorders_qs().order_by("id")[: self.count])
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
                    "pickup_notes": f"Vehicle released after invoice confirmation and customer ID check.",
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

        return GatePass.objects.filter(work_order__in=seed_workorders_qs()).count()

    def _purge_gatepass(self, s: ModuleSummary) -> None:
        from apps.gatepass.models import GatePass

        qs = GatePass.objects.filter(work_order__in=seed_workorders_qs())
        s.purged = qs.count()
        qs.delete()

    def _inventory_foundation(self):
        from apps.inventory.models import PartCategory, Supplier

        category, _ = PartCategory.objects.get_or_create(name="Workshop Consumables", defaults={"description": "Workshop operations and service records.", "is_active": True})
        supplier, _ = Supplier.objects.get_or_create(
            supplier_code="SUP-ATL",
            defaults={
                "name": "Atlantic Auto Parts",
                "supplier_type": "distributor",
                "email": seed_email("supplier"),
                "phone": "+233302009999",
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
                part_number=f"PRT-{i:04d}",
                defaults={
                    "name": part_name,
                    "description": f"Stock item used for repair and maintenance workflows.",
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
                    "bin_location": f"A-{i:03d}",
                    "is_active": True,
                    "is_taxable": True,
                    "created_by": self._admin(),
                },
            )
            part.suppliers.add(supplier)
            InventoryTransaction.objects.get_or_create(
                part=part,
                transaction_type="purchase",
                reason=f"Initial stock receipt",
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

        return Part.objects.filter(part_number__startswith="PRT-").count()

    def _purge_inventory(self, s: ModuleSummary) -> None:
        from apps.inventory.models import InventoryTransaction, Part

        parts = Part.objects.filter(part_number__startswith="PRT-")
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
        workorders = list(seed_workorders_qs().order_by("id")[: self.count])
        before = self._count_billing()
        for i in range(1, self.count + 1):
            total = _money(i, 300)
            work_order = workorders[i - 1] if i <= len(workorders) else None
            estimate, _ = Estimate.objects.get_or_create(
                estimate_number=f"EST-{i:05d}",
                defaults={
                    "branch": branch,
                    "customer": customers[i - 1],
                    "vehicle": vehicles[i - 1],
                    "work_order": work_order,
                    "status": "approved",
                    "estimate_date": self.today - timedelta(days=i % 15),
                    "valid_until": self.today + timedelta(days=15),
                    "title": f"Service estimate",
                    "description": f"Estimate for diagnostic and repair service.",
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
                invoice_number=f"INV-{i:05d}",
                defaults={
                    "branch": branch,
                    "customer": customers[i - 1],
                    "vehicle": vehicles[i - 1],
                    "work_order": work_order,
                    "estimate": estimate,
                    "status": "draft",
                    "invoice_date": self.today - timedelta(days=i % 20),
                    "due_date": self.today + timedelta(days=15),
                    "description": f"Repair invoice for maintenance and diagnostic service.",
                    "notes": "Invoice generated after service completion.",
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
                description=f"Labor service",
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
                description=f"Repair parts",
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
                    payment_number=f"PAY-{i:05d}",
                    defaults={
                        "invoice": invoice,
                        "customer": invoice.customer,
                        "payment_method": "check",
                        "bank_account": AccountingControl.get_settings().default_bank_account,
                        "status": "completed",
                        "amount": invoice.total,
                        "reference_number": f"PAY--REF-{i:05d}",
                        "notes": "Recorded during service visit.",
                        "processed_by": self._admin(),
                    },
                )
        s.existing = before

    def _count_billing(self) -> int:
        from apps.billing.models import Invoice

        return seed_invoices_qs().count()

    def _purge_billing(self, s: ModuleSummary) -> None:
        from apps.billing.models import Invoice, Payment

        invoices = seed_invoices_qs()
        Payment.objects.filter(invoice__in=invoices).delete()
        s.purged = invoices.count()
        invoices.delete()

    def _load_accounting(self, s: ModuleSummary) -> None:
        from apps.accounting.models import Account, JournalEntry, Transaction

        cash, _ = Account.objects.get_or_create(code="1110", defaults={"name": "Workshop Cash Account", "account_type": "asset", "balance_type": "debit", "description": "Petty cash and workshop receipts"})
        income, _ = Account.objects.get_or_create(code="4100", defaults={"name": "Service Labor Income", "account_type": "income", "balance_type": "credit", "description": "Labor revenue from repairs and maintenance"})
        before = self._count_accounting()
        for i in range(1, self.count + 1):
            je, created = JournalEntry.objects.get_or_create(
                reference=f"JE-SEED-{i:05d}",
                defaults={
                    "date": self.today - timedelta(days=i % 30),
                    "description": f"Posted service revenue entry {i}.",
                    "created_by": self._admin(),
                    "branch": self._branch(),
                },
            )
            amount = _money(i, 200)
            Transaction.objects.get_or_create(journal_entry=je, account=cash, transaction_type="debit", defaults={"amount": amount, "description": "Workshop operations and service records."})
            Transaction.objects.get_or_create(journal_entry=je, account=income, transaction_type="credit", defaults={"amount": amount, "description": "Workshop operations and service records."})
            if created:
                s.created += 1
        s.existing = before

    def _count_accounting(self) -> int:
        from apps.accounting.models import JournalEntry

        return JournalEntry.objects.filter(reference__startswith="JE-SEED-").count()

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
        dept, _ = Department.objects.get_or_create(name=f"Workshop", branch=branch, defaults={"description": "Workshop operations and service records."})
        pos, _ = Position.objects.get_or_create(title=f"Technician", department=dept, defaults={"min_salary": Decimal("2000"), "max_salary": Decimal("8000")})
        training, _ = TrainingProgram.objects.get_or_create(
            name=f"Safety & Diagnostics",
            defaults={
                "description": f"Workshop safety and diagnostic process training.",
                "trainer": "AAP Training Team",
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
                    "national_id": f"GHA-{i:09d}",
                    "tax_id": f"TIN-{i:08d}",
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
                    "notes": f"Regular shift attendance.",
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
                    "notes": f"Safety and equipment training completed.",
                },
            )
            PerformanceReview.objects.get_or_create(
                employee=employee,
                review_period_start=self.today - timedelta(days=120),
                review_period_end=self.today - timedelta(days=30),
                defaults={
                    "reviewer": self._admin(),
                    "overall_rating": 4,
                    "strengths": f"Strong diagnostic workflow and customer communication.",
                    "areas_for_improvement": "Continue improving estimate documentation.",
                    "goals": "Complete advanced electrical diagnostics training.",
                    "status": "submitted",
                    "submitted_at": self.now,
                },
            )
            ComplianceDocument.objects.get_or_create(
                employee=employee,
                name=f"Technician Certification {i:03d}",
                defaults={
                    "document_type": "certification",
                    "document_number": f"CERT-{i:05d}",
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

        return EmployeeProfile.objects.filter(user__in=seed_users_qs().filter(role="technician")).count()

    def _purge_hr(self, s: ModuleSummary) -> None:
        from apps.hr.models import EmployeeProfile

        qs = EmployeeProfile.objects.filter(user__in=seed_users_qs().filter(role="technician"))
        s.purged = qs.count()
        qs.delete()

    def _load_fixed_assets(self, s: ModuleSummary) -> None:
        from apps.fixed_assets.models import AssetCategory, FixedAsset

        category, _ = AssetCategory.objects.get_or_create(name=f"Equipment", defaults={"description": "Workshop operations and service records.", "default_useful_life_years": 5})
        branch = self._branch()
        before = self._count_fixed_assets()
        for i in range(1, self.count + 1):
            asset_name = ASSET_NAMES[(i - 1) % len(ASSET_NAMES)]
            _, created = FixedAsset.objects.get_or_create(
                asset_number=f"AST-{i:04d}",
                defaults={
                    "name": asset_name,
                    "description": f"Workshop equipment for service operations.",
                    "category": category,
                    "acquisition_cost": _money(i, 1000),
                    "acquisition_date": self.today - timedelta(days=365 + i),
                    "useful_life_years": 5,
                    "depreciation_start_date": self.today - timedelta(days=365 + i),
                    "branch": branch,
                    "location": "Main Workshop",
                    "manufacturer": ["Rotary", "Snap-on", "Bosch", "Hunter", "Ingersoll Rand"][i % 5],
                    "serial_number": f"SN-{i:06d}",
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_fixed_assets(self) -> int:
        from apps.fixed_assets.models import FixedAsset

        return FixedAsset.objects.filter(asset_number__startswith="AST-").count()

    def _purge_fixed_assets(self, s: ModuleSummary) -> None:
        from apps.fixed_assets.models import FixedAsset

        qs = FixedAsset.objects.filter(asset_number__startswith="AST-")
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
                request_number=f"RSA-{i:05d}",
                defaults={
                    "customer": customers[i - 1],
                    "vehicle": vehicles[i - 1],
                    "branch": self._branch(),
                    "service_type": service_types[i % len(service_types)],
                    "status": ["requested", "dispatched", "completed"][i % 3],
                    "breakdown_location": f"Near {STREETS[i % len(STREETS)]}, Accra.",
                    "description": f"Customer requested roadside assistance after vehicle would not restart.",
                    "customer_phone": _phone(1000 + i),
                    "notes": "Recorded during service visit.",
                    "created_by": self._admin(),
                },
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_roadside(self) -> int:
        from apps.roadside.models import RoadsideRequest

        return RoadsideRequest.objects.filter(customer__in=seed_customers_qs()).count()

    def _purge_roadside(self, s: ModuleSummary) -> None:
        from apps.roadside.models import RoadsideRequest

        qs = RoadsideRequest.objects.filter(customer__in=seed_customers_qs())
        s.purged = qs.count()
        qs.delete()

    def _load_subscriptions(self, s: ModuleSummary) -> None:
        from apps.subscriptions.models import Package, Subscription

        package, _ = Package.objects.get_or_create(
            code="PKG-ROADCARE",
            defaults={"name": "RoadCare Plus", "description": f"Annual roadside and inspection membership.", "price": Decimal("499.00"), "created_by": self._admin(), "features": {"roadside_first_aid": 2}},
        )
        customers = self._ensure_customers(self.count)
        vehicles = self._ensure_vehicles(self.count)
        before = self._count_subscriptions()
        for i in range(1, self.count + 1):
            _, created = Subscription.objects.get_or_create(
                subscription_number=f"SUB-{i:05d}",
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

        return Subscription.objects.filter(subscription_number__startswith="SUB-").count()

    def _purge_subscriptions(self, s: ModuleSummary) -> None:
        from apps.subscriptions.models import Subscription

        qs = Subscription.objects.filter(subscription_number__startswith="SUB-")
        s.purged = qs.count()
        qs.delete()

    def _load_documents(self, s: ModuleSummary) -> None:
        from apps.billing.models import Invoice
        from apps.documents.models import Document, DocumentAccess, DocumentCategory, DocumentShare, DocumentSignature, DocumentVersion
        from apps.workorders.models import WorkOrder

        category, _ = DocumentCategory.objects.update_or_create(
            slug="svr-seed-documents",
            defaults={"name": f"Service Records", "description": "Workshop operations and service records."},
        )
        customers = self._ensure_customers(self.count)
        vehicles = self._ensure_vehicles(self.count)
        workorders = list(seed_workorders_qs().order_by("id")[: self.count])
        invoices = list(seed_invoices_qs().order_by("id")[: self.count])
        before = self._count_documents()
        for i in range(1, self.count + 1):
            title = DOCUMENT_TITLES[(i - 1) % len(DOCUMENT_TITLES)]
            doc, created = Document.objects.get_or_create(
                document_number=f"DOC-{i:05d}",
                defaults={
                    "title": title,
                    "description": f"Service record for {title.lower()}.",
                    "category": category,
                    "file": ContentFile(f"{title}\n".encode("utf-8"), name=f"client-record-{i:03d}.txt"),
                    "file_size": 1,
                    "file_type": "text/plain",
                    "original_filename": f"client-record-{i:03d}.txt",
                    "tags": SEED_TAG,
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
                    "file": ContentFile(f"{title} v1\n".encode("utf-8"), name=f"client-record-{i:03d}-v1.txt"),
                    "file_size": 1,
                    "file_type": "text/plain",
                    "original_filename": f"client-record-{i:03d}-v1.txt",
                    "changes_description": "Initial document version uploaded.",
                    "uploaded_by": self._admin(),
                },
            )
            share, _ = DocumentShare.objects.get_or_create(
                document=doc,
                shared_with_email=customers[i - 1].user.email,
                defaults={
                    "shared_by": self._admin(),
                    "access_code": f"SHR-{i:04d}"[:20],
                    "expires_at": self.now + timedelta(days=30),
                    "max_views": 10,
                },
            )
            DocumentAccess.objects.get_or_create(
                document=doc,
                user=self._admin(),
                action="viewed",
                notes=f"Document accessed by workshop staff.",
                defaults={"share_link": share, "ip_address": "127.0.0.1", "user_agent": "svr-seed-data"},
            )
            DocumentSignature.objects.get_or_create(
                document=doc,
                signer_email=customers[i - 1].user.email,
                defaults={
                    "signer_name": customers[i - 1].user.get_full_name() or customers[i - 1].user.email,
                    "status": "pending",
                    "expires_at": self.now + timedelta(days=14),
                    "notes": f"Customer signature requested for authorization.",
                    "requested_by": self._admin(),
                },
            )
            if created:
                s.created += 1
            else:
                doc.tags = SEED_TAG
                update_fields = ["tags", "updated_at"]
                if not doc.description:
                    doc.description = f"Service record for {title.lower()}."
                    update_fields.append("description")
                doc.save(update_fields=update_fields)
        s.existing = before

    def _count_documents(self) -> int:
        from apps.documents.models import Document

        return Document.objects.filter(Q(tags__contains=SEED_TAG) | Q(document_number__startswith="DOC-")).count()

    def _purge_documents(self, s: ModuleSummary) -> None:
        from apps.documents.models import Document

        qs = Document.objects.filter(Q(tags__contains=SEED_TAG) | Q(document_number__startswith="DOC-"))
        s.purged = qs.count()
        qs.delete()

    def _load_feedback(self, s: ModuleSummary) -> None:
        from apps.feedback.models import Feedback

        before = self._count_feedback()
        for i in range(1, self.count + 1):
            first_name, last_name = CUSTOMER_NAMES[(i - 1) % len(CUSTOMER_NAMES)]
            _, created = Feedback.objects.get_or_create(
                email=seed_person_email(first_name, last_name, 5000 + i),
                defaults={
                    "message": f"Service advisor was helpful and the repair status updates were clear.",
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

        return Feedback.objects.filter(email__iendswith=f"@{SEED_EMAIL_DOMAIN}").count()

    def _purge_feedback(self, s: ModuleSummary) -> None:
        from apps.feedback.models import Feedback

        qs = Feedback.objects.filter(email__iendswith=f"@{SEED_EMAIL_DOMAIN}")
        s.purged = qs.count()
        qs.delete()

    def _load_chat(self, s: ModuleSummary) -> None:
        from apps.chat.models import ChatMembership, ChatMessage, Conversation

        techs = self._ensure_technician_users(self.count)
        admin = self._admin()
        before = self._count_chat()
        for i in range(1, self.count + 1):
            conv, created = Conversation.objects.get_or_create(
                room_id=f"svr-chat-{i:04d}",
                defaults={"type": "group", "title": f"Service Follow-up {i:03d}", "related_object_type": "workorder"},
            )
            ChatMembership.objects.get_or_create(conversation=conv, user=admin, defaults={"role": "admin"})
            ChatMembership.objects.get_or_create(conversation=conv, user=techs[i - 1], defaults={"role": "member"})
            ChatMessage.objects.get_or_create(conversation=conv, sender=admin, message=f"Please confirm the customer pickup window and final invoice status.")
            if created:
                s.created += 1
        s.existing = before

    def _count_chat(self) -> int:
        from apps.chat.models import Conversation

        return Conversation.objects.filter(room_id__startswith="svr-chat-").count()

    def _purge_chat(self, s: ModuleSummary) -> None:
        from apps.chat.models import Conversation

        qs = Conversation.objects.filter(room_id__startswith="svr-chat-")
        s.purged = qs.count()
        qs.delete()

    def _load_notifications_app(self, s: ModuleSummary) -> None:
        from apps.notifications_app.models import Notification, NotificationLog, NotificationPreference, NotificationTemplate

        admin = self._admin()
        users = self._ensure_staff_users() + self._ensure_technician_users(min(self.count, 5))
        before = self._count_notifications_app()
        template, _ = NotificationTemplate.objects.get_or_create(
            name="Work Order Update",
            channel="email",
            defaults={
                "template_type": "work_order_completed",
                "subject": "Work order status update",
                "body": f"Work order {{work_order_number}} is ready for review.",
                "html_body": "<p>Your work order status has been updated.</p>",
                "variables": {"work_order_number": "WO-2026-000001"},
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
                title=f"Service status update {i:03d}",
                channel="in_app",
                defaults={
                    "notification_type": "work_order",
                    "priority": "normal",
                    "message": f"Your work order has moved to the next workflow step.",
                    "status": "delivered",
                    "is_read": i % 2 == 0,
                    "sent_at": self.now,
                    "delivered_at": self.now,
                    "related_object_type": "workorder",
                    "related_object_id": i,
                    "template": template,
                    "data": {"seed": SEED_TAG},
                },
            )
            NotificationLog.objects.get_or_create(
                notification=notification,
                action="delivered",
                defaults={"details": "In-app notification delivered.", "metadata": {"seed": SEED_TAG}},
            )
            if created:
                s.created += 1
        s.existing = before

    def _count_notifications_app(self) -> int:
        from apps.notifications_app.models import Notification

        return Notification.objects.filter(recipient__in=seed_users_qs()).count()

    def _purge_notifications_app(self, s: ModuleSummary) -> None:
        from apps.notifications_app.models import Notification, NotificationTemplate

        notifications = Notification.objects.filter(recipient__in=seed_users_qs())
        templates = NotificationTemplate.objects.filter(name="Work Order Update")
        s.purged = notifications.count() + templates.count()
        notifications.delete()
        templates.delete()

    def _load_reporting(self, s: ModuleSummary) -> None:
        from apps.reporting.models import DashboardWidget, ReportExportLog, ReportSchedule, SavedReport

        admin = self._admin()
        before = self._count_reporting()
        for i in range(1, min(self.count, 12) + 1):
            _, created_schedule = ReportSchedule.objects.get_or_create(
                name=f"Weekly Operations {i:03d}",
                defaults={
                    "report_type": ["work_orders", "revenue", "inventory", "technician_performance"][i % 4],
                    "frequency": "weekly",
                    "email_recipients": admin.email,
                    "is_active": True,
                    "next_run_date": self.now + timedelta(days=i),
                    "parameters": {"seed": SEED_TAG},
                    "created_by": admin,
                },
            )
            _, created_saved = SavedReport.objects.get_or_create(
                name=f"Saved Dashboard {i:03d}",
                created_by=admin,
                defaults={
                    "report_type": "dashboard_overview",
                    "description": f"Saved report for workshop operations analytics.",
                    "parameters": {"seed": SEED_TAG, "date_range": "last_30_days"},
                    "is_public": True,
                },
            )
            DashboardWidget.objects.get_or_create(
                user=admin,
                widget_type=["revenue_today", "appointments_today", "active_work_orders", "low_stock"][i % 4],
                defaults={"position": i, "width": 6, "height": 4, "settings": {"seed": SEED_TAG}, "is_visible": True},
            )
            ReportExportLog.objects.get_or_create(
                report_type="dashboard_overview",
                report_name=f"Export {i:03d}",
                file_name=f"operations-report-{i:03d}.xlsx",
                defaults={
                    "export_format": "xlsx",
                    "status": "completed",
                    "parameters": {"seed": SEED_TAG},
                    "created_by": admin,
                    "ip_address": "127.0.0.1",
                    "user_agent": "svr-seed-data",
                },
            )
            if created_schedule or created_saved:
                s.created += int(created_schedule) + int(created_saved)
        s.existing = before

    def _count_reporting(self) -> int:
        from apps.reporting.models import ReportSchedule, SavedReport

        return (
            ReportSchedule.objects.filter(parameters__seed=SEED_TAG).count()
            + SavedReport.objects.filter(parameters__seed=SEED_TAG).count()
        )

    def _purge_reporting(self, s: ModuleSummary) -> None:
        from apps.reporting.models import DashboardWidget, ReportExportLog, ReportSchedule, SavedReport

        schedules = ReportSchedule.objects.filter(parameters__seed=SEED_TAG)
        saved = SavedReport.objects.filter(parameters__seed=SEED_TAG)
        widgets = DashboardWidget.objects.filter(settings__seed=SEED_TAG)
        logs = ReportExportLog.objects.filter(parameters__seed=SEED_TAG)
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
            client_id="svr-seed-qbo",
            defaults={
                "client_secret": "svr-seed-secret",
                "realm_id": "svr-seed-realm",
                "is_sandbox": True,
                "is_active": False,
            },
        )
        invoice = seed_invoices_qs().first()
        if invoice:
            QBOMapping.objects.get_or_create(
                content_type=ContentType.objects.get_for_model(Invoice),
                object_id=invoice.id,
                defaults={"qbo_id": "QBO-INV-000001", "qbo_sync_token": "0", "status": "pending", "error_message": SEED_MARKER},
            )
        _, created_log = QBOSyncLog.objects.get_or_create(
            entity_type="invoice",
            error_message=SEED_MARKER,
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
            s.warnings.append("QuickBooks config was active; seed does not call external APIs.")

    def _count_quickbooks_online(self) -> int:
        from apps.quickbooks_online.models import QBOConfig, QBOSyncLog

        return QBOConfig.objects.filter(client_id="svr-seed-qbo").count() + QBOSyncLog.objects.filter(error_message=SEED_MARKER).count()

    def _purge_quickbooks_online(self, s: ModuleSummary) -> None:
        from apps.quickbooks_online.models import QBOConfig, QBOMapping, QBOSyncLog

        configs = QBOConfig.objects.filter(client_id="svr-seed-qbo")
        logs = QBOSyncLog.objects.filter(error_message=SEED_MARKER)
        mappings = QBOMapping.objects.filter(error_message=SEED_MARKER)
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
        s.warnings.append("Portal has no dedicated persistent model; coverage comes from customer vehicles, bookings, history, inspections, and invoices.")

    def _count_portal(self) -> int:
        from apps.billing.models import Invoice
        from apps.workorders.models import WorkOrder

        return seed_workorders_qs().count() + seed_invoices_qs().count()

    def _purge_portal(self, s: ModuleSummary) -> None:
        s.existing = self._count_portal()
        s.skipped += 1
        s.warnings.append("Portal data is purged through customers, vehicles, appointments, workorders, inspections, and billing modules.")
