"""
Vehicle Management Frontend Views
Handles vehicle CRUD operations for the web interface
"""

from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django.http import JsonResponse
from django.db.models import Q, Count, Sum, Avg
from django.urls import reverse_lazy, reverse
from django.contrib import messages
from django.core.paginator import Paginator
from django.utils import timezone
from datetime import datetime, timedelta
import json
import csv
from django.http import HttpResponse
from django.template.loader import render_to_string

from .models import Vehicle, VehicleMileageHistory, VehicleDocument, VehiclePhoto
from .forms import VehicleForm, VehicleDocumentForm, VehiclePhotoForm
from apps.customers.models import Customer


class VehicleListView(LoginRequiredMixin, ListView):
    """
    Display list of vehicles with filtering and search
    """
    model = Vehicle
    template_name = 'vehicles/vehicle_list.html'
    context_object_name = 'vehicles'
    paginate_by = 20
    
    def get_paginate_by(self, queryset):
        """Allow dynamic pagination"""
        per_page = self.request.GET.get('per_page', self.paginate_by)
        try:
            per_page = int(per_page)
            if per_page in [10, 20, 50, 100]:
                return per_page
        except (ValueError, TypeError):
            pass
        return self.paginate_by
    
    def get_queryset(self):
        queryset = Vehicle.objects.select_related('owner', 'owner__user').prefetch_related(
            'work_orders', 'mileage_history', 'documents', 'photos'
        )
        
        # Search functionality
        search = self.request.GET.get('search')
        if search:
            queryset = queryset.filter(
                Q(vin__icontains=search) |
                Q(license_plate__icontains=search) |
                Q(make__icontains=search) |
                Q(model__icontains=search) |
                Q(owner__user__first_name__icontains=search) |
                Q(owner__user__last_name__icontains=search) |
                Q(owner__company_name__icontains=search)
            )
        
        # Status filter
        status = self.request.GET.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Make filter
        make = self.request.GET.get('make')
        if make:
            queryset = queryset.filter(make=make)
        
        # Year range filter
        year_from = self.request.GET.get('year_from')
        year_to = self.request.GET.get('year_to')
        if year_from:
            queryset = queryset.filter(year__gte=year_from)
        if year_to:
            queryset = queryset.filter(year__lte=year_to)
        
        # Customer filter
        customer_id = self.request.GET.get('customer')
        if customer_id:
            queryset = queryset.filter(owner_id=customer_id)
        
        # Sorting
        sort = self.request.GET.get('sort', '-created_at')
        queryset = queryset.order_by(sort)
        
        return queryset
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Statistics
        total_vehicles = Vehicle.objects.count()
        active_vehicles = Vehicle.objects.filter(status='active').count()
        in_service_vehicles = Vehicle.objects.filter(status='in_service').count()
        
        # Get unique makes for filter
        makes = Vehicle.objects.values_list('make', flat=True).distinct().order_by('make')
        
        # Get customers for filter
        customers = Customer.objects.select_related('user').order_by(
            'user__first_name', 'user__last_name'
        )
        
        context.update({
            'total_vehicles': total_vehicles,
            'active_vehicles': active_vehicles,
            'in_service_vehicles': in_service_vehicles,
            'search': self.request.GET.get('search', ''),
            'status_filter': self.request.GET.get('status', ''),
            'make_filter': self.request.GET.get('make', ''),
            'customer_filter': self.request.GET.get('customer', ''),
            'year_from': self.request.GET.get('year_from', ''),
            'year_to': self.request.GET.get('year_to', ''),
            'sort': self.request.GET.get('sort', '-created_at'),
            'vehicle_statuses': Vehicle.STATUS_CHOICES,
            'makes': makes,
            'customers': customers,
        })
        
        return context


class VehicleDetailView(LoginRequiredMixin, DetailView):
    """
    Display detailed vehicle information
    """
    model = Vehicle
    template_name = 'vehicles/vehicle_detail.html'
    context_object_name = 'vehicle'
    
    def get_object(self):
        return get_object_or_404(
            Vehicle.objects.select_related('owner', 'owner__user').prefetch_related(
                'work_orders__primary_technician',
                'work_orders__assigned_technicians',
                'mileage_history',
                'documents',
                'photos'
            ),
            pk=self.kwargs['pk']
        )
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        vehicle = self.object
        
        # Recent work orders (limit 5)
        recent_work_orders = vehicle.work_orders.select_related(
            'primary_technician', 'vehicle'
        ).order_by('-created_at')[:5]
        
        # Calculate stats
        total_spent = vehicle.work_orders.aggregate(
            total=Sum('actual_total')
        )['total'] or 0
        
        work_order_count = vehicle.work_orders.count()
        
        # Mileage history (limit 10)
        mileage_history = vehicle.mileage_history.order_by('-recorded_date')[:10]
        
        # Recent documents (limit 5)
        recent_documents = vehicle.documents.order_by('-uploaded_at')[:5]
        
        # Recent photos (limit 6)
        recent_photos = vehicle.photos.order_by('-uploaded_at')[:6]
        
        # Vehicle age
        current_year = timezone.now().year
        vehicle_age = current_year - vehicle.year
        
        context.update({
            'recent_work_orders': recent_work_orders,
            'total_spent': total_spent,
            'work_order_count': work_order_count,
            'mileage_history': mileage_history,
            'recent_documents': recent_documents,
            'recent_photos': recent_photos,
            'vehicle_age': vehicle_age,
        })
        
        return context


class VehicleCreateView(LoginRequiredMixin, CreateView):
    """
    Create new vehicle
    """
    model = Vehicle
    form_class = VehicleForm
    template_name = 'vehicles/vehicle_create.html'
    success_url = reverse_lazy('vehicles:vehicle-list')
    
    def get_initial(self):
        initial = super().get_initial()
        owner_id = self.request.GET.get('owner')

        if owner_id:
            try:
                owner_pk = int(owner_id)
            except (TypeError, ValueError):
                pass
            else:
                if Customer.objects.filter(pk=owner_pk).exists():
                    initial['owner'] = owner_pk

        return initial

    def form_valid(self, form):
        messages.success(self.request, 'Vehicle created successfully!')
        return super().form_valid(form)
    
    def form_invalid(self, form):
        messages.error(self.request, 'Please correct the errors below.')
        return super().form_invalid(form)

    def get_success_url(self):
        owner_param = self.request.GET.get('owner') or self.request.POST.get('owner')

        if owner_param:
            try:
                owner_pk = int(owner_param)
            except (TypeError, ValueError):
                owner_pk = None
            if owner_pk and Customer.objects.filter(pk=owner_pk).exists():
                return reverse('customers:customer-detail', kwargs={'pk': owner_pk})

        return super().get_success_url()


class VehicleUpdateView(LoginRequiredMixin, UpdateView):
    """
    Update existing vehicle
    """
    model = Vehicle
    form_class = VehicleForm
    template_name = 'vehicles/vehicle_edit.html'
    
    def form_valid(self, form):
        messages.success(self.request, 'Vehicle updated successfully!')
        return super().form_valid(form)
    
    def form_invalid(self, form):
        messages.error(self.request, 'Please correct the errors below.')
        return super().form_invalid(form)
    
    def get_success_url(self):
        return reverse_lazy('vehicles:vehicle-detail', kwargs={'pk': self.object.pk})


class VehicleDeleteView(LoginRequiredMixin, DeleteView):
    """
    Delete vehicle (with confirmation)
    """
    model = Vehicle
    template_name = 'vehicles/vehicle_delete_confirm.html'
    success_url = reverse_lazy('vehicles:vehicle-list')
    
    def delete(self, request, *args, **kwargs):
        messages.success(request, 'Vehicle deleted successfully!')
        return super().delete(request, *args, **kwargs)


class VehicleServiceHistoryView(LoginRequiredMixin, DetailView):
    """
    Display vehicle service history timeline
    """
    model = Vehicle
    template_name = 'vehicles/vehicle_service_history.html'
    context_object_name = 'vehicle'
    
    def get_object(self):
        return get_object_or_404(
            Vehicle.objects.select_related('owner', 'owner__user').prefetch_related(
                'work_orders__primary_technician',
                'work_orders__assigned_technicians',
                'mileage_history'
            ),
            pk=self.kwargs['pk']
        )
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        vehicle = self.object
        
        # All work orders with timeline data
        work_orders = vehicle.work_orders.select_related(
            'primary_technician', 'vehicle'
        ).order_by('-created_at')
        
        # Mileage history
        mileage_history = vehicle.mileage_history.order_by('-recorded_date')
        
        context.update({
            'work_orders': work_orders,
            'mileage_history': mileage_history,
        })
        
        return context


# AJAX Views for dynamic functionality
@login_required
def vehicle_search_ajax(request):
    """
    AJAX endpoint for vehicle search autocomplete
    """
    query = request.GET.get('q', '')
    vehicles = []
    
    if query and len(query) >= 2:
        vehicle_list = Vehicle.objects.filter(
            Q(vin__icontains=query) |
            Q(license_plate__icontains=query) |
            Q(make__icontains=query) |
            Q(model__icontains=query) |
            Q(owner__user__first_name__icontains=query) |
            Q(owner__user__last_name__icontains=query)
        ).select_related('owner', 'owner__user')[:10]
        
        vehicles = [{
            'id': vehicle.id,
            'display': f"{vehicle.year} {vehicle.make} {vehicle.model}",
            'vin': vehicle.vin,
            'license_plate': vehicle.license_plate,
            'owner': vehicle.owner.user.get_full_name(),
            'status': vehicle.status
        } for vehicle in vehicle_list]
    
    return JsonResponse({'vehicles': vehicles})


@login_required
def vin_decode_ajax(request):
    """
    AJAX endpoint for VIN decoding
    """
    vin = request.GET.get('vin', '').strip().upper()
    
    if not vin or len(vin) != 17:
        return JsonResponse({'error': 'Invalid VIN. Must be 17 characters.'}, status=400)
    
    try:
        # Import VIN decoder
        from .vin_decoder import VehicleVINDecoder
        
        decoder = VehicleVINDecoder()
        success, decoded_data = decoder.decode_vin(vin)
        
        if success:
            return JsonResponse({
                'success': True,
                'data': decoded_data
            })
        else:
            return JsonResponse({
                'error': decoded_data  # decoded_data contains error message
            }, status=404)
            
    except Exception as e:
        return JsonResponse({
            'error': f'VIN decoding failed: {str(e)}'
        }, status=500)


@login_required
def vehicle_stats_ajax(request):
    """
    AJAX endpoint for vehicle statistics
    """
    # Get date range from request
    days = int(request.GET.get('days', 30))
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days)
    
    # Calculate stats
    stats = {
        'total_vehicles': Vehicle.objects.count(),
        'active_vehicles': Vehicle.objects.filter(status='active').count(),
        'in_service_vehicles': Vehicle.objects.filter(status='in_service').count(),
        'inactive_vehicles': Vehicle.objects.filter(status='inactive').count(),
        'new_vehicles': Vehicle.objects.filter(
            created_at__gte=start_date,
            created_at__lte=end_date
        ).count(),
    }
    
    # Vehicle registration trend (last 7 days)
    trend_data = []
    for i in range(7):
        date = end_date - timedelta(days=i)
        count = Vehicle.objects.filter(
            created_at__date=date.date()
        ).count()
        trend_data.append({
            'date': date.strftime('%Y-%m-%d'),
            'count': count
        })
    
    stats['trend'] = list(reversed(trend_data))
    
    # Make distribution
    make_stats = list(Vehicle.objects.values('make').annotate(
        count=Count('id')
    ).order_by('-count')[:10])
    
    stats['make_distribution'] = make_stats
    
    return JsonResponse(stats)


@login_required
def vehicle_mileage_history_ajax(request, pk):
    """
    AJAX endpoint for vehicle mileage history chart data
    """
    try:
        vehicle = get_object_or_404(Vehicle, pk=pk)
        
        # Get mileage history
        mileage_data = list(vehicle.mileage_history.order_by('recorded_date').values(
            'recorded_date', 'mileage', 'notes'
        ))
        
        # Format data for chart
        chart_data = {
            'labels': [entry['recorded_date'].strftime('%Y-%m-%d') for entry in mileage_data],
            'data': [entry['mileage'] for entry in mileage_data],
            'unit': vehicle.mileage_unit
        }
        
        return JsonResponse(chart_data)
        
    except Vehicle.DoesNotExist:
        return JsonResponse({'error': 'Vehicle not found'}, status=404)


@login_required
def upload_vehicle_document_ajax(request, pk):
    """
    AJAX endpoint for uploading vehicle documents
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    try:
        vehicle = get_object_or_404(Vehicle, pk=pk)
        form = VehicleDocumentForm(request.POST, request.FILES)
        
        if form.is_valid():
            document = form.save(commit=False)
            document.vehicle = vehicle
            document.uploaded_by = request.user
            document.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Document uploaded successfully',
                'document': {
                    'id': document.id,
                    'name': document.name,
                    'file_url': document.file.url,
                    'uploaded_at': document.uploaded_at.strftime('%Y-%m-%d %H:%M')
                }
            })
        else:
            return JsonResponse({
                'error': 'Invalid form data',
                'errors': form.errors
            }, status=400)
            
    except Vehicle.DoesNotExist:
        return JsonResponse({'error': 'Vehicle not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def upload_vehicle_photo_ajax(request, pk):
    """
    AJAX endpoint for uploading vehicle photos
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    try:
        vehicle = get_object_or_404(Vehicle, pk=pk)
        form = VehiclePhotoForm(request.POST, request.FILES)
        
        if form.is_valid():
            photo = form.save(commit=False)
            photo.vehicle = vehicle
            photo.uploaded_by = request.user
            photo.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Photo uploaded successfully',
                'photo': {
                    'id': photo.id,
                    'description': photo.description,
                    'image_url': photo.image.url,
                    'thumbnail_url': photo.image.url,  # You might want to create thumbnails
                    'uploaded_at': photo.uploaded_at.strftime('%Y-%m-%d %H:%M')
                }
            })
        else:
            return JsonResponse({
                'error': 'Invalid form data',
                'errors': form.errors
            }, status=400)
            
    except Vehicle.DoesNotExist:
        return JsonResponse({'error': 'Vehicle not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def vehicle_export_view(request):
    """
    Export vehicles to CSV or PDF format
    """
    format_type = request.GET.get("format", "csv").lower()
    
    # Get vehicles with select_related for efficiency
    vehicles = Vehicle.objects.select_related("owner__user").all()
    
    # Apply filters if provided
    search = request.GET.get("search")
    status = request.GET.get("status")
    
    if search:
        vehicles = vehicles.filter(
            Q(vin__icontains=search) |
            Q(make__icontains=search) |
            Q(model__icontains=search) |
            Q(license_plate__icontains=search) |
            Q(owner__user__first_name__icontains=search) |
            Q(owner__user__last_name__icontains=search) |
            Q(owner__company_name__icontains=search)
        )
    
    if status:
        vehicles = vehicles.filter(status=status)
    
    if format_type == "csv":
        return export_vehicles_csv(vehicles)
    elif format_type == "pdf":
        return export_vehicles_pdf(request, vehicles)
    else:
        return JsonResponse({"error": "Invalid format. Use csv or pdf."}, status=400)


def export_vehicles_csv(vehicles):
    """Export vehicles to CSV format"""
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = "attachment; filename=\"vehicles_export.csv\""
    
    writer = csv.writer(response)
    
    # Write header
    writer.writerow([
        "VIN",
        "Make",
        "Model",
        "Year",
        "License Plate",
        "Owner",
        "Status",
        "Mileage",
        "Exterior Color",
        "Engine Type",
        "Created Date"
    ])
    
    # Write data
    for vehicle in vehicles:
        if vehicle.owner and hasattr(vehicle.owner, 'user'):
            owner_name = f"{vehicle.owner.user.first_name} {vehicle.owner.user.last_name}"
        elif vehicle.owner and hasattr(vehicle.owner, 'company_name') and vehicle.owner.company_name:
            owner_name = vehicle.owner.company_name
        else:
            owner_name = "N/A"
        writer.writerow([
            vehicle.vin or "",
            vehicle.make or "",
            vehicle.model or "",
            vehicle.year or "",
            vehicle.license_plate or "",
            owner_name,
            vehicle.get_status_display() if hasattr(vehicle, "get_status_display") else (vehicle.status or ""),
            vehicle.current_mileage or "",
            vehicle.exterior_color or "",
            vehicle.get_engine_type_display() if hasattr(vehicle, "get_engine_type_display") else (vehicle.engine_type or ""),
            vehicle.created_at.strftime("%Y-%m-%d %H:%M") if hasattr(vehicle, "created_at") and vehicle.created_at else ""
        ])
    
    return response


def export_vehicles_pdf(request, vehicles):
    """Export vehicles to PDF format"""
    try:
        import weasyprint
    except Exception as e:
        # Catch any exception during import (ImportError, NameError, etc.)
        messages.error(request, f"PDF generation is not available: {str(e)}")
        return redirect('vehicles:vehicle-list')
    
    # Create HTML content for PDF
    html_content = render_to_string("vehicles/vehicle_export_pdf.html", {
        "vehicles": vehicles,
        "export_date": timezone.now().strftime("%Y-%m-%d %H:%M"),
        "total_count": vehicles.count()
    })
    
    # Generate PDF
    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = "attachment; filename=\"vehicles_export.pdf\""
    
    try:
        # Use weasyprint to generate PDF
        weasyprint.HTML(string=html_content).write_pdf(response)
    except Exception as e:
        messages.error(request, f"Error generating PDF: {str(e)}")
        return redirect('vehicles:vehicle-list')
    
    return response
