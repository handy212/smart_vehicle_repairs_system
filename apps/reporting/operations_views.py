"""API views for Phase 3 operations reports."""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiTypes

from apps.accounts.permissions import HasAnyPermission, IsModuleEnabled, REPORTS_VIEW_PERMISSIONS

REPORTS_PERMISSION_CLASSES = [
    IsAuthenticated,
    IsModuleEnabled('reports'),
    HasAnyPermission(list(REPORTS_VIEW_PERMISSIONS)),
]

from .operations_reports import OperationsReportingService
from .views import _get_branch_ids, _parse_date_range


@extend_schema(description='Roadside assistance revenue by period and branch.')
@api_view(['GET'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def roadside_revenue_report(request):
    try:
        start_date, end_date = _parse_date_range(request, default_current_month=True)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)
    branch_ids = _get_branch_ids(request)
    return Response(
        OperationsReportingService.roadside_revenue(start_date, end_date, branch_ids or None)
    )


@api_view(['GET'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def cost_control_return_jobs(request):
    try:
        start_date, end_date = _parse_date_range(request, default_current_month=True)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)
    branch_ids = _get_branch_ids(request)
    return Response(
        OperationsReportingService.cost_control_return_jobs(
            start_date, end_date, branch_ids or None
        )
    )


@api_view(['GET'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def ap_cycle_time_dashboard(request):
    try:
        start_date, end_date = _parse_date_range(request, default_current_month=True)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)
    branch_ids = _get_branch_ids(request)
    return Response(
        OperationsReportingService.ap_cycle_time(start_date, end_date, branch_ids or None)
    )


@api_view(['GET'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def exception_log_report(request):
    branch_ids = _get_branch_ids(request)
    return Response(OperationsReportingService.exception_log(branch_ids or None))


@extend_schema(
    parameters=[
        OpenApiParameter('work_order_id', OpenApiTypes.INT, required=False),
        OpenApiParameter('part_id', OpenApiTypes.INT, required=False),
    ],
    description='Part/work-order traceability chain. Requires work_order_id or part_id.',
)
@api_view(['GET'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def traceability_dashboard(request):
    wo_id = request.query_params.get('work_order_id')
    part_id = request.query_params.get('part_id')
    if not wo_id and not part_id:
        return Response(
            {'detail': 'work_order_id or part_id required'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        OperationsReportingService.traceability(
            work_order_id=int(wo_id) if wo_id else None,
            part_id=int(part_id) if part_id else None,
        )
    )


@api_view(['GET'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def capacity_planning_report(request):
    try:
        start_date, end_date = _parse_date_range(request, default_current_month=True)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)
    branch_ids = _get_branch_ids(request)
    return Response(
        OperationsReportingService.capacity_planning(
            start_date, end_date, branch_ids or None
        )
    )


@api_view(['GET'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def system_usage_report(request):
    try:
        start_date, end_date = _parse_date_range(request, default_current_month=True)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)
    return Response(OperationsReportingService.system_usage(start_date, end_date))
