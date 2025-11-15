"""
Appointment Frontend Views
Handles appointment CRUD operations for the web interface
"""

from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django.http import JsonResponse
from django.db.models import Q, Count
from django.urls import reverse_lazy
from django.contrib import messages
from django.core.paginator import Paginator
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods  
from datetime import datetime, timedelta, time
import json

from .models import Appointment, ServiceBay, AppointmentReminder
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.branches.utils import filter_queryset_for_user_branches


class AppointmentListView(LoginRequiredMixin, ListView):
    """List view for appointments with search and filtering"""
    model = Appointment
    template_name = 'appointments/appointment_list.html'
    context_object_name = 'appointments'
    paginate_by = 20
    
    def get_queryset(self):
        queryset = Appointment.objects.select_related('customer__user', 'vehicle', 'service_bay', 'branch').prefetch_related(
            'vehicle__owner__user'
        ).order_by('-appointment_date', '-appointment_time')
        
        # Filter by active branch from session
        queryset = filter_queryset_for_user_branches(queryset, self.request.user, request=self.request, use_active_branch=True)
        
        # Search functionality
        search_query = self.request.GET.get('search')
        if search_query:
            queryset = queryset.filter(
                Q(appointment_number__icontains=search_query) |
                Q(customer__user__first_name__icontains=search_query) |
                Q(customer__user__last_name__icontains=search_query) |
                Q(customer__company_name__icontains=search_query) |
                Q(vehicle__vin__icontains=search_query) |
                Q(vehicle__make__icontains=search_query) |
                Q(vehicle__model__icontains=search_query) |
                Q(customer_concerns__icontains=search_query)
            ).distinct()
        
        # Status filter
        status = self.request.GET.get('status')
        if status:
            queryset = queryset.filter(status=status)
            
        # Service type filter
        service_type = self.request.GET.get('service_type')
        if service_type:
            queryset = queryset.filter(service_type=service_type)
            
        # Date range filter
        date_from = self.request.GET.get('date_from')
        date_to = self.request.GET.get('date_to')
        if date_from:
            queryset = queryset.filter(appointment_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(appointment_date__lte=date_to)
            
        return queryset
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Add filter choices for the template
        context.update({
            'status_choices': Appointment.STATUS_CHOICES,
            'service_type_choices': Appointment.SERVICE_TYPE_CHOICES,
            'search_query': self.request.GET.get('search', ''),
            'selected_status': self.request.GET.get('status', ''),
            'selected_service_type': self.request.GET.get('service_type', ''),
            'date_from': self.request.GET.get('date_from', ''),
            'date_to': self.request.GET.get('date_to', ''),
        })
        
        # Statistics - filter by active branch
        stats_queryset = Appointment.objects.all()
        stats_queryset = filter_queryset_for_user_branches(stats_queryset, self.request.user, request=self.request, use_active_branch=True)
        context.update({
            'total_appointments': stats_queryset.count(),
            'pending_appointments': stats_queryset.filter(status='pending').count(),
            'confirmed_appointments': stats_queryset.filter(status='confirmed').count(),
            'today_appointments': stats_queryset.filter(appointment_date=timezone.now().date()).count(),
        })
        
        return context


class AppointmentDetailView(LoginRequiredMixin, DetailView):
    """Detail view for appointments"""
    model = Appointment
    template_name = 'appointments/appointment_detail.html'
    context_object_name = 'appointment'
    
    def get_queryset(self):
        queryset = Appointment.objects.select_related(
            'customer__user', 'vehicle', 'service_bay', 'branch'
        ).prefetch_related(
            'reminders', 'vehicle__owner__user'
        )
        # Filter by active branch from session
        return filter_queryset_for_user_branches(queryset, self.request.user, request=self.request, use_active_branch=True)


class AppointmentCreateView(LoginRequiredMixin, CreateView):
    """Create view for appointments"""
    model = Appointment
    template_name = 'appointments/appointment_create.html'
    fields = [
        'customer', 'vehicle', 'appointment_date', 'appointment_time',
        'estimated_duration', 'service_type', 'service_bay', 'priority',
        'customer_concerns', 'special_instructions', 'estimated_cost'
    ]
    success_url = reverse_lazy('appointments:appointment-list')
    
    def form_valid(self, form):
        # Generate appointment number
        last_appointment = Appointment.objects.order_by('id').last()
        if last_appointment:
            number = int(last_appointment.appointment_number.split('-')[-1]) + 1
        else:
            number = 1
        
        form.instance.appointment_number = f"APT-{number:06d}"
        form.instance.status = 'pending'
        form.instance.created_by = self.request.user
        
        messages.success(self.request, f'Appointment {form.instance.appointment_number} created successfully!')
        return super().form_valid(form)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update({
            'customers': Customer.objects.select_related('user').all(),
            'vehicles': Vehicle.objects.select_related('owner__user').all(),
            'service_bays': ServiceBay.objects.filter(is_active=True),
        })
        return context


class AppointmentUpdateView(LoginRequiredMixin, UpdateView):
    """Update view for appointments"""
    model = Appointment
    template_name = 'appointments/appointment_edit.html'
    fields = [
        'customer', 'vehicle', 'appointment_date', 'appointment_time',
        'estimated_duration', 'service_type', 'service_bay', 'priority',
        'status', 'customer_concerns', 'special_instructions', 'estimated_cost'
    ]
    success_url = reverse_lazy('appointments:appointment-list')
    
    def form_valid(self, form):
        messages.success(self.request, f'Appointment {form.instance.appointment_number} updated successfully!')
        return super().form_valid(form)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update({
            'customers': Customer.objects.select_related('user').all(),
            'vehicles': Vehicle.objects.select_related('owner__user').all(),
            'service_bays': ServiceBay.objects.filter(is_active=True),
        })
        return context


class AppointmentDeleteView(LoginRequiredMixin, DeleteView):
    """Delete view for appointments"""
    model = Appointment
    template_name = 'appointments/appointment_delete_confirm.html'
    success_url = reverse_lazy('appointments:appointment-list')
    
    def delete(self, request, *args, **kwargs):
        appointment = self.get_object()
        messages.success(request, f'Appointment {appointment.appointment_number} deleted successfully!')
        return super().delete(request, *args, **kwargs)


@login_required
def calendar_view(request):
    """Calendar view for appointments"""
    # Get date range (current month by default)
    today = timezone.now().date()
    year = int(request.GET.get('year', today.year))
    month = int(request.GET.get('month', today.month))
    
    # Get appointments for the month
    start_date = datetime(year, month, 1).date()
    if month == 12:
        end_date = datetime(year + 1, 1, 1).date() - timedelta(days=1)
    else:
        end_date = datetime(year, month + 1, 1).date() - timedelta(days=1)
    
    appointments = Appointment.objects.filter(
        appointment_date__range=[start_date, end_date]
    ).select_related('customer__user', 'vehicle', 'service_bay', 'branch')
    # Filter by active branch from session
    appointments = filter_queryset_for_user_branches(appointments, request.user, request=request, use_active_branch=True)
    
    # Get service bays for the bay selector
    service_bays = ServiceBay.objects.filter(is_active=True)
    
    context = {
        'appointments': appointments,
        'service_bays': service_bays,
        'current_year': year,
        'current_month': month,
        'today': today,
    }
    
    return render(request, 'appointments/calendar_view.html', context)


@login_required
def get_calendar_events(request):
    """AJAX endpoint for calendar events"""
    # Add CORS headers for AJAX requests
    if request.method == 'GET':
        start = request.GET.get('start')
        end = request.GET.get('end')
        
        if not start or not end:
            return JsonResponse({'error': 'Start and end dates are required'}, status=400)
    
    try:
        start_date = datetime.fromisoformat(start.replace('Z', '+00:00')).date()
        end_date = datetime.fromisoformat(end.replace('Z', '+00:00')).date()
    except ValueError:
        return JsonResponse({'error': 'Invalid date format'}, status=400)
    
    appointments = Appointment.objects.filter(
        appointment_date__range=[start_date, end_date]
    ).select_related('customer__user', 'vehicle', 'service_bay', 'branch')
    # Filter by active branch from session
    appointments = filter_queryset_for_user_branches(appointments, request.user, request=request, use_active_branch=True)
    
    events = []
    for appointment in appointments:
        # Determine color based on status
        color_map = {
            'pending': '#ffc107',      # Yellow
            'confirmed': '#28a745',    # Green
            'in_progress': '#007bff',  # Blue
            'completed': '#6c757d',    # Gray
            'cancelled': '#dc3545',    # Red
            'no_show': '#dc3545',      # Red
            'rescheduled': '#fd7e14',  # Orange
        }
        
        customer_name = f"{appointment.customer.user.first_name} {appointment.customer.user.last_name}" if appointment.customer.user else appointment.customer.company_name
        
        events.append({
            'id': appointment.id,
            'title': f"{customer_name} - {appointment.get_service_type_display()}",
            'start': f"{appointment.appointment_date}T{appointment.appointment_time}",
            'end': f"{appointment.appointment_date}T{(datetime.combine(appointment.appointment_date, appointment.appointment_time) + timedelta(minutes=appointment.estimated_duration)).time()}",
            'color': color_map.get(appointment.status, '#6c757d'),
            'extendedProps': {
                'appointment_number': appointment.appointment_number,
                'customer': customer_name,
                'vehicle': f"{appointment.vehicle.year} {appointment.vehicle.make} {appointment.vehicle.model}",
                'service_bay': appointment.service_bay.name if appointment.service_bay else 'Not assigned',
                'status': appointment.get_status_display(),
                'description': appointment.customer_concerns,
            }
        })
    
    return JsonResponse(events, safe=False)


@login_required
def check_availability(request):
    """AJAX endpoint to check appointment availability"""
    date = request.GET.get('date')
    time_str = request.GET.get('time')
    duration = int(request.GET.get('duration', 60))
    service_bay_id = request.GET.get('service_bay_id')
    
    if not all([date, time_str]):
        return JsonResponse({'error': 'Date and time are required'}, status=400)
    
    try:
        appointment_date = datetime.fromisoformat(date).date()
        appointment_time = datetime.strptime(time_str, '%H:%M').time()
    except ValueError:
        return JsonResponse({'error': 'Invalid date or time format'}, status=400)
    
    # Check for conflicts
    start_datetime = datetime.combine(appointment_date, appointment_time)
    end_datetime = start_datetime + timedelta(minutes=duration)
    
    conflicts = Appointment.objects.filter(
        appointment_date=appointment_date,
        status__in=['pending', 'confirmed', 'in_progress']
    )
    
    if service_bay_id:
        conflicts = conflicts.filter(service_bay_id=service_bay_id)
    
    # Check for time overlaps
    has_conflict = False
    for appointment in conflicts:
        existing_start = datetime.combine(appointment.appointment_date, appointment.appointment_time)
        existing_end = existing_start + timedelta(minutes=appointment.estimated_duration)
        
        if (start_datetime < existing_end and end_datetime > existing_start):
            has_conflict = True
            break
    
    return JsonResponse({
        'available': not has_conflict,
        'conflicts': conflicts.count() if has_conflict else 0
    })


@login_required
def get_available_time_slots(request):
    """AJAX endpoint to get available time slots for a date"""
    date = request.GET.get('date')
    service_bay_id = request.GET.get('service_bay_id')
    duration = int(request.GET.get('duration', 60))
    
    if not date:
        return JsonResponse({'error': 'Date is required'}, status=400)
    
    try:
        appointment_date = datetime.fromisoformat(date).date()
    except ValueError:
        return JsonResponse({'error': 'Invalid date format'}, status=400)
    
    # Define business hours (8 AM to 6 PM)
    start_hour = 8
    end_hour = 18
    slot_duration = 30  # 30-minute slots
    
    # Get existing appointments for the date
    existing_appointments = Appointment.objects.filter(
        appointment_date=appointment_date,
        status__in=['pending', 'confirmed', 'in_progress']
    )
    
    if service_bay_id:
        existing_appointments = existing_appointments.filter(service_bay_id=service_bay_id)
    
    # Generate all possible time slots
    available_slots = []
    current_time = time(start_hour, 0)
    
    while current_time < time(end_hour, 0):
        slot_start = datetime.combine(appointment_date, current_time)
        slot_end = slot_start + timedelta(minutes=duration)
        
        # Check if this slot conflicts with existing appointments
        has_conflict = False
        for appointment in existing_appointments:
            existing_start = datetime.combine(appointment.appointment_date, appointment.appointment_time)
            existing_end = existing_start + timedelta(minutes=appointment.estimated_duration)
            
            if (slot_start < existing_end and slot_end > existing_start):
                has_conflict = True
                break
        
        if not has_conflict:
            available_slots.append({
                'time': current_time.strftime('%H:%M'),
                'display': current_time.strftime('%I:%M %p')
            })
        
        # Move to next slot
        current_time = (datetime.combine(appointment_date, current_time) + timedelta(minutes=slot_duration)).time()
    
    return JsonResponse({'slots': available_slots})


@login_required
def get_customer_vehicles(request):
    """AJAX endpoint to get vehicles for a customer"""
    customer_id = request.GET.get('customer_id')
    
    if not customer_id:
        return JsonResponse({'error': 'Customer ID is required'}, status=400)
    
    try:
        customer = Customer.objects.get(id=customer_id)
        vehicles = customer.vehicles.all()
        
        vehicle_data = []
        for vehicle in vehicles:
            vehicle_data.append({
                'id': vehicle.id,
                'display': f"{vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.vin})",
                'vin': vehicle.vin,
                'make': vehicle.make,
                'model': vehicle.model,
                'year': vehicle.year
            })
        
        return JsonResponse({'vehicles': vehicle_data})
        
    except Customer.DoesNotExist:
        return JsonResponse({'error': 'Customer not found'}, status=404)


@csrf_exempt
@login_required  
@require_http_methods(["POST"])
def update_appointment_status(request, pk):
    """AJAX endpoint to update appointment status"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method allowed'}, status=405)
    
    try:
        appointment = get_object_or_404(Appointment, pk=pk)
        
        # Get the new status from request
        data = json.loads(request.body)
        new_status = data.get('status')
        
        if not new_status:
            return JsonResponse({'error': 'Status is required'}, status=400)
        
        # Validate status
        valid_statuses = [choice[0] for choice in Appointment.STATUS_CHOICES]
        if new_status not in valid_statuses:
            return JsonResponse({'error': 'Invalid status'}, status=400)
        
        # Update appointment status
        old_status = appointment.status
        appointment.status = new_status
        appointment.save()
        
        return JsonResponse({
            'success': True,
            'message': f'Appointment status updated to {appointment.get_status_display()}',
            'old_status': old_status,
            'new_status': new_status,
            'status_display': appointment.get_status_display()
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def get_customers_ajax(request):
    """AJAX endpoint to get customers for calendar quick create"""
    try:
        # Import here to avoid circular imports
        from apps.customers.models import Customer
        
        customers = Customer.objects.select_related('user').all()
        
        customer_data = []
        for customer in customers:
            if customer.user:
                name = f"{customer.user.first_name} {customer.user.last_name}"
            else:
                name = customer.company_name or f"Customer {customer.id}"
                
            customer_data.append({
                'id': customer.id,
                'name': name,
                'user': {
                    'first_name': customer.user.first_name if customer.user else '',
                    'last_name': customer.user.last_name if customer.user else ''
                } if customer.user else None,
                'company_name': customer.company_name or ''
            })
        
        # Return in DRF-compatible format for existing JavaScript
        return JsonResponse({
            'results': customer_data,
            'count': len(customer_data)
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_http_methods(["POST"])
def create_appointment_api(request):
    """API endpoint to create an appointment from work order creation"""
    try:
        data = json.loads(request.body)
        
        # Required fields
        customer_id = data.get('customer_id')
        vehicle_id = data.get('vehicle_id')
        service_type = data.get('service_type')
        appointment_date = data.get('appointment_date')
        appointment_time = data.get('appointment_time')
        
        if not all([customer_id, vehicle_id, service_type, appointment_date, appointment_time]):
            return JsonResponse({'error': 'Missing required fields'}, status=400)
        
        # Get customer and vehicle
        customer = get_object_or_404(Customer, id=customer_id)
        vehicle = get_object_or_404(Vehicle, id=vehicle_id)
        
        # Create appointment
        appointment = Appointment.objects.create(
            customer=customer,
            vehicle=vehicle,
            service_type=service_type,
            appointment_date=appointment_date,
            appointment_time=appointment_time,
            priority=data.get('priority', 'normal'),
            status='pending',
            customer_concerns=data.get('service_description', ''),
            special_instructions=data.get('special_instructions', ''),
            created_by=request.user
        )
        
        # Send confirmation if requested
        if data.get('send_confirmation'):
            # TODO: Implement notification sending
            pass
        
        return JsonResponse({
            'success': True,
            'appointment_id': appointment.id,
            'appointment_number': appointment.appointment_number,
            'message': 'Appointment scheduled successfully'
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)