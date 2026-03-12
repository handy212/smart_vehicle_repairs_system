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
from apps.inventory.models import Part
from apps.billing.models import Invoice, Payment
from apps.subscriptions.models import Subscription, Package
from apps.branches.models import Branch
from apps.documents.models import Document
from apps.diagnosis.models import Diagnosis, RepairRecommendation
from apps.fixed_assets.models import FixedAsset, AssetMaintenance
from apps.notifications_app.models import NotificationTemplate


# Register models for audit logging
# Admin/System Models
auditlog.register(User)
# TODO: Re-enable SystemSettings after database encoding is migrated from SQL_ASCII to UTF8.
# The auditlog JSON field causes encoding errors on the current database. Wrapped in
# try/except so it auto-enables once the DB issue is resolved.
try:
    auditlog.register(SystemSettings)
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

# Inventory & Finance
auditlog.register(Part)
auditlog.register(Invoice)
auditlog.register(Payment)

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
