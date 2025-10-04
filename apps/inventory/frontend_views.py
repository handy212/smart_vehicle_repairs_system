from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.core.paginator import Paginator
from django.db.models import Q, Count, Sum, Max, Min, Avg, F, Case, When, Value, CharField
from django.db import models
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
import json
import csv
from datetime import datetime, timedelta

from .models import (
    Part, Supplier, PurchaseOrder, PurchaseOrderItem, 
    PartCategory, InventoryTransaction
)
from apps.accounts.models import User


@login_required
def part_list_view(request):
    """
    Parts catalog with advanced search and filtering
    """
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'parts_manager', 'technician']:
        messages.error(request, 'You do not have permission to view parts.')
        return redirect('dashboard:home')
    
    # Get filters
    search = request.GET.get('search', '')
    category_id = request.GET.get('category')
    supplier_id = request.GET.get('supplier')
    is_active = request.GET.get('is_active')
    stock_level = request.GET.get('stock_level')
    sort_by = request.GET.get('sort', '-created_at')
    
    # Base queryset
    parts = Part.objects.select_related(
        'category', 'preferred_supplier'
    ).prefetch_related('suppliers').annotate(
        available_stock=F('quantity_in_stock') - F('quantity_reserved'),
        stock_status=Case(
            When(quantity_in_stock__lte=F('minimum_stock'), then=Value('low')),
            When(quantity_in_stock__lte=F('reorder_point'), then=Value('reorder')),
            default=Value('normal'),
            output_field=CharField()
        )
    )
    
    # Apply filters
    if search:
        parts = parts.filter(
            Q(name__icontains=search) | 
            Q(part_number__icontains=search) |
            Q(manufacturer__icontains=search) |
            Q(description__icontains=search)
        )
    
    if category_id:
        parts = parts.filter(category_id=category_id)
        
    if supplier_id:
        parts = parts.filter(suppliers__id=supplier_id)
        
    if is_active is not None:
        parts = parts.filter(is_active=is_active.lower() == 'true')
    
    if stock_level:
        if stock_level == 'low':
            parts = parts.filter(quantity_in_stock__lte=F('minimum_stock'))
        elif stock_level == 'reorder':
            parts = parts.filter(quantity_in_stock__lte=F('reorder_point'))
        elif stock_level == 'out':
            parts = parts.filter(quantity_in_stock=0)
    
    # Sorting
    if sort_by in ['-created_at', 'name', '-name', 'part_number', '-part_number', 
                   'quantity_in_stock', '-quantity_in_stock', 'cost_price', '-cost_price']:
        parts = parts.order_by(sort_by)
    else:
        parts = parts.order_by('-created_at')
    
    # Pagination
    paginator = Paginator(parts, 25)
    page = request.GET.get('page')
    parts = paginator.get_page(page)
    
    # Get filter options
    categories = PartCategory.objects.order_by('name')
    suppliers = Supplier.objects.filter(is_active=True).order_by('name')
    
    # Statistics
    total_parts = Part.objects.count()
    low_stock_count = Part.objects.filter(quantity_in_stock__lte=F('minimum_stock')).count()
    out_of_stock_count = Part.objects.filter(quantity_in_stock=0).count()
    
    context = {
        'parts': parts,
        'categories': categories,
        'suppliers': suppliers,
        'search': search,
        'category_id': int(category_id) if category_id else None,
        'supplier_id': int(supplier_id) if supplier_id else None,
        'is_active': is_active,
        'stock_level': stock_level,
        'sort_by': sort_by,
        'total_parts': total_parts,
        'low_stock_count': low_stock_count,
        'out_of_stock_count': out_of_stock_count,
        'can_edit': request.user.role in ['admin', 'manager', 'parts_manager'],
    }
    
    return render(request, 'inventory/part_list.html', context)


@login_required
def part_detail_view(request, pk):
    """
    Part detail view with stock history and transactions
    """
    part = get_object_or_404(
        Part.objects.select_related('category', 'preferred_supplier')
        .prefetch_related('suppliers', 'transactions__created_by'),
        pk=pk
    )
    
    # Get recent transactions
    recent_transactions = part.transactions.select_related('created_by').order_by('-created_at')[:20]
    
    # Calculate statistics
    total_purchased = part.transactions.filter(transaction_type='purchase').aggregate(
        total=Sum('quantity')
    )['total'] or 0
    
    total_used = part.transactions.filter(transaction_type='sale').aggregate(
        total=Sum('quantity')
    )['total'] or 0
    
    # Get reorder suggestions
    needs_reorder = part.quantity_in_stock <= part.reorder_point
    
    context = {
        'part': part,
        'recent_transactions': recent_transactions,
        'total_purchased': total_purchased,
        'total_used': abs(total_used),  # Make positive for display
        'needs_reorder': needs_reorder,
        'available_stock': part.quantity_in_stock - part.quantity_reserved,
        'can_edit': request.user.role in ['admin', 'manager', 'parts_manager'],
    }
    
    return render(request, 'inventory/part_detail.html', context)


@login_required
def part_create_view(request):
    """
    Create new part
    """
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'parts_manager']:
        messages.error(request, 'You do not have permission to create parts.')
        return redirect('inventory:part_list')
    
    categories = PartCategory.objects.order_by('name')
    suppliers = Supplier.objects.filter(is_active=True).order_by('name')
    
    if request.method == 'POST':
        try:
            # Create part
            part = Part.objects.create(
                name=request.POST.get('name'),
                part_number=request.POST.get('part_number'),
                description=request.POST.get('description', ''),
                category_id=request.POST.get('category') or None,
                brand=request.POST.get('brand', ''),
                model=request.POST.get('model', ''),
                year_start=request.POST.get('year_start') or None,
                year_end=request.POST.get('year_end') or None,
                cost_price=float(request.POST.get('cost_price', 0)),
                selling_price=float(request.POST.get('selling_price', 0)),
                quantity_in_stock=int(request.POST.get('quantity_in_stock', 0)),
                reorder_point=int(request.POST.get('reorder_point', 10)),
                reorder_quantity=int(request.POST.get('reorder_quantity', 20)),
                minimum_stock=int(request.POST.get('minimum_stock', 5)),
                maximum_stock=int(request.POST.get('maximum_stock')) if request.POST.get('maximum_stock') else None,
                unit=request.POST.get('unit', 'piece'),
                status=request.POST.get('status', 'active'),
                location=request.POST.get('location', ''),
                notes=request.POST.get('notes', ''),
                preferred_supplier_id=request.POST.get('preferred_supplier') or None
            )
            
            # Add suppliers
            supplier_ids = request.POST.getlist('suppliers')
            if supplier_ids:
                part.suppliers.set(supplier_ids)
            
            # Create initial stock transaction
            if part.quantity_in_stock > 0:
                InventoryTransaction.objects.create(
                    part=part,
                    transaction_type='adjustment',
                    quantity=part.quantity_in_stock,
                    balance_after=part.quantity_in_stock,
                    unit_cost=part.cost_price,
                    total_cost=part.cost_price * part.quantity_in_stock,
                    reason='Initial stock',
                    notes='Initial stock entry',
                    created_by=request.user
                )
            
            messages.success(request, f'Part "{part.name}" created successfully!')
            return redirect('inventory:part_detail', pk=part.pk)
            
        except Exception as e:
            messages.error(request, f'Error creating part: {str(e)}')
    
    context = {
        'categories': categories,
        'suppliers': suppliers,
        'UNIT_CHOICES': Part.UNIT_CHOICES,
    }
    
    return render(request, 'inventory/part_create.html', context)


@login_required
def part_edit_view(request, pk):
    """
    Edit existing part
    """
    part = get_object_or_404(Part, pk=pk)
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'parts_manager']:
        messages.error(request, 'You do not have permission to edit parts.')
        return redirect('inventory:part_detail', pk=part.pk)
    
    categories = PartCategory.objects.order_by('name')
    suppliers = Supplier.objects.filter(is_active=True).order_by('name')
    
    if request.method == 'POST':
        try:
            # Track stock changes
            old_stock = part.quantity_in_stock
            new_stock = int(request.POST.get('quantity_in_stock', 0))
            
            # Update part
            part.name = request.POST.get('name')
            part.part_number = request.POST.get('part_number')
            part.description = request.POST.get('description', '')
            part.category_id = request.POST.get('category') or None
            part.brand = request.POST.get('brand', '')
            part.model = request.POST.get('model', '')
            part.year_start = request.POST.get('year_start') or None
            part.year_end = request.POST.get('year_end') or None
            part.cost_price = float(request.POST.get('cost_price', 0))
            part.selling_price = float(request.POST.get('selling_price', 0))
            part.quantity_in_stock = new_stock
            part.reorder_point = int(request.POST.get('reorder_point', 10))
            part.reorder_quantity = int(request.POST.get('reorder_quantity', 20))
            part.minimum_stock = int(request.POST.get('minimum_stock', 5))
            part.maximum_stock = int(request.POST.get('maximum_stock')) if request.POST.get('maximum_stock') else None
            part.unit = request.POST.get('unit', 'piece')
            part.is_active = request.POST.get('is_active', 'on') == 'on'
            part.location = request.POST.get('location', '')
            part.notes = request.POST.get('notes', '')
            part.preferred_supplier_id = request.POST.get('preferred_supplier') or None
            part.save()
            
            # Update suppliers
            supplier_ids = request.POST.getlist('suppliers')
            part.suppliers.set(supplier_ids)
            
            # Create stock adjustment transaction if quantity changed
            if new_stock != old_stock:
                quantity_change = new_stock - old_stock
                InventoryTransaction.objects.create(
                    part=part,
                    transaction_type='adjustment',
                    quantity=quantity_change,
                    balance_after=new_stock,
                    unit_cost=part.cost_price,
                    total_cost=part.cost_price * abs(quantity_change),
                    reason='Manual adjustment',
                    notes=f'Stock adjusted from {old_stock} to {new_stock}',
                    created_by=request.user
                )
            
            messages.success(request, f'Part "{part.name}" updated successfully!')
            return redirect('inventory:part_detail', pk=part.pk)
            
        except Exception as e:
            messages.error(request, f'Error updating part: {str(e)}')
    
    context = {
        'part': part,
        'categories': categories,
        'suppliers': suppliers,
        'UNIT_CHOICES': Part.UNIT_CHOICES,
    }
    
    return render(request, 'inventory/part_edit.html', context)


@login_required
def supplier_list_view(request):
    """
    Supplier list with search and filtering
    """
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'parts_manager']:
        messages.error(request, 'You do not have permission to view suppliers.')
        return redirect('dashboard:home')
    
    search = request.GET.get('search', '')
    supplier_type = request.GET.get('type')
    is_active = request.GET.get('active')
    sort_by = request.GET.get('sort', 'name')
    
    # Base queryset
    suppliers = Supplier.objects.annotate(
        parts_count=Count('parts'),
        purchase_orders_count=Count('purchase_orders')
    )
    
    # Apply filters
    if search:
        suppliers = suppliers.filter(
            Q(name__icontains=search) |
            Q(supplier_code__icontains=search) |
            Q(contact_person__icontains=search) |
            Q(email__icontains=search)
        )
    
    if supplier_type:
        suppliers = suppliers.filter(supplier_type=supplier_type)
    
    if is_active:
        suppliers = suppliers.filter(is_active=is_active == 'true')
    
    # Sorting
    if sort_by in ['name', '-name', 'supplier_code', '-supplier_code', 
                   'supplier_type', '-supplier_type', 'created_at', '-created_at']:
        suppliers = suppliers.order_by(sort_by)
    else:
        suppliers = suppliers.order_by('name')
    
    # Pagination
    paginator = Paginator(suppliers, 20)
    page = request.GET.get('page')
    suppliers = paginator.get_page(page)
    
    context = {
        'suppliers': suppliers,
        'search': search,
        'supplier_type': supplier_type,
        'is_active': is_active,
        'sort_by': sort_by,
        'SUPPLIER_TYPE_CHOICES': Supplier.SUPPLIER_TYPE_CHOICES,
        'can_edit': request.user.role in ['admin', 'manager', 'parts_manager'],
    }
    
    return render(request, 'inventory/supplier_list.html', context)


@login_required
def purchase_order_list_view(request):
    """
    Purchase order list with filtering
    """
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'parts_manager']:
        messages.error(request, 'You do not have permission to view purchase orders.')
        return redirect('dashboard:home')
    
    search = request.GET.get('search', '')
    status = request.GET.get('status')
    supplier_id = request.GET.get('supplier')
    sort_by = request.GET.get('sort', '-created_at')
    
    # Base queryset
    purchase_orders = PurchaseOrder.objects.select_related(
        'supplier', 'created_by'
    ).annotate(
        items_count=Count('items'),
        total_quantity=Sum('items__quantity'),
        received_quantity=Sum('items__quantity_received')
    )
    
    # Apply filters
    if search:
        purchase_orders = purchase_orders.filter(
            Q(po_number__icontains=search) |
            Q(supplier__name__icontains=search) |
            Q(notes__icontains=search)
        )
    
    if status:
        purchase_orders = purchase_orders.filter(status=status)
    
    if supplier_id:
        purchase_orders = purchase_orders.filter(supplier_id=supplier_id)
    
    # Sorting
    if sort_by in ['-created_at', 'po_number', '-po_number', 'order_date', 
                   '-order_date', 'total', '-total', 'status', '-status']:
        purchase_orders = purchase_orders.order_by(sort_by)
    else:
        purchase_orders = purchase_orders.order_by('-created_at')
    
    # Pagination
    paginator = Paginator(purchase_orders, 20)
    page = request.GET.get('page')
    purchase_orders = paginator.get_page(page)
    
    # Get filter options
    suppliers = Supplier.objects.filter(is_active=True).order_by('name')
    
    context = {
        'purchase_orders': purchase_orders,
        'suppliers': suppliers,
        'search': search,
        'status': status,
        'supplier_id': int(supplier_id) if supplier_id else None,
        'sort_by': sort_by,
        'STATUS_CHOICES': PurchaseOrder.STATUS_CHOICES,
        'can_edit': request.user.role in ['admin', 'manager', 'parts_manager'],
    }
    
    return render(request, 'inventory/purchase_order_list.html', context)


@login_required
def purchase_order_detail_view(request, pk):
    """
    Purchase order detail view
    """
    purchase_order = get_object_or_404(
        PurchaseOrder.objects.select_related('supplier', 'created_by')
        .prefetch_related('items__part'),
        pk=pk
    )
    
    context = {
        'purchase_order': purchase_order,
        'can_edit': request.user.role in ['admin', 'manager', 'parts_manager'],
    }
    
    return render(request, 'inventory/purchase_order_detail.html', context)


@login_required
def purchase_order_create_view(request):
    """
    Create new purchase order
    """
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'parts_manager']:
        messages.error(request, 'You do not have permission to create purchase orders.')
        return redirect('inventory:purchase_order_list')
    
    suppliers = Supplier.objects.filter(is_active=True).order_by('name')
    parts = Part.objects.filter(is_active=True).order_by('name')
    
    if request.method == 'POST':
        try:
            # Create purchase order
            po = PurchaseOrder.objects.create(
                supplier_id=request.POST.get('supplier'),
                order_date=request.POST.get('order_date'),
                expected_delivery_date=request.POST.get('expected_delivery_date') or None,
                shipping_cost=float(request.POST.get('shipping_cost', 0)),
                tax_amount=float(request.POST.get('tax_amount', 0)),
                notes=request.POST.get('notes', ''),
                internal_notes=request.POST.get('internal_notes', ''),
                created_by=request.user
            )
            
            # Add items
            part_ids = request.POST.getlist('part_id[]')
            quantities = request.POST.getlist('quantity[]')
            unit_costs = request.POST.getlist('unit_cost[]')
            
            for i, part_id in enumerate(part_ids):
                if part_id and quantities[i] and unit_costs[i]:
                    PurchaseOrderItem.objects.create(
                        purchase_order=po,
                        part_id=part_id,
                        quantity=int(quantities[i]),
                        unit_cost=float(unit_costs[i])
                    )
                    
                    # Update part quantity_on_order
                    part = Part.objects.get(id=part_id)
                    part.quantity_on_order += int(quantities[i])
                    part.save()
            
            # Calculate totals
            po.calculate_totals()
            
            messages.success(request, f'Purchase order {po.po_number} created successfully!')
            return redirect('inventory:purchase_order_detail', pk=po.pk)
            
        except Exception as e:
            messages.error(request, f'Error creating purchase order: {str(e)}')
    
    context = {
        'suppliers': suppliers,
        'parts': parts,
    }
    
    return render(request, 'inventory/purchase_order_create.html', context)


@login_required
@require_http_methods(["POST"])
def adjust_stock(request, pk):
    """
    Adjust part stock level
    """
    part = get_object_or_404(Part, pk=pk)
    
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'parts_manager']:
        return JsonResponse({'success': False, 'error': 'Permission denied'})
    
    try:
        adjustment_type = request.POST.get('adjustment_type', 'adjustment')
        quantity_change = int(request.POST.get('quantity_change', 0))
        reason = request.POST.get('reason', '')
        notes = request.POST.get('notes', '')
        
        if quantity_change == 0:
            return JsonResponse({'success': False, 'error': 'Quantity change cannot be zero'})
        
        # Calculate new balance
        old_balance = part.quantity_in_stock
        new_balance = max(0, old_balance + quantity_change)
        actual_change = new_balance - old_balance
        
        # Update part stock
        part.quantity_in_stock = new_balance
        part.save()
        
        # Create transaction
        InventoryTransaction.objects.create(
            part=part,
            transaction_type=adjustment_type,
            quantity=actual_change,
            balance_after=new_balance,
            unit_cost=part.cost_price,
            total_cost=part.cost_price * abs(actual_change),
            reason=reason,
            notes=notes,
            created_by=request.user
        )
        
        return JsonResponse({
            'success': True,
            'message': f'Stock adjusted successfully. New balance: {new_balance}',
            'new_balance': new_balance
        })
        
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@login_required
def supplier_import_view(request):
    """
    Supplier import functionality (placeholder)
    """
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'parts_manager']:
        messages.error(request, 'You do not have permission to import suppliers.')
        return redirect('inventory:supplier_list')
    
    if request.method == 'POST':
        messages.info(request, 'Supplier import functionality coming soon.')
        return redirect('inventory:supplier_list')
    
    return render(request, 'inventory/supplier_import.html')


@login_required
def inventory_dashboard_view(request):
    """
    Inventory dashboard with key metrics
    """
    # Check permissions
    if request.user.role not in ['admin', 'manager', 'parts_manager']:
        messages.error(request, 'You do not have permission to view inventory dashboard.')
        return redirect('dashboard:home')
    
    # Key metrics
    total_parts = Part.objects.count()
    total_value = Part.objects.aggregate(
        total=Sum(F('quantity_in_stock') * F('cost_price'))
    )['total'] or 0
    
    low_stock_parts = Part.objects.filter(quantity_in_stock__lte=F('minimum_stock'))
    low_stock_count = low_stock_parts.count()
    
    out_of_stock_count = Part.objects.filter(quantity_in_stock=0).count()
    
    reorder_needed = Part.objects.filter(quantity_in_stock__lte=F('reorder_point'))
    reorder_count = reorder_needed.count()
    
    # Recent transactions
    recent_transactions = InventoryTransaction.objects.select_related(
        'part', 'created_by'
    ).order_by('-created_at')[:10]
    
    # Pending purchase orders
    pending_pos = PurchaseOrder.objects.filter(
        status__in=['draft', 'submitted', 'confirmed']
    ).select_related('supplier').order_by('-created_at')[:5]
    
    context = {
        'total_parts': total_parts,
        'total_value': total_value,
        'low_stock_count': low_stock_count,
        'out_of_stock_count': out_of_stock_count,
        'reorder_count': reorder_count,
        'low_stock_parts': low_stock_parts[:10],
        'reorder_needed': reorder_needed[:10],
        'recent_transactions': recent_transactions,
        'pending_pos': pending_pos,
    }
    
    return render(request, 'inventory/dashboard.html', context)