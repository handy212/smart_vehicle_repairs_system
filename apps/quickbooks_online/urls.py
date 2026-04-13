from django.urls import path
from . import views

app_name = 'quickbooks_online'

urlpatterns = [
    path('connect/', views.QBOConnectView.as_view(), name='connect'),
    path('callback/', views.QBOCallbackView.as_view(), name='callback'),
    path('refresh/', views.QBORefreshView.as_view(), name='refresh'),
    path('disconnect/', views.QBODisconnectView.as_view(), name='disconnect'),
    path('sync-inbound/', views.QBOInboundSyncView.as_view(), name='sync_inbound'),
    path('status/', views.QBOStatusView.as_view(), name='status'),
    path('webhook/', views.QBOWebhookView.as_view(), name='webhook'),
]
