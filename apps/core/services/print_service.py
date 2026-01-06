"""
Professional Print Service
Handles PDF generation for all document types across the application
"""
from typing import Dict, Any, Optional
from django.template.loader import render_to_string
from django.http import HttpResponse
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


from apps.accounts.settings_utils import get_company_info, get_branding_settings

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
            # Add default context and keys from system settings
            system_settings = {}
            system_settings.update(get_company_info())
            system_settings.update(get_branding_settings())
            
            # Convert logo_path to absolute file:// URL for WeasyPrint
            if 'logo_path' in system_settings and system_settings['logo_path']:
                logo_path = system_settings['logo_path']
                # Only convert if not already an absolute URL
                if not logo_path.startswith(('http://', 'https://', 'file://')):
                    import os
                    media_root = getattr(settings, 'MEDIA_ROOT', '/app/media')
                    
                    # Handle both /media/path and relative path formats
                    if logo_path.startswith('/media/'):
                        file_path = os.path.join(media_root, logo_path.replace('/media/', ''))
                    elif logo_path.startswith('/static/'):
                        static_root = getattr(settings, 'STATIC_ROOT', '/app/staticfiles')
                        file_path = os.path.join(static_root, logo_path.replace('/static/', ''))
                    else:
                        # Treat as relative path within MEDIA_ROOT
                        file_path = os.path.join(media_root, logo_path)
                    
                    # Convert to file:// URL
                    system_settings['logo_path'] = f'file://{file_path}'
                    logger.info(f"Converted logo path: {logo_path} -> file://{file_path}")
            
            context.update({
                'document_type': self.document_type,
                'settings': settings,
                **system_settings, # Flatten settings into context (company_name, logo_path etc)
            })
            
            # Render HTML
            html_string = render_to_string(self.template, context)

            # Generate PDF:
            # - Primary: WeasyPrint (HTML->PDF) when system libraries are available
            # - Fallback: ReportLab (pure-Python) when WeasyPrint/Pango is not available
            pdf_file = None
            try:
                # Local import so the app can still run when OS libs for WeasyPrint are missing
                from weasyprint import HTML, CSS  # type: ignore

                # Determine base_url for relative paths (images)
                # Use internal container URL for reliable access
                base_url = getattr(settings, 'INTERNAL_API_URL', 'http://localhost:8000')

                pdf_file = HTML(string=html_string, base_url=base_url).write_pdf(
                    stylesheets=[CSS(string=self._get_custom_css())]
                )
            except Exception as weasy_exc:
                logger.warning(
                    "WeasyPrint unavailable; falling back to simple PDF. Error: %s",
                    weasy_exc,
                    exc_info=True,
                )
                pdf_file = self._generate_simple_pdf(context)
            
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

    def _generate_simple_pdf(self, context: Dict[str, Any]) -> bytes:
        """
        Pure-Python fallback PDF generator.

        This is used on environments where WeasyPrint's system dependencies (Pango/Cairo)
        cannot be installed.
        """
        from io import BytesIO
        from datetime import datetime

        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas
        except Exception as e:
            # If ReportLab is missing, we must fail loudly
            raise RuntimeError("ReportLab is required for PDF fallback but is not installed.") from e

        buf = BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        width, height = A4

        y = height - 50
        c.setFont("Helvetica-Bold", 16)
        c.drawString(50, y, f"{self.document_type.replace('_', ' ').title()} (Simple PDF)")
        y -= 25

        c.setFont("Helvetica", 10)
        c.drawString(50, y, f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
        y -= 25

        doc = context.get("document")
        branch = context.get("branch")

        def write_kv(key: str, value: Any) -> None:
            nonlocal y
            if y < 60:
                c.showPage()
                y = height - 50
                c.setFont("Helvetica", 10)
            c.setFont("Helvetica-Bold", 10)
            c.drawString(50, y, f"{key}:")
            c.setFont("Helvetica", 10)
            c.drawString(180, y, str(value) if value is not None else "")
            y -= 16

        # Common fields
        if doc is not None:
            # Try to show a useful identifier
            for attr in ("invoice_number", "estimate_number", "work_order_number", "inspection_number", "po_number", "payment_number", "id"):
                if hasattr(doc, attr):
                    write_kv("Document Number", getattr(doc, attr))
                    break
            if hasattr(doc, "status"):
                write_kv("Status", getattr(doc, "status"))
            if hasattr(doc, "created_at"):
                write_kv("Created At", getattr(doc, "created_at"))

        if branch is not None and hasattr(branch, "name"):
            write_kv("Branch", getattr(branch, "name"))

        # Work-order specific details (best-effort)
        if self.document_type == "work_order" and doc is not None:
            try:
                customer = getattr(doc, "customer", None)
                if customer is not None and getattr(customer, "user", None) is not None:
                    write_kv("Customer", customer.user.get_full_name() or customer.user.username)
            except Exception:
                pass
            try:
                vehicle = getattr(doc, "vehicle", None)
                if vehicle is not None:
                    plate = getattr(vehicle, "license_plate", "") or ""
                    make = getattr(vehicle, "make", "") or ""
                    model = getattr(vehicle, "model", "") or ""
                    year = getattr(vehicle, "year", "") or ""
                    write_kv("Vehicle", f"{year} {make} {model} {plate}".strip())
            except Exception:
                pass

        c.showPage()
        c.save()
        return buf.getvalue()
    
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
