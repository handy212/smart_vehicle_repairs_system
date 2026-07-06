"""Operations AI API views."""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiTypes

from apps.accounts.permissions import HasAnyPermission, IsModuleEnabled, REPORTS_VIEW_PERMISSIONS
from apps.core.services.ai_audit import is_ai_enabled
from apps.core.services.ai_service import AIService

from .operations_reports import OperationsReportingService
from .views import _get_branch_ids, _parse_date_range

REPORTS_PERMISSION_CLASSES = [
    IsAuthenticated,
    IsModuleEnabled('reports'),
    HasAnyPermission(list(REPORTS_VIEW_PERMISSIONS)),
]


def _ai_unavailable():
    return Response(
        {'error': 'AI features are not configured or disabled. Set GEMINI_API_KEY and enable AI in system settings.'},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


def _require_ai(feature):
    if not is_ai_enabled(feature):
        return _ai_unavailable()
    return None


@extend_schema(description='Generate a natural-language daily operations briefing.')
@api_view(['POST'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def daily_briefing(request):
    denied = _require_ai('ops_briefing')
    if denied:
        return denied
    try:
        start_date, end_date = _parse_date_range(request, default_current_month=True)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)

    branch_ids = _get_branch_ids(request)
    context = {
        'exceptions': OperationsReportingService.exception_log(branch_ids or None),
        'return_jobs': OperationsReportingService.cost_control_return_jobs(
            start_date, end_date, branch_ids or None
        ),
        'capacity': OperationsReportingService.capacity_planning(
            start_date, end_date, branch_ids or None
        ),
        'ap_cycle': OperationsReportingService.ap_cycle_time(
            start_date, end_date, branch_ids or None
        ),
        'roadside': OperationsReportingService.roadside_revenue(
            start_date, end_date, branch_ids or None
        ),
        'period': {'start': str(start_date), 'end': str(end_date)},
    }
    briefing = AIService.generate_ops_briefing(context, user=request.user)
    return Response({'briefing': briefing, 'context_summary': {
        'exception_count': len(context['exceptions'].get('exceptions', [])),
        'return_job_count': len(context['return_jobs'].get('return_jobs', [])),
    }})


@extend_schema(description='AI triage of operational exceptions with suggested actions and draft SMS.')
@api_view(['POST'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def triage_exceptions(request):
    denied = _require_ai('ops_exception_triage')
    if denied:
        return denied
    branch_ids = _get_branch_ids(request)
    data = OperationsReportingService.exception_log(branch_ids or None)
    exceptions = data.get('exceptions', [])
    if not exceptions:
        return Response({'triage': [], 'message': 'No exceptions to triage.'})
    triage = AIService.triage_exceptions(exceptions, user=request.user)
    return Response({'triage': triage, 'as_of': data.get('as_of')})


@extend_schema(description='AI root-cause analysis of return/rework jobs.')
@api_view(['POST'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def analyze_return_jobs(request):
    denied = _require_ai('ops_return_jobs')
    if denied:
        return denied
    try:
        start_date, end_date = _parse_date_range(request, default_current_month=True)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)
    branch_ids = _get_branch_ids(request)
    data = OperationsReportingService.cost_control_return_jobs(
        start_date, end_date, branch_ids or None
    )
    analysis = AIService.analyze_return_jobs(data.get('return_jobs', []), user=request.user)
    return Response({'analysis': analysis, 'return_job_count': len(data.get('return_jobs', []))})


@extend_schema(description='AI narrative for capacity planning data.')
@api_view(['POST'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def capacity_narrative(request):
    denied = _require_ai('ops_capacity')
    if denied:
        return denied
    try:
        start_date, end_date = _parse_date_range(request, default_current_month=True)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)
    branch_ids = _get_branch_ids(request)
    data = OperationsReportingService.capacity_planning(
        start_date, end_date, branch_ids or None
    )
    narrative = AIService.generate_capacity_narrative(data, user=request.user)
    return Response({'narrative': narrative, 'data': data})


@extend_schema(description='AI narrative for AP cycle time data.')
@api_view(['POST'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def ap_cycle_narrative(request):
    denied = _require_ai('ops_ap_cycle')
    if denied:
        return denied
    try:
        start_date, end_date = _parse_date_range(request, default_current_month=True)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)
    branch_ids = _get_branch_ids(request)
    data = OperationsReportingService.ap_cycle_time(
        start_date, end_date, branch_ids or None
    )
    narrative = AIService.generate_ap_cycle_narrative(data, user=request.user)
    return Response({'narrative': narrative, 'data': data})


@extend_schema(
    parameters=[
        OpenApiParameter('work_order_id', OpenApiTypes.INT, required=False),
        OpenApiParameter('part_id', OpenApiTypes.INT, required=False),
    ],
    description='Natural-language Q&A over a parts traceability chain.',
)
@api_view(['POST'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def traceability_qa(request):
    denied = _require_ai('ops_traceability')
    if denied:
        return denied
    question = (request.data.get('question') or '').strip()
    if not question:
        return Response({'error': 'question is required'}, status=400)
    wo_id = request.data.get('work_order_id') or request.query_params.get('work_order_id')
    part_id = request.data.get('part_id') or request.query_params.get('part_id')
    if not wo_id and not part_id:
        return Response({'error': 'work_order_id or part_id required'}, status=400)
    chain_data = OperationsReportingService.traceability(
        work_order_id=int(wo_id) if wo_id else None,
        part_id=int(part_id) if part_id else None,
    )
    answer = AIService.answer_traceability_query(chain_data.get('chain', []), question, user=request.user)
    return Response({'answer': answer, 'chain_count': len(chain_data.get('chain', []))})


@extend_schema(description='AI analysis of work-order workflow bottlenecks.')
@api_view(['POST'])
@permission_classes(REPORTS_PERMISSION_CLASSES)
def workflow_bottleneck_analysis(request):
    denied = _require_ai('ops_bottleneck')
    if denied:
        return denied
    metrics = request.data.get('metrics')
    if not metrics:
        return Response({'error': 'metrics object is required (from workflow_metrics endpoint)'}, status=400)
    analysis = AIService.analyze_workflow_bottlenecks(metrics, user=request.user)
    return Response({'analysis': analysis})
