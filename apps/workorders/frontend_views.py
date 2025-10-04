from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.core.paginator import Paginator
from django.db.models import Q, Count, Sum, F, Max
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
import json
import csv
from datetime import datetime, timedelta

from .models import (
    WorkOrder, ServiceTask, WorkOrderPart, 
    TechnicianTimeLog, WorkOrderNote, WorkOrderPhoto
)
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.accounts.models import User


@login_required
def workorder_list_view(request):
    """
    Work order list with filtering and search
    """
    workorders = WorkOrder.objects.select_related(
        'customer', 'vehicle', 'primary_technician'
    ).prefetch_related('assigned_technicians', 'tasks', 'parts').annotate(
        completed_tasks_count=Count('tasks', filter=Q(tasks__status='completed')),
        total_parts_quantity=Sum('parts__quantity'),
        total_hours=Sum('time_logs__duration_hours'),
        total_labor_cost=Sum('time_logs__labor_cost')
    )
    
    # Apply filters
    status_filter = request.GET.get('status')
    priority_filter = request.GET.get('priority')
    technician_filter = request.GET.get('technician')
    search_query = request.GET.get('search')
    
    if status_filter:
        workorders = workorders.filter(status=status_filter)
    
    if priority_filter:
        workorders = workorders.filter(priority=priority_filter)
    
    if technician_filter:
        workorders = workorders.filter(primary_technician__id=technician_filter)
    
    if search_query:
        workorders = workorders.filter(
            Q(work_order_number__icontains=search_query) |
            Q(customer__user__first_name__icontains=search_query) |
            Q(customer__user__last_name__icontains=search_query) |
            Q(vehicle__make__icontains=search_query) |
            Q(vehicle__model__icontains=search_query) |
            Q(vehicle__license_plate__icontains=search_query) |
            Q(customer_concerns__icontains=search_query)
        )
    
    # Add annotations for counts
    workorders = workorders.annotate(
        task_count=Count('tasks'),
        parts_count=Count('parts'),
        total_labor_hours=Sum('tasks__actual_hours')
    )
    
    # Pagination
    paginator = Paginator(workorders, 20)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    # Get filter options
    technicians = User.objects.filter(role__in=['technician', 'manager']).order_by('first_name')
    
    context = {
        'page_obj': page_obj,
        'workorders': page_obj,
        'status_choices': WorkOrder.STATUS_CHOICES,
        'priority_choices': WorkOrder.PRIORITY_CHOICES,
        'technicians': technicians,
        'current_filters': {
            'status': status_filter,
            'priority': priority_filter,
            'technician': technician_filter,
            'search': search_query,
        }
    }
    
    return render(request, 'workorders/workorder_list.html', context)


@login_required
def workorder_kanban_view(request):
    """
    Kanban board view of work orders
    """
    # Get work orders grouped by status
    workorders = WorkOrder.objects.select_related(
        'customer', 'vehicle', 'primary_technician'
    ).prefetch_related('assigned_technicians', 'tasks', 'parts').annotate(
        completed_tasks_count=Count('tasks', filter=Q(tasks__status='completed')),
        task_count=Count('tasks'),
        total_parts_quantity=Sum('parts__quantity'),
        total_hours=Sum('time_logs__duration_hours'),
        total_labor_cost=Sum('time_logs__labor_cost')
    )
    
    # Apply filters
    technician_filter = request.GET.get('technician')
    priority_filter = request.GET.get('priority')
    
    if technician_filter:
        workorders = workorders.filter(primary_technician__id=technician_filter)
    
    if priority_filter:
        workorders = workorders.filter(priority=priority_filter)
    
    # Group by status
    status_groups = {}
    for status_code, status_label in WorkOrder.STATUS_CHOICES:
        status_workorders = workorders.filter(status=status_code).annotate(
            task_count=Count('tasks'),
            completed_tasks=Count('tasks', filter=Q(tasks__status='completed'))
        )
        status_groups[status_code] = {
            'label': status_label,
            'workorders': status_workorders,
            'count': status_workorders.count()
        }
    
    # Get filter options
    technicians = User.objects.filter(role__in=['technician', 'manager']).order_by('first_name')
    
    context = {
        'status_groups': status_groups,
        'priority_choices': WorkOrder.PRIORITY_CHOICES,
        'technicians': technicians,
        'current_filters': {
            'technician': technician_filter,
            'priority': priority_filter,
        }
    }
    
    return render(request, 'workorders/workorder_kanban.html', context)


@login_required
def workorder_detail_view(request, pk):
    """
    Work order detail view with all related data
    """
    workorder = get_object_or_404(
        WorkOrder.objects.select_related(
            'customer', 'vehicle', 'appointment', 'primary_technician', 'created_by'
        ).prefetch_related(
            'assigned_technicians', 'tasks__assigned_to', 'parts',
            'time_logs__technician', 'notes__created_by', 'photos'
        ).annotate(
            completed_tasks_count=Count('tasks', filter=Q(tasks__status='completed')),
            task_count=Count('tasks'),
            total_parts_quantity=Sum('parts__quantity'),
            total_hours=Sum('time_logs__duration_hours'),
            total_labor_cost=Sum('time_logs__labor_cost')
        ),
        pk=pk
    )
    
    # Calculate totals and statistics
    total_estimated_hours = workorder.tasks.aggregate(
        total=Sum('estimated_hours')
    )['total'] or 0
    
    total_actual_hours = workorder.tasks.aggregate(
        total=Sum('actual_hours')
    )['total'] or 0
    
    total_labor_cost = workorder.tasks.aggregate(
        total=Sum('labor_cost')
    )['total'] or 0
    
    total_parts_cost = workorder.parts.aggregate(
        total=Sum('selling_price')
    )['total'] or 0
    
    # Get recent activity (notes, task updates, etc.)
    recent_notes = workorder.notes.select_related('created_by').order_by('-created_at')[:5]
    recent_time_logs = workorder.time_logs.select_related('technician').order_by('-created_at')[:5]
    
    # Get technicians for task assignment
    technicians = User.objects.filter(role__in=['technician', 'manager']).order_by('first_name')
    
    context = {
        'workorder': workorder,
        'total_estimated_hours': total_estimated_hours,
        'total_actual_hours': total_actual_hours,
        'total_labor_cost': total_labor_cost,
        'total_parts_cost': total_parts_cost,
        'recent_notes': recent_notes,
        'recent_time_logs': recent_time_logs,
        'technicians': technicians,
        'can_edit': request.user.role in ['admin', 'manager', 'receptionist'],
        'can_work': request.user.role in ['technician', 'manager'],
    }
    
    return render(request, 'workorders/workorder_detail.html', context)


@login_required
def workorder_create_view(request):
    """
    Create new work order
    """
    customers = Customer.objects.select_related('user').order_by('user__first_name')
    vehicles = Vehicle.objects.select_related('owner').order_by('make', 'model')
    technicians = User.objects.filter(role__in=['technician', 'manager']).order_by('first_name')
    
    if request.method == 'POST':
        try:
            # Create work order
            workorder = WorkOrder.objects.create(
                customer_id=request.POST.get('customer'),
                vehicle_id=request.POST.get('vehicle'),
                primary_technician_id=request.POST.get('primary_technician'),
                priority=request.POST.get('priority', 'normal'),
                customer_concerns=request.POST.get('customer_concerns', ''),
                special_instructions=request.POST.get('special_instructions', ''),
                odometer_in=request.POST.get('odometer_in') or 0,
                estimated_completion=request.POST.get('estimated_completion') or None,
                created_by=request.user
            )
            
            # Add assigned technicians
            assigned_technician_ids = request.POST.getlist('assigned_technicians')
            if assigned_technician_ids:
                workorder.assigned_technicians.set(assigned_technician_ids)
            
            messages.success(request, f'Work order {workorder.work_order_number} created successfully!')
            return redirect('workorders:detail', pk=workorder.pk)
            
        except Exception as e:
            messages.error(request, f'Error creating work order: {str(e)}')
    
    context = {
        'customers': customers,
        'vehicles': vehicles,
        'technicians': technicians,
        'priority_choices': WorkOrder.PRIORITY_CHOICES,
    }
    
    return render(request, 'workorders/workorder_create.html', context)


@login_required
def workorder_edit_view(request, pk):
    """
    Edit work order
    """
    workorder = get_object_or_404(WorkOrder, pk=pk)
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to edit work orders.')
        return redirect('workorders:detail', pk=workorder.pk)
    
    customers = Customer.objects.select_related('user').order_by('user__first_name')
    vehicles = Vehicle.objects.select_related('owner').order_by('make', 'model')
    technicians = User.objects.filter(role__in=['technician', 'manager']).order_by('first_name')
    
    if request.method == 'POST':
        try:
            # Update work order
            workorder.customer_id = request.POST.get('customer')
            workorder.vehicle_id = request.POST.get('vehicle')
            workorder.primary_technician_id = request.POST.get('primary_technician')
            workorder.priority = request.POST.get('priority', 'normal')
            workorder.status = request.POST.get('status', workorder.status)
            workorder.customer_concerns = request.POST.get('customer_concerns', '')
            workorder.special_instructions = request.POST.get('special_instructions', '')
            workorder.diagnosis_notes = request.POST.get('diagnosis_notes', '')
            odometer_in = request.POST.get('odometer_in')
            if odometer_in:
                workorder.odometer_in = int(odometer_in)
            workorder.estimated_completion = request.POST.get('estimated_completion') or None
            
            workorder.save()
            
            # Update assigned technicians
            assigned_technician_ids = request.POST.getlist('assigned_technicians')
            workorder.assigned_technicians.set(assigned_technician_ids)
            
            messages.success(request, f'Work order {workorder.work_order_number} updated successfully!')
            return redirect('workorders:detail', pk=workorder.pk)
            
        except Exception as e:
            messages.error(request, f'Error updating work order: {str(e)}')
    
    context = {
        'workorder': workorder,
        'customers': customers,
        'vehicles': vehicles,
        'technicians': technicians,
        'priority_choices': WorkOrder.PRIORITY_CHOICES,
        'status_choices': WorkOrder.STATUS_CHOICES,
    }
    
    return render(request, 'workorders/workorder_edit.html', context)


@login_required
def workorder_print_view(request, pk):
    """
    Printable work order view
    """
    workorder = get_object_or_404(
        WorkOrder.objects.select_related(
            'customer', 'vehicle', 'primary_technician'
        ).prefetch_related(
            'assigned_technicians', 'tasks', 'parts', 'time_logs'
        ),
        pk=pk
    )
    
    # Calculate totals
    total_labor_cost = workorder.tasks.aggregate(Sum('labor_cost'))['labor_cost__sum'] or 0
    total_parts_cost = workorder.parts.aggregate(Sum('selling_price'))['selling_price__sum'] or 0
    total_hours = workorder.tasks.aggregate(Sum('actual_hours'))['actual_hours__sum'] or 0
    
    context = {
        'workorder': workorder,
        'total_labor_cost': total_labor_cost,
        'total_parts_cost': total_parts_cost,
        'total_hours': total_hours,
        'print_date': timezone.now(),
    }
    
    return render(request, 'workorders/workorder_print.html', context)


# AJAX Views for dynamic updates

@login_required
def update_workorder_status(request, pk):
    """
    AJAX endpoint to update work order status
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    workorder = get_object_or_404(WorkOrder, pk=pk)
    new_status = request.POST.get('status')
    
    if new_status not in dict(WorkOrder.STATUS_CHOICES):
        return JsonResponse({'error': 'Invalid status'}, status=400)
    
    old_status = workorder.status
    workorder.status = new_status
    
    # Update timestamps based on status
    now = timezone.now()
    if new_status == 'in_progress' and not workorder.started_at:
        workorder.started_at = now
    elif new_status == 'completed' and not workorder.completed_at:
        workorder.completed_at = now
    
    workorder.save()
    
    # Create note for status change
    WorkOrderNote.objects.create(
        work_order=workorder,
        note_type='internal',
        note=f'Status changed from {old_status} to {new_status}',
        created_by=request.user
    )
    
    return JsonResponse({
        'success': True,
        'status': new_status,
        'status_display': workorder.get_status_display()
    })


@login_required
def get_customer_vehicles(request, customer_id):
    """
    AJAX endpoint to get vehicles for a customer
    """
    vehicles = Vehicle.objects.filter(owner_id=customer_id).values(
        'id', 'make', 'model', 'year', 'license_plate', 'vin'
    )
    
    vehicle_list = []
    for vehicle in vehicles:
        vehicle_list.append({
            'id': vehicle['id'],
            'display': f"{vehicle['year']} {vehicle['make']} {vehicle['model']} - {vehicle['license_plate']}",
            'vin': vehicle['vin']
        })
    
    return JsonResponse({'vehicles': vehicle_list})


@login_required
def add_workorder_note(request, pk):
    """
    AJAX endpoint to add a note to work order
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    workorder = get_object_or_404(WorkOrder, pk=pk)
    
    try:
        data = json.loads(request.body)
        note_type = data.get('note_type', 'general')
        note_text = data.get('note', '').strip()
        is_important = data.get('is_important', False)
        is_customer_visible = data.get('is_customer_visible', False)
        
        if not note_text:
            return JsonResponse({'error': 'Note text is required'}, status=400)
        
        note = WorkOrderNote.objects.create(
            work_order=workorder,
            note_type=note_type,
            note=note_text,
            is_important=is_important,
            is_customer_visible=is_customer_visible,
            created_by=request.user
        )
        
        return JsonResponse({
            'success': True,
            'note': {
                'id': note.id,
                'note_type': note.get_note_type_display(),
                'note': note.note,
                'is_important': note.is_important,
                'is_customer_visible': note.is_customer_visible,
                'created_by': f"{note.created_by.first_name} {note.created_by.last_name}",
                'created_at': note.created_at.strftime('%Y-%m-%d %H:%M')
            }
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def technician_time_clock(request, pk):
    """
    AJAX endpoint for technician time clock in/out
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    workorder = get_object_or_404(WorkOrder, pk=pk)
    
    try:
        data = json.loads(request.body)
        action = data.get('action')  # 'clock_in' or 'clock_out'
        task_id = data.get('task_id')  # optional
        description = data.get('description', '')
        
        if action == 'clock_in':
            # Check if already clocked in
            active_log = TechnicianTimeLog.objects.filter(
                work_order=workorder,
                technician=request.user,
                clock_out__isnull=True
            ).first()
            
            if active_log:
                return JsonResponse({'error': 'Already clocked in'}, status=400)
            
            time_log = TechnicianTimeLog.objects.create(
                work_order=workorder,
                task_id=task_id if task_id else None,
                technician=request.user,
                clock_in=timezone.now(),
                description=description,
                hourly_rate=request.user.hourly_rate if hasattr(request.user, 'hourly_rate') else 0
            )
            
            return JsonResponse({
                'success': True,
                'action': 'clocked_in',
                'time_log_id': time_log.id,
                'clock_in': time_log.clock_in.strftime('%Y-%m-%d %H:%M:%S')
            })
            
        elif action == 'clock_out':
            time_log_id = data.get('time_log_id')
            if time_log_id:
                time_log = get_object_or_404(TechnicianTimeLog, id=time_log_id, technician=request.user)
            else:
                # Find active time log
                time_log = TechnicianTimeLog.objects.filter(
                    work_order=workorder,
                    technician=request.user,
                    clock_out__isnull=True
                ).first()
                
            if not time_log:
                return JsonResponse({'error': 'No active time log found'}, status=400)
            
            time_log.clock_out = timezone.now()
            time_log.notes = data.get('notes', '')
            time_log.save()  # This will trigger duration and cost calculation
            
            return JsonResponse({
                'success': True,
                'action': 'clocked_out',
                'duration_hours': float(time_log.duration_hours),
                'labor_cost': float(time_log.labor_cost)
            })
            
        else:
            return JsonResponse({'error': 'Invalid action'}, status=400)
            
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def workorder_export_view(request):
    """
    Export work orders to CSV or PDF format
    """
    format_type = request.GET.get('format', 'csv').lower()
    
    # Get work orders with select_related for efficiency
    workorders = WorkOrder.objects.select_related(
        'customer', 'vehicle', 'primary_technician'
    ).annotate(
        completed_tasks_count=Count('tasks', filter=Q(tasks__status='completed')),
        task_count=Count('tasks'),
        total_parts_quantity=Sum('parts__quantity'),
        total_hours=Sum('time_logs__duration_hours'),
        total_labor_cost=Sum('time_logs__labor_cost')
    ).all()
    
    # Apply filters if provided
    status = request.GET.get('status')
    priority = request.GET.get('priority')
    date_from = request.GET.get('date_from')
    date_to = request.GET.get('date_to')
    
    if status:
        workorders = workorders.filter(status=status)
    
    if priority:
        workorders = workorders.filter(priority=priority)
    
    if date_from:
        workorders = workorders.filter(created_at__date__gte=date_from)
    
    if date_to:
        workorders = workorders.filter(created_at__date__lte=date_to)
    
    if format_type == 'csv':
        return export_workorders_csv(workorders)
    else:
        return JsonResponse({'error': 'Invalid format. Use csv.'}, status=400)


def export_workorders_csv(workorders):
    """Export work orders to CSV format"""
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="workorders_export.csv"'
    
    writer = csv.writer(response)
    
    # Write header
    writer.writerow([
        'Work Order #',
        'Status',
        'Priority',
        'Customer',
        'Vehicle',
        'Primary Technician',
        'Created Date',
        'Started Date',
        'Completed Date',
        'Customer Concerns',
        'Estimated Total',
        'Actual Total',
        'Task Count',
        'Parts Count'
    ])
    
    # Write data
    for wo in workorders:
        customer_name = f"{wo.customer.user.first_name} {wo.customer.user.last_name}" if wo.customer else "N/A"
        vehicle_info = f"{wo.vehicle.year} {wo.vehicle.make} {wo.vehicle.model}" if wo.vehicle else "N/A"
        tech_name = f"{wo.primary_technician.first_name} {wo.primary_technician.last_name}" if wo.primary_technician else "N/A"
        
        writer.writerow([
            wo.work_order_number,
            wo.get_status_display(),
            wo.get_priority_display(),
            customer_name,
            vehicle_info,
            tech_name,
            wo.created_at.strftime('%Y-%m-%d %H:%M') if wo.created_at else '',
            wo.started_at.strftime('%Y-%m-%d %H:%M') if wo.started_at else '',
            wo.completed_at.strftime('%Y-%m-%d %H:%M') if wo.completed_at else '',
            wo.customer_concerns or '',
            wo.estimated_total or '',
            wo.actual_total or '',
            wo.tasks.count(),
            wo.parts.count()
        ])
    
    return response


@login_required
@require_http_methods(["POST"])
def add_task(request, pk):
    """
    Add a new service task to a work order
    """
    workorder = get_object_or_404(WorkOrder, pk=pk)
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'technician']:
        return JsonResponse({'success': False, 'error': 'Permission denied'})
    
    try:
        task_type = request.POST.get('task_type', 'repair')
        description = request.POST.get('description', '').strip()
        detailed_notes = request.POST.get('detailed_notes', '').strip()
        assigned_to_id = request.POST.get('assigned_to')
        estimated_hours = request.POST.get('estimated_hours', 0)
        labor_rate = request.POST.get('labor_rate', 0)
        
        if not description:
            return JsonResponse({'success': False, 'error': 'Description is required'})
        
        # Get next sequence order
        max_sequence = workorder.tasks.aggregate(max_seq=Max('sequence_order'))['max_seq']
        next_sequence = (max_sequence or 0) + 1
        
        # Create task
        task = ServiceTask.objects.create(
            work_order=workorder,
            task_type=task_type,
            description=description,
            detailed_notes=detailed_notes,
            assigned_to_id=assigned_to_id if assigned_to_id else None,
            estimated_hours=float(estimated_hours) if estimated_hours else 0,
            labor_rate=float(labor_rate) if labor_rate else 0,
            sequence_order=next_sequence
        )
        
        return JsonResponse({
            'success': True, 
            'message': f'Task "{task.description}" added successfully',
            'task_id': task.id
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@login_required
@require_http_methods(["POST"])
def update_task_status(request, pk, task_id):
    """
    Update the status of a service task
    """
    workorder = get_object_or_404(WorkOrder, pk=pk)
    task = get_object_or_404(ServiceTask, id=task_id, work_order=workorder)
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'technician']:
        return JsonResponse({'success': False, 'error': 'Permission denied'})
    
    try:
        new_status = request.POST.get('status')
        if new_status not in dict(ServiceTask.STATUS_CHOICES):
            return JsonResponse({'success': False, 'error': 'Invalid status'})
        
        # Update timestamps based on status
        if new_status == 'in_progress' and task.status != 'in_progress':
            task.started_at = timezone.now()
        elif new_status == 'completed' and task.status != 'completed':
            task.completed_at = timezone.now()
            # If no actual hours recorded, use estimated hours
            if task.actual_hours == 0 and task.estimated_hours > 0:
                task.actual_hours = task.estimated_hours
        
        task.status = new_status
        task.save()
        
        return JsonResponse({
            'success': True,
            'message': f'Task status updated to {task.get_status_display()}'
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@login_required
@require_http_methods(["POST"])
def delete_task(request, pk, task_id):
    """
    Delete a service task
    """
    workorder = get_object_or_404(WorkOrder, pk=pk)
    task = get_object_or_404(ServiceTask, id=task_id, work_order=workorder)
    
    # Check permissions
    if request.user.role not in ['admin', 'manager']:
        return JsonResponse({'success': False, 'error': 'Permission denied'})
    
    try:
        task_description = task.description
        task.delete()
        
        return JsonResponse({
            'success': True,
            'message': f'Task "{task_description}" deleted successfully'
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})