"""Inventory & compliance management reports (Part B — Phase 2)."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone


def _float(value):
    return float(value or 0)


ACCURACY_META = {
    'formula': 'lines_with_zero_variance_percent',
    'description': (
        'Percentage of count lines where physical quantity equals system quantity. '
        '100% means every counted line matched the system.'
    ),
}

CONTROL_META = {
    'formula': 'approved_work_order_sales_percent',
    'description': (
        'Sale transactions in period must link to a work order in an approved-or-later status. '
        'non_compliant_count uses the full filtered queryset; exceptions list is capped at 100.'
    ),
}


class InventoryManagementReports:
    @classmethod
    def get_top_availability(cls, limit=100, branch_id=None):
        from apps.branches.models import Branch
        from .models import InventoryTransaction, Part, StockItem

        sales_qs = InventoryTransaction.objects.filter(
            transaction_type='sale',
            created_at__gte=timezone.now() - timedelta(days=90),
        )
        if branch_id:
            sales_qs = sales_qs.filter(branch_id=branch_id)

        top_part_ids = list(
            sales_qs.values('part_id')
            .annotate(qty=Sum('quantity'))
            .order_by('-qty')[:limit]
            .values_list('part_id', flat=True)
        )
        if not top_part_ids:
            part_qs = Part.objects.filter(is_active=True)
            if branch_id:
                part_qs = part_qs.filter(
                    stock_items__branch_id=branch_id,
                    stock_items__quantity_in_stock__gt=0,
                ).distinct()
            top_part_ids = list(part_qs.values_list('id', flat=True)[:limit])

        branches = Branch.objects.filter(is_active=True)
        if branch_id:
            branches = branches.filter(id=branch_id)

        rows = []
        for part_id in top_part_ids:
            try:
                part = Part.objects.get(id=part_id)
            except Part.DoesNotExist:
                continue
            for branch in branches:
                stock = StockItem.objects.filter(part_id=part_id, branch=branch).first()
                qty = stock.quantity_in_stock if stock else 0
                rows.append({
                    'item': part.part_number,
                    'item_name': part.name,
                    'branch_id': branch.id,
                    'branch': branch.name,
                    'qty_available': qty,
                })

        return {'limit': limit, 'rows': rows[: limit * max(branches.count(), 1)]}

    @classmethod
    def get_inventory_accuracy(cls, branch_id=None):
        from .models import PhysicalCountSession, PhysicalCountItem

        sessions_qs = PhysicalCountSession.objects.filter(
            status='completed',
        ).order_by('-completed_at')
        if branch_id:
            sessions_qs = sessions_qs.filter(branch_id=branch_id)
        sessions = sessions_qs[:20]

        lines = []
        total_items = 0
        lines_with_zero_variance = 0
        for session in sessions:
            items = PhysicalCountItem.objects.filter(session=session)
            for item in items:
                total_items += 1
                variance = (item.physical_quantity or 0) - (item.system_quantity or 0)
                if variance == 0:
                    lines_with_zero_variance += 1
                lines.append({
                    'session_id': session.id,
                    'session_number': session.session_number,
                    'part_number': item.part.part_number if item.part_id else '',
                    'system_qty': item.system_quantity,
                    'counted_qty': item.physical_quantity,
                    'variance': variance,
                    'completed_at': session.completed_at.isoformat() if session.completed_at else None,
                })

        accuracy_pct = (
            (lines_with_zero_variance / total_items * 100) if total_items else 100.0
        )
        return {
            'accuracy_percent': round(accuracy_pct, 2),
            'items_counted': total_items,
            'lines': lines,
            'meta': ACCURACY_META,
        }

    @classmethod
    def get_shrinkage_report(cls, start_date, end_date, branch_id=None):
        from .models import InventoryTransaction

        qs = InventoryTransaction.objects.filter(
            transaction_type__in=['damage', 'loss'],
            created_at__date__range=[start_date, end_date],
        ).select_related('part', 'branch', 'work_order')
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        rows = []
        for tx in qs.order_by('-created_at')[:500]:
            rows.append({
                'id': tx.id,
                'part_number': tx.part.part_number,
                'part_name': tx.part.name,
                'branch': tx.branch.name if tx.branch_id else '',
                'quantity': abs(tx.quantity),
                'type': tx.transaction_type,
                'reason': tx.reason,
                'date': tx.created_at.date().isoformat(),
                'work_order_id': tx.work_order_id,
            })
        return {'period': {'start': start_date, 'end': end_date}, 'items': rows}

    @classmethod
    def get_obsolescence_report(cls, days_unused=180, branch_id=None):
        from .models import InventoryTransaction, StockItem

        cutoff = timezone.now() - timedelta(days=days_unused)
        rows = []
        stock_qs = StockItem.objects.filter(quantity_in_stock__gt=0).select_related('part', 'branch')
        if branch_id:
            stock_qs = stock_qs.filter(branch_id=branch_id)

        for stock in stock_qs[:500]:
            tx_filter = {'part': stock.part, 'branch_id': stock.branch_id}
            last_sale = (
                InventoryTransaction.objects.filter(
                    transaction_type='sale', **tx_filter
                )
                .order_by('-created_at')
                .first()
            )
            last_used = last_sale.created_at if last_sale else None
            if last_used and last_used >= cutoff:
                continue
            in_stock_since = (
                InventoryTransaction.objects.filter(
                    transaction_type__in=['purchase', 'transfer_in'],
                    **tx_filter,
                )
                .order_by('created_at')
                .first()
            )
            rows.append({
                'item': stock.part.part_number,
                'item_name': stock.part.name,
                'branch': stock.branch.name,
                'qty_in_stock': stock.quantity_in_stock,
                'in_stock_since': in_stock_since.created_at.date().isoformat() if in_stock_since else None,
                'last_used': last_used.date().isoformat() if last_used else None,
                'recommendation': 'Review for obsolescence / write-off' if stock.quantity_in_stock > 0 else 'N/A',
            })

        rows.sort(key=lambda r: r['qty_in_stock'], reverse=True)
        return {'days_unused_threshold': days_unused, 'items': rows[:200]}

    @classmethod
    def get_p2p_compliance(cls, start_date, end_date, branch_id=None):
        from .models import PurchaseOrder

        qs = PurchaseOrder.objects.filter(created_at__date__range=[start_date, end_date])
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        violations = []
        for po in qs.select_related('supplier'):
            issues = []
            if po.status in ('draft', 'pending_approval'):
                issues.append('not_approved')
            if not po.approvals.filter(status='approved').exists() and po.status not in ('draft', 'cancelled'):
                if po.status not in ('draft', 'pending_approval'):
                    issues.append('missing_approval_record')
            if issues:
                violations.append({
                    'po_number': po.po_number,
                    'supplier': po.supplier.name,
                    'status': po.status,
                    'total': _float(po.total),
                    'issues': issues,
                })

        total = qs.count()
        return {
            'period': {'start': start_date, 'end': end_date},
            'total_pos': total,
            'violations_count': len(violations),
            'compliance_rate_percent': round((1 - len(violations) / total) * 100, 2) if total else 100.0,
            'violations': violations,
        }

    @classmethod
    def get_orphan_supply(cls, start_date, end_date, branch_id=None):
        from .models import InventoryTransaction

        qs = InventoryTransaction.objects.filter(
            transaction_type='sale',
            created_at__date__range=[start_date, end_date],
            work_order__isnull=True,
        ).select_related('part', 'branch')
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        rows = [
            {
                'id': tx.id,
                'part_number': tx.part.part_number,
                'part_name': tx.part.name,
                'branch': tx.branch.name if tx.branch_id else '',
                'quantity': abs(tx.quantity),
                'date': tx.created_at.date().isoformat(),
                'reason': tx.reason,
            }
            for tx in qs.order_by('-created_at')[:300]
        ]
        return {'period': {'start': start_date, 'end': end_date}, 'items': rows}

    @classmethod
    def get_unbilled_delivered(cls, branch_id=None, start_date=None, end_date=None, limit=200):
        from apps.billing.models import Invoice
        from apps.workorders.models import WorkOrder

        qs = WorkOrder.objects.filter(
            status__in=['completed', 'ready_for_pickup', 'delivered', 'invoiced', 'closed'],
        ).select_related('vehicle', 'customer', 'branch')
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if start_date and end_date:
            qs = qs.filter(completed_at__date__range=[start_date, end_date])

        rows = []
        for wo in qs.order_by('-completed_at')[:limit]:
            has_invoice = Invoice.objects.filter(work_order=wo).exclude(status='void').exists()
            if has_invoice:
                continue
            unbilled_parts = wo.parts.filter(status__in=['installed', 'ready', 'received']).exists()
            if not unbilled_parts:
                continue
            rows.append({
                'work_order_id': wo.id,
                'work_order_number': getattr(wo, 'work_order_number', str(wo.id)),
                'customer': str(wo.customer) if wo.customer_id else '',
                'vehicle': str(wo.vehicle) if wo.vehicle_id else '',
                'status': wo.status,
                'branch': wo.branch.name if wo.branch_id else '',
            })
        return {'items': rows, 'limit': limit}

    @classmethod
    def get_inventory_control_summary(cls, start_date, end_date, branch_id=None):
        from .models import InventoryTransaction

        sales = InventoryTransaction.objects.filter(
            transaction_type='sale',
            created_at__date__range=[start_date, end_date],
        )
        if branch_id:
            sales = sales.filter(branch_id=branch_id)

        approved_statuses = {'approved', 'in_progress', 'paused', 'completed', 'ready_for_pickup', 'delivered'}
        non_compliant = []
        for tx in sales.select_related('work_order', 'part'):
            wo = tx.work_order
            if not wo:
                non_compliant.append({'transaction_id': tx.id, 'issue': 'no_work_order', 'part': tx.part.part_number})
            elif wo.status not in approved_statuses and not getattr(wo, 'is_approved', False):
                non_compliant.append({
                    'transaction_id': tx.id,
                    'issue': 'work_order_not_approved',
                    'work_order_id': wo.id,
                    'status': wo.status,
                    'part': tx.part.part_number,
                })

        total_sales = sales.count()
        total_issues = len(non_compliant)

        return {
            'period': {'start': start_date, 'end': end_date},
            'total_sale_transactions': total_sales,
            'non_compliant_count': total_issues,
            'compliance_rate_percent': round(
                (1 - total_issues / total_sales) * 100, 2
            ) if total_sales else 100.0,
            'exceptions': non_compliant[:100],
            'meta': CONTROL_META,
        }
