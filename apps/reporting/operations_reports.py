"""Operations intelligence reports (Part B — Phase 3)."""
from django.db.models import Count, Q, Sum
from django.utils import timezone


def _parse_dates(start_date, end_date):
    return start_date, end_date


class OperationsReportingService:
    @classmethod
    def roadside_revenue(cls, start_date, end_date, branch_ids=None):
        from apps.roadside.models import RoadsideRequest

        qs = RoadsideRequest.objects.filter(
            completed_at__date__gte=start_date,
            completed_at__date__lte=end_date,
            status='completed',
        )
        if branch_ids:
            qs = qs.filter(branch_id__in=branch_ids)

        by_type = (
            qs.values('service_type')
            .annotate(count=Count('id'), revenue=Sum('charge_amount'))
            .order_by('-revenue')
        )
        total = qs.aggregate(revenue=Sum('charge_amount'), count=Count('id'))
        return {
            'period': {'start': start_date, 'end': end_date},
            'total_revenue': float(total['revenue'] or 0),
            'completed_count': total['count'] or 0,
            'by_service_type': [
                {
                    'service_type': row['service_type'],
                    'count': row['count'],
                    'revenue': float(row['revenue'] or 0),
                }
                for row in by_type
            ],
        }

    @classmethod
    def cost_control_return_jobs(cls, start_date, end_date, branch_ids=None):
        from apps.workorders.models import WorkOrder

        qs = WorkOrder.objects.filter(
            created_at__date__range=[start_date, end_date],
        ).filter(Q(is_warranty_rework=True) | Q(related_work_order__isnull=False))
        if branch_ids:
            qs = qs.filter(branch_id__in=branch_ids)

        rows = []
        for wo in qs.select_related('related_work_order', 'branch')[:200]:
            rows.append({
                'work_order_id': wo.id,
                'work_order_number': getattr(wo, 'work_order_number', str(wo.id)),
                'is_warranty_rework': wo.is_warranty_rework,
                'related_work_order_id': wo.related_work_order_id,
                'estimated_total': float(wo.estimated_total or 0),
                'actual_total': float(getattr(wo, 'actual_total', 0) or 0),
                'cost_variance': float(wo.cost_variance or 0),
                'branch': wo.branch.name if wo.branch_id else '',
                'status': wo.status,
            })
        return {'period': {'start': start_date, 'end': end_date}, 'return_jobs': rows}

    @classmethod
    def ap_cycle_time(cls, start_date, end_date, branch_ids=None):
        from apps.billing.models import Bill, BillPayment

        bills = Bill.objects.filter(
            bill_date__range=[start_date, end_date],
            status__in=['paid', 'partially_paid', 'open', 'overdue'],
        )
        if branch_ids:
            bills = bills.filter(branch_id__in=branch_ids)

        cycles = []
        for bill in bills.select_related('vendor')[:300]:
            first_payment = (
                BillPayment.objects.filter(bill=bill).order_by('payment_date').first()
            )
            if first_payment and bill.bill_date:
                days = (first_payment.payment_date - bill.bill_date).days
                cycles.append(days)
            elif bill.status == 'paid' and bill.due_date:
                days = (bill.due_date - bill.bill_date).days
                cycles.append(max(days, 0))

        avg_days = sum(cycles) / len(cycles) if cycles else 0
        return {
            'period': {'start': start_date, 'end': end_date},
            'bills_sampled': bills.count(),
            'payments_sampled': len(cycles),
            'average_days_to_pay': round(avg_days, 1),
            'distribution': {
                'under_15': sum(1 for d in cycles if d < 15),
                '15_30': sum(1 for d in cycles if 15 <= d < 30),
                '30_60': sum(1 for d in cycles if 30 <= d < 60),
                'over_60': sum(1 for d in cycles if d >= 60),
            },
        }

    @classmethod
    def exception_log(cls, branch_ids=None):
        from apps.appointments.models import Appointment
        from apps.workorders.models import WorkOrder

        now = timezone.now()
        exceptions = []

        overdue_wos = WorkOrder.objects.filter(
            estimated_completion__lt=now,
        ).exclude(status__in=['completed', 'closed', 'cancelled', 'invoiced'])
        if branch_ids:
            overdue_wos = overdue_wos.filter(branch_id__in=branch_ids)

        for wo in overdue_wos.select_related('customer', 'vehicle')[:100]:
            delay_hours = (now - wo.estimated_completion).total_seconds() / 3600
            exceptions.append({
                'type': 'work_order_delay',
                'reference': getattr(wo, 'work_order_number', str(wo.id)),
                'work_order_id': wo.id,
                'customer': str(wo.customer) if wo.customer_id else '',
                'delay_hours': round(delay_hours, 1),
                'status': wo.status,
                'message': f'Work order overdue by {round(delay_hours, 1)} hours',
            })

        late_appts = Appointment.objects.filter(
            appointment_date__lt=now.date(),
            status__in=['scheduled', 'confirmed'],
        )
        if branch_ids:
            late_appts = late_appts.filter(branch_id__in=branch_ids)
        for appt in late_appts[:50]:
            exceptions.append({
                'type': 'appointment_delay',
                'reference': str(appt.id),
                'appointment_id': appt.id,
                'customer': str(appt.customer) if hasattr(appt, 'customer') else '',
                'delay_hours': None,
                'status': appt.status,
                'message': 'Appointment date passed without completion',
            })

        return {'as_of': now.isoformat(), 'exceptions': exceptions}

    @classmethod
    def traceability(cls, work_order_id=None, part_id=None, limit=50):
        from apps.inventory.models import InventoryTransaction

        qs = InventoryTransaction.objects.select_related(
            'part', 'work_order', 'purchase_order', 'branch'
        ).order_by('-created_at')
        if work_order_id:
            qs = qs.filter(work_order_id=work_order_id)
        if part_id:
            qs = qs.filter(part_id=part_id)

        chain = []
        for tx in qs[:limit]:
            chain.append({
                'id': tx.id,
                'date': tx.created_at.isoformat(),
                'type': tx.transaction_type,
                'part_number': tx.part.part_number,
                'quantity': tx.quantity,
                'branch': tx.branch.name if tx.branch_id else '',
                'work_order_id': tx.work_order_id,
                'purchase_order_id': tx.purchase_order_id,
                'reason': tx.reason,
            })
        return {'chain': chain}

    @classmethod
    def capacity_planning(cls, start_date, end_date, branch_ids=None):
        from apps.appointments.models import Appointment, ServiceBay
        from apps.workorders.models import WorkOrder

        # ServiceBay has no branch FK — bays are org-wide; branch scope uses appointments/WOs.
        bays = ServiceBay.objects.filter(is_active=True)

        appts = Appointment.objects.filter(
            appointment_date__range=[start_date, end_date],
        )
        if branch_ids:
            appts = appts.filter(branch_id__in=branch_ids)

        active_wos = WorkOrder.objects.filter(
            status__in=['approved', 'in_progress', 'paused'],
        )
        if branch_ids:
            active_wos = active_wos.filter(branch_id__in=branch_ids)

        if branch_ids:
            bays_in_use = (
                appts.exclude(service_bay_id__isnull=True)
                .values('service_bay_id')
                .distinct()
                .count()
            )
            service_bay_count = bays_in_use or bays.count()
        else:
            service_bay_count = bays.count()

        appt_count = appts.count()
        period_days = (end_date - start_date).days + 1

        return {
            'period': {'start': start_date, 'end': end_date},
            'service_bays': service_bay_count,
            'appointments_in_period': appt_count,
            'active_work_orders': active_wos.count(),
            'utilization_note': (
                f'{appt_count} appointments across {service_bay_count} bays '
                f'over {period_days} days'
            ),
        }

    @classmethod
    def system_usage(cls, start_date, end_date):
        from auditlog.models import LogEntry

        from apps.accounts.models import User
        from apps.workorders.models import ServiceTask, TechnicianTimeLog, WorkOrder

        logs = LogEntry.objects.filter(
            timestamp__date__range=[start_date, end_date],
        )
        actions_by_user = (
            logs.values('actor_id')
            .annotate(actions=Count('id'))
            .order_by('-actions')[:20]
        )
        user_map = {
            u.id: u.get_full_name() or u.username
            for u in User.objects.filter(id__in=[r['actor_id'] for r in actions_by_user if r['actor_id']])
        }

        wos = WorkOrder.objects.filter(created_at__date__range=[start_date, end_date])
        total_wos = wos.count()
        fully_logged = 0
        for wo in wos.iterator(chunk_size=100):
            has_tasks = ServiceTask.objects.filter(work_order=wo).exists()
            has_time = TechnicianTimeLog.objects.filter(work_order=wo).exists()
            has_parts = wo.parts.exists()
            if has_tasks and has_time and (has_parts or wo.status in ('completed', 'closed', 'invoiced')):
                fully_logged += 1

        pct = round((fully_logged / total_wos * 100) if total_wos else 0, 2)
        return {
            'period': {'start': start_date, 'end': end_date},
            'audit_actions': logs.count(),
            'active_users': [
                {
                    'user_id': row['actor_id'],
                    'name': user_map.get(row['actor_id'], 'System'),
                    'actions': row['actions'],
                }
                for row in actions_by_user
                if row['actor_id']
            ],
            'jobs': {
                'total_work_orders': total_wos,
                'fully_logged': fully_logged,
                'fully_logged_percent': pct,
            },
        }
