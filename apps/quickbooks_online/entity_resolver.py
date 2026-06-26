"""Resolve existing QBO entities for update — avoid duplicate creates on sync."""
from __future__ import annotations

import logging

from django.contrib.contenttypes.models import ContentType

from .models import QBOMapping

logger = logging.getLogger(__name__)


def _escape_qbo_literal(value: str) -> str:
    return (value or '').replace("'", "\\'")


def _entity_table_name(qb_class) -> str:
    """Resolve QBO SQL entity table name (Item, Invoice, …) from SDK class or test mock."""
    raw = qb_class.__dict__.get('__name__') if hasattr(qb_class, '__dict__') else None
    if isinstance(raw, str) and raw and raw != 'MagicMock':
        return raw
    if isinstance(qb_class, type):
        name = qb_class.__name__
        if isinstance(name, str) and name not in ('', 'MagicMock'):
            return name
    return 'Unknown'


def query_qbo_where(qb_class, client, where_clause: str):
    if client is None or qb_class is None or not where_clause:
        return []
    sql = f'SELECT * FROM {_entity_table_name(qb_class)} WHERE {where_clause}'
    try:
        results = qb_class.query(sql, qb=client)
        return list(results or [])
    except Exception as exc:
        logger.warning('QBO query failed (%s): %s', sql, exc)
        return []


def find_by_doc_number(qb_class, client, doc_number: str | None):
    if not doc_number:
        return None
    escaped = _escape_qbo_literal(str(doc_number))
    matches = query_qbo_where(qb_class, client, f"DocNumber = '{escaped}'")
    return matches[0] if matches else None


# QBO entities that use Name instead of DisplayName in SQL queries.
_ENTITIES_USING_NAME_NOT_DISPLAY = frozenset({'Item'})


def find_by_display_name(qb_class, client, display_name: str | None):
    if not display_name:
        return None
    table = _entity_table_name(qb_class)
    if table in _ENTITIES_USING_NAME_NOT_DISPLAY:
        return None
    escaped = _escape_qbo_literal(str(display_name))
    matches = query_qbo_where(qb_class, client, f"DisplayName = '{escaped}'")
    return matches[0] if matches else None


def find_by_sku(qb_class, client, sku: str | None):
    if not sku:
        return None
    escaped = _escape_qbo_literal(str(sku))
    matches = query_qbo_where(qb_class, client, f"Sku = '{escaped}'")
    return matches[0] if matches else None


def find_by_name(qb_class, client, name: str | None):
    if not name:
        return None
    escaped = _escape_qbo_literal(str(name))
    matches = query_qbo_where(qb_class, client, f"Name = '{escaped}'")
    return matches[0] if matches else None


def find_by_company_name(qb_class, client, company_name: str | None):
    if not company_name:
        return None
    table = _entity_table_name(qb_class)
    if table not in ('Vendor', 'Customer'):
        return None
    escaped = _escape_qbo_literal(str(company_name))
    matches = query_qbo_where(qb_class, client, f"CompanyName = '{escaped}'")
    return matches[0] if matches else None


def _clear_stale_mapping(mapping: QBOMapping | None) -> None:
    if not mapping or not (mapping.qbo_id or '').strip():
        return
    mapping.qbo_id = ''
    mapping.qbo_sync_token = ''
    mapping.save(update_fields=['qbo_id', 'qbo_sync_token'])


def _search_by_natural_keys(
    qb_class,
    client,
    *,
    doc_number=None,
    display_name=None,
    sku=None,
    name=None,
    company_name=None,
):
    return (
        find_by_doc_number(qb_class, client, doc_number)
        or find_by_sku(qb_class, client, sku)
        or find_by_display_name(qb_class, client, display_name)
        or find_by_name(qb_class, client, name)
        or find_by_company_name(qb_class, client, company_name)
    )


def _relink_mapping(local_obj, qbo_id: str, sync_token: str = '') -> None:
    QBOMapping.objects.update_or_create(
        content_type=ContentType.objects.get_for_model(local_obj),
        object_id=local_obj.id,
        defaults={
            'qbo_id': str(qbo_id),
            'qbo_sync_token': sync_token or '',
            'status': 'synced',
            'error_message': '',
        },
    )


def resolve_qbo_entity(
    *,
    client,
    qb_class,
    local_obj,
    mapping: QBOMapping | None,
    doc_number: str | None = None,
    display_name: str | None = None,
    sku: str | None = None,
    name: str | None = None,
    company_name: str | None = None,
    allow_create: bool = True,
):
    """
    Load a QBO entity for update following Intuit's create-vs-update pattern:
    GET by mapped Id, else query by natural key, else create when allowed.

    Returns (qb_entity, error_message). When error_message is set, caller must abort.
    """
    if qb_class is None:
        return None, 'QuickBooks SDK unavailable.'

    mapped_id = (mapping.qbo_id or '').strip() if mapping else ''
    if mapped_id:
        try:
            return qb_class.get(int(mapped_id), qb=client), None
        except Exception as exc:
            logger.warning(
                'QBO GET failed for mapped %s id=%s (%s); searching by natural key.',
                _entity_table_name(qb_class),
                mapped_id,
                exc,
            )
            found = _search_by_natural_keys(
                qb_class,
                client,
                doc_number=doc_number,
                display_name=display_name,
                sku=sku,
                name=name,
                company_name=company_name,
            )
            if found and getattr(found, 'Id', None):
                _relink_mapping(
                    local_obj,
                    str(found.Id),
                    getattr(found, 'SyncToken', '') or '',
                )
                return found, None

            _clear_stale_mapping(mapping)
            if not allow_create:
                return None, (
                    f'Mapped QuickBooks {_entity_table_name(qb_class)} id {mapped_id} was not found '
                    f'and no matching record exists by document number or name.'
                )
            logger.info(
                'Cleared stale QBO mapping for %s; will create or match without mapped id.',
                local_obj,
            )

    found = _search_by_natural_keys(
        qb_class,
        client,
        doc_number=doc_number,
        display_name=display_name,
        sku=sku,
        name=name,
        company_name=company_name,
    )
    if found and getattr(found, 'Id', None):
        _relink_mapping(
            local_obj,
            str(found.Id),
            getattr(found, 'SyncToken', '') or '',
        )
        return found, None

    if not allow_create:
        return None, f'No existing QuickBooks {_entity_table_name(qb_class)} record found to update.'

    return qb_class(), None
