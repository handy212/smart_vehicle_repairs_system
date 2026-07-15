"""
Professional Print Service
Handles PDF generation for all document types across the application
"""
from typing import Dict, Any, Optional
from django.template.loader import render_to_string
from django.http import HttpResponse
from django.conf import settings
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


from apps.accounts.settings_utils import get_company_info, get_branding_settings, get_document_terms


def _get_pdf_footer_logos() -> list[str]:
    logo_dir = Path(settings.BASE_DIR) / 'static' / 'images' / 'logos'
    return [
        f'file://{logo_dir / filename}'
        for filename in ('logo-1.jpeg', 'logo-2.jpeg', 'logo-3.jpeg')
        if (logo_dir / filename).exists()
    ]


def _get_browser_footer_logos(base_url: str) -> list[str]:
    """HTTP logo URLs for browser HTML print previews."""
    logo_dir = Path(settings.BASE_DIR) / 'static' / 'images' / 'logos'
    root = base_url.rstrip('/')
    return [
        f'{root}/static/images/logos/{filename}'
        for filename in ('logo-1.jpeg', 'logo-2.jpeg', 'logo-3.jpeg')
        if (logo_dir / filename).exists()
    ]


def _document_watermark_enabled() -> bool:
    from apps.accounts.settings_utils import get_setting

    value = get_setting('document_watermark_enabled', 'true')
    return str(value).strip().lower() in {'true', '1', 'yes', 'on'}


DOCUMENT_WATERMARKS = {
    'work_order': 'WORK ORDER',
    'job_card': 'JOB CARD',
    'inspection': 'INSPECTION',
    'purchase_order': 'PURCHASE ORDER',
    'receipt': 'RECEIPT',
    'gate_pass': 'GATE PASS',
    'bill': 'BILL',
    'transfer_note': 'TRANSFER',
    'inventory_count_sheet': 'COUNT SHEET',
    'aging_report': 'AGING REPORT',
    'revenue_summary': 'REVENUE REPORT',
    'payslip': 'PAYSLIP',
    'diagnosis_report': 'DIAGNOSIS',
    'recommendations': 'RECOMMENDATIONS',
    'financial_report': 'FINANCIAL REPORT',
}


def _get_default_watermark(document_type: str, document: Any = None) -> Optional[Dict[str, str]]:
    if not _document_watermark_enabled():
        return None

    status = getattr(document, 'status', None)
    if status:
        status_watermark = _get_watermark(str(status))
        if status_watermark:
            return status_watermark

    text = DOCUMENT_WATERMARKS.get(document_type)
    if not text:
        return None
    return {'text': text, 'color': '#6b7280'}


def _get_document_watermark(document_type: str, document: Any = None, explicit: Optional[Dict[str, str]] = None) -> Optional[Dict[str, str]]:
    if not _document_watermark_enabled():
        return None
    return explicit or _get_default_watermark(document_type, document)


def _normalize_inspection_damage_marks(vehicle_damage: Any) -> list[dict[str, Any]]:
    """Normalize inspection damage marks for print/PDF templates."""
    if not isinstance(vehicle_damage, list):
        return []

    type_colors = {
        'scratch': '#6366f1',
        'dent': '#dc2626',
        'chip': '#eab308',
        'crack': '#ea580c',
        'rust': '#92400e',
        'other': '#4b5563',
    }
    severity_sizes = {
        'minor': 10,
        'moderate': 14,
        'major': 18,
    }
    severity_badges = {
        'minor': 'badge-minor',
        'moderate': 'badge-moderate',
        'major': 'badge-major',
    }

    normalized: list[dict[str, Any]] = []
    for index, mark in enumerate(vehicle_damage, start=1):
        if not isinstance(mark, dict):
            continue

        raw_type = str(mark.get('type') or 'other').strip().lower()
        raw_severity = str(mark.get('severity') or 'minor').strip().lower()
        type_key = raw_type if raw_type in type_colors else 'other'
        severity_key = raw_severity if raw_severity in severity_sizes else 'minor'

        try:
            x = float(mark.get('x', 0))
            y = float(mark.get('y', 0))
        except (TypeError, ValueError):
            continue

        if 0 <= x <= 1:
            x *= 100
        if 0 <= y <= 1:
            y *= 100

        normalized.append({
            'index': index,
            'type': type_key,
            'severity': severity_key,
            'description': str(mark.get('description') or '').strip(),
            'x_pct': max(0, min(100, x)),
            'y_pct': max(0, min(100, y)),
            'marker_color': type_colors[type_key],
            'marker_size': severity_sizes[severity_key],
            'badge_class': severity_badges[severity_key],
        })

    return normalized


def _get_static_asset_url(relative_path: str, *, base_url: Optional[str] = None, prefer_file: bool = False) -> str:
    normalized = relative_path.lstrip('/')
    static_root = Path(getattr(settings, 'STATIC_ROOT', ''))
    static_dirs = [Path(p) for p in getattr(settings, 'STATICFILES_DIRS', [])]
    search_roots = [root for root in [static_root, *static_dirs] if str(root)]

    for root in search_roots:
        candidate = root / normalized
        if candidate.exists():
            if prefer_file:
                return candidate.resolve().as_uri()
            if base_url:
                return f"{base_url.rstrip('/')}/static/{normalized.replace('static/', '', 1)}"

    if base_url:
        return f"{base_url.rstrip('/')}/static/{normalized.replace('static/', '', 1)}"
    return f"/static/{normalized.replace('static/', '', 1)}"


def _suppress_pdf_library_logs() -> None:
    """Reduce noisy third-party PDF/font logs during document generation."""
    for logger_name in (
        'fontTools',
        'fontTools.subset',
        'fontTools.ttLib',
        'fontTools.misc',
    ):
        logging.getLogger(logger_name).setLevel(logging.ERROR)


def _build_work_order_delivery_contact(work_order: Any) -> Dict[str, str]:
    customer = getattr(work_order, 'customer', None)
    contact = getattr(work_order, 'brought_by_contact', None)

    def _customer_name() -> str:
        if not customer:
            return "—"
        return getattr(customer, 'company_name', '') or getattr(customer, 'full_name', '') or str(customer)

    if work_order.brought_by_type == 'saved_contact' and contact:
        full_name = f"{contact.first_name} {contact.last_name}".strip()
        return {
            'name': full_name or "—",
            'role': contact.job_title or work_order.brought_by_relationship or "Company Contact",
            'phone': contact.phone or "",
            'email': contact.email or "",
        }

    if work_order.brought_by_type == 'third_party':
        return {
            'name': work_order.brought_by_name or "—",
            'role': work_order.brought_by_relationship or work_order.get_brought_by_type_display(),
            'phone': work_order.brought_by_phone or "",
            'email': work_order.brought_by_email or "",
        }

    return {
        'name': _customer_name(),
        'role': 'Account Holder',
        'phone': getattr(customer, 'phone', '') or "",
        'email': getattr(customer, 'email', '') or "",
    }


def _build_work_order_stage_timeline(work_order: Any) -> list[dict[str, Any]]:
    timeline: list[dict[str, Any]] = []

    def add(label: str, when: Any, tone: str = 'muted') -> None:
        if when:
            timeline.append({'label': label, 'when': when, 'tone': tone})

    add('Job Opened', work_order.created_at, 'neutral')
    add('Diagnosis Ready', work_order.diagnosis_completed_at, 'info')
    add('Approval Requested', work_order.approval_requested_at, 'warning')
    add('Customer Approved', work_order.approved_at, 'success')
    add('Repairs Started', work_order.started_at, 'info')
    if getattr(work_order, 'quality_check_completed', False):
        add(
            'Quality Check',
            work_order.quality_check_at,
            'success' if getattr(work_order, 'quality_check_passed', False) else 'warning',
        )
    add('Work Completed', work_order.completed_at, 'success')

    invoice = getattr(work_order, 'invoice', None)
    if invoice:
        add('Invoice Ready', getattr(invoice, 'created_at', None), 'neutral')
        add('Invoice Paid', getattr(invoice, 'paid_at', None), 'success')

    gate_pass = work_order.gate_passes.exclude(status='cancelled').order_by('-created_at').first()
    if gate_pass:
        add('Gate Pass Issued', getattr(gate_pass, 'issued_at', None) or gate_pass.created_at, 'neutral')
        add('Vehicle Released', getattr(gate_pass, 'completed_at', None), 'success')

    return timeline


def _build_diagnosis_recommendation_context(work_order: Any) -> Dict[str, Any]:
    diagnosis = getattr(work_order, 'diagnosis', None)
    if not diagnosis:
        return {
            'diagnosis_record': None,
            'diagnosis_summary': None,
            'diagnosis_recommendations': [],
        }

    recommendations = list(
        diagnosis.repair_recommendations.prefetch_related('findings').order_by('order', 'created_at')
    )
    if not recommendations:
        return {
            'diagnosis_record': diagnosis,
            'diagnosis_summary': {
                'total': 0,
                'approved': 0,
                'pending': 0,
                'deferred': 0,
                'declined': 0,
                'quoted': 0,
                'requested': 0,
            },
            'diagnosis_recommendations': [],
        }

    approval_counts = {
        'approved': 0,
        'pending': 0,
        'deferred': 0,
        'declined': 0,
    }
    quotation_counts = {
        'quoted': 0,
        'requested': 0,
    }
    normalized_recommendations: list[Dict[str, Any]] = []

    for recommendation in recommendations:
        status_key = recommendation.approval_status
        if status_key == 'pending_approval':
            approval_counts['pending'] += 1
        elif status_key in approval_counts:
            approval_counts[status_key] += 1

        if recommendation.quotation_status == 'quoted':
            quotation_counts['quoted'] += 1
        elif recommendation.quotation_status == 'requested':
            quotation_counts['requested'] += 1

        parts_list = []
        for part in recommendation.parts_needed or []:
            if not isinstance(part, dict):
                continue
            name = str(part.get('part_name') or part.get('name') or '').strip()
            quantity = part.get('quantity')
            if name:
                parts_list.append(f"{name}{f' x{quantity}' if quantity not in (None, '', 0) else ''}")

        finding_summaries = [
            getattr(finding, 'finding_summary', '') or getattr(finding, 'summary', '') or str(finding)
            for finding in recommendation.findings.all()
        ]

        normalized_recommendations.append({
            'record': recommendation,
            'parts_text': ', '.join(parts_list),
            'findings_text': '; '.join(filter(None, finding_summaries[:3])),
            'is_approved': recommendation.approval_status == 'approved',
            'is_unapproved': recommendation.approval_status in {'pending_approval', 'deferred', 'declined'},
        })

    return {
        'diagnosis_record': diagnosis,
        'diagnosis_summary': {
            'total': len(recommendations),
            'approved': approval_counts['approved'],
            'pending': approval_counts['pending'],
            'deferred': approval_counts['deferred'],
            'declined': approval_counts['declined'],
            'quoted': quotation_counts['quoted'],
            'requested': quotation_counts['requested'],
        },
        'diagnosis_recommendations': normalized_recommendations,
    }


def _build_work_order_print_context(work_order: Any) -> Dict[str, Any]:
    from django.db.models import Q

    invoice = getattr(work_order, 'invoice', None)
    gate_pass = work_order.gate_passes.exclude(status='cancelled').order_by('-created_at').first()
    repair_tasks = work_order.tasks.filter(is_workflow_task=False).select_related('assigned_to').order_by('sequence_order', 'id')
    parts = work_order.parts.order_by('created_at', 'id')

    visible_notes = list(
        work_order.notes.select_related('created_by')
        .exclude(note__startswith='Status changed from ')
        .exclude(note__startswith='Status changed from')
        .filter(
            Q(is_important=True)
            | Q(note_type__in=['customer', 'technician', 'parts', 'approval', 'quality', 'general'])
        )
        .order_by('-created_at')[:8]
    )

    workflow_notes = list(
        work_order.notes.select_related('created_by')
        .filter(note_type='status')
        .order_by('-created_at')[:5]
    )

    diagnosis_context = _build_diagnosis_recommendation_context(work_order)

    return {
        'delivery_contact': _build_work_order_delivery_contact(work_order),
        'work_order_timeline': _build_work_order_stage_timeline(work_order),
        'repair_tasks': repair_tasks,
        'work_order_parts': parts,
        'visible_work_order_notes': visible_notes,
        'workflow_notes': workflow_notes,
        'invoice_summary': invoice,
        'gate_pass_summary': gate_pass,
        **diagnosis_context,
    }

class DocumentPrinter:
    """Unified document printing service"""
    
    TEMPLATES = {
        'invoice': 'printing/documents/invoice.html',
        'estimate': 'printing/documents/estimate.html',
        'work_order': 'printing/documents/work_order.html',
        'job_card': 'printing/documents/job_card.html',
        'inspection': 'printing/documents/inspection.html',
        'purchase_order': 'printing/documents/purchase_order.html',
        'receipt': 'printing/documents/receipt.html',
        'gate_pass': 'printing/documents/gate_pass.html',
        'credit_note': 'printing/documents/credit_note.html',
        'bill': 'printing/documents/bill.html',
        'transfer_note': 'printing/documents/transfer_note.html',
        'inventory_count_sheet': 'printing/documents/inventory_count_sheet.html',
        'aging_report': 'printing/reports/aging_report.html',
        'revenue_summary': 'printing/reports/revenue_summary.html',
        'payslip': 'printing/documents/payslip.html',
        'diagnosis_report': 'diagnosis/customer_report.html',
        'financial_report': 'printing/reports/financial_report.html',
        'customer_statement': 'printing/reports/customer_statement.html',
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
            system_settings.update(get_document_terms())
            
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
                'print_footer_logos': _get_pdf_footer_logos(),
                'is_pdf': True,
                **system_settings, # Flatten settings into context (company_name, logo_path etc)
            })
            if context.pop('disable_watermark', False):
                context['watermark'] = None
            else:
                context['watermark'] = _get_document_watermark(
                    self.document_type,
                    context.get('document'),
                    context.get('watermark'),
                )
            
            # Render HTML
            html_string = render_to_string(self.template, context)

            # Generate PDF:
            # - Primary: WeasyPrint (HTML->PDF) when system libraries are available
            # - Fallback: ReportLab (pure-Python) when WeasyPrint/Pango is not available
            pdf_file = None
            try:
                # Local import so the app can still run when OS libs for WeasyPrint are missing
                _suppress_pdf_library_logs()
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
        """
        Extra WeasyPrint helpers that mirror the HTML print layout.

        Keep @page / shell / footer rules in document_base.html so PDF and print stay aligned.
        """
        return """
        html,
        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 7.5pt;
            line-height: 1.2;
            background: #fff !important;
        }

        body.is-pdf .document-shell {
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
            display: block !important;
        }

        body.is-pdf .print-footer {
            position: running(doc-footer) !important;
            margin-top: 0 !important;
            width: 100% !important;
        }

        body.is-pdf .header-container,
        body.is-pdf .print-footer {
            table-layout: fixed !important;
            width: 100% !important;
        }

        body.is-pdf .header-right {
            width: 38% !important;
            max-width: none !important;
            text-align: right !important;
        }

        body.is-pdf .header-meta {
            width: 100% !important;
            table-layout: auto !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
        }

        body.is-pdf .header-meta td.header-meta-label {
            width: 100% !important;
            text-align: right !important;
            white-space: nowrap !important;
        }

        body.is-pdf .header-meta td.header-meta-value {
            width: 1% !important;
            text-align: left !important;
            white-space: nowrap !important;
        }

        body.is-pdf .header-tagline {
            text-align: right !important;
        }

        body.is-pdf .doc-number {
            background: #eff6ff !important;
            border: 1px solid #93c5fd !important;
            color: #1e3a8a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
        }

        body.is-pdf .doc-type {
            color: #1d4ed8 !important;
        }

        body.is-pdf .print-footer-logos {
            text-align: right !important;
        }

        body.is-pdf .print-footer-page {
            display: block !important;
        }

        table {
            page-break-inside: auto;
            break-inside: auto;
        }

        thead {
            display: table-header-group;
        }

        tfoot {
            display: table-footer-group;
        }

        tr,
        .avoid-break,
        .page-break-avoid,
        .info-card,
        .financial-summary {
            page-break-inside: avoid;
            break-inside: avoid;
        }

        a[href]::after {
            content: "";
        }
        """


# Convenience functions for common document types
def generate_invoice_pdf(invoice, branch=None):
    """Generate PDF for invoice"""
    printer = DocumentPrinter('invoice')
    context = {
        'document': invoice,
        'branch': branch or invoice.branch,
        'watermark': _get_document_watermark('invoice', invoice, _get_watermark(invoice.status)),
    }
    filename = f"invoice_{invoice.invoice_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_estimate_pdf(estimate, branch=None):
    """Generate PDF for estimate"""
    printer = DocumentPrinter('estimate')
    context = {
        'document': estimate,
        'branch': branch or estimate.branch,
        'watermark': _get_document_watermark('estimate', estimate, _get_watermark(estimate.status)),
    }
    filename = f"estimate_{estimate.estimate_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_work_order_pdf(work_order, branch=None):
    """Generate PDF for work order"""
    printer = DocumentPrinter('work_order')
    context = {
        'document': work_order,
        'branch': branch or work_order.branch,
        'watermark': _get_document_watermark('work_order', work_order),
        **_build_work_order_print_context(work_order),
    }
    filename = f"work_order_{work_order.work_order_number}.pdf"
    return printer.generate_pdf(context, filename)


def _build_job_card_print_context(work_order) -> Dict[str, Any]:
    """Lean context for the customer-facing Job Card (intake / acknowledgement)."""
    job_type_names = []
    try:
        job_type_names = list(
            work_order.job_types.order_by('name').values_list('name', flat=True)
        )
    except Exception:
        pass
    if not job_type_names and getattr(work_order, 'job_type', None):
        job_type_names = [work_order.job_type.name]

    fuel_display = ''
    battery_display = ''
    try:
        fuel_display = work_order.get_fuel_level_display() if work_order.fuel_level else ''
    except Exception:
        fuel_display = work_order.fuel_level or ''
    try:
        battery_display = (
            work_order.get_battery_condition_display() if work_order.battery_condition else ''
        )
    except Exception:
        battery_display = work_order.battery_condition or ''

    return {
        'job_type_names': job_type_names,
        'intake_fuel_level': fuel_display,
        'intake_battery_condition': battery_display,
        'intake_valuables_notes': (work_order.valuables_notes or '').strip(),
        'intake_warning_lights_notes': (work_order.warning_lights_notes or '').strip(),
    }


def generate_job_card_pdf(work_order, branch=None):
    """Generate customer-facing Job Card PDF (handed over at intake)."""
    printer = DocumentPrinter('job_card')
    context = {
        'document': work_order,
        'branch': branch or work_order.branch,
        # Customer handout — keep clean like the paper job card (no watermark).
        'disable_watermark': True,
        'watermark': None,
        **_build_job_card_print_context(work_order),
    }
    filename = f"job_card_{work_order.work_order_number}.pdf"
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
        'normalized_damage_marks': _normalize_inspection_damage_marks(inspection.vehicle_damage),
        'inspection_damage_diagram_url': _get_static_asset_url(
            'images/car_with_markers.png',
            prefer_file=True,
        ),
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


def _make_logo_absolute(branding: dict, base_url: str) -> None:
    """Convert logo_path to absolute URL for HTML display (in-place)."""
    from django.conf import settings as django_settings
    if not branding.get('logo_path'):
        return
    lp = branding['logo_path']
    if lp.startswith(('http://', 'https://')):
        return
    media_url = getattr(django_settings, 'MEDIA_URL', '/media/')
    if lp.startswith('/'):
        path = lp
    else:
        path = f"{media_url.rstrip('/')}/{lp.lstrip('/')}"
    branding['logo_path'] = f"{base_url.rstrip('/')}{path}"


def render_invoice_print_html(invoice, branch=None, request=None):
    """Render invoice as HTML for browser print (same layout as PDF)."""
    from apps.accounts.settings_utils import get_company_info, get_branding_settings, get_document_terms
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    document_terms = get_document_terms()
    _make_logo_absolute(branding, base_url)
    context = {
        'document': invoice,
        'branch': branch or invoice.branch,
        'watermark': _get_document_watermark('invoice', invoice, _get_watermark(invoice.status)),
        'show_print_controls': True,
        'base_url': base_url.rstrip('/'),
        'print_footer_logos': _get_browser_footer_logos(base_url),
        **company_info,
        **branding,
        **document_terms,
    }
    return render_to_string('printing/documents/invoice.html', context)


def render_estimate_print_html(estimate, branch=None, request=None):
    """Render estimate as HTML for browser print (same layout as PDF)."""
    from apps.accounts.settings_utils import get_company_info, get_branding_settings, get_document_terms
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    document_terms = get_document_terms()
    _make_logo_absolute(branding, base_url)
    context = {
        'document': estimate,
        'branch': branch or estimate.branch,
        'watermark': _get_document_watermark('estimate', estimate, _get_watermark(estimate.status)),
        'show_print_controls': True,
        'base_url': base_url.rstrip('/'),
        'print_footer_logos': _get_browser_footer_logos(base_url),
        **company_info,
        **branding,
        **document_terms,
    }
    return render_to_string('printing/documents/estimate.html', context)


def render_receipt_print_html(payment, branch=None, request=None):
    """Render payment receipt as HTML for browser print."""
    from apps.accounts.settings_utils import get_company_info, get_branding_settings, get_document_terms
    from decimal import Decimal
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    document_terms = get_document_terms()
    _make_logo_absolute(branding, base_url)
    previous_payments = Decimal('0')
    if payment.invoice:
        previous_payments = sum(
            p.amount - getattr(p, 'refund_amount', Decimal('0'))
            for p in payment.invoice.payments.filter(status='completed').exclude(id=payment.id)
        )
    context = {
        'document': payment,
        'branch': branch or (payment.invoice.branch if payment.invoice else None),
        'previous_payments': previous_payments,
        'watermark': _get_document_watermark('receipt', payment),
        'show_print_controls': True,
        'base_url': base_url.rstrip('/'),
        **company_info,
        **branding,
        **document_terms,
    }
    return render_to_string('printing/documents/receipt.html', context)


def render_work_order_print_html(work_order, branch=None, request=None):
    """Render work order as HTML for browser print."""
    from apps.accounts.settings_utils import get_company_info, get_branding_settings, get_document_terms
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    document_terms = get_document_terms()
    _make_logo_absolute(branding, base_url)
    context = {
        'document': work_order,
        'branch': branch or work_order.branch,
        'watermark': _get_document_watermark('work_order', work_order),
        'show_print_controls': True,
        'base_url': base_url.rstrip('/'),
        **_build_work_order_print_context(work_order),
        **company_info,
        **branding,
        **document_terms,
    }
    return render_to_string('printing/documents/work_order.html', context)


def render_job_card_print_html(work_order, branch=None, request=None):
    """Render customer-facing Job Card as HTML for browser print."""
    from apps.accounts.settings_utils import get_company_info, get_branding_settings, get_document_terms
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    document_terms = get_document_terms()
    _make_logo_absolute(branding, base_url)
    context = {
        'document': work_order,
        'branch': branch or work_order.branch,
        'watermark': None,
        'show_print_controls': True,
        'base_url': base_url.rstrip('/'),
        'print_footer_logos': _get_browser_footer_logos(base_url),
        **_build_job_card_print_context(work_order),
        **company_info,
        **branding,
        **document_terms,
    }
    return render_to_string('printing/documents/job_card.html', context)


def render_inspection_print_html(inspection, branch=None, request=None):
    """Render inspection as HTML for browser print."""
    from apps.accounts.settings_utils import get_company_info, get_branding_settings
    from itertools import groupby
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    _make_logo_absolute(branding, base_url)
    results = inspection.results.select_related(
        'inspection_item', 'inspection_item__category'
    ).order_by('inspection_item__category__order', 'inspection_item__order')
    grouped_results = [
        {'category': cat, 'results': list(grp)}
        for cat, grp in groupby(results, key=lambda r: r.inspection_item.category)
    ]
    context = {
        'document': inspection,
        'branch': branch or inspection.branch,
        'grouped_results': grouped_results,
        'normalized_damage_marks': _normalize_inspection_damage_marks(inspection.vehicle_damage),
        'inspection_damage_diagram_url': _get_static_asset_url(
            'images/car_with_markers.png',
            base_url=base_url.rstrip('/'),
        ),
        'watermark': _get_document_watermark('inspection', inspection),
        'show_print_controls': True,
        'base_url': base_url.rstrip('/'),
        **company_info,
        **branding,
    }
    return render_to_string('printing/documents/inspection.html', context)


def _get_watermark(status: str) -> Optional[Dict]:
    """Get watermark config for document status"""
    watermarks = {
        'draft': {'text': 'DRAFT', 'color': '#3b82f6'},
        'proforma': {'text': 'PROFORMA', 'color': '#8b5cf6'},
        'void': {'text': 'VOID', 'color': '#ef4444'},
        'paid': {'text': 'PAID', 'color': '#10b981'},
    }
    return watermarks.get(status)


def render_gate_pass_print_html(gate_pass, branch=None, request=None):
    """Render gate pass as HTML for browser print."""
    from apps.accounts.settings_utils import get_company_info, get_branding_settings
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    _make_logo_absolute(branding, base_url)
    context = {
        'document': gate_pass,
        'branch': branch or gate_pass.branch,
        'watermark': _get_document_watermark('gate_pass', gate_pass),
        'show_print_controls': True,
        'base_url': base_url.rstrip('/'),
        **company_info,
        **branding,
    }
    return render_to_string('printing/documents/gate_pass.html', context)


def render_credit_note_print_html(credit_note, branch=None, request=None):
    """Render credit note as HTML for browser print."""
    from apps.accounts.settings_utils import get_company_info, get_branding_settings, get_document_terms
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    document_terms = get_document_terms()
    _make_logo_absolute(branding, base_url)
    context = {
        'document': credit_note,
        'branch': branch or credit_note.branch,
        'items': credit_note.line_items.all(),
        'watermark': _get_document_watermark('credit_note', credit_note, _get_watermark(credit_note.status)),
        'show_print_controls': True,
        'base_url': base_url.rstrip('/'),
        **company_info,
        **branding,
        **document_terms,
    }
    return render_to_string('printing/documents/credit_note.html', context)


def render_purchase_order_print_html(purchase_order, branch=None, request=None):
    """Render purchase order as HTML for browser print."""
    from apps.accounts.settings_utils import get_company_info, get_branding_settings
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    _make_logo_absolute(branding, base_url)
    context = {
        'document': purchase_order,
        'branch': branch or purchase_order.branch,
        'watermark': _get_document_watermark('purchase_order', purchase_order),
        'show_print_controls': True,
        'base_url': base_url.rstrip('/'),
        **company_info,
        **branding,
    }
    return render_to_string('printing/documents/purchase_order.html', context)


def generate_gate_pass_pdf(gate_pass, branch=None):
    """Generate PDF for gate pass"""
    printer = DocumentPrinter('gate_pass')
    context = {
        'document': gate_pass,
        'branch': branch or gate_pass.branch,
    }
    filename = f"gate_pass_{gate_pass.gate_pass_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_credit_note_pdf(credit_note, branch=None):
    """Generate PDF for credit note"""
    printer = DocumentPrinter('credit_note')
    context = {
        'document': credit_note,
        'branch': branch or credit_note.branch,
        'items': credit_note.line_items.all(),
        'watermark': _get_watermark(credit_note.status),
    }
    filename = f"credit_note_{credit_note.credit_note_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_bill_pdf(bill, branch=None):
    """Generate PDF for vendor bill"""
    printer = DocumentPrinter('bill')
    context = {
        'document': bill,
        'branch': branch or bill.branch,
        'items': bill.line_items.all(),
    }
    filename = f"bill_{bill.bill_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_transfer_note_pdf(transfer, branch=None):
    """Generate PDF for stock transfer note"""
    printer = DocumentPrinter('transfer_note')
    context = {
        'document': transfer,
        'branch': branch or transfer.source_branch,
    }
    filename = f"transfer_{transfer.transfer_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_inventory_count_sheet_pdf(session, branch=None):
    """Generate PDF for inventory count sheet"""
    printer = DocumentPrinter('inventory_count_sheet')
    context = {
        'document': session,
        'branch': branch or session.branch,
    }
    filename = f"count_sheet_{session.session_number}.pdf"
    return printer.generate_pdf(context, filename)


def generate_aging_report_pdf(data):
    """Generate PDF for aging report"""
    from django.utils import timezone
    printer = DocumentPrinter('aging_report')
    now = timezone.now()
    context = {
        'report_date': data.get('report_date', now.date()),
        'generated_at': now,
        **data
    }
    filename = f"aging_report_{context['generated_at'].strftime('%Y%m%d')}.pdf"
    return printer.generate_pdf(context, filename)


def generate_customer_statement_pdf(statement_data, customer, branch=None, request=None):
    """Generate PDF for a customer account statement."""
    from django.utils import timezone
    from apps.accounts.settings_utils import get_company_info, get_branding_settings

    printer = DocumentPrinter('customer_statement')
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    _make_logo_absolute(branding, base_url)
    context = {
        'document_type': 'customer_statement',
        'customer_name': str(customer),
        'customer_number': getattr(customer, 'customer_number', ''),
        'period': statement_data.get('period', {}),
        'opening_balance': statement_data.get('opening_balance', 0),
        'closing_balance': statement_data.get('closing_balance', 0),
        'period_debits': statement_data.get('period_debits', 0),
        'period_credits': statement_data.get('period_credits', 0),
        'transactions': statement_data.get('transactions', []),
        'generated_at': timezone.now(),
        'branch': branch,
        'base_url': base_url.rstrip('/'),
        'watermark': _get_document_watermark('financial_report', None),
        **company_info,
        **branding,
    }
    safe_customer = (getattr(customer, 'customer_number', None) or f'customer_{customer.id}').replace('/', '-')
    filename = f"statement_{safe_customer}_{context['period'].get('end', 'export')}.pdf"
    return printer.generate_pdf(context, filename)


def render_customer_statement_html(statement_data, customer, branch=None, request=None):
    from django.utils import timezone
    from apps.accounts.settings_utils import get_company_info, get_branding_settings

    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    _make_logo_absolute(branding, base_url)
    context = {
        'document_type': 'customer_statement',
        'customer_name': str(customer),
        'customer_number': getattr(customer, 'customer_number', ''),
        'period': statement_data.get('period', {}),
        'opening_balance': statement_data.get('opening_balance', 0),
        'closing_balance': statement_data.get('closing_balance', 0),
        'transactions': statement_data.get('transactions', []),
        'generated_at': timezone.now(),
        'branch': branch,
        'base_url': base_url.rstrip('/'),
        'show_print_controls': True,
        **company_info,
        **branding,
    }
    return render_to_string('printing/reports/customer_statement.html', context)


def _accounting_report_base_context(context: Dict[str, Any], request=None) -> Dict[str, Any]:
    """Merge company branding into accounting report print context."""
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    _make_logo_absolute(branding, base_url)
    merged = {
        'document_type': 'financial_report',
        'show_print_controls': True,
        'base_url': base_url.rstrip('/'),
        'watermark': _get_document_watermark('financial_report', None),
        **company_info,
        **branding,
    }
    merged.update(context)
    return merged


def render_accounting_report_html(context: Dict[str, Any], request=None) -> str:
    """Render accounting financial report HTML (browser print)."""
    return render_to_string(
        'printing/reports/financial_report.html',
        _accounting_report_base_context(context, request),
    )


def generate_accounting_report_pdf(context: Dict[str, Any], filename: Optional[str] = None, request=None):
    """Generate PDF for an accounting financial report."""
    printer = DocumentPrinter('financial_report')
    merged = _accounting_report_base_context(context, request)
    merged['document'] = None
    safe_name = (filename or f"report_{merged.get('slug', 'export')}.pdf").replace('/', '-')
    return printer.generate_pdf(merged, safe_name)


def generate_revenue_summary_pdf(data):
    """Generate PDF for revenue summary"""
    printer = DocumentPrinter('revenue_summary')
    context = {
        'generated_at': __import__('django.utils.timezone', fromlist=['now']).now(),
        **data
    }
    filename = f"revenue_summary_{context['generated_at'].strftime('%Y%m%d')}.pdf"
    return printer.generate_pdf(context, filename)


def generate_payslip_pdf(payslip):
    """Generate PDF for payslip"""
    printer = DocumentPrinter('payslip')
    context = {
        'document': payslip,
        'branch': payslip.employee.user.branch,
    }
    # Filename: payslip_NAME_PERIOD.pdf
    safe_name = "".join(c for c in payslip.employee.full_name if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
    filename = f"payslip_{safe_name}_{payslip.payroll_period.start_date}.pdf"
    return printer.generate_pdf(context, filename)


def generate_diagnosis_report_pdf(diagnosis, base_context=None):
    """Generate PDF for diagnosis report"""
    printer = DocumentPrinter('diagnosis_report')
    context = base_context or {}
    context.update({
        'document': diagnosis,
        'branch': diagnosis.work_order.branch if diagnosis.work_order else None,
    })
    filename = f"diagnosis_report_{diagnosis.work_order.work_order_number if diagnosis.work_order else diagnosis.id}.pdf"
    return printer.generate_pdf(context, filename)


def render_diagnosis_report_print_html(diagnosis, base_context=None, request=None):
    """Render diagnosis report as HTML for browser print."""
    from apps.accounts.settings_utils import get_company_info, get_branding_settings
    base_url = request.build_absolute_uri('/') if request else '/'
    company_info = get_company_info()
    branding = get_branding_settings()
    _make_logo_absolute(branding, base_url)
    context = base_context or {}
    context.update({
        'document': diagnosis,
        'branch': diagnosis.work_order.branch if diagnosis.work_order else None,
        'watermark': _get_document_watermark('diagnosis_report', diagnosis),
        'show_print_controls': True,
        'base_url': base_url.rstrip('/'),
        **company_info,
        **branding,
    })
    return render_to_string('diagnosis/customer_report.html', context)
