"""
Frontend views for Notifications Center
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.core.paginator import Paginator
from django.db.models import Q, Count
from django.utils import timezone
from datetime import datetime, timedelta

from .models import Notification, NotificationPreference


@login_required
def notification_center(request):
    """Notification inbox/center"""
    # Get filter parameters
    filter_type = request.GET.get('type', 'all')
    filter_read = request.GET.get('read')
    search = request.GET.get('search')
    
    # Base queryset
    notifications = Notification.objects.filter(recipient=request.user)
    
    # Apply filters
    if filter_type != 'all':
        notifications = notifications.filter(notification_type=filter_type)
    
    if filter_read == 'unread':
        notifications = notifications.filter(is_read=False)
    elif filter_read == 'read':
        notifications = notifications.filter(is_read=True)
    
    if search:
        notifications = notifications.filter(
            Q(title__icontains=search) |
            Q(message__icontains=search)
        )
    
    # Order by newest first
    notifications = notifications.order_by('-created_at')
    
    # Get statistics
    total_count = Notification.objects.filter(recipient=request.user).count()
    unread_count = Notification.objects.filter(recipient=request.user, is_read=False).count()
    
    # Notification types for filter
    notification_types = Notification.NOTIFICATION_TYPE_CHOICES
    
    context = {
        'notifications': notifications,
        'total_count': total_count,
        'unread_count': unread_count,
        'filter_type': filter_type,
        'filter_read': filter_read,
        'search_query': search,
        'notification_types': notification_types,
    }
    
    return render(request, 'notifications/notification_center.html', context)


@login_required
def notification_preferences(request):
    """Notification preferences and settings"""
    # Get or create preference
    preference, created = NotificationPreference.objects.get_or_create(user=request.user)
    
    if request.method == 'POST':
        # Update preferences
        preference.email_enabled = request.POST.get('email_enabled') == 'on'
        preference.sms_enabled = request.POST.get('sms_enabled') == 'on'
        preference.push_enabled = request.POST.get('push_enabled') == 'on'
        preference.in_app_enabled = request.POST.get('in_app_enabled') == 'on'
        
        # Notification type preferences
        preference.appointment_notifications = request.POST.get('appointment_notifications') == 'on'
        preference.work_order_notifications = request.POST.get('work_order_notifications') == 'on'
        preference.invoice_notifications = request.POST.get('invoice_notifications') == 'on'
        preference.payment_notifications = request.POST.get('payment_notifications') == 'on'
        preference.inspection_notifications = request.POST.get('inspection_notifications') == 'on'
        preference.inventory_notifications = request.POST.get('inventory_notifications') == 'on'
        preference.system_notifications = request.POST.get('system_notifications') == 'on'
        
        # Quiet hours
        quiet_hours_enabled = request.POST.get('quiet_hours_enabled') == 'on'
        if quiet_hours_enabled:
            quiet_hours_start = request.POST.get('quiet_hours_start')
            quiet_hours_end = request.POST.get('quiet_hours_end')
            if quiet_hours_start and quiet_hours_end:
                preference.quiet_hours_enabled = True
                preference.quiet_hours_start = quiet_hours_start
                preference.quiet_hours_end = quiet_hours_end
        else:
            preference.quiet_hours_enabled = False
        
        preference.save()
        messages.success(request, 'Notification preferences updated successfully!')
        return redirect('notifications:notification-preferences')
    
    # Get FCM tokens for this user (placeholder - FCMToken model doesn't exist yet)
    fcm_tokens = []
    
    context = {
        'preference': preference,
        'fcm_tokens': fcm_tokens,
    }
    
    return render(request, 'notifications/notification_preferences.html', context)


@login_required
def notification_detail(request, pk):
    """View notification details"""
    notification = get_object_or_404(Notification, pk=pk, recipient=request.user)
    
    # Mark as read
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save()
    
    context = {
        'notification': notification,
    }
    
    return render(request, 'notifications/notification_detail.html', context)


@login_required
def mark_as_read(request, pk):
    """Mark a notification as read"""
    notification = get_object_or_404(Notification, pk=pk, recipient=request.user)
    
    if request.method == 'POST':
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({'success': True})
        
        messages.success(request, 'Notification marked as read.')
        return redirect('notifications:notification-center')
    
    return redirect('notifications:notification-detail', pk=pk)


@login_required
def mark_all_as_read(request):
    """Mark all notifications as read"""
    if request.method == 'POST':
        updated = Notification.objects.filter(
            recipient=request.user,
            is_read=False
        ).update(
            is_read=True,
            read_at=timezone.now()
        )
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({'success': True, 'count': updated})
        
        messages.success(request, f'{updated} notifications marked as read.')
        return redirect('notifications:notification-center')
    
    return redirect('notifications:notification-center')


@login_required
def delete_notification(request, pk):
    """Delete a notification"""
    notification = get_object_or_404(Notification, pk=pk, recipient=request.user)
    
    if request.method == 'POST':
        notification.delete()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({'success': True})
        
        messages.success(request, 'Notification deleted.')
        return redirect('notifications:notification-center')
    
    return redirect('notifications:notification-detail', pk=pk)


@login_required
def get_unread_count(request):
    """AJAX: Get unread notification count"""
    count = Notification.objects.filter(
        recipient=request.user,
        is_read=False
    ).count()
    
    return JsonResponse({'count': count})


@login_required
def get_recent_notifications(request):
    """AJAX: Get recent notifications for dropdown"""
    limit = int(request.GET.get('limit', 5))
    
    notifications = Notification.objects.filter(
        recipient=request.user
    ).order_by('-created_at')[:limit]
    
    data = []
    for notification in notifications:
        data.append({
            'id': notification.id,
            'title': notification.title,
            'message': notification.message[:100],
            'notification_type': notification.notification_type,
            'priority': notification.priority,
            'is_read': notification.is_read,
            'created_at': notification.created_at.isoformat(),
            'url': f'/notifications/{notification.id}/',
        })
    
    return JsonResponse({'notifications': data})
