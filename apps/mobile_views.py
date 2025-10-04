"""
Mobile Views for Vehicle Repairs System
Handles mobile-optimized views and PWA functionality
"""

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.utils import timezone
from django.core.paginator import Paginator
from django.db.models import Q, Count
from django.contrib import messages
import json
import re

# Import models from other apps
from apps.workorders.models import WorkOrder
from apps.appointments.models import Appointment
from apps.inspections.models import VehicleInspection
from apps.vehicles.models import Vehicle
from apps.customers.models import Customer
from apps.billing.models import Invoice


def is_mobile_request(request):
    """Check if the request is from a mobile device"""
    user_agent = request.META.get('HTTP_USER_AGENT', '').lower()
    
    # Check for explicit mobile parameter
    if request.GET.get('mobile') == '1':
        return True
    
    # Simple mobile detection using user agent
    mobile_keywords = [
        'mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry', 
        'windows phone', 'nokia', 'samsung', 'htc', 'lg', 'motorola',
        'opera mini', 'opera mobi', 'fennec'
    ]
    
    return any(keyword in user_agent for keyword in mobile_keywords)


def mobile_template_name(base_template):
    """Generate mobile template name from base template"""
    if base_template.startswith('mobile/'):
        return base_template
    
    # Convert template path to mobile version
    parts = base_template.split('/')
    if len(parts) > 1:
        return f"mobile/{parts[-1]}"
    return f"mobile/{base_template}"


@login_required
def mobile_dashboard(request):
    """Mobile-optimized dashboard view"""
    if not is_mobile_request(request) and not request.GET.get('force_mobile'):
        return redirect('dashboard')
    
    # Get dashboard statistics
    context = {
        'active_workorders_count': WorkOrder.objects.filter(
            status__in=['pending', 'in_progress']
        ).count(),
        'todays_appointments_count': Appointment.objects.filter(
            appointment_date=timezone.now().date(),
            status='confirmed'
        ).count(),
        'pending_inspections_count': VehicleInspection.objects.filter(
            status='in_progress'
        ).count(),
        'overdue_invoices_count': Invoice.objects.filter(
            due_date__lt=timezone.now().date(),
            status__in=['sent', 'viewed', 'partial', 'overdue']
        ).count(),
    }
    
    # Get recent activity
    recent_activity = []
    
    # Recent work orders
    recent_workorders = WorkOrder.objects.select_related('customer', 'vehicle').order_by('-created_at')[:5]
    for wo in recent_workorders:
        recent_activity.append({
            'type': 'workorder',
            'icon': 'wrench',
            'title': f'Work Order #{wo.id:04d}',
            'subtitle': f'{wo.customer.user.get_full_name()} - {wo.vehicle.make} {wo.vehicle.model}',
            'time_ago': time_ago(wo.created_at),
            'url': f'/workorders/{wo.id}/',
        })
    
    # Recent appointments
    recent_appointments = Appointment.objects.select_related('customer', 'vehicle').order_by('-created_at')[:3]
    for apt in recent_appointments:
        recent_activity.append({
            'type': 'appointment',
            'icon': 'calendar',
            'title': f'Appointment - {apt.customer.user.get_full_name()}',
            'subtitle': f'{apt.appointment_date} at {apt.appointment_time}',
            'time_ago': time_ago(apt.created_at),
            'url': f'/appointments/{apt.id}/',
        })
    
    # Sort by time
    recent_activity.sort(key=lambda x: x['time_ago'], reverse=True)
    context['recent_activity'] = recent_activity[:8]
    
    return render(request, 'mobile/dashboard.html', context)


@login_required
def mobile_workorder_list(request):
    """Mobile-optimized work order list view"""
    if not is_mobile_request(request) and not request.GET.get('force_mobile'):
        return redirect('workorders:workorder_list')
    
    # Get filters from request
    status_filter = request.GET.get('status', 'all')
    priority_filter = request.GET.get('priority')
    search_query = request.GET.get('q', '').strip()
    
    # Base queryset
    workorders = WorkOrder.objects.select_related('customer', 'vehicle').order_by('-created_at')
    
    # Apply filters
    if status_filter != 'all':
        workorders = workorders.filter(status=status_filter)
    
    if priority_filter:
        workorders = workorders.filter(priority=priority_filter)
    
    if search_query:
        workorders = workorders.filter(
            Q(customer__first_name__icontains=search_query) |
            Q(customer__last_name__icontains=search_query) |
            Q(vehicle__make__icontains=search_query) |
            Q(vehicle__model__icontains=search_query) |
            Q(vehicle__license_plate__icontains=search_query) |
            Q(description__icontains=search_query)
        )
    
    # Pagination for mobile (smaller page size)
    paginator = Paginator(workorders, 10)
    page_number = request.GET.get('page')
    workorders_page = paginator.get_page(page_number)
    
    context = {
        'workorders': workorders_page,
        'status_filter': status_filter,
        'priority_filter': priority_filter,
        'search_query': search_query,
    }
    
    return render(request, 'mobile/workorder_list.html', context)


@login_required  
def mobile_inspection_form(request, vehicle_id=None):
    """Mobile-optimized inspection form with camera integration"""
    if not is_mobile_request(request) and not request.GET.get('force_mobile'):
        return redirect('inspections:inspection_create')
    
    vehicle = None
    if vehicle_id:
        vehicle = get_object_or_404(Vehicle, id=vehicle_id)
    
    context = {
        'vehicle': vehicle,
    }
    
    if request.method == 'POST':
        # Handle inspection form submission
        return handle_mobile_inspection_submit(request, vehicle)
    
    return render(request, 'mobile/inspection_form.html', context)


@login_required
@require_http_methods(["POST"])
@csrf_exempt
def mobile_quick_update(request):
    """Handle quick updates from mobile interface"""
    try:
        data = json.loads(request.body)
        update_type = data.get('type')
        object_id = data.get('id')
        
        if update_type == 'workorder':
            workorder = get_object_or_404(WorkOrder, id=object_id)
            
            if 'status' in data:
                workorder.status = data['status']
            if 'priority' in data:
                workorder.priority = data['priority']
            if 'notes' in data and data['notes']:
                workorder.internal_notes = f"{workorder.internal_notes}\n\n[Mobile Update - {timezone.now()}]\n{data['notes']}"
            
            workorder.updated_at = timezone.now()
            workorder.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Work order updated successfully'
            })
        
        return JsonResponse({
            'success': False,
            'message': 'Invalid update type'
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': str(e)
        })


@login_required
def mobile_search_api(request):
    """API endpoint for mobile search functionality"""
    query = request.GET.get('q', '').strip()
    search_type = request.GET.get('type', 'all')
    
    if len(query) < 2:
        return JsonResponse({'results': []})
    
    results = []
    
    if search_type in ['all', 'workorders']:
        workorders = WorkOrder.objects.select_related('customer', 'vehicle').filter(
            Q(customer__first_name__icontains=query) |
            Q(customer__last_name__icontains=query) |
            Q(vehicle__license_plate__icontains=query) |
            Q(description__icontains=query)
        )[:5]
        
        for wo in workorders:
            results.append({
                'type': 'workorder',
                'id': wo.id,
                'title': f'WO-{wo.id:04d} - {wo.customer.user.get_full_name()}',
                'subtitle': f'{wo.vehicle.year} {wo.vehicle.make} {wo.vehicle.model}',
                'url': f'/workorders/{wo.id}/',
                'status': wo.get_status_display(),
            })
    
    if search_type in ['all', 'customers']:
        customers = Customer.objects.select_related('user').filter(
            Q(user__first_name__icontains=query) |
            Q(user__last_name__icontains=query) |
            Q(user__email__icontains=query) |
            Q(user__phone__icontains=query) |
            Q(company_name__icontains=query)
        )[:5]
        
        for customer in customers:
            results.append({
                'type': 'customer',
                'id': customer.id,
                'title': customer.user.get_full_name(),
                'subtitle': f'{customer.user.email} • {customer.user.phone or "No phone"}',
                'url': f'/customers/{customer.id}/',
            })
    
    if search_type in ['all', 'vehicles']:
        vehicles = Vehicle.objects.select_related('customer').filter(
            Q(make__icontains=query) |
            Q(model__icontains=query) |
            Q(license_plate__icontains=query) |
            Q(vin__icontains=query)
        )[:5]
        
        for vehicle in vehicles:
            results.append({
                'type': 'vehicle',
                'id': vehicle.id,
                'title': f'{vehicle.year} {vehicle.make} {vehicle.model}',
                'subtitle': f'{vehicle.license_plate} • {vehicle.customer.user.get_full_name()}',
                'url': f'/vehicles/{vehicle.id}/',
            })
    
    return JsonResponse({'results': results})


@login_required
def pwa_manifest(request):
    """Serve PWA manifest with dynamic content"""
    manifest = {
        "name": "Vehicle Repairs System",
        "short_name": "VehicleRepairs",
        "description": "Professional vehicle repair management system",
        "start_url": "/mobile/dashboard/",
        "display": "standalone",
        "background_color": "#ffffff",
        "theme_color": "#4f46e5",
        "orientation": "portrait",
        "scope": "/",
        "icons": [
            {
                "src": "/static/icons/icon-72x72.png",
                "sizes": "72x72",
                "type": "image/png",
                "purpose": "maskable any"
            },
            {
                "src": "/static/icons/icon-96x96.png", 
                "sizes": "96x96",
                "type": "image/png",
                "purpose": "maskable any"
            },
            {
                "src": "/static/icons/icon-128x128.png",
                "sizes": "128x128", 
                "type": "image/png",
                "purpose": "maskable any"
            },
            {
                "src": "/static/icons/icon-144x144.png",
                "sizes": "144x144",
                "type": "image/png",
                "purpose": "maskable any"
            },
            {
                "src": "/static/icons/icon-152x152.png",
                "sizes": "152x152",
                "type": "image/png",
                "purpose": "maskable any"
            },
            {
                "src": "/static/icons/icon-192x192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "maskable any"
            },
            {
                "src": "/static/icons/icon-384x384.png",
                "sizes": "384x384",
                "type": "image/png",
                "purpose": "maskable any"
            },
            {
                "src": "/static/icons/icon-512x512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable any"
            }
        ],
        "shortcuts": [
            {
                "name": "Dashboard",
                "short_name": "Dashboard",
                "description": "View system dashboard",
                "url": "/mobile/dashboard/",
                "icons": [{"src": "/static/icons/shortcut-dashboard.png", "sizes": "192x192"}]
            },
            {
                "name": "Work Orders",
                "short_name": "Work Orders", 
                "description": "Manage work orders",
                "url": "/mobile/workorders/",
                "icons": [{"src": "/static/icons/shortcut-workorders.png", "sizes": "192x192"}]
            },
            {
                "name": "Inspections",
                "short_name": "Inspections",
                "description": "Perform vehicle inspections",
                "url": "/mobile/inspections/",
                "icons": [{"src": "/static/icons/shortcut-inspections.png", "sizes": "192x192"}]
            }
        ],
        "categories": ["business", "productivity", "utilities"]
    }
    
    return JsonResponse(manifest, content_type='application/manifest+json')


def handle_mobile_inspection_submit(request, vehicle):
    """Handle mobile inspection form submission"""
    try:
        # Get form data
        mileage = request.POST.get('mileage')
        notes = request.POST.get('notes', '')
        
        # Get inspection results
        inspection_results = {}
        for key, value in request.POST.items():
            if key.startswith('inspection_'):
                inspection_results[key] = value
        
        # Handle photo uploads
        photos = {}
        for key, file in request.FILES.items():
            if key.startswith('photo_'):
                # Save photo and store reference
                photos[key] = file
        
        # Create inspection record
        inspection = VehicleInspection.objects.create(
            vehicle=vehicle,
            inspector=request.user,
            odometer_reading=mileage,
            technician_notes=notes,
            status='completed',
            completed_at=timezone.now()
        )
        
        # Handle photos if any
        for key, photo in photos.items():
            # Save photo to inspection
            pass  # Implement photo handling based on your model structure
        
        messages.success(request, 'Inspection completed successfully!')
        
        if request.headers.get('Content-Type') == 'application/json':
            return JsonResponse({
                'success': True,
                'message': 'Inspection completed successfully',
                'inspection_id': inspection.id
            })
        
        return redirect('inspections:inspection_detail', inspection.id)
        
    except Exception as e:
        messages.error(request, f'Error saving inspection: {str(e)}')
        
        if request.headers.get('Content-Type') == 'application/json':
            return JsonResponse({
                'success': False,
                'message': str(e)
            })
        
        return render(request, 'mobile/inspection_form.html', {'vehicle': vehicle})


def time_ago(datetime_obj):
    """Calculate human-readable time difference"""
    now = timezone.now()
    diff = now - datetime_obj
    
    if diff.days > 0:
        return f"{diff.days} day{'s' if diff.days > 1 else ''} ago"
    elif diff.seconds > 3600:
        hours = diff.seconds // 3600
        return f"{hours} hour{'s' if hours > 1 else ''} ago"
    elif diff.seconds > 60:
        minutes = diff.seconds // 60
        return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
    else:
        return "Just now"


@login_required
def mobile_offline_sync(request):
    """Handle offline data synchronization"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            sync_items = data.get('items', [])
            
            results = []
            
            for item in sync_items:
                try:
                    # Process each offline item
                    result = process_offline_item(item)
                    results.append({
                        'local_id': item.get('local_id'),
                        'success': True,
                        'server_id': result.get('id'),
                        'message': 'Synced successfully'
                    })
                except Exception as e:
                    results.append({
                        'local_id': item.get('local_id'),
                        'success': False,
                        'message': str(e)
                    })
            
            return JsonResponse({
                'success': True,
                'results': results
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': str(e)
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


def process_offline_item(item):
    """Process individual offline sync item"""
    item_type = item.get('type')
    
    if item_type == 'inspection':
        # Create inspection from offline data
        vehicle_id = item.get('vehicle_id')
        vehicle = Vehicle.objects.get(id=vehicle_id)
        
        inspection = VehicleInspection.objects.create(
            vehicle=vehicle,
            inspector_id=item.get('inspector_id'),
            odometer_reading=item.get('mileage'),
            technician_notes=item.get('notes', ''),
            status='completed',
            completed_at=timezone.now()
        )
        
        return {'id': inspection.id}
    
    elif item_type == 'workorder_update':
        # Update work order from offline data
        workorder_id = item.get('workorder_id')
        workorder = WorkOrder.objects.get(id=workorder_id)
        
        if 'status' in item:
            workorder.status = item['status']
        if 'notes' in item:
            workorder.internal_notes = f"{workorder.internal_notes}\n\n[Offline Update]\n{item['notes']}"
        
        workorder.updated_at = timezone.now()
        workorder.save()
        
        return {'id': workorder.id}
    
    else:
        raise ValueError(f"Unknown item type: {item_type}")