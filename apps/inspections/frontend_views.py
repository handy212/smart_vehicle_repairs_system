"""
Frontend views for Vehicle Inspections
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.db.models import Q, Count, Avg
from django.utils import timezone
from .models import VehicleInspection, InspectionTemplate, InspectionItem, InspectionResult
from .forms import InspectionForm
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
def inspection_create(request):
    """Create a new inspection"""
    if request.method == 'POST':
        form = InspectionForm(request.POST)
        
        if form.is_valid():
            try:
                # Create inspection with form data
                inspection = form.save(commit=False)
                inspection.save()
                
                # Create inspection results for each item in the template
                template = inspection.template
                items = template.items.all()
                
                for item in items:
                    item_key = f'item_{item.id}'
                    result = request.POST.get(item_key, 'pass')
                    notes = request.POST.get(f'notes_{item.id}', '')
                    
                    InspectionResult.objects.create(
                        inspection=inspection,
                        inspection_item=item,
                        result=result,
                        notes=notes
                    )
                
                # Update inspection status
                inspection.status = 'completed'
                inspection.save()
                
                messages.success(request, 'Inspection created successfully!')
                return redirect('inspections:inspection-detail', pk=inspection.id)
                
            except Exception as e:
                messages.error(request, f'Error creating inspection: {str(e)}')
        else:
            messages.error(request, 'Please correct the errors below.')
    else:
        # GET request - create empty form
        form = InspectionForm(initial={'performed_by': request.user})
    
    # Get templates for dynamic loading of inspection items
    templates = InspectionTemplate.objects.filter(is_active=True)
    
    context = {
        'form': form,
        'templates': templates,
    }
    
    return render(request, 'inspections/inspection_form.html', context)


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
    warning_count = results.filter(result='warning').count()
    
    context = {
        'inspection': inspection,
        'pass_count': pass_count,
        'fail_count': fail_count,
        'warning_count': warning_count,
    }
    
    return render(request, 'inspections/inspection_detail.html', context)


@login_required
def inspection_edit(request, pk):
    """Edit an existing inspection"""
    inspection = get_object_or_404(VehicleInspection, pk=pk)
    
    if request.method == 'POST':
        try:
            inspection.notes = request.POST.get('notes', '')
            inspection.customer_signature = request.POST.get('customer_signature', '')
            inspection.technician_signature = request.POST.get('technician_signature', '')
            inspection.save()
            
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
    
    context = {
        'inspection': inspection,
        'is_edit': True,
    }
    
    return render(request, 'inspections/inspection_form.html', context)


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
            'vehicle', 'vehicle__owner', 'technician', 'template'
        ).prefetch_related('results', 'results__inspection_item'),
        pk=pk
    )
    
    # Calculate pass/fail counts
    results = inspection.results.all()
    pass_count = results.filter(result='pass').count()
    fail_count = results.filter(result='fail').count()
    warning_count = results.filter(result='warning').count()
    
    context = {
        'inspection': inspection,
        'pass_count': pass_count,
        'fail_count': fail_count,
        'warning_count': warning_count,
    }
    
    return render(request, 'inspections/inspection_print.html', context)


@login_required
def inspection_pdf(request, pk):
    """Generate PDF for inspection"""
    try:
        from weasyprint import HTML
        from django.template.loader import render_to_string
        
        inspection = get_object_or_404(
            VehicleInspection.objects.select_related(
                'vehicle', 'vehicle__owner', 'technician', 'template'
            ).prefetch_related('results', 'results__inspection_item'),
            pk=pk
        )
        
        # Calculate pass/fail counts
        results = inspection.results.all()
        pass_count = results.filter(result='pass').count()
        fail_count = results.filter(result='fail').count()
        warning_count = results.filter(result='warning').count()
        
        context = {
            'inspection': inspection,
            'pass_count': pass_count,
            'fail_count': fail_count,
            'warning_count': warning_count,
        }
        
        # Render template to HTML
        html_string = render_to_string('inspections/inspection_print.html', context)
        
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
            )
            
            messages.success(request, 'Template created successfully!')
            return redirect('inspections:template-detail', pk=template.id)
            
        except Exception as e:
            messages.error(request, f'Error creating template: {str(e)}')
    
    return render(request, 'inspections/template_form.html', {})
