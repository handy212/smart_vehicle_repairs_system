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
from .forms import CustomerForm


class CustomerListView(LoginRequiredMixin, ListView):
    """
    Display list of customers with filtering and search
    """
    model = Customer
    template_name = 'customers/customer_list.html'
    context_object_name = 'customers'
    paginate_by = 20
    
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