"""API views for Part B Phase 1 management reports."""
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasPermission, IsModuleEnabled

from .management_reports import ManagementReportingService
from .views import get_report_branch_id, scope_budgets
from .models import Budget


def _parse_period(request, default_current_month=True):
    start_str = request.query_params.get('start_date')
    end_str = request.query_params.get('end_date')
    today = timezone.now().date()
    if not start_str or not end_str:
        if default_current_month:
            return today.replace(day=1), today
        return None, None
    start_date = parse_date(start_str)
    end_date = parse_date(end_str)
    if not start_date or not end_date:
        return None, None
    return start_date, end_date


class _ManagementReportBase(APIView):
    permission_classes = [
        IsAuthenticated,
        IsModuleEnabled('accounting'),
        HasPermission('view_financial_reports'),
    ]


class ProfitLossComparativeView(_ManagementReportBase):
    @extend_schema(summary="P&L with MoM or YoY comparison")
    def get(self, request):
        start_date, end_date = _parse_period(request)
        if not start_date:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        comparison = request.query_params.get('comparison', 'mom')
        if comparison not in ('mom', 'yoy'):
            return Response({'error': 'comparison must be mom or yoy'}, status=400)
        branch_id = get_report_branch_id(request)
        report = ManagementReportingService.get_profit_loss_comparative(
            start_date, end_date, branch_id=branch_id, comparison=comparison
        )
        return Response(report)


class ConsolidatedProfitLossView(_ManagementReportBase):
    @extend_schema(summary="Consolidated P&L with branch breakdown")
    def get(self, request):
        start_date, end_date = _parse_period(request)
        if not start_date:
            return Response({'error': 'Invalid date format.'}, status=400)
        report = ManagementReportingService.get_consolidated_profit_loss(start_date, end_date)
        return Response(report)


class BranchPLScorecardView(_ManagementReportBase):
    @extend_schema(summary="Branch P&L scorecard with rankings")
    def get(self, request):
        start_date, end_date = _parse_period(request)
        if not start_date:
            return Response({'error': 'Invalid date format.'}, status=400)
        report = ManagementReportingService.get_branch_pl_scorecard(start_date, end_date)
        return Response(report)


class SupplierAPAgingView(_ManagementReportBase):
    @extend_schema(summary="AP ageing by supplier with payment terms")
    def get(self, request):
        date_str = request.query_params.get('date')
        as_of = parse_date(date_str) if date_str else timezone.now().date()
        branch_id = get_report_branch_id(request)
        report = ManagementReportingService.get_supplier_ap_aging(as_of, branch_id=branch_id)
        return Response(report)


class CashCollectionReportView(_ManagementReportBase):
    @extend_schema(summary="Cash collection by Individual vs Corporate")
    def get(self, request):
        start_date, end_date = _parse_period(request)
        if not start_date:
            return Response({'error': 'Invalid date format.'}, status=400)
        branch_id = get_report_branch_id(request)
        report = ManagementReportingService.get_cash_collection_report(
            start_date, end_date, branch_id=branch_id
        )
        return Response(report)


class RevenueMixReportView(_ManagementReportBase):
    @extend_schema(summary="Revenue mix by product and branch")
    def get(self, request):
        start_date, end_date = _parse_period(request)
        if not start_date:
            return Response({'error': 'Invalid date format.'}, status=400)
        branch_id = get_report_branch_id(request)
        report = ManagementReportingService.get_revenue_mix(
            start_date, end_date, branch_id=branch_id
        )
        return Response(report)


class CostControlReportView(_ManagementReportBase):
    @extend_schema(summary="Cost control — expenses and return/rework jobs")
    def get(self, request):
        start_date, end_date = _parse_period(request)
        if not start_date:
            return Response({'error': 'Invalid date format.'}, status=400)
        branch_id = get_report_branch_id(request)
        from .management_reports import ManagementReportingService
        report = ManagementReportingService.get_cost_control_report(
            start_date, end_date, branch_id=branch_id
        )
        return Response(report)


class OpexVarianceView(APIView):
    def get_permissions(self):
        permission_classes = [IsAuthenticated, IsModuleEnabled('accounting')]
        if request := getattr(self, 'request', None):
            if request.method in ('GET', 'HEAD', 'OPTIONS'):
                permission_classes.append(HasPermission('view_budgets'))
            else:
                permission_classes.append(HasPermission('manage_budgets'))
        else:
            permission_classes.append(HasPermission('view_budgets'))
        return [p() for p in permission_classes]

    @extend_schema(summary="OPEX variance vs budget")
    def get(self, request):
        budget_id = request.query_params.get('budget_id')
        if not budget_id:
            return Response({'error': 'budget_id required'}, status=400)
        if not scope_budgets(Budget.objects.filter(id=budget_id), request).exists():
            return Response({'error': 'Budget not found'}, status=404)
        start_date = parse_date(request.query_params.get('start_date') or '')
        end_date = parse_date(request.query_params.get('end_date') or '')
        report = ManagementReportingService.get_opex_variance(
            budget_id, start_date, end_date
        )
        if not report:
            return Response({'error': 'Budget not found'}, status=404)
        return Response(report)
