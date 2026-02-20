from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, Q, Count, F
from django.template.loader import render_to_string
import logging

logger = logging.getLogger(__name__)

class BillingService:
    @staticmethod
    def get_invoice_stats(queryset):
        """Calculate invoice statistics for dashboard"""
        total_count = queryset.count()
        draft_count = queryset.filter(status='draft').count()
        paid_count = queryset.filter(status='paid').count()
        partial_count = queryset.filter(status='partial').count()
        overdue_count = queryset.filter(status='overdue').count()
        
        unpaid_count = queryset.filter(
            status__in=['sent', 'viewed', 'proforma']
        ).count()
        
        total_paid = queryset.aggregate(total=Sum('amount_paid'))['total'] or 0
        past_due_total = queryset.filter(status='overdue').aggregate(
            total=Sum('amount_due')
        )['total'] or 0
        
        outstanding_total = queryset.exclude(
            status__in=['paid', 'void', 'cancelled']
        ).aggregate(
            total=Sum('amount_due')
        )['total'] or 0
        
        return {
            "counts": {
                "total": total_count,
                "draft": draft_count,
                "paid": paid_count,
                "partially_paid": partial_count,
                "overdue": overdue_count,
                "unpaid": unpaid_count
            },
            "financials": {
                "total_paid": total_paid,
                "past_due_total": past_due_total,
                "outstanding_total": outstanding_total
            }
        }

    @staticmethod
    def get_aging_report_data(queryset):
        """Calculate accounts receivable aging report data"""
        today = timezone.now().date()
        
        # Get all unpaid invoices
        unpaid_invoices = queryset.filter(
            status__in=['sent', 'viewed', 'overdue', 'partial']
        ).exclude(status='void')
        
        # Aging buckets
        current = Decimal('0')
        days_1_30 = Decimal('0')
        days_31_60 = Decimal('0')
        days_61_90 = Decimal('0')
        days_over_90 = Decimal('0')
        
        for invoice in unpaid_invoices:
            amount_due = invoice.amount_due
            
            if invoice.due_date >= today:
                current += amount_due
            else:
                days_overdue = (today - invoice.due_date).days
                if days_overdue <= 30:
                    days_1_30 += amount_due
                elif days_overdue <= 60:
                    days_31_60 += amount_due
                elif days_overdue <= 90:
                    days_61_90 += amount_due
                else:
                    days_over_90 += amount_due
        
        total = current + days_1_30 + days_31_60 + days_61_90 + days_over_90
        
        return {
            "aging_report": {
                "current": str(current),
                "1_30_days": str(days_1_30),
                "31_60_days": str(days_31_60),
                "61_90_days": str(days_61_90),
                "over_90_days": str(days_over_90),
                "total_outstanding": str(total)
            },
            "invoice_count": unpaid_invoices.count()
        }

    @staticmethod
    def get_revenue_summary(queryset, start_date, end_date):
        """Calculate revenue summary for a date range"""
        invoices = queryset.filter(
            invoice_date__gte=start_date,
            invoice_date__lte=end_date
        ).exclude(status='void')
        
        total_invoiced = invoices.aggregate(total=Sum('total'))['total'] or Decimal('0')
        total_paid = invoices.aggregate(paid=Sum('amount_paid'))['paid'] or Decimal('0')
        total_outstanding = invoices.aggregate(due=Sum('amount_due'))['due'] or Decimal('0')
        
        # Count by status
        status_counts = {}
        # We need the model class to get STATUS_CHOICES if we want to include labels,
        # but for now we just use the raw status codes from the queryset
        from apps.billing.models import Invoice
        for s in Invoice.STATUS_CHOICES:
            status_code = s[0]
            count = invoices.filter(status=status_code).count()
            if count > 0:
                status_counts[status_code] = count
        
        return {
            "start_date": start_date,
            "end_date": end_date,
            "total_invoiced": str(total_invoiced),
            "total_paid": str(total_paid),
            "total_outstanding": str(total_outstanding),
            "invoice_count": invoices.count(),
            "status_breakdown": status_counts
        }

class PDFService:
    @staticmethod
    def generate_invoice_pdf(invoice):
        """Generate PDF for an invoice."""
        return b"PDF Content Placeholder"

    @staticmethod
    def generate_estimate_pdf(estimate):
        """Generate PDF for an estimate."""
        return b"PDF Content Placeholder"

    @staticmethod
    def generate_credit_note_pdf(credit_note):
        """Generate PDF for a credit note."""
        return b"PDF Content Placeholder"
