"""HTML print and PDF export for accounting financial reports."""
import logging

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasPermission, IsModuleEnabled

from .report_print import ACCOUNTING_REPORT_SLUGS, build_accounting_report_context

logger = logging.getLogger(__name__)

_REPORT_PERMISSIONS = [
    IsAuthenticated,
    IsModuleEnabled('accounting'),
    HasPermission('view_financial_reports'),
]


class AccountingReportPrintView(APIView):
    """Render report as HTML (same layout as PDF) for browser print."""

    permission_classes = _REPORT_PERMISSIONS

    @extend_schema(
        summary="Accounting report print HTML",
        responses={(200, 'text/html'): OpenApiTypes.STR},
    )
    def get(self, request, report_slug):
        if report_slug not in ACCOUNTING_REPORT_SLUGS:
            return Response({'error': 'Unknown report'}, status=status.HTTP_404_NOT_FOUND)
        try:
            from apps.core.services.print_service import render_accounting_report_html

            context = build_accounting_report_context(report_slug, request)
            html = render_accounting_report_html(context, request=request)
            response = HttpResponse(html, content_type='text/html; charset=utf-8')
            response['Cache-Control'] = 'private, max-age=300'
            return response
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.error('Accounting report print failed (%s): %s', report_slug, exc, exc_info=True)
            return Response(
                {'error': f'Failed to generate print view: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class AccountingReportPdfView(APIView):
    """Download report as PDF (WeasyPrint / ReportLab fallback)."""

    permission_classes = _REPORT_PERMISSIONS

    @extend_schema(
        summary="Accounting report PDF",
        responses={(200, 'application/pdf'): OpenApiTypes.BINARY},
    )
    def get(self, request, report_slug):
        if report_slug not in ACCOUNTING_REPORT_SLUGS:
            return Response({'error': 'Unknown report'}, status=status.HTTP_404_NOT_FOUND)
        try:
            from apps.core.services.print_service import generate_accounting_report_pdf

            context = build_accounting_report_context(report_slug, request)
            filename = f"{report_slug}_{context.get('date_info', 'report')}.pdf".replace(' ', '_')
            return generate_accounting_report_pdf(context, filename=filename)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.error('Accounting report PDF failed (%s): %s', report_slug, exc, exc_info=True)
            return Response(
                {'error': f'Failed to generate PDF: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
