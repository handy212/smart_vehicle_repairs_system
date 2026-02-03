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
from apps.branches.utils import filter_queryset_for_user_branches
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
    # Apply branch filtering
    active_workorders = filter_queryset_for_user_branches(
        WorkOrder.objects.filter(status__in=['pending', 'in_progress']), 
        request.user, request
    )
    todays_appointments = filter_queryset_for_user_branches(
        Appointment.objects.filter(appointment_date=timezone.now().date(), status='confirmed'),
        request.user, request
    )
    pending_inspections = filter_queryset_for_user_branches(
        VehicleInspection.objects.filter(status='in_progress'),
        request.user, request
    )
    overdue_invoices = filter_queryset_for_user_branches(
        Invoice.objects.filter(due_date__lt=timezone.now().date(), status__in=['sent', 'viewed', 'partial', 'overdue']),
        request.user, request
    )

    context = {
        'active_workorders_count': active_workorders.count(),
        'todays_appointments_count': todays_appointments.count(),
        'pending_inspections_count': pending_inspections.count(),
        'overdue_invoices_count': overdue_invoices.count(),
    }
    
    # Get recent activity
    recent_activity = []
    
    # Recent work orders
    recent_workorders_qs = WorkOrder.objects.select_related('customer', 'vehicle').order_by('-created_at')
    recent_workorders = filter_queryset_for_user_branches(recent_workorders_qs, request.user, request)[:5]
    
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
    recent_appointments_qs = Appointment.objects.select_related('customer', 'vehicle').order_by('-created_at')
    recent_appointments = filter_queryset_for_user_branches(recent_appointments_qs, request.user, request)[:3]
    
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
    workorders_qs = WorkOrder.objects.select_related('customer', 'vehicle').order_by('-created_at')
    workorders = filter_queryset_for_user_branches(workorders_qs, request.user, request)
    
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
    import logging
    logger = logging.getLogger(__name__)
    
    query = request.GET.get('q', '').strip()
    search_type = request.GET.get('type', 'all')
    
    logger.info(f"Search API called: query='{query}', type='{search_type}'")
    
    # Allow empty query if searching a specific type (to get all of that type)
    if len(query) < 2 and search_type == 'all':
        return JsonResponse({'results': []})
    
    results = []
    
    if search_type in ['all', 'workorders']:
        # Base query with branch filtering
        workorders_qs = WorkOrder.objects.select_related('customer', 'customer__user', 'vehicle')
        workorders_qs = filter_queryset_for_user_branches(workorders_qs, request.user, request)
        
        if query:
            workorders = workorders_qs.filter(
                Q(work_order_number__icontains=query) |
                Q(customer__user__first_name__icontains=query) |
                Q(customer__user__last_name__icontains=query) |
                Q(customer__user__email__icontains=query) |
                Q(vehicle__make__icontains=query) |
                Q(vehicle__model__icontains=query) |
                Q(vehicle__license_plate__icontains=query) |
                Q(vehicle__vin__icontains=query) |
                Q(customer_concerns__icontains=query) |
                Q(diagnosis_notes__icontains=query) |
                Q(special_instructions__icontains=query) |
                Q(approval_notes__icontains=query)
            ).order_by('-created_at')[:5]
        else:
            # Empty query for specific type - return all
            workorders = workorders_qs.order_by('-created_at')[:10]
        
        for wo in workorders:
            customer_name = wo.customer.full_name if hasattr(wo.customer, 'full_name') else (
                wo.customer.user.get_full_name() if wo.customer and wo.customer.user else 'Unknown'
            )
            vehicle_info = f'{wo.vehicle.year or ""} {wo.vehicle.make or ""} {wo.vehicle.model or ""}'.strip() if wo.vehicle else 'No vehicle'
            
            # Get description from customer_concerns or diagnosis_notes
            description = wo.customer_concerns[:50] if wo.customer_concerns else (
                wo.diagnosis_notes[:50] if wo.diagnosis_notes else "No description"
            )
            
            results.append({
                'type': 'workorder',
                'id': wo.id,
                'title': f'{wo.work_order_number or f"WO-{wo.id:04d}"} - {customer_name}',
                'subtitle': f'{vehicle_info} • {description}',
                'url': f'/workorders/{wo.id}/',
                'status': wo.status if hasattr(wo, 'status') else None,
            })
    
    if search_type in ['all', 'customers']:
        if query:
            # Split query into words for better matching
            query_words = query.strip().split()
            
            # Build Q object for customer search
            customer_q = Q()
            
            # Search in individual fields (icontains is already case-insensitive)
            customer_q |= Q(user__first_name__icontains=query)
            customer_q |= Q(user__last_name__icontains=query)
            customer_q |= Q(user__email__icontains=query)
            customer_q |= Q(user__phone__icontains=query)
            customer_q |= Q(company_name__icontains=query)
            customer_q |= Q(customer_number__icontains=query)
            
            # If query has multiple words, search for full name combinations
            if len(query_words) >= 2:
                # Search for "first last" combination (most common)
                # This handles "Demo Customer" -> first_name="Demo", last_name="Customer"
                customer_q |= Q(
                    user__first_name__icontains=query_words[0],
                    user__last_name__icontains=query_words[-1]
                )
                # Search for "last first" combination (less common but possible)
                customer_q |= Q(
                    user__first_name__icontains=query_words[-1],
                    user__last_name__icontains=query_words[0]
                )
                # Search for first word in first_name and remaining words in last_name
                if len(query_words) > 2:
                    customer_q |= Q(
                        user__first_name__icontains=query_words[0],
                        user__last_name__icontains=' '.join(query_words[1:])
                    )
            
            customers = Customer.objects.select_related('user').filter(customer_q).distinct()[:10]
            customers_list = list(customers)  # Evaluate queryset to get count
            logger.info(f"Found {len(customers_list)} customers for query '{query}'")
            if len(customers_list) > 0:
                logger.info(f"First customer: {customers_list[0].user.first_name} {customers_list[0].user.last_name}")
            customers = customers_list
        else:
            # Empty query for specific type - return all
            customers = Customer.objects.select_related('user').order_by('-created_at')[:10]
        
        for customer in customers:
            customer_name = customer.full_name if hasattr(customer, 'full_name') else (
                customer.user.get_full_name() if customer.user else 'Unknown'
            )
            subtitle_parts = []
            if customer.user and customer.user.email:
                subtitle_parts.append(customer.user.email)
            if customer.user and customer.user.phone:
                subtitle_parts.append(customer.user.phone)
            if customer.company_name:
                subtitle_parts.append(customer.company_name)
            
            results.append({
                'type': 'customer',
                'id': customer.id,
                'title': customer_name,
                'subtitle': ' • '.join(subtitle_parts) if subtitle_parts else 'No contact info',
                'url': f'/customers/{customer.id}/',
                'status': customer.status if hasattr(customer, 'status') else None,
            })
    
    if search_type in ['all', 'vehicles']:
        if query:
            vehicles = Vehicle.objects.select_related('owner', 'owner__user').filter(
                Q(make__icontains=query) |
                Q(model__icontains=query) |
                Q(license_plate__icontains=query) |
                Q(vin__icontains=query)
            )[:5]
        else:
            # Empty query for specific type - return all
            vehicles = Vehicle.objects.select_related('owner', 'owner__user').order_by('-created_at')[:10]
        
        for vehicle in vehicles:
            owner_name = 'Unknown'
            if vehicle.owner and hasattr(vehicle.owner, 'user'):
                owner_name = vehicle.owner.user.get_full_name() or vehicle.owner.user.email
            elif vehicle.owner and hasattr(vehicle.owner, 'company_name'):
                owner_name = vehicle.owner.company_name or vehicle.owner.full_name
            
            results.append({
                'type': 'vehicle',
                'id': vehicle.id,
                'title': f'{vehicle.year or ""} {vehicle.make or ""} {vehicle.model or ""}'.strip(),
                'subtitle': f'{vehicle.license_plate or "No plate"} • {owner_name}',
                'url': f'/vehicles/{vehicle.id}/',
                'status': vehicle.status if hasattr(vehicle, 'status') else None,
            })
    
    if search_type in ['all', 'appointments']:
        from apps.appointments.models import Appointment
        # Base query with branch filtering
        appointments_qs = Appointment.objects.select_related('customer', 'customer__user', 'vehicle')
        appointments_qs = filter_queryset_for_user_branches(appointments_qs, request.user, request)
        
        if query:
            appointments = appointments_qs.filter(
                Q(customer__user__first_name__icontains=query) |
                Q(customer__user__last_name__icontains=query) |
                Q(customer__user__email__icontains=query) |
                Q(vehicle__make__icontains=query) |
                Q(vehicle__model__icontains=query) |
                Q(vehicle__license_plate__icontains=query) |
                Q(vehicle__vin__icontains=query) |
                Q(service_type__icontains=query) |
                Q(customer_concerns__icontains=query) |
                Q(special_instructions__icontains=query) |
                Q(appointment_number__icontains=query)
            ).order_by('-appointment_date', '-appointment_time')[:5]
        else:
            # Empty query for specific type - return all
            appointments = appointments_qs.order_by('-appointment_date', '-appointment_time')[:10]
        
        for apt in appointments:
            customer_name = apt.customer.full_name if hasattr(apt.customer, 'full_name') else (
                apt.customer.user.get_full_name() if apt.customer and apt.customer.user else 'Unknown'
            )
            vehicle_info = f'{apt.vehicle.year or ""} {apt.vehicle.make or ""} {apt.vehicle.model or ""}'.strip() if apt.vehicle else 'No vehicle'
            
            results.append({
                'type': 'appointment',
                'id': apt.id,
                'title': f'{customer_name} - {apt.service_type or "Service"}',
                'subtitle': f'{apt.appointment_date} at {apt.appointment_time} • {vehicle_info}',
                'url': f'/appointments/{apt.id}/',
                'status': apt.status if hasattr(apt, 'status') else None,
            })
    
    if search_type in ['all', 'invoices']:
        from apps.billing.models import Invoice
        # Base query with branch filtering
        invoices_qs = Invoice.objects.select_related('customer', 'customer__user')
        invoices_qs = filter_queryset_for_user_branches(invoices_qs, request.user, request)
        
        if query:
            invoices = invoices_qs.filter(
                Q(invoice_number__icontains=query) |
                Q(customer__user__first_name__icontains=query) |
                Q(customer__user__last_name__icontains=query) |
                Q(customer__user__email__icontains=query) |
                Q(customer__company_name__icontains=query)
            ).order_by('-invoice_date')[:5]
        else:
            # Empty query for specific type - return all
            invoices = invoices_qs.order_by('-invoice_date')[:10]
        
        for inv in invoices:
            customer_name = inv.customer.full_name if hasattr(inv.customer, 'full_name') else (
                inv.customer.user.get_full_name() if inv.customer and inv.customer.user else 'Unknown'
            )
            
            results.append({
                'type': 'invoice',
                'id': inv.id,
                'title': f'{inv.invoice_number} - {customer_name}',
                'subtitle': f'${float(inv.total or 0):.2f} • {inv.invoice_date}',
                'url': f'/billing/invoices/{inv.id}/',
                'status': inv.status if hasattr(inv, 'status') else None,
            })
    
    if search_type in ['all', 'parts']:
        from apps.inventory.models import Part
        if query:
            parts = Part.objects.select_related('category').filter(
                Q(part_number__icontains=query) |
                Q(name__icontains=query) |
                Q(description__icontains=query) |
                Q(manufacturer__icontains=query) |
                Q(manufacturer_part_number__icontains=query)
            )[:5]
        else:
            # Empty query for specific type - return all
            parts = Part.objects.select_related('category').filter(is_active=True).order_by('part_number')[:10]
        
        for part in parts:
            category_name = part.category.name if part.category else 'Uncategorized'
            stock_status = f'{part.quantity_in_stock or 0} in stock'
            
            results.append({
                'type': 'part',
                'id': part.id,
                'title': f'{part.part_number} - {part.name}',
                'subtitle': f'{category_name} • {stock_status}',
                'url': f'/inventory/{part.id}/',
                'status': 'low_stock' if part.is_low_stock else 'in_stock' if (part.quantity_in_stock or 0) > 0 else 'out_of_stock',
            })
    
    logger.info(f"Returning {len(results)} total results")
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