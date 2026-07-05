"""Aggregate QuickBooks setup progress for the admin setup checklist."""

from __future__ import annotations

from django.contrib.contenttypes.models import ContentType

from apps.branches.models import Branch
from apps.quickbooks_online.mapping_specs import all_mapping_rows, branch_mapping_rows
from apps.quickbooks_online.models import QBOAccountMapping, QBOMapping
from apps.quickbooks_online.services import QuickBooksService


def get_qbo_setup_status():
    """Return connection health and mapping completion counts for the setup UI."""
    connected = QuickBooksService.is_connected()
    api_ready = connected and QuickBooksService.get_client() is not None

    company_rows = list(all_mapping_rows())
    company_stored = {
        (row.mapping_kind, row.mapping_key): row
        for row in QBOAccountMapping.objects.filter(branch__isnull=True)
    }
    company_mapped = 0
    for spec in company_rows:
        mapping = company_stored.get((spec['mapping_kind'], spec['mapping_key']))
        if not mapping:
            continue
        if spec.get('uses_item') and mapping.qbo_item_id:
            company_mapped += 1
        elif spec.get('uses_class') and mapping.qbo_class_id:
            company_mapped += 1
        elif mapping.qbo_account_id:
            company_mapped += 1

    branch_ct = ContentType.objects.get_for_model(Branch)
    active_branches = list(Branch.objects.filter(is_active=True).order_by('name'))
    branch_mappings = {
        mapping.object_id: mapping
        for mapping in QBOMapping.objects.filter(content_type=branch_ct).exclude(qbo_id='')
    }

    branches_summary = []
    unmapped_locations = 0
    for branch in active_branches:
        mapping = branch_mappings.get(branch.id)
        location_mapped = bool(mapping and mapping.qbo_id)
        if not location_mapped:
            unmapped_locations += 1
        override_count = QBOAccountMapping.objects.filter(branch=branch).count()
        branches_summary.append({
            'id': branch.id,
            'name': branch.name,
            'code': branch.code,
            'location_mapped': location_mapped,
            'qbo_department_id': mapping.qbo_id if mapping else '',
            'override_count': override_count,
        })

    branch_override_slots = len(branch_mapping_rows(active_branches[0])) if active_branches else 0

    return {
        'is_connected': connected,
        'is_api_ready': api_ready,
        'company_mappings': {
            'mapped': company_mapped,
            'total': len(company_rows),
        },
        'branches': {
            'active_count': len(active_branches),
            'unmapped_locations': unmapped_locations,
            'items': branches_summary,
            'override_slots_per_branch': branch_override_slots,
        },
        'next_steps': _build_next_steps(
            connected=connected,
            api_ready=api_ready,
            company_mapped=company_mapped,
            company_total=len(company_rows),
            unmapped_locations=unmapped_locations,
            active_branch_count=len(active_branches),
        ),
    }


def _build_next_steps(
    *,
    connected,
    api_ready,
    company_mapped,
    company_total,
    unmapped_locations,
    active_branch_count,
):
    steps = []
    if not connected:
        steps.append({
            'id': 'connect',
            'label': 'Connect QuickBooks under Admin → Integrations',
            'href': '/admin/integrations?category=accounting',
            'done': False,
        })
        return steps

    if not api_ready:
        steps.append({
            'id': 'reconnect',
            'label': 'Reconnect QuickBooks (live API session unavailable)',
            'href': '/admin/integrations?category=accounting',
            'done': False,
        })
        return steps

    steps.append({'id': 'connect', 'label': 'QuickBooks connected', 'done': True})

    company_done = company_total > 0 and company_mapped >= min(12, company_total)
    steps.append({
        'id': 'company_mappings',
        'label': f'Company QBO mappings ({company_mapped}/{company_total})',
        'href': '/accounting/controls?qbo_tab=mapping',
        'done': company_done,
    })

    if active_branch_count:
        locations_done = unmapped_locations == 0
        steps.append({
            'id': 'branch_locations',
            'label': (
                f'Branch QBO locations ({active_branch_count - unmapped_locations}'
                f'/{active_branch_count} mapped)'
            ),
            'href': '/admin/branches',
            'done': locations_done,
        })

    return steps
