"""
Main dashboard and homepage views
"""
from django.shortcuts import render, redirect
from django.http import JsonResponse, HttpResponse
from django.views.generic import TemplateView
from django.contrib.auth.decorators import login_required
from django.contrib.auth import logout as auth_logout
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django.contrib import messages
from django.contrib.auth.forms import UserCreationForm
from django import forms
import os
from django.conf import settings

User = get_user_model()


class StaffRegistrationForm(forms.ModelForm):
    """Form for registering staff members"""
    password1 = forms.CharField(label='Password', widget=forms.PasswordInput)
    password2 = forms.CharField(label='Confirm Password', widget=forms.PasswordInput)
    
    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'phone', 'role', 'is_active']
    
    def clean_password2(self):
        password1 = self.cleaned_data.get('password1')
        password2 = self.cleaned_data.get('password2')
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError("Passwords don't match")
        return password2
    
    def clean_role(self):
        role = self.cleaned_data.get('role')
        if role not in ['manager', 'receptionist', 'technician', 'parts_manager']:
            raise forms.ValidationError("Invalid staff role")
        return role
    
    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data['password1'])
        user.is_staff = True  # All staff members should have staff access
        if commit:
            user.save()
        return user


def firebase_messaging_sw(request):
    """
    Serve the Firebase messaging service worker from root path.
    This is required by Firebase Cloud Messaging.
    """
    sw_path = os.path.join(settings.BASE_DIR, 'static', 'firebase-messaging-sw.js')
    
    try:
        with open(sw_path, 'r') as f:
            content = f.read()
        return HttpResponse(content, content_type='application/javascript')
    except FileNotFoundError:
        return HttpResponse(
            '// Service worker file not found',
            content_type='application/javascript',
            status=404
        )


def test_fcm_view(request):
    """
    Test page for Firebase Cloud Messaging token generation
    """
    return render(request, 'test_fcm.html')


@api_view(['GET'])
@permission_classes([AllowAny])
def api_root(request):
    """
    API root endpoint - provides links to all available endpoints
    """
    return Response({
        'message': 'Welcome to Smart Vehicle Repairs API',
        'version': '1.0.0',
        'endpoints': {
            'admin': '/admin/',
            'api_documentation': '/api/docs/',
            'api_schema': '/api/schema/',
            'authentication': {
                'login': '/api/auth/token/',
                'refresh_token': '/api/auth/token/refresh/',
                'verify_token': '/api/auth/token/verify/',
                'users': '/api/auth/users/',
                'my_profile': '/api/auth/users/me/',
            },
            'modules': {
                'customers': '/api/customers/',
                'vehicles': '/api/vehicles/',
                'appointments': '/api/appointments/',
                'work_orders': '/api/workorders/',
                'inventory': '/api/inventory/',
                'billing': '/api/billing/',
                'inspections': '/api/inspections/',
                'reports': '/api/reporting/',
                'notifications': '/api/notifications/',
            }
        },
        'status': 'operational'
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    Lightweight container health endpoint.
    """
    return Response({'status': 'ok'})


class HomePageView(TemplateView):
    """
    Homepage view.

    In production we primarily serve the UI from the Next.js frontend, but the
    Django root route can still be hit (e.g. when proxying /api, /static, /media
    to Django). We avoid a hard dependency on a 'home.html' template here.
    """

    def get(self, request, *args, **kwargs):
        # Keep it simple and always return the API root payload location.
        return redirect('api-root')


@login_required
def dashboard_view(request):
    """
    Main dashboard view - routes to role-specific dashboard
    Phase 2: Role-specific dashboards with analytics
    """
    from django.db.models import Count, Sum, Q, F, Avg
    from django.utils import timezone
    from datetime import timedelta
    from apps.customers.models import Customer
    from apps.vehicles.models import Vehicle
    from apps.appointments.models import Appointment
    from apps.workorders.models import WorkOrder
    from apps.billing.models import Invoice, Payment
    from apps.inventory.models import Part
    from apps.notifications_app.models import Notification
    from apps.branches.utils import filter_queryset_for_user_branches
    from django.contrib.auth import get_user_model
    
    User = get_user_model()
    user = request.user
    role = user.role
    
    # Common metrics for all roles
    today = timezone.now().date()
    start_of_month = today.replace(day=1)
    start_of_week = today - timedelta(days=today.weekday())
    
    # Get counts - filter by active branch
    total_customers = Customer.objects.count()  # Customers are not branch-specific
    total_vehicles = Vehicle.objects.count()  # Vehicles are not branch-specific
    
    appointments_qs = Appointment.objects.filter(appointment_date__gte=today)
    appointments_qs = filter_queryset_for_user_branches(appointments_qs, user, request=request, use_active_branch=True)
    total_appointments = appointments_qs.count()
    today_appointments = appointments_qs.filter(appointment_date=today).count()
    
    # Work orders by status - filter by active branch
    workorders_qs = WorkOrder.objects.filter(
        status__in=['pending', 'in_progress', 'awaiting_parts']
    )
    workorders_qs = filter_queryset_for_user_branches(workorders_qs, user, request=request, use_active_branch=True)
    active_workorders = workorders_qs.count()
    
    # Financial metrics - filter by active branch
    # Payments are linked via invoices which have branches
    payments_qs = Payment.objects.filter(
        payment_date__gte=start_of_month,
        status='completed'
    ).select_related('invoice', 'invoice__branch')
    # Filter payments by invoice's branch - get active branch IDs
    active_branch_ids = filter_queryset_for_user_branches(
        Invoice.objects.all(), user, request=request, use_active_branch=True
    ).values_list('branch_id', flat=True).distinct()
    if active_branch_ids.exists():
        payments_qs = payments_qs.filter(invoice__branch_id__in=active_branch_ids)
    monthly_revenue = payments_qs.aggregate(total=Sum('amount'))['total'] or 0
    
    pending_invoices_qs = Invoice.objects.filter(
        status__in=['sent', 'viewed', 'partial', 'overdue']
    )
    pending_invoices_qs = filter_queryset_for_user_branches(pending_invoices_qs, user, request=request, use_active_branch=True)
    pending_invoices_count = pending_invoices_qs.count()
    pending_invoices_amount = pending_invoices_qs.aggregate(total=Sum('total'))['total'] or 0
    
    # Appointments this week - filter by active branch
    appointments_this_week_qs = Appointment.objects.filter(
        appointment_date__range=[start_of_week, today + timedelta(days=7)]
    )
    appointments_this_week_qs = filter_queryset_for_user_branches(appointments_this_week_qs, user, request=request, use_active_branch=True)
    appointments_this_week = appointments_this_week_qs.count()
    
    # Low stock items - filter by active branch if Part has branch field
    low_stock_items_qs = Part.objects.filter(
        Q(quantity_in_stock__lte=F('minimum_stock')) | Q(quantity_in_stock=0)
    )
    if hasattr(Part, 'branch'):
        low_stock_items_qs = filter_queryset_for_user_branches(low_stock_items_qs, user, request=request, use_active_branch=True)
    low_stock_items = low_stock_items_qs.order_by('quantity_in_stock')[:10]
    low_stock_count = low_stock_items.count()
    
    # Recent appointments (next 5) - filter by active branch
    recent_appointments_qs = Appointment.objects.filter(
        appointment_date__gte=today
    ).select_related('customer__user', 'vehicle', 'branch')
    recent_appointments_qs = filter_queryset_for_user_branches(recent_appointments_qs, user, request=request, use_active_branch=True)
    recent_appointments = recent_appointments_qs.order_by('appointment_date', 'appointment_time')[:5]
    
    # Recent work orders (last 5 active) - filter by active branch
    recent_workorders_qs = WorkOrder.objects.filter(
        status__in=['pending', 'in_progress', 'awaiting_parts']
    ).select_related('customer__user', 'vehicle', 'branch')
    recent_workorders_qs = filter_queryset_for_user_branches(recent_workorders_qs, user, request=request, use_active_branch=True)
    recent_workorders = recent_workorders_qs.order_by('-created_at')[:5]
    
    # Recent notifications (using 'recipient' field, not 'user')
    recent_notifications = Notification.objects.filter(
        recipient=user
    ).order_by('-created_at')[:10]
    
    # Chart data - Work orders by status - filter by active branch
    workorders_chart_qs = WorkOrder.objects.all()
    workorders_chart_qs = filter_queryset_for_user_branches(workorders_chart_qs, user, request=request, use_active_branch=True)
    workorder_stats = list(workorders_chart_qs.values('status').annotate(count=Count('id')))
    
    # Chart data - Revenue last 7 days - filter by active branch
    revenue_chart_data = []
    # Get active branch IDs for filtering payments via invoices
    active_branch_ids = filter_queryset_for_user_branches(
        Invoice.objects.all(), user, request=request, use_active_branch=True
    ).values_list('branch_id', flat=True).distinct()
    for i in range(6, -1, -1):
        date = today - timedelta(days=i)
        daily_payments_qs = Payment.objects.filter(
            payment_date=date,
            status='completed'
        )
        if active_branch_ids.exists():
            daily_payments_qs = daily_payments_qs.filter(invoice__branch_id__in=active_branch_ids)
        daily_revenue = daily_payments_qs.aggregate(total=Sum('amount'))['total'] or 0
        revenue_chart_data.append({
            'date': date.strftime('%b %d'),
            'revenue': float(daily_revenue)
        })
    
    # Active technicians count
    active_technicians = User.objects.filter(
        role='technician',
        is_active=True
    ).count()
    
    # Serialize chart data for JavaScript
    import json
    revenue_chart_json = json.dumps(revenue_chart_data)
    workorder_stats_json = json.dumps(workorder_stats)
    
    # Base context for all roles
    context = {
        'user': user,
        'role': role,
        'today_date': today,
        'total_customers': total_customers,
        'total_vehicles': total_vehicles,
        'total_appointments': total_appointments,
        'todays_appointments': today_appointments,
        'active_work_orders': active_workorders,
        'monthly_revenue': monthly_revenue,
        'pending_invoices': pending_invoices_count,
        'pending_invoices_amount': f"${pending_invoices_amount:,.2f}",
        'appointments_this_week': appointments_this_week,
        'low_stock_items_count': low_stock_count,
        'low_stock_items': low_stock_items,
        'recent_appointments': recent_appointments,
        'recent_workorders': recent_workorders,
        'recent_notifications': recent_notifications,
        'workorder_stats': workorder_stats,
        'workorder_stats_json': workorder_stats_json,
        'revenue_chart_data': revenue_chart_json,
        'active_technicians': active_technicians,
    }
    
    # Role-specific context and template selection
    if role == 'admin' or role == 'manager':
        # Additional admin/manager metrics
        active_technicians = User.objects.filter(
            role='technician',
            is_active=True
        ).count()
        
        context.update({
            'active_technicians': active_technicians,
            'customer_trend': '+5%',  # TODO: Calculate real trends
            'vehicle_trend': '+3%',
            'revenue_trend': '+12%',
        })
        
        if role == 'admin':
            template = 'dashboard/admin_dashboard.html'
        else:
            # Manager-specific data - filter by active branch
            week_payments_qs = Payment.objects.filter(
                payment_date__gte=start_of_week,
                status='completed'
            )
            # Filter payments by invoice's branch - get active branch IDs
            week_active_branch_ids = filter_queryset_for_user_branches(
                Invoice.objects.all(), user, request=request, use_active_branch=True
            ).values_list('branch_id', flat=True).distinct()
            if week_active_branch_ids.exists():
                week_payments_qs = week_payments_qs.filter(invoice__branch_id__in=week_active_branch_ids)
            week_revenue = week_payments_qs.aggregate(total=Sum('amount'))['total'] or 0
            
            completed_workorders_qs = WorkOrder.objects.filter(status='completed')
            completed_workorders_qs = filter_queryset_for_user_branches(completed_workorders_qs, user, request=request, use_active_branch=True)
            avg_job_value = completed_workorders_qs.aggregate(avg=Avg('final_total'))['avg'] or 0
            
            context.update({
                'week_revenue': week_revenue,
                'avg_job_value': avg_job_value,
                'completed_week': completed_workorders_qs.filter(
                    completed_at__gte=start_of_week
                ).count(),
                'satisfaction_score': '4.8/5',  # TODO: Implement reviews
                'tech_utilization': '85%',  # TODO: Calculate from time logs
                'tech_performance': [],  # TODO: Implement
                'top_services': [],  # TODO: Implement
            })
            template = 'dashboard/manager_dashboard.html'
            
    elif role == 'technician':
        # Technician-specific context - filter by active branch
        my_workorders_qs = WorkOrder.objects.filter(
            assigned_technicians=user,
            status__in=['pending', 'in_progress', 'awaiting_parts']
        ).select_related('customer__user', 'vehicle', 'branch')
        my_workorders_qs = filter_queryset_for_user_branches(my_workorders_qs, user, request=request, use_active_branch=True)
        my_workorders = my_workorders_qs.order_by('-priority', 'created_at')
        
        today_schedule_qs = Appointment.objects.filter(
            appointment_date=today,
            assigned_technicians=user
        ).select_related('customer__user', 'vehicle', 'branch')
        today_schedule_qs = filter_queryset_for_user_branches(today_schedule_qs, user, request=request, use_active_branch=True)
        today_schedule = today_schedule_qs.order_by('appointment_time')
        
        completed_today_qs = WorkOrder.objects.filter(
            assigned_technicians=user,
            status='completed',
            completed_at__date=today
        )
        completed_today_qs = filter_queryset_for_user_branches(completed_today_qs, user, request=request, use_active_branch=True)
        completed_today = completed_today_qs.count()
        
        pending_approvals_qs = WorkOrder.objects.filter(
            assigned_technicians=user,
            status='awaiting_approval'
        )
        pending_approvals_qs = filter_queryset_for_user_branches(pending_approvals_qs, user, request=request, use_active_branch=True)
        
        context.update({
            'my_workorders': my_workorders,
            'my_active_workorders': my_workorders.count(),
            'today_appointments': today_schedule,
            'completed_today': completed_today,
            'pending_approvals': pending_approvals_qs.count(),
            'hours_logged': '32h',  # TODO: Calculate from time logs
            'parts_needed': [],  # TODO: Get parts on backorder for my jobs
        })
        template = 'dashboard/technician_dashboard.html'
        
    elif role == 'receptionist':
        # Receptionist-specific context
        today_schedule = Appointment.objects.filter(
            appointment_date=today
        ).select_related('customer__user', 'vehicle').prefetch_related('assigned_technicians').order_by('appointment_time')
        
        checked_in_count = Appointment.objects.filter(
            appointment_date=today,
            status='checked_in'
        ).count()
        
        waiting_count = Appointment.objects.filter(
            appointment_date=today,
            status='checked_in'
        ).exclude(
            workorder__status='in_progress'
        ).count()
        
        recent_customers = Customer.objects.select_related('user').annotate(
            vehicle_count=Count('vehicle')
        ).order_by('-created_at')[:10]
        
        context.update({
            'today_schedule': today_schedule,
            'checked_in_count': checked_in_count,
            'waiting_count': waiting_count,
            'new_customers_week': Customer.objects.filter(
                created_at__gte=start_of_week
            ).count(),
            'recent_customers': recent_customers,
        })
        template = 'dashboard/receptionist_dashboard.html'
        
    else:
        # Default fallback
        template = 'dashboard/dashboard.html'
    
    return render(request, template, context)


def logout_view(request):
    """
    Logout view with message
    """
    auth_logout(request)
    messages.success(request, 'You have been successfully logged out.')
    return redirect('home')


@login_required
def search_view(request):
    """
    Global search view - searches across customers, vehicles, work orders, and appointments
    """
    from django.db.models import Q
    from apps.customers.models import Customer
    from apps.vehicles.models import Vehicle
    from apps.workorders.models import WorkOrder
    from apps.appointments.models import Appointment
    
    # Only staff can search
    if not request.user.is_staff:
        messages.error(request, 'You do not have permission to access this page.')
        return redirect('dashboard')
    
    query = request.GET.get('q', '')
    
    customers = []
    vehicles = []
    workorders = []
    appointments = []
    
    if query and len(query) >= 2:  # Only search if query is at least 2 characters
        # Search customers (via user relationship)
        customers = Customer.objects.filter(
            Q(user__first_name__icontains=query) | 
            Q(user__last_name__icontains=query) | 
            Q(user__email__icontains=query) | 
            Q(user__phone__icontains=query) | 
            Q(customer_number__icontains=query) | 
            Q(company_name__icontains=query)
        ).select_related('user')[:10]
        
        # Search vehicles
        vehicles = Vehicle.objects.filter(
            Q(make__icontains=query) | 
            Q(model__icontains=query) | 
            Q(license_plate__icontains=query) | 
            Q(vin__icontains=query)
        ).select_related('owner', 'owner__user')[:10]
        
        # Search work orders
        workorders = WorkOrder.objects.filter(
            Q(work_order_number__icontains=query) | 
            Q(customer_concerns__icontains=query) | 
            Q(diagnosis_notes__icontains=query) |
            Q(special_instructions__icontains=query) |
            Q(vehicle__license_plate__icontains=query) | 
            Q(customer__user__first_name__icontains=query) | 
            Q(customer__user__last_name__icontains=query)
        ).select_related('vehicle', 'customer', 'customer__user')[:10]
        
        # Search appointments
        appointments = Appointment.objects.filter(
            Q(appointment_number__icontains=query) | 
            Q(special_instructions__icontains=query) |
            Q(customer_concerns__icontains=query) |
            Q(customer__user__first_name__icontains=query) | 
            Q(customer__user__last_name__icontains=query) | 
            Q(vehicle__license_plate__icontains=query)
        ).select_related('customer', 'customer__user', 'vehicle')[:10]
    
    context = {
        'query': query,
        'customers': customers,
        'vehicles': vehicles,
        'workorders': workorders,
        'appointments': appointments,
        'total_results': len(customers) + len(vehicles) + len(workorders) + len(appointments),
    }
    
    return render(request, 'search_results.html', context)


@login_required
def staff_register_view(request):
    """
    Staff registration view - admin only
    """
    # Check if user is admin
    if request.user.role != 'admin':
        messages.error(request, 'You do not have permission to access this page.')
        return redirect('dashboard')
    
    if request.method == 'POST':
        form = StaffRegistrationForm(request.POST)
        if form.is_valid():
            user = form.save()
            messages.success(request, f'Staff member {user.username} has been successfully registered.')
            return redirect('dashboard')
    else:
        form = StaffRegistrationForm()
    
    return render(request, 'accounts/staff_register.html', {'form': form})


@login_required
def profile_view(request):
    """
    User profile view and edit
    """
    if request.method == 'POST':
        # Handle profile update
        user = request.user
        user.first_name = request.POST.get('first_name', '')
        user.last_name = request.POST.get('last_name', '')
        user.phone_number = request.POST.get('phone_number', '')
        
        # Handle profile picture upload
        if 'profile_picture' in request.FILES:
            user.profile_picture = request.FILES['profile_picture']
        
        user.save()
        messages.success(request, 'Your profile has been updated successfully.')
        return redirect('profile')
    
    return render(request, 'accounts/profile.html', {'user': request.user})
