"""Aggregate QuickBooks setup progress for the admin setup checklist."""

from __future__ import annotations

from django.contrib.contenttypes.models import ContentType

from apps.branches.models import Branch
from apps.quickbooks_online.mapping_specs import all_mapping_rows, branch_mapping_rows
from apps.quickbooks_online.models import QBOAccountMapping, QBOMapping
from apps.quickbooks_online.services import QuickBooksService


def _mapping_is_filled(spec, mapping) -> bool:
    if not mapping:
        return False
    if spec.get('uses_item') and mapping.qbo_item_id:
        return True
    if spec.get('uses_class') and mapping.qbo_class_id:
        return True
    if mapping.qbo_account_id:
        return True
    return False


def _branch_override_coverage(branch, company_stored):
    """
    Count override slots as mapped (branch row), inherit (company default), or unmapped.

    Payment/tax/bank mappings stay company-scoped and are not counted here.
    """
    branch_rows = {
        (row.mapping_kind, row.mapping_key): row
        for row in QBOAccountMapping.objects.filter(branch=branch)
    }
    mapped = 0
    inherit = 0
    unmapped = 0
    for spec in branch_mapping_rows(branch):
        key = (spec['mapping_kind'], spec['mapping_key'])
        branch_mapping = branch_rows.get(key)
        company_mapping = company_stored.get(key)
        if _mapping_is_filled(spec, branch_mapping):
            mapped += 1
        elif _mapping_is_filled(spec, company_mapping):
            inherit += 1
        else:
            unmapped += 1
    return {
        'override_slots': mapped + inherit + unmapped,
        'override_mapped': mapped,
        'override_inherit': inherit,
        'override_unmapped': unmapped,
    }


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
        if _mapping_is_filled(spec, company_stored.get((spec['mapping_kind'], spec['mapping_key']))):
            company_mapped += 1

    branch_ct = ContentType.objects.get_for_model(Branch)
    active_branches = list(Branch.objects.filter(is_active=True).order_by('name'))
    branch_mappings = {
        mapping.object_id: mapping
        for mapping in QBOMapping.objects.filter(content_type=branch_ct).exclude(qbo_id='')
    }

    branches_summary = []
    unmapped_locations = 0
    total_override_mapped = 0
    total_override_inherit = 0
    total_override_unmapped = 0
    for branch in active_branches:
        mapping = branch_mappings.get(branch.id)
        location_mapped = bool(mapping and mapping.qbo_id)
        if not location_mapped:
            unmapped_locations += 1
        coverage = _branch_override_coverage(branch, company_stored)
        total_override_mapped += coverage['override_mapped']
        total_override_inherit += coverage['override_inherit']
        total_override_unmapped += coverage['override_unmapped']
        branches_summary.append({
            'id': branch.id,
            'name': branch.name,
            'code': branch.code,
            'location_mapped': location_mapped,
            'qbo_department_id': mapping.qbo_id if mapping else '',
            'override_count': coverage['override_mapped'],
            **coverage,
        })

    branch_override_slots = (
        len(branch_mapping_rows(active_branches[0])) if active_branches else 0
    )

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
            'override_mapped': total_override_mapped,
            'override_inherit': total_override_inherit,
            'override_unmapped': total_override_unmapped,
            'note': (
                'Branch overrides cover AR/COGS/revenue, invoice line items, and revenue-product '
                'classes. Payment methods, tax codes, expense classes, and bank/till accounts '
                'use company defaults only.'
            ),
        },
        'next_steps': _build_next_steps(
            connected=connected,
            api_ready=api_ready,
            company_mapped=company_mapped,
            company_total=len(company_rows),
            unmapped_locations=unmapped_locations,
            active_branch_count=len(active_branches),
            override_unmapped=total_override_unmapped,
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
    override_unmapped=0,
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
        # Informational: inherit counts as covered; only fully unmapped slots are flagged.
        steps.append({
            'id': 'branch_overrides',
            'label': (
                f'Branch chart coverage '
                f'({override_unmapped} override slot(s) with no company or branch mapping)'
                if override_unmapped
                else 'Branch chart coverage (all override slots inherit or mapped)'
            ),
            'href': '/admin/branches',
            'done': override_unmapped == 0,
        })

    return steps
