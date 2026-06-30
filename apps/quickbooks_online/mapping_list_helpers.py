"""Helpers for listing QBOMapping rows in the admin integrations UI."""
from __future__ import annotations

from django.apps import apps

from .outbound_entities import OUTBOUND_SYNC_ENTITIES

_CONTENT_TYPE_TO_ENTITY: dict[tuple[str, str], str] | None = None

_ENTITY_TYPE_LABELS = {
    'customer': 'Customer',
    'invoice': 'Invoice',
    'payment': 'Customer Payment',
    'supplier': 'Supplier',
    'purchase_order': 'Purchase Order',
    'branch': 'Branch',
    'estimate': 'Estimate',
    'credit_note': 'Credit Memo',
    'vendor_bill': 'Vendor Bill',
    'vendor_credit': 'Vendor Credit',
    'bill_payment': 'Vendor Bill Payment',
    'vendor_expense': 'Vendor Expense',
    'part': 'Part / Item',
}

_LABEL_ATTRS = (
    'bill_number',
    'invoice_number',
    'credit_number',
    'expense_number',
    'estimate_number',
    'po_number',
    'payment_number',
    'credit_note_number',
    'part_number',
    'name',
    'company_name',
    'code',
)


def content_type_to_entity_type(app_label: str, model_name: str) -> str | None:
    global _CONTENT_TYPE_TO_ENTITY
    if _CONTENT_TYPE_TO_ENTITY is None:
        mapping: dict[tuple[str, str], str] = {}
        for entity_type, cfg in OUTBOUND_SYNC_ENTITIES.items():
            key = (cfg['app_label'], cfg['model_name'].lower())
            mapping[key] = entity_type
        _CONTENT_TYPE_TO_ENTITY = mapping
    return _CONTENT_TYPE_TO_ENTITY.get((app_label, model_name.lower()))


def entity_type_display(entity_type: str | None) -> str:
    if not entity_type:
        return 'Unknown'
    return _ENTITY_TYPE_LABELS.get(entity_type, entity_type.replace('_', ' ').title())


def resolve_mapping_object_label(instance) -> str:
    if instance is None:
        return ''
    for attr in _LABEL_ATTRS:
        value = getattr(instance, attr, None)
        if value:
            return str(value)
    return str(instance)


def load_mapping_instance(mapping):
    entity_type = content_type_to_entity_type(
        mapping.content_type.app_label,
        mapping.content_type.model,
    )
    if not entity_type:
        return None, entity_type
    cfg = OUTBOUND_SYNC_ENTITIES.get(entity_type)
    if not cfg:
        return None, entity_type
    model = apps.get_model(cfg['app_label'], cfg['model_name'])
    try:
        return model.objects.get(pk=mapping.object_id), entity_type
    except model.DoesNotExist:
        return None, entity_type
