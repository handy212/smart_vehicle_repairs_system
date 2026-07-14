"""
Helpers for sharing invoices, estimates, and job cards via WhatsApp.
Supports Meta Cloud API (when configured) and manual wa.me fallbacks.
"""
from __future__ import annotations

from typing import Any, Optional

from apps.accounts.settings_utils import get_site_url, get_whatsapp_settings
from apps.notifications_app.currency import format_money
from apps.notifications_app.document_links import build_public_document_pdf_url
from apps.notifications_app.phone_utils import format_phone_display, normalize_phone_e164


def get_base_url() -> str:
    return (get_site_url() or "").rstrip("/")


def customer_phone(customer) -> str:
    if not customer:
        return ""
    prefs = None
    user = getattr(customer, "user", None)
    if user and hasattr(user, "notification_preferences"):
        prefs = user.notification_preferences
    raw = (
        (getattr(prefs, "phone_number", None) if prefs else None)
        or getattr(customer, "phone", None)
        or getattr(user, "phone", None)
        or getattr(customer, "alternative_phone", None)
        or getattr(customer, "company_phone", None)
        or ""
    )
    return normalize_phone_e164(raw)


def customer_display_name(customer) -> str:
    if not customer:
        return "Customer"
    if getattr(customer, "company_name", None):
        return customer.company_name
    if getattr(customer, "full_name", None):
        return customer.full_name
    user = getattr(customer, "user", None)
    if user:
        name = user.get_full_name() if hasattr(user, "get_full_name") else ""
        if name:
            return name
        return getattr(user, "email", None) or "Customer"
    return "Customer"


def vehicle_display(vehicle) -> str:
    if not vehicle:
        return "N/A"
    parts = [
        str(getattr(vehicle, "year", "") or "").strip(),
        str(getattr(vehicle, "make", "") or "").strip(),
        str(getattr(vehicle, "model", "") or "").strip(),
    ]
    label = " ".join(p for p in parts if p).strip()
    plate = getattr(vehicle, "license_plate", None)
    if plate:
        return f"{label} ({plate})" if label else str(plate)
    return label or "N/A"


def whatsapp_api_enabled_for_user(user) -> bool:
    settings_dict = get_whatsapp_settings()
    if str(settings_dict.get("whatsapp_enabled", "false")).lower() != "true":
        return False
    if user and hasattr(user, "notification_preferences"):
        return bool(getattr(user.notification_preferences, "whatsapp_enabled", True))
    return True


def _share_base(customer, *, document_type: str, object_id: int, filename: str, title: str, body: str) -> dict[str, Any]:
    base = get_base_url()
    phone = customer_phone(customer)
    pdf_url = build_public_document_pdf_url(document_type, object_id, base_url=base)
    message = body
    if pdf_url:
        message += f"\nDownload PDF: {pdf_url}\n"
    message += "\nThank you."
    return {
        "document_type": document_type,
        "phone_number": phone,
        "phone_display": format_phone_display(phone),
        "message": message,
        "filename": filename,
        "document_pdf_url": pdf_url or None,
        "portal_url": None,
        "customer_name": customer_display_name(customer),
        "title": title,
    }


def build_invoice_share(invoice) -> dict[str, Any]:
    base = get_base_url()
    customer = invoice.customer
    amount = format_money(invoice.amount_due or invoice.total)
    portal = f"{base}/portal/invoices/{invoice.id}" if base else ""
    vehicle = vehicle_display(invoice.vehicle) if invoice.vehicle_id else "N/A"
    body = (
        f"Hello {customer_display_name(customer)},\n\n"
        f"Your invoice {invoice.invoice_number} is ready.\n"
        f"Amount due: {amount}\n"
        f"Due date: {invoice.due_date or 'N/A'}\n"
        f"Vehicle: {vehicle}\n"
    )
    if portal:
        body += f"\nView / pay: {portal}\n"
    share = _share_base(
        customer,
        document_type="invoice",
        object_id=invoice.id,
        filename=f"Invoice_{invoice.invoice_number}.pdf",
        title=f"Invoice {invoice.invoice_number}",
        body=body.rstrip() + "\n",
    )
    share["portal_url"] = portal or None
    return share


def build_estimate_share(estimate) -> dict[str, Any]:
    base = get_base_url()
    customer = estimate.customer
    amount = format_money(estimate.total)
    portal = f"{base}/portal/estimates/{estimate.id}" if base else ""
    vehicle = vehicle_display(estimate.vehicle) if estimate.vehicle_id else "N/A"
    body = (
        f"Hello {customer_display_name(customer)},\n\n"
        f"Your estimate {estimate.estimate_number} is ready for review.\n"
        f"Amount: {amount}\n"
        f"Valid until: {estimate.valid_until or 'N/A'}\n"
        f"Vehicle: {vehicle}\n"
    )
    if portal:
        body += f"\nReview / approve: {portal}\n"
    body += "\nPlease reply if you have any questions."
    share = _share_base(
        customer,
        document_type="estimate",
        object_id=estimate.id,
        filename=f"Estimate_{estimate.estimate_number}.pdf",
        title=f"Estimate {estimate.estimate_number}",
        body=body.rstrip() + "\n",
    )
    share["portal_url"] = portal or None
    return share


def build_job_card_share(work_order) -> dict[str, Any]:
    base = get_base_url()
    customer = work_order.customer
    portal = f"{base}/portal/work-orders/{work_order.id}" if base else ""
    vehicle = vehicle_display(work_order.vehicle) if work_order.vehicle_id else "N/A"
    status_label = (
        work_order.get_status_display()
        if hasattr(work_order, "get_status_display")
        else work_order.status
    )
    body = (
        f"Hello {customer_display_name(customer)},\n\n"
        f"Job card for work order {work_order.work_order_number}.\n"
        f"Vehicle: {vehicle}\n"
        f"Status: {status_label}\n"
    )
    if portal:
        body += f"\nView details: {portal}\n"
    share = _share_base(
        customer,
        document_type="job_card",
        object_id=work_order.id,
        filename=f"JobCard_{work_order.work_order_number}.pdf",
        title=f"Job Card {work_order.work_order_number}",
        body=body.rstrip() + "\n",
    )
    share["portal_url"] = portal or None
    return share


def build_share_for_object(document_type: str, obj) -> Optional[dict[str, Any]]:
    if document_type == "invoice":
        return build_invoice_share(obj)
    if document_type == "estimate":
        return build_estimate_share(obj)
    if document_type in ("job_card", "work_order"):
        return build_job_card_share(obj)
    return None
