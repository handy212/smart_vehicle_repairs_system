"""
Frontend URL patterns for Notifications Center
"""
from django.urls import path
from . import frontend_views

app_name = 'notifications'

urlpatterns = [
    # Notification Center
    path('', frontend_views.notification_center, name='notification-center'),
    path('preferences/', frontend_views.notification_preferences, name='notification-preferences'),
    path('<int:pk>/', frontend_views.notification_detail, name='notification-detail'),
    
    # Actions
    path('<int:pk>/mark-read/', frontend_views.mark_as_read, name='mark-as-read'),
    path('mark-all-read/', frontend_views.mark_all_as_read, name='mark-all-as-read'),
    path('<int:pk>/delete/', frontend_views.delete_notification, name='delete-notification'),
    
    # AJAX endpoints
    path('ajax/unread-count/', frontend_views.get_unread_count, name='unread-count'),
    path('ajax/recent/', frontend_views.get_recent_notifications, name='recent-notifications'),
]
