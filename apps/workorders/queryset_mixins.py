"""Shared queryset scoping for work-order child viewsets."""

from apps.accounts.permissions import filter_workorders_for_user
from apps.branches.utils import filter_queryset_for_user_branches

from .models import WorkOrder


class WorkOrderChildQuerysetMixin:
    """Scope child records to visible work orders, branch, and customer role."""

    work_order_lookup = 'work_order'

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        wo_prefix = self.work_order_lookup

        if getattr(user, 'role', None) == 'customer' and hasattr(user, 'customer_profile'):
            return queryset.filter(**{f'{wo_prefix}__customer': user.customer_profile})

        scoped_work_orders = filter_workorders_for_user(WorkOrder.objects.all(), user)
        queryset = queryset.filter(**{f'{wo_prefix}__in': scoped_work_orders})

        show_all = self.request.query_params.get('all_branches', 'false').lower() == 'true'
        return filter_queryset_for_user_branches(
            queryset,
            user,
            request=self.request,
            use_active_branch=not show_all,
            include_unassigned=True,
            branch_lookup=f'{wo_prefix}__branch',
        )
