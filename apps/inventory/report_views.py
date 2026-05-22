"""API views for inventory management reports."""
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import HasPermission, IsModuleEnabled
from apps.branches.utils import get_user_accessible_branches, resolve_branch

from .management_reports import InventoryManagementReports


def _branch_id(request):
    """Active branch from header/session, or None for consolidated (superuser) view."""
    branch = resolve_branch(request)
    if branch:
        return branch.id
    user = getattr(request, 'user', None)
    if user and user.is_authenticated and not getattr(user, 'is_superuser', False):
        accessible = get_user_accessible_branches(user)
        if accessible.count() == 1:
            return accessible.first().id
    return None


def _parse_range(request):
    start_str = request.query_params.get('start_date')
    end_str = request.query_params.get('end_date')
    today = timezone.now().date()
    if not start_str or not end_str:
        return today.replace(day=1), today
    start = parse_date(start_str)
    end = parse_date(end_str)
    return start, end


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('inventory'), HasPermission('view_inventory')])
def availability_top_100(request):
    limit = min(int(request.query_params.get('limit', 100)), 100)
    report = InventoryManagementReports.get_top_availability(limit=limit, branch_id=_branch_id(request))
    return Response(report)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('inventory'), HasPermission('view_inventory')])
def inventory_accuracy_report(request):
    report = InventoryManagementReports.get_inventory_accuracy(branch_id=_branch_id(request))
    return Response(report)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('inventory'), HasPermission('view_inventory')])
def shrinkage_report(request):
    start, end = _parse_range(request)
    if not start:
        return Response({'detail': 'Invalid dates'}, status=400)
    report = InventoryManagementReports.get_shrinkage_report(start, end, branch_id=_branch_id(request))
    return Response(report)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('inventory'), HasPermission('view_inventory')])
def obsolescence_report(request):
    days = int(request.query_params.get('days_unused', 180))
    report = InventoryManagementReports.get_obsolescence_report(days_unused=days, branch_id=_branch_id(request))
    return Response(report)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('inventory'), HasPermission('view_inventory')])
def p2p_compliance_report(request):
    start, end = _parse_range(request)
    if not start:
        return Response({'detail': 'Invalid dates'}, status=400)
    report = InventoryManagementReports.get_p2p_compliance(start, end, branch_id=_branch_id(request))
    return Response(report)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('inventory'), HasPermission('view_inventory')])
def orphan_supply_report(request):
    start, end = _parse_range(request)
    if not start:
        return Response({'detail': 'Invalid dates'}, status=400)
    report = InventoryManagementReports.get_orphan_supply(start, end, branch_id=_branch_id(request))
    return Response(report)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('inventory'), HasPermission('view_inventory')])
def unbilled_delivered_report(request):
    start_str = request.query_params.get('start_date')
    end_str = request.query_params.get('end_date')
    start = parse_date(start_str) if start_str else None
    end = parse_date(end_str) if end_str else None
    if (start_str and not start) or (end_str and not end):
        return Response({'detail': 'Invalid dates'}, status=status.HTTP_400_BAD_REQUEST)
    report = InventoryManagementReports.get_unbilled_delivered(
        branch_id=_branch_id(request),
        start_date=start,
        end_date=end,
    )
    return Response(report)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsModuleEnabled('inventory'), HasPermission('view_inventory')])
def inventory_control_report(request):
    start, end = _parse_range(request)
    if not start:
        return Response({'detail': 'Invalid dates'}, status=400)
    report = InventoryManagementReports.get_inventory_control_summary(start, end, branch_id=_branch_id(request))
    return Response(report)
