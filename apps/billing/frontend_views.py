"""
Frontend views for billing and invoicing system
Handles rendering HTML templates for billing operations
"""

from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.db.models import Q, Sum, Count
from django.utils import timezone
from django.core.paginator import Paginator
from django.urls import reverse
from django.template.loader import render_to_string
from decimal import Decimal
import json
import csv
import io
from datetime import datetime, timedelta
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

from apps.billing.models import Invoice, Estimate, Payment, TaxRate, EstimateLineItem
from apps.customers.models import Customer
from apps.vehicles.models import Vehicle
from apps.workorders.models import WorkOrder
from apps.inventory.models import Part
from apps.accounts.models import User


@login_required
def billing_dashboard(request):
    """Billing dashboard with key metrics and recent activity"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to access billing.')
        return redirect('dashboard')
    
    # Get date range from query params (default to last 30 days)
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=30)
    
    if request.GET.get('start_date'):
        start_date = datetime.strptime(request.GET.get('start_date'), '%Y-%m-%d').date()
    if request.GET.get('end_date'):
        end_date = datetime.strptime(request.GET.get('end_date'), '%Y-%m-%d').date()
    
    # Financial metrics
    invoices_in_period = Invoice.objects.filter(
        invoice_date__range=[start_date, end_date]
    )
    
    total_invoiced = invoices_in_period.aggregate(
        total=Sum('total')
    )['total'] or Decimal('0')
    
    total_paid = invoices_in_period.aggregate(
        paid=Sum('amount_paid')
    )['paid'] or Decimal('0')
    
    outstanding = invoices_in_period.aggregate(
        outstanding=Sum('amount_due')
    )['outstanding'] or Decimal('0')
    
    overdue_invoices = Invoice.objects.filter(
        status='overdue'
    ).count()
    
    # Recent activity
    recent_invoices = Invoice.objects.select_related(
        'customer', 'vehicle'
    ).order_by('-created_at')[:10]
    
    recent_payments = Payment.objects.select_related(
        'customer', 'invoice'
    ).filter(
        status='completed'
    ).order_by('-payment_date')[:10]
    
    pending_estimates = Estimate.objects.filter(
        status__in=['sent', 'viewed']
    ).count()
    
    # Calculate average invoice amount
    invoice_count = invoices_in_period.count()
    avg_invoice_amount = total_invoiced / invoice_count if invoice_count > 0 else Decimal('0')
    
    context = {
        'start_date': start_date,
        'end_date': end_date,
        'total_invoiced': total_invoiced,
        'total_paid': total_paid,
        'outstanding': outstanding,
        'overdue_invoices': overdue_invoices,
        'recent_invoices': recent_invoices,
        'recent_payments': recent_payments,
        'pending_estimates': pending_estimates,
        'avg_invoice_amount': avg_invoice_amount,
        'page_title': 'Billing Dashboard',
    }
    
    return render(request, 'billing/dashboard.html', context)


@login_required
def invoice_list(request):
    """List all invoices with filtering and search"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to access billing.')
        return redirect('dashboard')
    
    invoices = Invoice.objects.select_related(
        'customer', 'vehicle', 'work_order'
    ).order_by('-created_at')
    
    # Apply filters
    status_filter = request.GET.get('status')
    if status_filter:
        invoices = invoices.filter(status=status_filter)
    
    customer_filter = request.GET.get('customer')
    if customer_filter:
        invoices = invoices.filter(customer_id=customer_filter)
    
    search_query = request.GET.get('search')
    if search_query:
        invoices = invoices.filter(
            Q(invoice_number__icontains=search_query) |
            Q(customer__first_name__icontains=search_query) |
            Q(customer__last_name__icontains=search_query) |
            Q(customer__email__icontains=search_query) |
            Q(vehicle__make__icontains=search_query) |
            Q(vehicle__model__icontains=search_query)
        )
    
    # Pagination
    paginator = Paginator(invoices, 25)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    # Get customers for filter dropdown
    customers = Customer.objects.filter(
        status='active'
    ).order_by('user__last_name', 'user__first_name')
    
    context = {
        'page_obj': page_obj,
        'customers': customers,
        'status_filter': status_filter,
        'customer_filter': customer_filter,
        'search_query': search_query,
        'status_choices': Invoice.STATUS_CHOICES,
        'page_title': 'Invoices',
    }
    
    return render(request, 'billing/invoice_list.html', context)


@login_required
def invoice_detail(request, invoice_id):
    """View invoice details"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to access billing.')
        return redirect('dashboard')
    
    invoice = get_object_or_404(
        Invoice.objects.select_related(
            'customer', 'vehicle', 'work_order', 'estimate'
        ),
        id=invoice_id
    )
    
    # Get payments for this invoice
    payments = invoice.payments.order_by('-payment_date')
    
    # Calculate payment summary
    total_payments = payments.filter(status='completed').aggregate(
        total=Sum('amount')
    )['total'] or Decimal('0')
    
    context = {
        'invoice': invoice,
        'payments': payments,
        'total_payments': total_payments,
        'page_title': f'Invoice {invoice.invoice_number}',
    }
    
    return render(request, 'billing/invoice_detail.html', context)


@login_required
def invoice_create(request):
    """Create new invoice"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to access billing.')
        return redirect('dashboard')
    
    if request.method == 'POST':
        try:
            # Get form data
            customer_id = request.POST.get('customer_id')
            vehicle_id = request.POST.get('vehicle_id')
            work_order_id = request.POST.get('work_order_id')
            
            # Debug form data
            print(f"DEBUG - Form data: customer_id={customer_id}, vehicle_id={vehicle_id}, work_order_id={work_order_id}")
            
            # Validate required fields
            if not customer_id:
                messages.error(request, 'Customer is required.')
                return redirect('billing:invoice_create')
            
            if not vehicle_id:
                messages.error(request, 'Vehicle is required.')
                return redirect('billing:invoice_create')
            
            customer = get_object_or_404(Customer, id=customer_id)
            vehicle = get_object_or_404(Vehicle, id=vehicle_id)
            
            # Create invoice
            invoice = Invoice.objects.create(
                customer=customer,
                vehicle=vehicle,
                work_order_id=work_order_id if work_order_id else None,
                due_date=timezone.now().date() + timedelta(days=30),
                description=request.POST.get('description', ''),
                notes=request.POST.get('notes', ''),
                customer_notes=request.POST.get('customer_notes', ''),
                terms=request.POST.get('terms', 'Net 30'),
                created_by=request.user,
            )
            
            # If linked to work order, calculate totals
            if work_order_id:
                invoice.calculate_totals_from_work_order()
            
            messages.success(request, f'Invoice {invoice.invoice_number} created successfully!')
            return redirect('billing:invoice_detail', invoice_id=invoice.id)
            
        except Exception as e:
            messages.error(request, f'Error creating invoice: {str(e)}')
    
    # Get customers and their vehicles for form
    customers = Customer.objects.filter(status='active').order_by('user__last_name', 'user__first_name')
    work_orders = WorkOrder.objects.filter(
        status='completed'
    ).select_related('customer', 'vehicle').order_by('-completed_at')[:100]
    
    context = {
        'customers': customers,
        'work_orders': work_orders,
        'page_title': 'Create Invoice',
    }
    
    return render(request, 'billing/invoice_create.html', context)


@login_required
def invoice_edit(request, invoice_id):
    """Edit existing invoice"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to access billing.')
        return redirect('dashboard')
    
    invoice = get_object_or_404(Invoice, id=invoice_id)
    
    # Only allow editing of draft invoices
    if invoice.status not in ['draft']:
        messages.error(request, 'Only draft invoices can be edited.')
        return redirect('billing:invoice_detail', invoice_id=invoice.id)
    
    if request.method == 'POST':
        try:
            # Update invoice fields
            invoice.description = request.POST.get('description', '')
            invoice.notes = request.POST.get('notes', '')
            invoice.customer_notes = request.POST.get('customer_notes', '')
            invoice.terms = request.POST.get('terms', '')
            
            # Update financial fields
            invoice.discount_percentage = Decimal(request.POST.get('discount_percentage', '0'))
            invoice.discount_reason = request.POST.get('discount_reason', '')
            invoice.shop_supplies_fee = Decimal(request.POST.get('shop_supplies_fee', '0'))
            invoice.environmental_fee = Decimal(request.POST.get('environmental_fee', '0'))
            
            # Recalculate totals
            if invoice.work_order:
                invoice.calculate_totals_from_work_order()
            else:
                invoice.save()
            
            messages.success(request, 'Invoice updated successfully!')
            return redirect('billing:invoice_detail', invoice_id=invoice.id)
            
        except Exception as e:
            messages.error(request, f'Error updating invoice: {str(e)}')
    
    context = {
        'invoice': invoice,
        'page_title': f'Edit Invoice {invoice.invoice_number}',
    }
    
    return render(request, 'billing/invoice_edit.html', context)


@login_required
def invoice_print(request, invoice_id):
    """Print-friendly invoice view"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to access billing.')
        return redirect('dashboard')
    
    invoice = get_object_or_404(
        Invoice.objects.select_related(
            'customer', 'vehicle', 'work_order'
        ),
        id=invoice_id
    )
    
    context = {
        'invoice': invoice,
        'page_title': f'Print Invoice {invoice.invoice_number}',
    }
    
    return render(request, 'billing/invoice_print.html', context)


@login_required
def estimate_list(request):
    """List all estimates with filtering and search"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to access billing.')
        return redirect('dashboard')
    
    estimates = Estimate.objects.select_related(
        'customer', 'vehicle'
    ).order_by('-created_at')
    
    # Apply filters
    status_filter = request.GET.get('status')
    if status_filter:
        estimates = estimates.filter(status=status_filter)
    
    customer_filter = request.GET.get('customer')
    if customer_filter:
        estimates = estimates.filter(customer_id=customer_filter)
    
    search_query = request.GET.get('search')
    if search_query:
        estimates = estimates.filter(
            Q(estimate_number__icontains=search_query) |
            Q(customer__first_name__icontains=search_query) |
            Q(customer__last_name__icontains=search_query) |
            Q(title__icontains=search_query)
        )
    
    # Pagination
    paginator = Paginator(estimates, 25)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    # Get customers for filter dropdown
    customers = Customer.objects.filter(
        status='active'
    ).order_by('user__last_name', 'user__first_name')
    
    context = {
        'page_obj': page_obj,
        'customers': customers,
        'status_filter': status_filter,
        'customer_filter': customer_filter,
        'search_query': search_query,
        'status_choices': Estimate.STATUS_CHOICES,
        'page_title': 'Estimates',
    }
    
    return render(request, 'billing/estimate_list.html', context)


@login_required
def estimate_create(request):
    """Create new estimate"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to access billing.')
        return redirect('dashboard')
    
    if request.method == 'POST':
        try:
            # Get form data - using correct field names from template
            customer_id = request.POST.get('customer')
            vehicle_id = request.POST.get('vehicle')
            work_order_id = request.POST.get('work_order')
            
            # Get customer (required)
            if not customer_id:
                raise ValueError("Customer is required")
            customer = get_object_or_404(Customer, id=customer_id)
            
            # Get vehicle (optional)
            vehicle = None
            if vehicle_id:
                try:
                    vehicle = Vehicle.objects.get(id=vehicle_id)
                except Vehicle.DoesNotExist:
                    pass
            
            # Get work order (optional)
            work_order = None
            if work_order_id:
                try:
                    work_order = WorkOrder.objects.get(id=work_order_id)
                except WorkOrder.DoesNotExist:
                    pass
            
            # Parse dates
            estimate_date = request.POST.get('estimate_date')
            if estimate_date:
                estimate_date = datetime.strptime(estimate_date, '%Y-%m-%d').date()
            else:
                estimate_date = timezone.now().date()
                
            valid_until = request.POST.get('valid_until')
            if valid_until:
                valid_until = datetime.strptime(valid_until, '%Y-%m-%d').date()
            else:
                # Default to 30 days from estimate date
                valid_until = estimate_date + timedelta(days=30)
            
            # Create estimate with required fields
            estimate = Estimate.objects.create(
                customer=customer,
                vehicle=vehicle,
                work_order=work_order,
                title=request.POST.get('title', 'Estimate'),
                description=request.POST.get('description', ''),
                notes=request.POST.get('notes', ''),
                customer_notes=request.POST.get('customer_notes', ''),
                estimate_date=estimate_date,
                valid_until=valid_until,
                created_by=request.user,
            )
            
            messages.success(request, f'Estimate {estimate.estimate_number} created successfully!')
            return redirect('billing:estimate_detail', estimate_id=estimate.id)
            
        except Exception as e:
            messages.error(request, f'Error creating estimate: {str(e)}')
    
    # Get customers for form
    customers = Customer.objects.filter(status='active').order_by('user__last_name', 'user__first_name')
    
    context = {
        'customers': customers,
        'page_title': 'Create Estimate',
    }
    
    return render(request, 'billing/estimate_create.html', context)


@login_required
def estimate_detail(request, estimate_id):
    """View estimate details"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to access billing.')
        return redirect('dashboard')
    
    estimate = get_object_or_404(
        Estimate.objects.select_related(
            'customer', 'vehicle', 'work_order'
        ).prefetch_related('line_items'),
        id=estimate_id
    )
    
    context = {
        'estimate': estimate,
        'page_title': f'Estimate {estimate.estimate_number}',
    }
    
    return render(request, 'billing/estimate_detail.html', context)


@login_required
def payment_list(request):
    """List all payments with filtering"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to access billing.')
        return redirect('dashboard')
    
    payments = Payment.objects.select_related(
        'customer', 'invoice'
    ).order_by('-payment_date')
    
    # Apply filters
    status_filter = request.GET.get('status')
    if status_filter:
        payments = payments.filter(status=status_filter)
    
    method_filter = request.GET.get('method')
    if method_filter:
        payments = payments.filter(payment_method=method_filter)
    
    customer_filter = request.GET.get('customer')
    if customer_filter:
        payments = payments.filter(customer_id=customer_filter)
    
    search_query = request.GET.get('search')
    if search_query:
        payments = payments.filter(
            Q(payment_number__icontains=search_query) |
            Q(reference_number__icontains=search_query) |
            Q(customer__first_name__icontains=search_query) |
            Q(customer__last_name__icontains=search_query)
        )
    
    # Pagination
    paginator = Paginator(payments, 25)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    # Get filter options
    customers = Customer.objects.filter(
        status='active'
    ).order_by('user__last_name', 'user__first_name')
    
    # Calculate stats
    from django.utils import timezone
    today = timezone.now().date()
    
    total_payments = payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')
    today_payments = Payment.objects.filter(
        payment_date__date=today,
        status='completed'
    ).count()
    
    context = {
        'page_obj': page_obj,
        'customers': customers,
        'status_filter': status_filter,
        'method_filter': method_filter,
        'customer_filter': customer_filter,
        'search_query': search_query,
        'status_choices': Payment.STATUS_CHOICES,
        'method_choices': Payment.PAYMENT_METHOD_CHOICES,
        'total_payments': total_payments,
        'today_payments': today_payments,
        'start_date': timezone.now().date() - timedelta(days=30),
        'end_date': timezone.now().date(),
        'page_title': 'Payments',
    }
    
    return render(request, 'billing/payment_list.html', context)


@login_required
def payment_create(request):
    """Create new payment"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to access billing.')
        return redirect('dashboard')
    
    if request.method == 'POST':
        try:
            invoice_id = request.POST.get('invoice_id')
            invoice = get_object_or_404(Invoice, id=invoice_id)
            
            # Create payment
            payment = Payment.objects.create(
                invoice=invoice,
                customer=invoice.customer,
                payment_method=request.POST.get('payment_method'),
                amount=Decimal(request.POST.get('amount')),
                reference_number=request.POST.get('reference_number', ''),
                notes=request.POST.get('notes', ''),
                processed_by=request.user,
            )
            
            messages.success(request, f'Payment {payment.payment_number} recorded successfully!')
            return redirect('billing:invoice_detail', invoice_id=invoice.id)
            
        except Exception as e:
            messages.error(request, f'Error recording payment: {str(e)}')
    
    # Get unpaid invoices
    invoice_id = request.GET.get('invoice_id')
    if invoice_id:
        invoices = Invoice.objects.filter(id=invoice_id)
    else:
        invoices = Invoice.objects.filter(
            amount_due__gt=0
        ).select_related('customer', 'vehicle').order_by('-created_at')[:50]
    
    context = {
        'invoices': invoices,
        'method_choices': Payment.PAYMENT_METHOD_CHOICES,
        'page_title': 'Record Payment',
    }
    
    return render(request, 'billing/payment_create.html', context)


# AJAX endpoints for dynamic content


@login_required
def get_customer_vehicles(request):
    """Get vehicles for a customer (AJAX endpoint)"""
    customer_id = request.GET.get('customer_id')
    if not customer_id:
        return JsonResponse({'vehicles': []})
    
    vehicles = Vehicle.objects.filter(
        owner_id=customer_id
    ).values('id', 'year', 'make', 'model', 'vin')
    
    return JsonResponse({'vehicles': list(vehicles)})


@login_required
def get_work_orders_for_vehicle(request):
    """Get work orders for a vehicle (AJAX endpoint)"""
    vehicle_id = request.GET.get('vehicle_id')
    if not vehicle_id:
        return JsonResponse({'work_orders': []})
    
    work_orders = WorkOrder.objects.filter(
        vehicle_id=vehicle_id,
        status='completed'
    ).values('id', 'work_order_number', 'description', 'completed_at')
    
    return JsonResponse({'work_orders': list(work_orders)}, default=str)


@login_required
def calculate_tax(request):
    """Calculate tax for given amount and location (AJAX endpoint)"""
    try:
        amount = Decimal(request.GET.get('amount', '0'))
        # Get location parameters for tax calculation
        # This is simplified - implement proper tax calculation based on TaxRate model
        
        # For now, use a simple 8.5% tax rate
        tax_rate = Decimal('8.5')
        tax_amount = (amount * tax_rate / 100).quantize(Decimal('0.01'))
        
        return JsonResponse({
            'tax_rate': float(tax_rate),
            'tax_amount': float(tax_amount),
            'total_with_tax': float(amount + tax_amount)
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


# Export Functions

@login_required
def export_invoices_csv(request):
    """Export invoices to CSV format"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to export data.')
        return redirect('billing:invoice_list')
    
    # Get filtered invoices (same logic as invoice_list view)
    invoices = Invoice.objects.select_related('customer__user', 'vehicle', 'work_order').order_by('-created_at')
    
    # Apply same filters as the list view
    status_filter = request.GET.get('status')
    if status_filter:
        invoices = invoices.filter(status=status_filter)
    
    customer_filter = request.GET.get('customer')
    if customer_filter:
        invoices = invoices.filter(customer_id=customer_filter)
    
    search_query = request.GET.get('search')
    if search_query:
        invoices = invoices.filter(
            Q(invoice_number__icontains=search_query) |
            Q(customer__user__first_name__icontains=search_query) |
            Q(customer__user__last_name__icontains=search_query)
        )
    
    # Create CSV response
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="invoices_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'
    
    writer = csv.writer(response)
    
    # Write header
    writer.writerow([
        'Invoice Number',
        'Customer Name',
        'Customer Email',
        'Invoice Date',
        'Due Date',
        'Vehicle',
        'Work Order',
        'Subtotal',
        'Tax Amount',
        'Total',
        'Amount Paid',
        'Amount Due',
        'Status',
        'Created Date'
    ])
    
    # Write data
    for invoice in invoices:
        writer.writerow([
            invoice.invoice_number,
            f"{invoice.customer.user.first_name} {invoice.customer.user.last_name}",
            invoice.customer.user.email,
            invoice.invoice_date.strftime('%Y-%m-%d'),
            invoice.due_date.strftime('%Y-%m-%d') if invoice.due_date else '',
            f"{invoice.vehicle.year} {invoice.vehicle.make} {invoice.vehicle.model}" if invoice.vehicle else '',
            invoice.work_order.work_order_number if invoice.work_order else '',
            float(invoice.subtotal),
            float(invoice.tax_amount),
            float(invoice.total),
            float(invoice.amount_paid),
            float(invoice.amount_due),
            invoice.get_status_display(),
            invoice.created_at.strftime('%Y-%m-%d %H:%M:%S')
        ])
    
    return response


@login_required
def export_invoices_pdf(request):
    """Export invoices to PDF format"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to export data.')
        return redirect('billing:invoice_list')
    
    try:
        # Get filtered invoices
        invoices = Invoice.objects.select_related('customer__user', 'vehicle').order_by('-created_at')
        
        # Apply filters (same as CSV)
        status_filter = request.GET.get('status')
        if status_filter:
            invoices = invoices.filter(status=status_filter)
        
        customer_filter = request.GET.get('customer')  
        if customer_filter:
            invoices = invoices.filter(customer_id=customer_filter)
        
        # Create PDF response
        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="invoices_report_{timezone.now().strftime("%Y%m%d_%H%M%S")}.pdf"'
        
        # Create PDF document
        doc = SimpleDocTemplate(response, pagesize=A4)
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], alignment=1, spaceAfter=30)
        title = Paragraph("Invoices Report", title_style)
        elements.append(title)
        
        # Report info
        report_info = Paragraph(f"Generated on: {timezone.now().strftime('%B %d, %Y at %I:%M %p')}", styles['Normal'])
        elements.append(report_info)
        elements.append(Spacer(1, 20))
        
        # Create table data
        data = [['Invoice #', 'Customer', 'Date', 'Total', 'Status']]
        
        for invoice in invoices[:100]:  # Limit to first 100 for performance
            data.append([
                invoice.invoice_number,
                f"{invoice.customer.user.first_name} {invoice.customer.user.last_name}",
                invoice.invoice_date.strftime('%m/%d/%Y'),
                f"${invoice.total:,.2f}",
                invoice.get_status_display()
            ])
        
        # Create table
        table = Table(data, colWidths=[1.2*inch, 2*inch, 1*inch, 1*inch, 1*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        elements.append(table)
        
        # Summary
        elements.append(Spacer(1, 20))
        total_amount = sum(invoice.total for invoice in invoices)
        summary = Paragraph(f"Total Invoices: {invoices.count()} | Total Amount: ${total_amount:,.2f}", styles['Normal'])
        elements.append(summary)
        
        doc.build(elements)
        return response
        
    except Exception as e:
        messages.error(request, f'Error generating PDF: {str(e)}')
        return redirect('billing:invoice_list')


@login_required
def export_estimates_csv(request):
    """Export estimates to CSV format"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to export data.')
        return redirect('billing:estimate_list')
    
    # Get filtered estimates
    estimates = Estimate.objects.select_related('customer__user', 'vehicle').order_by('-created_at')
    
    # Apply filters
    status_filter = request.GET.get('status')
    if status_filter:
        estimates = estimates.filter(status=status_filter)
    
    customer_filter = request.GET.get('customer')
    if customer_filter:
        estimates = estimates.filter(customer_id=customer_filter)
    
    # Create CSV response
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="estimates_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'
    
    writer = csv.writer(response)
    
    # Write header
    writer.writerow([
        'Estimate Number',
        'Customer Name',
        'Customer Email',
        'Estimate Date',
        'Valid Until',
        'Vehicle',
        'Description',
        'Subtotal',
        'Tax Amount',
        'Total',
        'Status',
        'Created Date'
    ])
    
    # Write data
    for estimate in estimates:
        writer.writerow([
            estimate.estimate_number,
            f"{estimate.customer.user.first_name} {estimate.customer.user.last_name}",
            estimate.customer.user.email,
            estimate.estimate_date.strftime('%Y-%m-%d'),
            estimate.valid_until.strftime('%Y-%m-%d') if estimate.valid_until else '',
            f"{estimate.vehicle.year} {estimate.vehicle.make} {estimate.vehicle.model}" if estimate.vehicle else '',
            estimate.description or '',
            float(estimate.subtotal),
            float(estimate.tax_amount),
            float(estimate.total),
            estimate.get_status_display(),
            estimate.created_at.strftime('%Y-%m-%d %H:%M:%S')
        ])
    
    return response


@login_required
def export_payments_csv(request):
    """Export payments to CSV format"""
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to export data.')
        return redirect('billing:payment_list')
    
    # Get filtered payments
    payments = Payment.objects.select_related('customer__user', 'invoice').order_by('-payment_date')
    
    # Apply filters
    status_filter = request.GET.get('status')
    if status_filter:
        payments = payments.filter(status=status_filter)
    
    method_filter = request.GET.get('method')
    if method_filter:
        payments = payments.filter(payment_method=method_filter)
    
    customer_filter = request.GET.get('customer')
    if customer_filter:
        payments = payments.filter(customer_id=customer_filter)
    
    # Create CSV response
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="payments_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'
    
    writer = csv.writer(response)
    
    # Write header
    writer.writerow([
        'Payment ID',
        'Customer Name',
        'Customer Email',
        'Invoice Number',
        'Payment Date',
        'Amount',
        'Payment Method',
        'Transaction ID',
        'Reference Number',
        'Status',
        'Notes'
    ])
    
    # Write data
    for payment in payments:
        writer.writerow([
            payment.payment_number or payment.id,
            f"{payment.customer.user.first_name} {payment.customer.user.last_name}",
            payment.customer.user.email,
            payment.invoice.invoice_number if payment.invoice else '',
            payment.payment_date.strftime('%Y-%m-%d %H:%M:%S'),
            float(payment.amount),
            payment.get_payment_method_display(),
            payment.transaction_id or '',
            payment.reference_number or '',
            payment.get_status_display(),
            payment.notes or ''
        ])
    
    return response


@login_required
def bulk_export_invoices(request):
    """Export selected invoices"""
    
    if request.method != 'POST':
        return redirect('billing:invoice_list')
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'receptionist']:
        messages.error(request, 'You do not have permission to export data.')
        return redirect('billing:invoice_list')
    
    invoice_ids = request.POST.getlist('invoice_ids')
    if not invoice_ids:
        messages.error(request, 'No invoices selected for export.')
        return redirect('billing:invoice_list')
    
    # Get selected invoices
    invoices = Invoice.objects.filter(id__in=invoice_ids).select_related('customer__user', 'vehicle')
    
    # Create CSV response
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="selected_invoices_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'
    
    writer = csv.writer(response)
    
    # Write header
    writer.writerow([
        'Invoice Number',
        'Customer Name',
        'Invoice Date',
        'Total',
        'Amount Paid',
        'Amount Due',
        'Status'
    ])
    
    # Write data
    for invoice in invoices:
        writer.writerow([
            invoice.invoice_number,
            f"{invoice.customer.user.first_name} {invoice.customer.user.last_name}",
            invoice.invoice_date.strftime('%Y-%m-%d'),
            float(invoice.total),
            float(invoice.amount_paid),
            float(invoice.amount_due),
            invoice.get_status_display()
        ])
    
    return response