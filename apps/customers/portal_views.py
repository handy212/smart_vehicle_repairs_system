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
import logging

logger = logging.getLogger(__name__)

from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.appointments.models import Appointment
from apps.workorders.models import WorkOrder
from apps.billing.models import Invoice, Payment, Estimate
from apps.inspections.models import VehicleInspection
from apps.accounts.models import User
from apps.notifications_app.models import Notification


def customer_login_required(view_func):
    """
    Customer portal authentication using role-based permissions
    Checks user.role field which is managed via admin panel
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        # Check if user is authenticated
        if not request.user.is_authenticated:
            return redirect('customer_login')
        
        # Check if user has customer role (managed in admin panel)
        if request.user.role != 'customer':
            messages.error(request, 'Access denied. This portal is for customers only.')
            return redirect('customer_login')
        
        # Verify customer profile exists (additional safety check)
        if not hasattr(request.user, 'customer_profile'):
            messages.error(request, 'Customer profile not found. Please contact support.')
            return redirect('customer_login')
            
        return view_func(request, *args, **kwargs)
    return wrapper


@customer_login_required
def portal_home(request):
    """Customer portal dashboard"""
    
    customer = request.user.customer_profile
    
    # Get customer statistics
    total_vehicles = Vehicle.objects.filter(owner=customer).count()
    upcoming_appointments_count = Appointment.objects.filter(
        customer=customer,
        appointment_date__gte=timezone.now().date(),
        status__in=['pending', 'confirmed']
    ).count()
    
    pending_invoices_count = Invoice.objects.filter(
        customer=customer,
        status__in=['pending', 'sent']
    ).count()
    
    pending_estimates_count = Estimate.objects.filter(
        customer=customer,
        status='sent'
    ).count()
    
    total_spent = Payment.objects.filter(
        invoice__customer=customer,
        status='completed'
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    # Recent appointments
    recent_appointments = Appointment.objects.filter(
        customer=customer
    ).order_by('-appointment_date')[:3]
    
    # Recent invoices (exclude drafts and void)
    recent_invoices = Invoice.objects.filter(
        customer=customer
    ).exclude(
        status__in=['draft', 'void']
    ).order_by('-invoice_date')[:3]
    
    # Active vehicles
    vehicles = Vehicle.objects.filter(owner=customer)[:4]
    
    context = {
        'customer': customer,
        'total_vehicles': total_vehicles,
        'upcoming_appointments_count': upcoming_appointments_count,
        'pending_invoices_count': pending_invoices_count,
        'pending_estimates_count': pending_estimates_count,
        'total_spent': total_spent,
        'recent_appointments': recent_appointments,
        'recent_invoices': recent_invoices,
        'vehicles': vehicles,
    }
    
    return render(request, 'portal/home.html', context)


@customer_login_required
def my_vehicles(request):
    """View all customer vehicles"""
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


@customer_login_required
def my_appointments(request):
    """View all customer appointments"""
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


@customer_login_required
def my_invoices(request):
    """View all customer invoices"""
    customer = request.user.customer_profile
    
    # Filter by status - exclude draft and void invoices (customers should only see sent/active invoices)
    status_filter = request.GET.get('status', 'all')
    invoices = Invoice.objects.filter(
        customer=customer
    ).exclude(
        status__in=['draft', 'void']  # Hide draft and void invoices from customers
    )
    
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


@customer_login_required
def my_history(request):
    """View complete service history"""
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


@customer_login_required
def book_appointment(request):
    """Self-service appointment booking"""
    customer = request.user.customer_profile
    
    vehicles = Vehicle.objects.filter(owner=customer)
    
    if request.method == 'POST':
        try:
            # Get form data
            vehicle_id = request.POST.get('vehicle')
            service_type = request.POST.get('service_type')
            appointment_date = request.POST.get('appointment_date')
            appointment_time = request.POST.get('appointment_time')
            notes = request.POST.get('notes', '')
            
            # Validate required fields
            if not all([vehicle_id, service_type, appointment_date, appointment_time]):
                messages.error(request, 'Please fill in all required fields.')
                return redirect('portal:book-appointment')
            
            # Get the vehicle and verify ownership
            vehicle = Vehicle.objects.get(id=vehicle_id, owner=customer)
            
            # Create the appointment
            appointment = Appointment.objects.create(
                customer=customer,
                vehicle=vehicle,
                service_type=service_type,
                appointment_date=appointment_date,
                appointment_time=appointment_time,
                customer_concerns=notes or 'No specific concerns mentioned',
                special_instructions=notes,
                status='pending',
                priority='normal',
                estimated_duration=60  # Default 1 hour
            )
            
            # Send notifications to staff members about new appointment
            try:
                # Get all staff members who should be notified (managers, receptionists, admins)
                staff_to_notify = User.objects.filter(
                    role__in=['admin', 'manager', 'receptionist'],
                    is_active=True
                )
                
                # Create notification message
                notification_message = (
                    f'New appointment booking from {customer.user.get_full_name()}. '
                    f'Vehicle: {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.license_plate}). '
                    f'Service: {appointment.get_service_type_display()}. '
                    f'Date: {appointment_date} at {appointment_time}.'
                )
                
                # Create notifications for each staff member
                for staff_member in staff_to_notify:
                    Notification.objects.create(
                        recipient=staff_member,
                        notification_type='appointment',
                        channel='in_app',  # In-app notification
                        priority='high',
                        title=f'New Appointment: {appointment.appointment_number}',
                        message=notification_message,
                        data={
                            'appointment_id': appointment.id,
                            'appointment_number': appointment.appointment_number,
                            'customer_name': customer.user.get_full_name(),
                            'customer_email': customer.user.email,
                            'customer_phone': customer.phone,
                            'vehicle': f'{vehicle.year} {vehicle.make} {vehicle.model}',
                            'license_plate': vehicle.license_plate,
                            'service_type': service_type,
                            'appointment_date': appointment_date,
                            'appointment_time': appointment_time,
                            'notes': notes
                        },
                        related_object_type='appointment',
                        related_object_id=appointment.id
                    )
                
                logger.info(f'Sent new appointment notifications to {staff_to_notify.count()} staff members')
            except Exception as e:
                logger.error(f'Failed to send appointment notifications: {str(e)}')
                # Don't fail the appointment creation if notifications fail
            
            messages.success(
                request, 
                f'Appointment #{appointment.appointment_number} booked successfully! '
                f'We will confirm your appointment for {appointment_date} at {appointment_time}.'
            )
            return redirect('portal:my-appointments')
            
        except Vehicle.DoesNotExist:
            messages.error(request, 'Invalid vehicle selection.')
            return redirect('portal:book-appointment')
        except Exception as e:
            messages.error(request, f'Error booking appointment: {str(e)}')
            return redirect('portal:book-appointment')
    
    # Prepare context for GET request
    from datetime import date
    context = {
        'customer': customer,
        'vehicles': vehicles,
        'today': date.today().isoformat(),
    }
    
    return render(request, 'portal/book_appointment.html', context)


@customer_login_required
def make_payment(request, invoice_id):
    """Make payment for invoice"""
    customer = request.user.customer_profile
    
    # Get invoice and ensure it's not draft or void
    invoice = get_object_or_404(
        Invoice, 
        id=invoice_id, 
        customer=customer
    )
    
    # Prevent payment on draft or void invoices
    if invoice.status in ['draft', 'void']:
        messages.error(request, 'This invoice is not available for payment.')
        return redirect('portal:my-invoices')
    
    if request.method == 'POST':
        # This would integrate with payment gateway (Hubtel, Stripe, etc.)
        messages.success(request, 'Payment initiated! You will receive confirmation shortly.')
        return redirect('portal:my-invoices')
    
    context = {
        'customer': customer,
        'invoice': invoice,
    }
    
    return render(request, 'portal/payment.html', context)


@customer_login_required
def vehicle_detail(request, vehicle_id):
    """View vehicle details in customer portal"""
    customer = request.user.customer_profile
    
    # Ensure customer can only view their own vehicles
    vehicle = get_object_or_404(Vehicle, id=vehicle_id, owner=customer)
    
    # Get service history for this vehicle
    work_orders = WorkOrder.objects.filter(vehicle=vehicle).order_by('-created_at')[:10]
    inspections = VehicleInspection.objects.filter(vehicle=vehicle).order_by('-inspection_date')[:10]
    appointments = Appointment.objects.filter(
        vehicle=vehicle,
        customer=customer
    ).order_by('-appointment_date')[:5]
    
    context = {
        'customer': customer,
        'vehicle': vehicle,
        'work_orders': work_orders,
        'inspections': inspections,
        'appointments': appointments,
    }
    
    return render(request, 'portal/vehicle_detail.html', context)


@customer_login_required
def inspection_detail(request, inspection_id):
    """View inspection details in customer portal"""
    customer = request.user.customer_profile
    
    # Get customer's vehicles
    customer_vehicles = Vehicle.objects.filter(owner=customer)
    
    # Ensure customer can only view inspections for their own vehicles
    inspection = get_object_or_404(
        VehicleInspection, 
        id=inspection_id, 
        vehicle__in=customer_vehicles
    )
    
    context = {
        'customer': customer,
        'inspection': inspection,
    }
    
    return render(request, 'portal/inspection_detail.html', context)


@customer_login_required
def my_estimates(request):
    """View all pending estimates for approval"""
    customer = request.user.customer_profile
    
    # Get all estimates for this customer
    estimates = Estimate.objects.filter(
        customer=customer
    ).select_related('vehicle', 'work_order').order_by('-created_at')
    
    # Filter by status if provided
    status_filter = request.GET.get('status')
    if status_filter:
        estimates = estimates.filter(status=status_filter)
    
    context = {
        'customer': customer,
        'estimates': estimates,
        'status_filter': status_filter,
    }
    
    return render(request, 'portal/my_estimates.html', context)


@customer_login_required
def estimate_detail(request, estimate_id):
    """View detailed estimate and approve/decline"""
    from django.http import JsonResponse
    from apps.workorders.models import WorkOrderNote
    
    customer = request.user.customer_profile
    
    # Ensure customer can only view their own estimates
    estimate = get_object_or_404(
        Estimate, 
        id=estimate_id, 
        customer=customer
    )
    
    # Handle approval/decline
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'approve':
            estimate.status = 'approved'
            estimate.approved_date = timezone.now()
            estimate.approved_by = request.user
            estimate.save()
            
            # Update work order status if linked
            if estimate.work_order:
                estimate.work_order.status = 'approved'
                estimate.work_order.save()
                
                # Create activity note
                WorkOrderNote.objects.create(
                    work_order=estimate.work_order,
                    note_type='status',
                    note=f'Estimate #{estimate.estimate_number} approved by customer',
                    created_by=request.user
                )
            
            messages.success(request, 'Estimate approved! Work will begin shortly.')
            return redirect('portal:my-estimates')
            
        elif action == 'decline':
            decline_reason = request.POST.get('decline_reason', '')
            estimate.status = 'declined'
            estimate.declined_date = timezone.now()
            estimate.save()
            
            # Update work order status if linked
            if estimate.work_order:
                estimate.work_order.status = 'cancelled'
                estimate.work_order.save()
                
                # Create activity note
                WorkOrderNote.objects.create(
                    work_order=estimate.work_order,
                    note_type='status',
                    note=f'Estimate #{estimate.estimate_number} declined by customer. Reason: {decline_reason}',
                    created_by=request.user
                )
            
            messages.info(request, 'Estimate declined.')
            return redirect('portal:my-estimates')
    
    context = {
        'customer': customer,
        'estimate': estimate,
    }
    
    return render(request, 'portal/estimate_detail.html', context)
