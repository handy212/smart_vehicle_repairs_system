"""
Customer Portal Views
Self-service portal for customers to manage their vehicles, appointments, and invoices
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db.models import Q, Sum, Count
from django.utils import timezone
from datetime import datetime, timedelta
from functools import wraps

from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.appointments.models import Appointment
from apps.workorders.models import WorkOrder
from apps.billing.models import Invoice, Payment
from apps.inspections.models import VehicleInspection


def customer_login_required(view_func):
    """
    Custom decorator for customer portal authentication
    Redirects to customer login instead of staff login
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect('customer_login')
        
        if not hasattr(request.user, 'customer_profile'):
            messages.error(request, 'Access denied. This portal is for customers only.')
            return redirect('customer_login')
            
        return view_func(request, *args, **kwargs)
    return wrapper


@customer_login_required
def portal_home(request):
    """Customer portal dashboard"""
    
    customer = request.user.customer_profile
    
    # Get customer statistics
    total_vehicles = Vehicle.objects.filter(owner=customer).count()
    upcoming_appointments = Appointment.objects.filter(
        customer=customer,
        appointment_date__gte=timezone.now().date(),
        status__in=['pending', 'confirmed']
    ).count()
    
    pending_invoices = Invoice.objects.filter(
        customer=customer,
        status__in=['pending', 'sent']
    ).count()
    
    total_spent = Payment.objects.filter(
        invoice__customer=customer,
        status='completed'
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    # Recent appointments
    recent_appointments = Appointment.objects.filter(
        customer=customer
    ).order_by('-appointment_date')[:3]
    
    # Recent invoices
    recent_invoices = Invoice.objects.filter(
        customer=customer
    ).order_by('-invoice_date')[:3]
    
    # Active vehicles
    vehicles = Vehicle.objects.filter(owner=customer)[:4]
    
    context = {
        'customer': customer,
        'total_vehicles': total_vehicles,
        'upcoming_appointments': upcoming_appointments,
        'pending_invoices': pending_invoices,
        'total_spent': total_spent,
        'recent_appointments': recent_appointments,
        'recent_invoices': recent_invoices,
        'vehicles': vehicles,
    }
    
    return render(request, 'portal/home.html', context)


@login_required
def my_vehicles(request):
    """View all customer vehicles"""
    if not hasattr(request.user, 'customer_profile'):
        messages.error(request, 'Access denied. This portal is for customers only.')
        return redirect('home')
    
    customer = request.user.customer_profile
    
    vehicles = Vehicle.objects.filter(owner=customer).order_by('-created_at')
    
    # Get service counts for each vehicle
    for vehicle in vehicles:
        vehicle.service_count = WorkOrder.objects.filter(vehicle=vehicle).count()
        vehicle.last_service = WorkOrder.objects.filter(
            vehicle=vehicle
        ).order_by('-created_at').first()
    
    context = {
        'customer': customer,
        'vehicles': vehicles,
    }
    
    return render(request, 'portal/my_vehicles.html', context)


@login_required
def my_appointments(request):
    """View all customer appointments"""
    if not hasattr(request.user, 'customer_profile'):
        messages.error(request, 'Access denied. This portal is for customers only.')
        return redirect('home')
    
    customer = request.user.customer_profile
    
    # Filter by status
    status_filter = request.GET.get('status', 'all')
    appointments = Appointment.objects.filter(customer=customer)
    
    if status_filter != 'all':
        appointments = appointments.filter(status=status_filter)
    
    appointments = appointments.order_by('-appointment_date', '-appointment_time')
    
    # Separate upcoming and past
    today = timezone.now().date()
    upcoming = appointments.filter(appointment_date__gte=today)
    past = appointments.filter(appointment_date__lt=today)
    
    context = {
        'customer': customer,
        'appointments': appointments,
        'upcoming': upcoming,
        'past': past,
        'status_filter': status_filter,
    }
    
    return render(request, 'portal/my_appointments.html', context)


@login_required
def my_invoices(request):
    """View all customer invoices"""
    if not hasattr(request.user, 'customer_profile'):
        messages.error(request, 'Access denied. This portal is for customers only.')
        return redirect('home')
    
    customer = request.user.customer_profile
    
    # Filter by status
    status_filter = request.GET.get('status', 'all')
    invoices = Invoice.objects.filter(customer=customer)
    
    if status_filter != 'all':
        invoices = invoices.filter(status=status_filter)
    
    invoices = invoices.order_by('-invoice_date')
    
    # Calculate totals
    total_pending = invoices.filter(status__in=['pending', 'sent']).aggregate(
        total=Sum('total')
    )['total'] or 0
    
    total_paid = invoices.filter(status='paid').aggregate(
        total=Sum('total')
    )['total'] or 0
    
    context = {
        'customer': customer,
        'invoices': invoices,
        'status_filter': status_filter,
        'total_pending': total_pending,
        'total_paid': total_paid,
    }
    
    return render(request, 'portal/my_invoices.html', context)


@login_required
def my_history(request):
    """View complete service history"""
    if not hasattr(request.user, 'customer_profile'):
        messages.error(request, 'Access denied. This portal is for customers only.')
        return redirect('home')
    
    customer = request.user.customer_profile
    
    # Get all work orders for customer's vehicles
    vehicles = Vehicle.objects.filter(owner=customer)
    work_orders = WorkOrder.objects.filter(
        vehicle__in=vehicles
    ).order_by('-created_at')
    
    # Filter by vehicle if specified
    vehicle_id = request.GET.get('vehicle')
    if vehicle_id:
        work_orders = work_orders.filter(vehicle_id=vehicle_id)
    
    # Get inspections
    inspections = VehicleInspection.objects.filter(
        vehicle__in=vehicles
    ).order_by('-inspection_date')
    
    context = {
        'customer': customer,
        'vehicles': vehicles,
        'work_orders': work_orders,
        'inspections': inspections,
        'selected_vehicle': vehicle_id,
    }
    
    return render(request, 'portal/my_history.html', context)


@login_required
def book_appointment(request):
    """Self-service appointment booking"""
    if not hasattr(request.user, 'customer_profile'):
        messages.error(request, 'Access denied. This portal is for customers only.')
        return redirect('home')
    
    customer = request.user.customer_profile
    
    vehicles = Vehicle.objects.filter(owner=customer)
    
    if request.method == 'POST':
        # This is a simplified version - you'd integrate with the appointment creation endpoint
        messages.success(request, 'Appointment booking request submitted! We will confirm shortly.')
        return redirect('portal:my-appointments')
    
    context = {
        'customer': customer,
        'vehicles': vehicles,
    }
    
    return render(request, 'portal/book_appointment.html', context)


@login_required
def make_payment(request, invoice_id):
    """Make payment for invoice"""
    if not hasattr(request.user, 'customer_profile'):
        messages.error(request, 'Access denied. This portal is for customers only.')
        return redirect('home')
    
    customer = request.user.customer_profile
    
    invoice = get_object_or_404(Invoice, id=invoice_id, customer=customer)
    
    if request.method == 'POST':
        # This would integrate with payment gateway (Hubtel, Stripe, etc.)
        messages.success(request, 'Payment initiated! You will receive confirmation shortly.')
        return redirect('portal:my-invoices')
    
    context = {
        'customer': customer,
        'invoice': invoice,
    }
    
    return render(request, 'portal/payment.html', context)
