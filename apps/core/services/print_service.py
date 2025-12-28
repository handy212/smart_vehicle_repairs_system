"""
Professional Print Service
Handles PDF generation for all document types across the application
"""
from typing import Dict, Any, Optional
from weasyprint import HTML, CSS
from django.template.loader import render_to_string
from django.http import HttpResponse
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class DocumentPrinter:
    """Unified document printing service"""
    
    TEMPLATES = {
        'invoice': 'printing/documents/invoice.html',
        'estimate': 'printing/documents/estimate.html',
        'work_order': 'printing/documents/work_order.html',
        'inspection': 'printing/documents/inspection.html',
        'purchase_order': 'printing/documents/purchase_order.html',
        'receipt': 'printing/documents/receipt.html',
    }
    
    def __init__(self, document_type: str):
        """
        Initialize printer for specific document type
        
        Args:
            document_type: Type of document (invoice, estimate, etc.)
        """
        if document_type not in self.TEMPLATES:
            raise ValueError(f"Unknown document type: {document_type}")
        
        self.document_type = document_type
        self.template = self.TEMPLATES[document_type]
    
    def generate_pdf(
        self,
        context: Dict[str, Any],
        filename: Optional[str] = None
    ) -> HttpResponse:
        """
        Generate PDF from document data
        
        Args:
            context: Template context (document data, branch, etc.)
            filename: Optional custom filename
            
        Returns:
            HttpResponse with PDF content
        """
        try:
            # Add default context
            context.update({
                'document_type': self.document_type,
                'settings': settings,
            })
            
            # Render HTML
            html_string = render_to_string(self.template, context)
            
            # Generate PDF with custom CSS
            pdf_file = HTML(string=html_string).write_pdf(
                stylesheets=[CSS(string=self._get_custom_css())]
            )
            
            # Create response
            response = HttpResponse(pdf_file, content_type='application/pdf')
            
            if filename:
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
            else:
                response['Content-Disposition'] = 'inline'
            
            return response
            
        except Exception as e:
            logger.error(f"PDF generation failed for {self.document_type}: {e}", exc_info=True)
            raise
    
    def _get_custom_css(self) -> str:
        """Get custom CSS for PDF generation"""
        return """
        @page {
            size: A4;
            margin: 20mm;
        }
        """


# Convenience functions for common document types
def generate_invoice_pdf(invoice, branch=None):
    """Generate PDF for invoice"""
    printer = DocumentPrinter('invoice')
    context = {
        'document': invoice,
        'branch': branch or invoice.branch,
        'watermark': _get_watermark(invoice.status),
    }
    filename = f"invoice_{invoice.invoice_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_estimate_pdf(estimate, branch=None):
    """Generate PDF for estimate"""
    printer = DocumentPrinter('estimate')
    context = {
        'document': estimate,
        'branch': branch or estimate.branch,
        'watermark': _get_watermark(estimate.status),
    }
    filename = f"estimate_{estimate.estimate_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_work_order_pdf(work_order, branch=None):
    """Generate PDF for work order"""
    printer = DocumentPrinter('work_order')
    context = {
        'document': work_order,
        'branch': branch or work_order.branch,
    }
    filename = f"work_order_{work_order.work_order_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_inspection_pdf(inspection, branch=None):
    """
    Generate PDF for vehicle inspection
    Groups results by category for the template
    """
    printer = DocumentPrinter('inspection')
    
    # Pre-fetch results with related item and category
    results = inspection.results.select_related(
        'inspection_item', 
        'inspection_item__category'
    ).order_by(
        'inspection_item__category__order', 
        'inspection_item__order'
    )
    
    # Group by category
    from itertools import groupby
    grouped_results = []
    
    for category, category_results in groupby(results, key=lambda r: r.inspection_item.category):
        grouped_results.append({
            'category': category,
            'results': list(category_results)
        })
        
    context = {
        'document': inspection,
        'branch': branch or inspection.branch,
        'grouped_results': grouped_results,
    }
    filename = f"inspection_{inspection.inspection_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_purchase_order_pdf(purchase_order, branch=None):
    """Generate PDF for purchase order"""
    printer = DocumentPrinter('purchase_order')
    context = {
        'document': purchase_order,
        'branch': branch or purchase_order.branch,
        'items': purchase_order.items.select_related('part').all()
    }
    filename = f"PO_{purchase_order.po_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_receipt_pdf(payment, branch=None):
    """Generate PDF for payment receipt"""
    printer = DocumentPrinter('receipt')
    
    # Calculate previous payments for context
    previous_payments = 0
    if payment.invoice:
        # Sum of all completed payments for this invoice excluding current one
        from decimal import Decimal
        previous_payments = sum(
            p.amount - p.refund_amount 
            for p in payment.invoice.payments.filter(status='completed').exclude(id=payment.id)
        )
    
    context = {
        'document': payment,
        'branch': branch or payment.invoice.branch,
        'previous_payments': previous_payments,
    }
    filename = f"receipt_{payment.payment_number}.pdf"
    return printer.generate_pdf(context, filename)


def _get_watermark(status: str) -> Optional[Dict]:
    """Get watermark config for document status"""
    watermarks = {
        'draft': {'text': 'DRAFT', 'color': '#3b82f6'},
        'proforma': {'text': 'PROFORMA', 'color': '#8b5cf6'},
        'void': {'text': 'VOID', 'color': '#ef4444'},
        'paid': {'text': 'PAID', 'color': '#10b981'},
    }
    return watermarks.get(status)
