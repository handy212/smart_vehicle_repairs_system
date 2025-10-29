"""
Frontend views for Vehicle Inspections
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.db.models import Q, Count, Avg
from django.utils import timezone
from .models import VehicleInspection, InspectionTemplate, InspectionItem, InspectionResult, InspectionCategory
from .forms import InspectionForm, InspectionCategoryForm, InspectionItemForm
from apps.vehicles.models import Vehicle
from apps.accounts.models import User


@login_required
def inspection_list(request):
    """List all inspections with filters"""
    inspections = VehicleInspection.objects.select_related(
        'vehicle', 'vehicle__owner__user', 'performed_by', 'template'
    ).all()
    
    # Filters
    status = request.GET.get('status')
    template_id = request.GET.get('template')
    technician_id = request.GET.get('technician')
    search = request.GET.get('search')
    
    if status:
        inspections = inspections.filter(status=status)
    if template_id:
        inspections = inspections.filter(template_id=template_id)
    if technician_id:
        inspections = inspections.filter(performed_by_id=technician_id)
    if search:
        inspections = inspections.filter(
            Q(vehicle__vin__icontains=search) |
            Q(vehicle__make__icontains=search) |
            Q(vehicle__model__icontains=search) |
            Q(vehicle__owner__user__first_name__icontains=search) |
            Q(vehicle__owner__user__last_name__icontains=search)
        )
    
    # Order by newest first
    inspections = inspections.order_by('-inspection_date', '-created_at')
    
    # Get filter options
    templates = InspectionTemplate.objects.filter(is_active=True)
    technicians = User.objects.filter(role='technician', is_active=True)
    
    context = {
        'inspections': inspections,
        'templates': templates,
        'technicians': technicians,
        'current_status': status,
        'current_template': template_id,
        'current_technician': technician_id,
        'search_query': search,
    }
    
    return render(request, 'inspections/inspection_list.html', context)


@login_required
def inspection_start(request):
    """Start an inspection from a work order"""
    workorder_id = request.GET.get('workorder')
    
    if not workorder_id:
        messages.error(request, 'No work order specified.')
        return redirect('inspections:inspection-list')
    
    try:
        from apps.workorders.models import WorkOrder
        workorder = get_object_or_404(WorkOrder, pk=workorder_id)
        
        # Redirect to create inspection with pre-filled customer and vehicle
        return redirect(f"/inspections/create/?customer={workorder.customer.id}&vehicle={workorder.vehicle.id}&workorder={workorder_id}")
    
    except Exception as e:
        messages.error(request, f'Error starting inspection: {str(e)}')
        return redirect('workorders:detail', pk=workorder_id)


@login_required
def inspection_create(request):
    """Create a new inspection"""
    from django.utils import timezone
    from apps.customers.models import Customer
    
    if request.method == 'POST':
        form = InspectionForm(request.POST)
        
        if form.is_valid():
            try:
                # Create inspection with form data
                inspection = form.save(commit=False)
                
                # Process vehicle damage data
                vehicle_damage_json = request.POST.get('vehicle_damage', '')
                if vehicle_damage_json:
                    try:
                        import json
                        inspection.vehicle_damage = json.loads(vehicle_damage_json)
                    except json.JSONDecodeError:
                        inspection.vehicle_damage = []
                
                inspection.save()
                
                # Create inspection results for each item in the template
                template = inspection.template
                
                # Items are accessed through categories
                categories = template.categories.all()
                for category in categories:
                    for item in category.items.all():
                        item_key = f'item_{item.id}'
                        result = request.POST.get(item_key, 'pass')
                        notes = request.POST.get(f'notes_{item.id}', '')
                        
                        InspectionResult.objects.create(
                            inspection=inspection,
                            inspection_item=item,
                            result=result,
                            notes=notes
                        )
                
                # Update inspection status based on whether items were completed
                if categories.exists():
                    inspection.status = 'completed'
                else:
                    inspection.status = 'draft'
                inspection.save()
                
                # If this inspection is linked to a work order, update the work order
                workorder_id = request.POST.get('workorder_id')
                if workorder_id:
                    try:
                        from apps.workorders.models import WorkOrder
                        workorder = WorkOrder.objects.get(pk=workorder_id)
                        workorder.inspection_completed = True
                        workorder.status = 'intake'  # Move to intake after inspection
                        workorder.save()
                        messages.success(request, f'Inspection created successfully! Work Order {workorder.work_order_number} updated to Intake.')
                        return redirect('workorders:detail', pk=workorder.id)
                    except WorkOrder.DoesNotExist:
                        pass
                
                messages.success(request, 'Inspection created successfully!')
                return redirect('inspections:inspection-detail', pk=inspection.id)
                
            except Exception as e:
                messages.error(request, f'Error creating inspection: {str(e)}')
        else:
            messages.error(request, 'Please correct the errors below.')
    else:
        # GET request - create empty form with auto-filled date
        initial_data = {
            'performed_by': request.user,
            'inspection_date': timezone.now()  # Auto-fill current date/time
        }
        
        # Pre-fill customer if provided in query parameters
        customer_id = request.GET.get('customer')
        if customer_id:
            try:
                customer = Customer.objects.get(pk=customer_id)
                initial_data['customer'] = customer
            except Customer.DoesNotExist:
                pass
        
        # Pre-fill vehicle if provided in query parameters
        vehicle_id = request.GET.get('vehicle')
        if vehicle_id:
            try:
                vehicle = Vehicle.objects.get(pk=vehicle_id)
                initial_data['vehicle'] = vehicle
            except Vehicle.DoesNotExist:
                pass
        
        form = InspectionForm(initial=initial_data)
    
    # Get templates and customers for the form
    templates = InspectionTemplate.objects.filter(is_active=True).prefetch_related('categories__items')
    customers = Customer.objects.select_related('user').filter(user__is_active=True).order_by('user__first_name')
    
    # Get work order ID if provided (to link back after inspection)
    workorder_id = request.GET.get('workorder')
    workorder = None
    if workorder_id:
        try:
            from apps.workorders.models import WorkOrder
            workorder = WorkOrder.objects.select_related('customer__user', 'vehicle').get(pk=workorder_id)
        except:
            pass
    
    context = {
        'form': form,
        'templates': templates,
        'customers': customers,
        'workorder_id': workorder_id,
        'workorder': workorder,
    }
    
    return render(request, 'inspections/inspection_form_new.html', context)


@login_required
def inspection_detail(request, pk):
    """View inspection details"""
    inspection = get_object_or_404(
        VehicleInspection.objects.select_related(
            'vehicle', 'vehicle__owner__user', 'performed_by', 'template'
        ).prefetch_related('results', 'results__inspection_item'),
        pk=pk
    )
    
    # Calculate pass/fail counts
    results = inspection.results.all()
    pass_count = results.filter(result='pass').count()
    fail_count = results.filter(result='fail').count()
    advisory_count = results.filter(result='advisory').count()
    
    # Create a dictionary mapping item IDs to results for easy template access
    results_by_item = {result.inspection_item_id: result for result in results}
    
    context = {
        'inspection': inspection,
        'pass_count': pass_count,
        'fail_count': fail_count,
        'advisory_count': advisory_count,
        'results_by_item': results_by_item,
    }
    
    return render(request, 'inspections/inspection_detail.html', context)


@login_required
def inspection_edit(request, pk):
    """Edit an existing inspection"""
    inspection = get_object_or_404(VehicleInspection, pk=pk)
    
    if request.method == 'POST':
        form = InspectionForm(request.POST, instance=inspection)
        
        if form.is_valid():
            try:
                # Save form data
                inspection = form.save()
                
                # Update results
                for result in inspection.results.all():
                    result_value = request.POST.get(f'item_{result.inspection_item_id}')
                    notes_value = request.POST.get(f'notes_{result.inspection_item_id}', '')
                    
                    if result_value:
                        result.result = result_value
                        result.notes = notes_value
                        result.save()
                
                messages.success(request, 'Inspection updated successfully!')
                return redirect('inspections:inspection-detail', pk=inspection.id)
                
            except Exception as e:
                messages.error(request, f'Error updating inspection: {str(e)}')
        else:
            messages.error(request, 'Please correct the errors below.')
    else:
        # GET request - populate form with existing data
        form = InspectionForm(instance=inspection)
    
    # Get templates for dynamic loading of inspection items
    templates = InspectionTemplate.objects.filter(is_active=True)
    
    context = {
        'form': form,
        'templates': templates,
        'inspection': inspection,
        'is_edit': True,
    }
    
    return render(request, 'inspections/inspection_form_new.html', context)


@login_required
def inspection_delete(request, pk):
    """Delete an inspection"""
    inspection = get_object_or_404(VehicleInspection, pk=pk)
    
    if request.method == 'POST':
        inspection.delete()
        messages.success(request, 'Inspection deleted successfully!')
        return redirect('inspections:inspection-list')
    
    return redirect('inspections:inspection-detail', pk=pk)


@login_required
def inspection_print(request, pk):
    """Print-friendly inspection view"""
    inspection = get_object_or_404(
        VehicleInspection.objects.select_related(
            'vehicle', 'vehicle__owner', 'performed_by', 'template'
        ).prefetch_related('results', 'results__inspection_item'),
        pk=pk
    )
    
    # Calculate pass/fail counts
    results = inspection.results.all()
    pass_count = results.filter(result='pass').count()
    fail_count = results.filter(result='fail').count()
    warning_count = results.filter(result='warning').count()
    
    # Create results_by_item dictionary for easy lookup
    results_by_item = {}
    for result in results:
        results_by_item[result.inspection_item_id] = result
    
    context = {
        'inspection': inspection,
        'pass_count': pass_count,
        'fail_count': fail_count,
        'warning_count': warning_count,
        'results_by_item': results_by_item,
    }
    
    return render(request, 'inspections/inspection_print_clean.html', context)


@login_required
def inspection_pdf(request, pk):
    """Generate PDF for inspection"""
    try:
        from weasyprint import HTML
        from django.template.loader import render_to_string
        
        inspection = get_object_or_404(
            VehicleInspection.objects.select_related(
                'vehicle', 'vehicle__owner', 'performed_by', 'template'
            ).prefetch_related('results', 'results__inspection_item'),
            pk=pk
        )
        
        # Calculate pass/fail counts
        results = inspection.results.all()
        pass_count = results.filter(result='pass').count()
        fail_count = results.filter(result='fail').count()
        warning_count = results.filter(result='warning').count()
        
        # Create results_by_item dictionary for easy lookup
        results_by_item = {}
        for result in results:
            results_by_item[result.inspection_item_id] = result
        
        context = {
            'inspection': inspection,
            'pass_count': pass_count,
            'fail_count': fail_count,
            'warning_count': warning_count,
            'results_by_item': results_by_item,
        }
        
        # Render template to HTML
        html_string = render_to_string('inspections/inspection_print_clean.html', context)
        
        # Generate PDF
        pdf = HTML(string=html_string).write_pdf()
        
        # Return PDF response
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="inspection_{inspection.id}.pdf"'
        return response
        
    except ImportError:
        messages.error(request, 'PDF generation requires WeasyPrint. Please install it: pip install weasyprint')
        return redirect('inspections:inspection-print', pk=pk)
    except Exception as e:
        messages.error(request, f'Error generating PDF: {str(e)}')
        return redirect('inspections:inspection-print', pk=pk)


@login_required
def template_list(request):
    """List all inspection templates"""
    templates = InspectionTemplate.objects.annotate(
        category_count=Count('categories', distinct=True),
        item_count=Count('categories__items', distinct=True)
    ).all()
    
    context = {
        'templates': templates,
    }
    
    return render(request, 'inspections/template_list.html', context)


@login_required
def template_detail(request, pk):
    """View template details"""
    template = get_object_or_404(
        InspectionTemplate.objects.prefetch_related(
            'categories', 'categories__items'
        ),
        pk=pk
    )
    
    context = {
        'template': template,
    }
    
    return render(request, 'inspections/template_detail.html', context)


@login_required
def template_edit(request, pk):
    """Edit inspection template"""
    template = get_object_or_404(InspectionTemplate, pk=pk)
    
    if request.method == 'POST':
        # Handle template editing
        template.name = request.POST.get('name', template.name)
        template.description = request.POST.get('description', template.description)
        template.is_active = request.POST.get('is_active') == 'on'
        template.is_default = request.POST.get('is_default') == 'on'
        template.requires_odometer = request.POST.get('requires_odometer') == 'on'
        template.requires_technician_signature = request.POST.get('requires_technician_signature') == 'on'
        template.requires_customer_signature = request.POST.get('requires_customer_signature') == 'on'
        template.allows_photos = request.POST.get('allows_photos') == 'on'
        template.allows_video = request.POST.get('allows_video') == 'on'
        template.save()
        
        messages.success(request, 'Template updated successfully!')
        return redirect('inspections:template-detail', pk=template.id)
    
    context = {
        'template': template,
        'is_edit': True,
    }
    
    return render(request, 'inspections/template_form.html', context)


@login_required
def template_create(request):
    """Create new inspection template"""
    if request.method == 'POST':
        # Handle template creation
        try:
            template = InspectionTemplate.objects.create(
                name=request.POST.get('name'),
                description=request.POST.get('description', ''),
                is_active=request.POST.get('is_active') == 'on',
                is_default=request.POST.get('is_default') == 'on',
                created_by=request.user,
                requires_odometer=request.POST.get('requires_odometer') == 'on',
                requires_technician_signature=request.POST.get('requires_technician_signature') == 'on',
                requires_customer_signature=request.POST.get('requires_customer_signature') == 'on',
                allows_photos=request.POST.get('allows_photos') == 'on',
                allows_video=request.POST.get('allows_video') == 'on',
            )
            
            messages.success(request, 'Template created successfully! Now add categories and items to your template.')
            return redirect('inspections:template-detail', pk=template.id)
            
        except Exception as e:
            messages.error(request, f'Error creating template: {str(e)}')
    
    context = {
        'is_edit': False,
    }
    
    return render(request, 'inspections/template_form.html', context)


@login_required
def category_create(request, template_pk):
    """Add a new category to a template"""
    template = get_object_or_404(InspectionTemplate, pk=template_pk)
    
    if request.method == 'POST':
        form = InspectionCategoryForm(request.POST)
        if form.is_valid():
            category = form.save(commit=False)
            category.template = template
            category.save()
            messages.success(request, f'Category "{category.name}" added successfully!')
            return redirect('inspections:template-detail', pk=template.id)
        else:
            messages.error(request, 'Please correct the errors below.')
    else:
        form = InspectionCategoryForm()
    
    context = {
        'form': form,
        'template': template,
        'is_edit': False,
    }
    
    return render(request, 'inspections/category_form.html', context)


@login_required
def category_edit(request, pk):
    """Edit an existing category"""
    category = get_object_or_404(InspectionCategory, pk=pk)
    template = category.template
    
    if request.method == 'POST':
        form = InspectionCategoryForm(request.POST, instance=category)
        if form.is_valid():
            form.save()
            messages.success(request, f'Category "{category.name}" updated successfully!')
            return redirect('inspections:template-detail', pk=template.id)
        else:
            messages.error(request, 'Please correct the errors below.')
    else:
        form = InspectionCategoryForm(instance=category)
    
    context = {
        'form': form,
        'template': template,
        'category': category,
        'is_edit': True,
    }
    
    return render(request, 'inspections/category_form.html', context)


@login_required
def category_delete(request, pk):
    """Delete a category"""
    category = get_object_or_404(InspectionCategory, pk=pk)
    template = category.template
    
    if request.method == 'POST':
        category_name = category.name
        category.delete()
        messages.success(request, f'Category "{category_name}" deleted successfully!')
        return redirect('inspections:template-detail', pk=template.id)
    
    return redirect('inspections:template-detail', pk=template.id)


@login_required
def item_create(request, category_pk):
    """Add a new item to a category"""
    category = get_object_or_404(InspectionCategory, pk=category_pk)
    template = category.template
    
    if request.method == 'POST':
        form = InspectionItemForm(request.POST)
        if form.is_valid():
            item = form.save(commit=False)
            item.category = category
            item.save()
            messages.success(request, f'Item "{item.name}" added successfully!')
            return redirect('inspections:template-detail', pk=template.id)
        else:
            messages.error(request, 'Please correct the errors below.')
    else:
        form = InspectionItemForm()
    
    context = {
        'form': form,
        'category': category,
        'template': template,
        'is_edit': False,
    }
    
    return render(request, 'inspections/item_form.html', context)


@login_required
def item_edit(request, pk):
    """Edit an existing item"""
    item = get_object_or_404(InspectionItem, pk=pk)
    category = item.category
    template = category.template
    
    if request.method == 'POST':
        form = InspectionItemForm(request.POST, instance=item)
        if form.is_valid():
            form.save()
            messages.success(request, f'Item "{item.name}" updated successfully!')
            return redirect('inspections:template-detail', pk=template.id)
        else:
            messages.error(request, 'Please correct the errors below.')
    else:
        form = InspectionItemForm(instance=item)
    
    context = {
        'form': form,
        'item': item,
        'category': category,
        'template': template,
        'is_edit': True,
    }
    
    return render(request, 'inspections/item_form.html', context)


@login_required
def item_delete(request, pk):
    """Delete an item"""
    item = get_object_or_404(InspectionItem, pk=pk)
    template = item.category.template
    
    if request.method == 'POST':
        item_name = item.name
        item.delete()
        messages.success(request, f'Item "{item_name}" deleted successfully!')
        return redirect('inspections:template-detail', pk=template.id)
    
    return redirect('inspections:template-detail', pk=template.id)


@login_required
def template_checklist_api(request, pk):
    """API endpoint to get template checklist items as JSON"""
    # Check authentication for AJAX
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    
    template = get_object_or_404(InspectionTemplate, pk=pk)
    
    categories_data = []
    for category in template.categories.all().order_by('order'):
        items_data = []
        for item in category.items.all().order_by('order'):
            items_data.append({
                'id': item.id,
                'name': item.name,
                'description': item.description,
                'item_type': item.item_type,
                'measurement_unit': item.measurement_unit,
                'is_critical': item.is_critical,
            })
        
        categories_data.append({
            'id': category.id,
            'name': category.name,
            'description': category.description,
            'items': items_data
        })
    
    return JsonResponse({
        'template_id': template.id,
        'template_name': template.name,
        'categories': categories_data
    })


@login_required
def templates_list_api(request):
    """API endpoint to get list of active templates"""
    templates = InspectionTemplate.objects.filter(is_active=True).annotate(
        category_count=Count('categories', distinct=True),
        item_count=Count('categories__items', distinct=True)
    )
    
    templates_data = []
    for template in templates:
        templates_data.append({
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'category_count': template.category_count,
            'item_count': template.item_count,
            'is_default': template.is_default
        })
    
    return JsonResponse({'templates': templates_data})


@login_required
def template_details_api(request, pk):
    """API endpoint to get full template details with categories and items"""
    template = get_object_or_404(
        InspectionTemplate.objects.prefetch_related('categories__items'),
        pk=pk,
        is_active=True
    )
    
    categories_data = []
    for category in template.categories.all().order_by('order'):
        items_data = []
        for item in category.items.all().order_by('order'):
            items_data.append({
                'id': item.id,
                'name': item.name,
                'description': item.description,
                'item_type': item.item_type,
                'is_critical': item.is_critical,
            })
        
        categories_data.append({
            'id': category.id,
            'name': category.name,
            'description': category.description,
            'items': items_data
        })
    
    return JsonResponse({
        'id': template.id,
        'name': template.name,
        'description': template.description,
        'categories': categories_data
    })
