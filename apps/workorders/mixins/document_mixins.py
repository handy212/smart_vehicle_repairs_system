from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone

class WorkOrderDocumentMixin:
    """Mixin for work order document generation"""

    @action(detail=True, methods=['get'])
    def recommendations_pdf(self, request, pk=None):
        """
        Generate PDF of recommendations for vehicle dashboard.
        Returns PDF file that can be downloaded.
        """
        from django.http import HttpResponse
        from django.template.loader import render_to_string
        
        work_order = self.get_object()
        
        try:
            from apps.diagnosis.models import Diagnosis, RepairRecommendation
            
            # Get diagnosis for this work order
            diagnosis = Diagnosis.objects.filter(work_order=work_order).first()
            
            if not diagnosis:
                return Response(
                    {'error': 'No diagnosis found for this work order'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Filter for unapproved recommendations
            recommendations = diagnosis.repair_recommendations.filter(
                customer_approved=False
            ).order_by('priority', 'order', 'created_at')
            
            if not recommendations.exists():
                return Response(
                    {'error': 'No unapproved recommendations found for this work order'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Get branch info
            branch = work_order.branch
            from apps.core.services.print_service import _get_document_watermark, _get_pdf_footer_logos
            
            context = {
                'work_order': work_order,
                'vehicle': work_order.vehicle,
                'customer': work_order.customer,
                'recommendations': recommendations,
                'diagnosis': diagnosis,
                'print_generated_at': timezone.now(),
                'print_branch': branch,
                'print_footer_logos': _get_pdf_footer_logos(),
                'watermark': _get_document_watermark(
                    'recommendations',
                    work_order,
                    {'text': 'RECOMMENDATIONS', 'color': '#6b7280'},
                ),
            }
            
            try:
                from django.conf import settings
                from weasyprint import HTML
                
                # Render HTML template
                html_string = render_to_string('workorders/recommendations_print.html', context, request=request)
                
                # Generate PDF
                base_url = getattr(settings, 'INTERNAL_API_URL', 'http://localhost:8000')
                pdf = HTML(string=html_string, base_url=base_url).write_pdf()
                
                # Return PDF response
                response = HttpResponse(pdf, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="recommendations_{work_order.work_order_number}.pdf"'
                return response
                
            except ImportError:
                return Response(
                    {'error': 'PDF generation requires WeasyPrint. Please install it: pip install weasyprint'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error generating PDF: {str(e)}", exc_info=True)
                return Response(
                    {'error': f'Error generating PDF: {str(e)}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error getting recommendations for PDF: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Failed to generate PDF: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def print_recommendations(self, request, pk=None):
        """
        Get recommendations data for printing.
        Returns recommendations that are unapproved (not yet approved by customer).
        """
        work_order = self.get_object()
        
        try:
            from apps.diagnosis.models import Diagnosis, RepairRecommendation
            
            # Get diagnosis for this work order
            diagnosis = Diagnosis.objects.filter(work_order=work_order).first()
            
            if not diagnosis:
                return Response(
                    {'error': 'No diagnosis found for this work order'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Filter for unapproved recommendations (as per user selection)
            recommendations = diagnosis.repair_recommendations.filter(
                customer_approved=False
            ).order_by('priority', 'order', 'created_at')
            
            # Serialize recommendations
            from apps.diagnosis.serializers import RepairRecommendationSerializer
            recommendations_data = RepairRecommendationSerializer(recommendations, many=True).data
            
            # Get work order and vehicle details
            work_order_data = {
                'id': work_order.id,
                'work_order_number': work_order.work_order_number,
                'created_at': work_order.created_at,
                'completed_at': work_order.completed_at,
                'status': work_order.status,
            }
            
            vehicle_data = {
                'id': work_order.vehicle.id,
                'year': work_order.vehicle.year,
                'make': work_order.vehicle.make,
                'model': work_order.vehicle.model,
                'vin': work_order.vehicle.vin,
                'license_plate': work_order.vehicle.license_plate,
                'display_name': work_order.vehicle.display_name,
            }
            
            customer_data = {
                'id': work_order.customer.id,
                'customer_number': work_order.customer.customer_number,
                'full_name': work_order.customer.user.get_full_name() if work_order.customer.user else f"Customer #{work_order.customer.id}",
                'company_name': work_order.customer.company_name,
            }
            
            return Response({
                'work_order': work_order_data,
                'vehicle': vehicle_data,
                'customer': customer_data,
                'recommendations': recommendations_data,
                'count': recommendations.count(),
            })
            
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error getting recommendations for print: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Failed to get recommendations: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def print(self, request, pk=None):
        """Return HTML for print view (same layout as PDF)."""
        from django.http import HttpResponse
        from apps.core.services.print_service import render_work_order_print_html
        
        work_order = self.get_object()
        try:
            html = render_work_order_print_html(work_order, branch=work_order.branch, request=request)
            return HttpResponse(html, content_type='text/html; charset=utf-8')
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Print HTML generation error: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to generate print view: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Generate PDF for work order"""
        from apps.core.services.print_service import generate_work_order_pdf
        
        work_order = self.get_object()
        return generate_work_order_pdf(work_order)
