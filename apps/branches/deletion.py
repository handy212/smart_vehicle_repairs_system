"""Branch permanent deletion helpers."""
from __future__ import annotations

from django.contrib.contenttypes.models import ContentType
from django.db import transaction

from apps.accounts.models import User
from apps.branches.models import Branch


def _count(model, branch, **filters):
    field_names = {field.name for field in model._meta.get_fields()}
    if "branch" not in field_names:
        return 0
    return model.objects.filter(branch=branch, **filters).count()


def get_branch_delete_blockers(branch: Branch) -> list[str]:
    """Return human-readable reasons a branch cannot be permanently deleted."""
    blockers: list[str] = []

    from apps.workorders.models import WorkOrder
    from apps.appointments.models import Appointment
    from apps.billing.models import Estimate, Invoice, Bill, CreditNote, VendorCredit
    from apps.inspections.models import VehicleInspection
    from apps.inventory.models import StockItem, PurchaseOrder, InventoryTransaction
    from apps.accounting.models import JournalEntry
    from apps.gatepass.models import GatePass
    from apps.roadside.models import RoadsideRequest
    from apps.fixed_assets.models import FixedAsset
    from apps.feedback.models import Feedback
    from apps.hr.models import EmployeeProfile, PayrollPeriod

    checks = [
        (WorkOrder, "work orders"),
        (Appointment, "appointments"),
        (Estimate, "estimates"),
        (Invoice, "invoices"),
        (Bill, "bills"),
        (CreditNote, "credit notes"),
        (VendorCredit, "vendor credits"),
        (VehicleInspection, "inspections"),
        (StockItem, "stock items"),
        (PurchaseOrder, "purchase orders"),
        (InventoryTransaction, "inventory transactions"),
        (JournalEntry, "journal entries"),
        (GatePass, "gate passes"),
        (RoadsideRequest, "roadside requests"),
        (FixedAsset, "fixed assets"),
        (Feedback, "feedback records"),
        (EmployeeProfile, "employee profiles"),
        (PayrollPeriod, "payroll periods"),
    ]

    for model, label in checks:
        count = _count(model, branch)
        if count:
            blockers.append(f"{count} {label}")

    if Branch.objects.count() <= 1:
        blockers.append("this is the only branch in the system")

    return blockers


def permanently_delete_branch(branch: Branch, *, fallback_branch: Branch | None = None) -> Branch | None:
    """
    Permanently remove a branch that has no operational history.

    Reassigns staff to fallback_branch (or clears assignment) and promotes another
    branch to headquarters when needed.
    """
    blockers = get_branch_delete_blockers(branch)
    if blockers:
        raise ValueError(
            "Cannot permanently delete this branch because it still has: "
            + ", ".join(blockers)
            + ". Archive it instead, or remove the related records first."
        )

    with transaction.atomic():
        fallback = fallback_branch
        if fallback and fallback.pk == branch.pk:
            fallback = None
        if not fallback:
            fallback = (
                Branch.objects.filter(is_active=True)
                .exclude(pk=branch.pk)
                .order_by("-is_headquarters", "name")
                .first()
            )

        if branch.is_headquarters and fallback:
            fallback.is_headquarters = True
            fallback.is_active = True
            fallback.save(update_fields=["is_headquarters", "is_active", "updated_at"])

        User.objects.filter(branch=branch).update(branch=fallback)
        branch.managers.clear()

        try:
            from apps.quickbooks_online.services import QuickBooksService

            QuickBooksService().clear_branch_qbo_mapping(branch)
        except Exception:
            from apps.quickbooks_online.models import QBOMapping

            branch_ct = ContentType.objects.get_for_model(Branch)
            QBOMapping.objects.filter(content_type=branch_ct, object_id=branch.id).delete()

        name = branch.name
        branch.delete()
        return fallback
