from auditlog.registry import auditlog
from apps.accounts.models import (
    User
)
from apps.accounts.admin_models import (
    SystemSettings,
    SystemBackup, EmailTemplate, SMSTemplate
)
from apps.accounts.permission_models import (
    Role, Permission
)
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder
from apps.appointments.models import Appointment
from apps.inspections.models import VehicleInspection
from apps.roadside.models import RoadsideRequest
from apps.inventory.models import (
    Part,
    Supplier,
    Transfer,
    PurchaseOrder,
    InventoryTransaction,
    PhysicalCountSession,
)
from apps.billing.models import (
    Invoice,
    Payment,
    Estimate,
    CreditNote,
    Bill,
    BillPayment,
    Refund,
)
from apps.subscriptions.models import Subscription, Package
from apps.branches.models import Branch
from apps.documents.models import Document
from apps.diagnosis.models import Diagnosis, RepairRecommendation
from apps.fixed_assets.models import FixedAsset, AssetMaintenance
from apps.notifications_app.models import NotificationTemplate
from apps.gatepass.models import GatePass
from apps.hr.models import Department, EmployeeProfile, LeaveRequest, PayrollPeriod


# Register models for audit logging
# Admin/System Models
auditlog.register(User)
# TODO: Re-enable SystemSettings after database encoding is migrated from SQL_ASCII to UTF8.
try:
    auditlog.register(SystemSettings, exclude_fields=['value'])
except Exception:  # noqa: BLE001
    pass
auditlog.register(Role)
auditlog.register(Permission)
auditlog.register(SystemBackup)
auditlog.register(EmailTemplate)
auditlog.register(SMSTemplate)
auditlog.register(Branch)
auditlog.register(Document)

# Business Models
auditlog.register(Customer)
auditlog.register(Vehicle)

# Service Operations
auditlog.register(WorkOrder)
auditlog.register(Appointment)
auditlog.register(VehicleInspection)
auditlog.register(RoadsideRequest)
auditlog.register(GatePass)

# Inventory & Finance
auditlog.register(Part)
auditlog.register(Supplier)
auditlog.register(Transfer)
auditlog.register(PurchaseOrder)
auditlog.register(InventoryTransaction)
auditlog.register(PhysicalCountSession)
auditlog.register(Invoice)
auditlog.register(Payment)
auditlog.register(Estimate)
auditlog.register(CreditNote)
auditlog.register(Bill)
auditlog.register(BillPayment)
auditlog.register(Refund)

# Subscriptions
auditlog.register(Subscription)
auditlog.register(Package)

# Diagnosis
auditlog.register(Diagnosis)
auditlog.register(RepairRecommendation)

# Fixed Assets
auditlog.register(FixedAsset)
auditlog.register(AssetMaintenance)

# Notifications
auditlog.register(NotificationTemplate)

# HR
auditlog.register(Department)
auditlog.register(EmployeeProfile)
auditlog.register(LeaveRequest)
auditlog.register(PayrollPeriod)
