"""
Customer Management Frontend Views
Handles customer CRUD operations for the web interface
"""

from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django.http import JsonResponse
from django.db.models import Q, Count, Sum, Avg
from django.urls import reverse_lazy
from django.contrib import messages
from django.core.paginator import Paginator
from django.utils import timezone
from datetime import datetime, timedelta

from .models import Customer
from .forms import CustomerForm, CustomerImportForm


class CustomerListView(LoginRequiredMixin, ListView):
    """
    Display list of customers with filtering and search
    """
    model = Customer
    template_name = 'customers/customer_list.html'
    context_object_name = 'customers'
    paginate_by = 20

    def get_paginate_by(self, queryset):
        """Allow dynamic pagination sizes"""
        per_page = self.request.GET.get('per_page', self.paginate_by)
        try:
            per_page = int(per_page)
            if per_page in [10, 20, 50, 100]:
                return per_page
        except (ValueError, TypeError):
            pass
        return self.paginate_by
    
    def get_queryset(self):
        queryset = Customer.objects.select_related('user').prefetch_related(
            'work_orders', 'vehicles', 'customer_notes'
        )
        
        # Search functionality
        search = self.request.GET.get('search')
        if search:
            queryset = queryset.filter(
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__email__icontains=search) |
                Q(company_name__icontains=search)
            )
        
        # Status filter
        status = self.request.GET.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Customer type filter
        customer_type = self.request.GET.get('customer_type')
        if customer_type:
            queryset = queryset.filter(customer_type=customer_type)
        
        # Date range filter
        date_from = self.request.GET.get('date_from')
        date_to = self.request.GET.get('date_to')
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)
        
        # Sorting
        sort = self.request.GET.get('sort', '-created_at')
        queryset = queryset.order_by(sort)
        
        return queryset
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Statistics
        total_customers = Customer.objects.count()
        active_customers = Customer.objects.filter(status='active').count()
        inactive_customers = Customer.objects.filter(status='inactive').count()
        new_this_month = Customer.objects.filter(
            created_at__gte=timezone.now().replace(day=1)
        ).count()
        vehicle_metrics = Customer.objects.annotate(
            vehicle_total=Count('vehicles')
        ).aggregate(
            avg_vehicles=Avg('vehicle_total')
        )
        average_vehicle_count = vehicle_metrics.get('avg_vehicles') or 0
        active_rate = (active_customers / total_customers * 100) if total_customers else 0
        
        context.update({
            'total_customers': total_customers,
            'active_customers': active_customers,
            'inactive_customers': inactive_customers,
            'new_this_month': new_this_month,
            'average_vehicle_count': average_vehicle_count,
            'active_rate': active_rate,
            'search': self.request.GET.get('search', ''),
            'status_filter': self.request.GET.get('status', ''),
            'customer_type_filter': self.request.GET.get('customer_type', ''),
            'date_from': self.request.GET.get('date_from', ''),
            'date_to': self.request.GET.get('date_to', ''),
            'sort': self.request.GET.get('sort', '-created_at'),
            'customer_statuses': Customer.STATUS_CHOICES,
            'customer_types': Customer.CUSTOMER_TYPE_CHOICES,
            'sort_options': [
                ('-created_at', 'Newest First'),
                ('created_at', 'Oldest First'),
                ('user__last_name', 'Last Name A-Z'),
                ('-user__last_name', 'Last Name Z-A'),
                ('customer_since', 'Customer Since (Earliest)'),
                ('-customer_since', 'Customer Since (Latest)'),
                ('customer_number', 'Customer # (Ascending)'),
                ('-customer_number', 'Customer # (Descending)')
            ],
            'per_page': self.get_paginate_by(self.object_list),
        })
        
        return context


class CustomerDetailView(LoginRequiredMixin, DetailView):
    """
    Display detailed customer information
    """
    model = Customer
    template_name = 'customers/customer_detail.html'
    context_object_name = 'customer'
    
    def get_object(self):
        return get_object_or_404(
            Customer.objects.select_related('user').prefetch_related(
                'work_orders__vehicle',
                'vehicles',
                'customer_notes'
            ),
            pk=self.kwargs['pk']
        )
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        customer = self.object
        
        # Recent work orders (limit 5)
        recent_work_orders = customer.work_orders.select_related('vehicle').order_by('-created_at')[:5]
        
        # Calculate totals
        total_spent = customer.work_orders.aggregate(
            total=Sum('actual_total')
        )['total'] or 0
        
        # Vehicle count
        vehicle_count = customer.vehicles.count()
        
        # Recent notes (limit 3)
        recent_notes = customer.customer_notes.order_by('-created_at')[:3]
        
        context.update({
            'recent_work_orders': recent_work_orders,
            'total_spent': total_spent,
            'vehicle_count': vehicle_count,
            'work_order_count': customer.work_orders.count(),
            'recent_notes': recent_notes,
        })
        
        return context


class CustomerCreateView(LoginRequiredMixin, CreateView):
    """
    Create new customer
    """
    model = Customer
    form_class = CustomerForm
    template_name = 'customers/customer_create.html'
    success_url = reverse_lazy('customers:customer-list')
    
    def form_valid(self, form):
        messages.success(self.request, 'Customer created successfully!')
        return super().form_valid(form)
    
    def form_invalid(self, form):
        messages.error(self.request, 'Please correct the errors below.')
        return super().form_invalid(form)


class CustomerUpdateView(LoginRequiredMixin, UpdateView):
    """
    Update existing customer
    """
    model = Customer
    form_class = CustomerForm
    template_name = 'customers/customer_edit.html'
    success_url = reverse_lazy('customers:customer-list')
    
    def form_valid(self, form):
        messages.success(self.request, 'Customer updated successfully!')
        return super().form_valid(form)
    
    def form_invalid(self, form):
        messages.error(self.request, 'Please correct the errors below.')
        return super().form_invalid(form)
    
    def get_success_url(self):
        return reverse_lazy('customers:customer-detail', kwargs={'pk': self.object.pk})


class CustomerDeleteView(LoginRequiredMixin, DeleteView):
    """
    Delete customer (with confirmation)
    """
    model = Customer
    template_name = 'customers/customer_delete_confirm.html'
    success_url = reverse_lazy('customers:customer-list')
    
    def delete(self, request, *args, **kwargs):
        messages.success(request, 'Customer deleted successfully!')
        return super().delete(request, *args, **kwargs)


# AJAX Views for dynamic functionality
@login_required
def customer_search_ajax(request):
    """
    AJAX endpoint for customer search autocomplete
    """
    query = request.GET.get('q', '')
    customers = []
    
    if query and len(query) >= 2:
        customer_list = Customer.objects.filter(
            Q(user__first_name__icontains=query) |
            Q(user__last_name__icontains=query) |
            Q(user__email__icontains=query) |
            Q(company_name__icontains=query)
        )[:10]
        
        customers = [{
            'id': customer.id,
            'name': customer.user.get_full_name(),
            'email': customer.user.email,
            'phone': customer.phone,
            'company': customer.company_name or ''
        } for customer in customer_list]
    
    return JsonResponse({'customers': customers})


@login_required
def customer_stats_ajax(request):
    """
    AJAX endpoint for customer statistics
    """
    # Get date range from request
    days = int(request.GET.get('days', 30))
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days)
    
    # Calculate stats
    stats = {
        'total_customers': Customer.objects.count(),
        'active_customers': Customer.objects.filter(status='active').count(),
        'inactive_customers': Customer.objects.filter(status='inactive').count(),
        'new_customers': Customer.objects.filter(
            created_at__gte=start_date,
            created_at__lte=end_date
        ).count(),
    }
    
    # Customer registration trend (last 7 days)
    trend_data = []
    for i in range(7):
        date = end_date - timedelta(days=i)
        count = Customer.objects.filter(
            created_at__date=date.date()
        ).count()
        trend_data.append({
            'date': date.strftime('%Y-%m-%d'),
            'count': count
        })
    
    stats['trend'] = list(reversed(trend_data))
    
    return JsonResponse(stats)


@login_required
def customer_quick_info_ajax(request, pk):
    """
    AJAX endpoint for quick customer info (for tooltips, etc.)
    """
    try:
        customer = Customer.objects.select_related('user').prefetch_related(
            'work_orders', 'vehicles'
        ).get(pk=pk)
        
        data = {
            'id': customer.id,
            'name': customer.user.get_full_name(),
            'email': customer.user.email,
            'phone': customer.phone,
            'company': customer.company_name or '',
            'status': customer.status,
            'total_work_orders': customer.work_orders.count(),
            'total_vehicles': customer.vehicles.count(),
            'total_spent': float(customer.work_orders.aggregate(
                total=Sum('actual_total')
            )['total'] or 0),
            'created_at': customer.created_at.strftime('%Y-%m-%d'),
            'last_service': None
        }
        
        # Get last service date
        last_work_order = customer.work_orders.order_by('-created_at').first()
        if last_work_order:
            data['last_service'] = last_work_order.created_at.strftime('%Y-%m-%d')
        
        return JsonResponse(data)
        
    except Customer.DoesNotExist:
        return JsonResponse({'error': 'Customer not found'}, status=404)


@login_required
def export_customers(request):
    """
    Export customers to CSV
    """
    import csv
    from django.http import HttpResponse
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="customers.csv"'
    
    writer = csv.writer(response)
    writer.writerow([
        'ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Company', 
        'Status', 'Service Address', 'Billing Address', 'Created At'
    ])
    
    customers = Customer.objects.all().order_by('created_at')
    for customer in customers:
        writer.writerow([
            customer.id,
            customer.user.first_name,
            customer.user.last_name,
            customer.user.email,
            customer.phone,
            customer.company_name or '',
            customer.status,
            customer.service_address,
            customer.billing_address,
            customer.created_at.strftime('%Y-%m-%d %H:%M:%S')
        ])
    
    return response


@login_required
def import_customers(request):
    """
    Import customers from CSV file
    """
    import csv
    from django.contrib.auth import get_user_model
    from django.db import transaction
    
    User = get_user_model()
    
    # Check permissions (optional - adjust based on your requirements)
    if request.method == 'POST':
        form = CustomerImportForm(request.POST, request.FILES)
        if form.is_valid():
            csv_file = form.cleaned_data['csv_file']
            
            try:
                imported_count = 0
                skipped_count = 0
                error_rows = []
                
                # Read CSV file
                decoded_file = csv_file.read().decode('utf-8').splitlines()
                reader = csv.DictReader(decoded_file)
                
                # Required headers
                required_headers = ['first_name', 'last_name', 'email', 'phone']
                
                # Check if required headers exist
                if not all(header in reader.fieldnames for header in required_headers):
                    messages.error(request, f'CSV file must contain these columns: {", ".join(required_headers)}')
                    return redirect('customers:customer-import')
                
                # Process each row
                for row_num, row in enumerate(reader, start=2):
                    try:
                        first_name = row.get('first_name', '').strip()
                        last_name = row.get('last_name', '').strip()
                        email = row.get('email', '').strip().lower()
                        phone = row.get('phone', '').strip()
                        
                        # Validate required fields
                        if not first_name or not last_name or not email:
                            error_rows.append(f"Row {row_num}: Missing required fields (first_name, last_name, or email)")
                            skipped_count += 1
                            continue
                        
                        # Check if user with this email already exists
                        if User.objects.filter(email=email).exists():
                            error_rows.append(f"Row {row_num}: Email {email} already exists")
                            skipped_count += 1
                            continue
                        
                        # Create user and customer in a transaction
                        with transaction.atomic():
                            # Create user
                            username = email  # Use email as username
                            user = User.objects.create_user(
                                username=username,
                                email=email,
                                first_name=first_name,
                                last_name=last_name,
                                phone=phone,
                                role='customer'
                            )
                            
                            # Create customer
                            customer = Customer.objects.create(
                                user=user,
                                company_name=row.get('company_name', '').strip() or None,
                                customer_type=row.get('customer_type', 'individual').strip() or 'individual',
                                status=row.get('status', 'active').strip() or 'active',
                                service_address=row.get('service_address', '').strip() or None,
                                service_city=row.get('service_city', '').strip() or None,
                                service_state=row.get('service_state', '').strip() or None,
                                service_zip_code=row.get('service_zip_code', '').strip() or None,
                                billing_address=row.get('billing_address', '').strip() or None,
                                billing_city=row.get('billing_city', '').strip() or None,
                                billing_state=row.get('billing_state', '').strip() or None,
                                billing_zip_code=row.get('billing_zip_code', '').strip() or None,
                                payment_terms=row.get('payment_terms', 'due_on_receipt').strip() or 'due_on_receipt',
                                preferred_contact_method=row.get('preferred_contact_method', 'email').strip() or 'email',
                            )
                            from apps.customers.contact_services import (
                                apply_business_contact_person_name,
                                sync_primary_contact,
                            )
                            apply_business_contact_person_name(customer)
                            customer.save(update_fields=['contact_person_name'])
                            sync_primary_contact(customer)
                            
                            imported_count += 1
                            
                    except Exception as e:
                        error_rows.append(f"Row {row_num}: {str(e)}")
                        skipped_count += 1
                
                # Show results
                if imported_count > 0:
                    messages.success(request, f'Successfully imported {imported_count} customers.')
                if skipped_count > 0:
                    messages.warning(request, f'Skipped {skipped_count} rows (duplicates or errors).')
                if error_rows:
                    # Store errors in session for display (limit to 50)
                    request.session['import_errors'] = error_rows[:50]
                    if len(error_rows) > 50:
                        messages.warning(request, f'Showing first 50 errors. Total errors: {len(error_rows)}')
                
                return redirect('customers:customer-list')
                
            except Exception as e:
                messages.error(request, f'Error processing file: {str(e)}')
                return redirect('customers:customer-import')
        else:
            # Form validation errors
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f'{field}: {error}')
            return redirect('customers:customer-import')
    
    # GET request - show import form
    form = CustomerImportForm()
    
    # Define required and optional headers for the template
    required_headers = ['first_name', 'last_name', 'email', 'phone']
    optional_headers = [
        'company_name', 'customer_type', 'status', 'service_address', 
        'service_city', 'service_state', 'service_zip_code',
        'billing_address', 'billing_city', 'billing_state', 'billing_zip_code',
        'payment_terms', 'preferred_contact_method'
    ]
    
    context = {
        'form': form,
        'required_headers': required_headers,
        'optional_headers': optional_headers,
        'import_errors': request.session.pop('import_errors', [])
    }
    
    return render(request, 'customers/customer_import.html', context)


@login_required
def customer_notes_ajax(request, pk):
    """
    AJAX endpoint for customer notes
    """
    try:
        customer = get_object_or_404(Customer, pk=pk)
        notes = customer.customer_notes.order_by('-created_at')
        
        notes_data = [{
            'id': note.id,
            'content': note.content,
            'note_type': note.note_type,
            'created_at': note.created_at.strftime('%Y-%m-%d %H:%M'),
            'created_by': note.created_by.get_full_name() if note.created_by else 'System'
        } for note in notes]
        
        return JsonResponse({'notes': notes_data})
        
    except Customer.DoesNotExist:
        return JsonResponse({'error': 'Customer not found'}, status=404)


@login_required
def customer_vehicles_ajax(request, pk):
    """
    AJAX endpoint for customer vehicles
    """
    try:
        customer = get_object_or_404(Customer, pk=pk)
        vehicles = customer.vehicles.all()
        
        vehicles_data = [{
            'id': vehicle.id,
            'year': vehicle.year,
            'make': vehicle.make,
            'model': vehicle.model,
            'vin': vehicle.vin,
            'license_plate': vehicle.license_plate,
            'mileage': vehicle.mileage,
            'status': vehicle.status
        } for vehicle in vehicles]
        
        return JsonResponse({'vehicles': vehicles_data})
        
    except Customer.DoesNotExist:
        return JsonResponse({'error': 'Customer not found'}, status=404)


@login_required
def customer_history_ajax(request, pk):
    """
    AJAX endpoint for customer service history
    """
    try:
        customer = get_object_or_404(Customer, pk=pk)
        work_orders = customer.work_orders.select_related('vehicle').order_by('-created_at')
        
        history_data = [{
            'id': work_order.id,
            'work_order_number': work_order.work_order_number,
            'vehicle': f"{work_order.vehicle.year} {work_order.vehicle.make} {work_order.vehicle.model}" if work_order.vehicle else 'N/A',
            'status': work_order.status,
            'total': float(work_order.actual_total or 0),
            'created_at': work_order.created_at.strftime('%Y-%m-%d'),
            'description': work_order.description[:100] + '...' if len(work_order.description) > 100 else work_order.description
        } for work_order in work_orders]
        
        return JsonResponse({'history': history_data})
        
    except Customer.DoesNotExist:
        return JsonResponse({'error': 'Customer not found'}, status=404)


@login_required
def customer_vehicles_api(request, pk):
    """API endpoint to get customer's vehicles"""
    # Check authentication for AJAX
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    
    try:
        customer = Customer.objects.select_related('user').get(pk=pk)
        
        vehicles = customer.vehicles.filter(status='active').select_related('owner')
        
        vehicles_data = [{
            'id': vehicle.id,
            'display_name': f"{vehicle.year} {vehicle.make} {vehicle.model}",
            'vin': vehicle.vin,
            'license_plate': vehicle.license_plate,
            'year': vehicle.year,
            'make': vehicle.make,
            'model': vehicle.model,
            'color': vehicle.exterior_color,
        } for vehicle in vehicles]
        
        customer_data = {
            'id': customer.id,
            'full_name': customer.user.get_full_name(),
            'email': customer.user.email,
            'phone': customer.phone,
        }
        
        return JsonResponse({
            'customer': customer_data,
            'vehicles': vehicles_data
        })
        
    except Customer.DoesNotExist:
        return JsonResponse({'error': 'Customer not found'}, status=404)