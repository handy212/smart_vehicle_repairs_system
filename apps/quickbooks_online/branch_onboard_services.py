"""One-step QuickBooks onboarding for a new or existing SVR branch."""

from __future__ import annotations

from django.contrib.contenttypes.models import ContentType

from apps.accounting.settlement_accounts import branch_settlement_overview
from apps.branches.models import Branch
from apps.quickbooks_online.branch_main_cash_services import migrate_branch_main_cash
from apps.quickbooks_online.branch_settlement_services import provision_branch_settlement_accounts
from apps.quickbooks_online.models import QBOMapping
from apps.quickbooks_online.services import QuickBooksService


def onboard_branch_quickbooks(
    branch: Branch,
    *,
    location_action: str = 'auto_sync',
    department_id: str | None = None,
    provision_settlement: bool = True,
    provision_main_cash: bool = True,
    dry_run: bool = False,
):
    """
    Map branch → QBO location and provision settlement GL accounts from QBO.

    location_action: auto_sync | map | skip
    """
    result = {
        'branch_id': branch.id,
        'branch_name': branch.name,
        'dry_run': dry_run,
        'location': None,
        'settlement': None,
        'main_cash': None,
        'settlement_overview': None,
        'errors': [],
        'warnings': [],
    }

    if not QuickBooksService.is_connected():
        result['errors'].append('QuickBooks is not connected. Connect under Admin → Integrations first.')
        return result

    service = QuickBooksService()
    action = (location_action or 'auto_sync').strip().lower()

    if action == 'skip':
        result['location'] = {'skipped': True}
    elif action == 'auto_sync':
        if dry_run:
            result['location'] = {
                'dry_run': True,
                'action': 'auto_sync',
                'detail': f'Would create or update QBO location for {branch.name}.',
            }
        else:
            qb_department = service.sync_branch(branch)
            if not qb_department:
                branch_ct = ContentType.objects.get_for_model(Branch)
                mapping = QBOMapping.objects.filter(content_type=branch_ct, object_id=branch.id).first()
                error_message = mapping.error_message if mapping else 'Failed to sync branch to QuickBooks.'
                result['errors'].append(error_message)
            else:
                result['location'] = {
                    'qbo_department_id': str(qb_department.Id),
                    'qbo_department_name': qb_department.Name,
                }
    elif action == 'map':
        if not department_id:
            result['errors'].append('department_id is required when location_action is map.')
        elif dry_run:
            result['location'] = {
                'dry_run': True,
                'action': 'map',
                'qbo_department_id': str(department_id),
            }
        else:
            success, error = service.map_branch_to_department(branch, department_id)
            if not success:
                result['errors'].append(error or 'Failed to map QuickBooks location.')
            else:
                departments, _list_error = service.list_departments()
                department_name = None
                if departments:
                    department_name = next(
                        (item['name'] for item in departments if item['id'] == str(department_id)),
                        None,
                    )
                result['location'] = {
                    'qbo_department_id': str(department_id),
                    'qbo_department_name': department_name,
                }
    else:
        result['errors'].append(f'Unknown location_action: {location_action}')

    if result['errors'] and not dry_run:
        return result

    if provision_settlement:
        settlement = provision_branch_settlement_accounts(
            branch,
            dry_run=dry_run,
            map_qbo=True,
        )
        result['settlement'] = settlement
        if settlement.get('errors'):
            result['errors'].extend(settlement['errors'])
        skipped = settlement.get('skipped') or []
        if skipped:
            result['warnings'].extend(f'Settlement: {line}' for line in skipped)

    if provision_main_cash:
        main_cash = migrate_branch_main_cash(branch, dry_run=dry_run, map_qbo=True)
        result['main_cash'] = main_cash
        if main_cash.get('errors'):
            result['errors'].extend(main_cash['errors'])
        skipped = main_cash.get('skipped') or []
        if skipped:
            result['warnings'].extend(f'Main cash: {line}' for line in skipped)

    if not dry_run:
        result['settlement_overview'] = branch_settlement_overview(branch)

    return result
