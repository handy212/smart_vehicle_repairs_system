from django.urls import path
from . import views
from . import api_views

app_name = 'quickbooks_online'

urlpatterns = [
    path('connect/', views.QBOConnectView.as_view(), name='connect'),
    path('callback/', views.QBOCallbackView.as_view(), name='callback'),
    path('refresh/', views.QBORefreshView.as_view(), name='refresh'),
    path('disconnect/', views.QBODisconnectView.as_view(), name='disconnect'),
    path('sync-inbound/', views.QBOInboundSyncView.as_view(), name='sync_inbound'),
    path('status/', views.QBOStatusView.as_view(), name='status'),
    path('webhook/', views.QBOWebhookView.as_view(), name='webhook'),
    path('accounts/', api_views.QBOAccountsListView.as_view(), name='accounts'),
    path('items/', api_views.QBOItemsListView.as_view(), name='items'),
    path('account-mappings/', api_views.QBOAccountMappingsView.as_view(), name='account_mappings'),
    path(
        'account-mappings/<str:mapping_kind>/<str:mapping_key>/',
        api_views.QBOAccountMappingDetailView.as_view(),
        name='account_mapping_detail',
    ),
    path('sync-outbound/', api_views.QBOOutboundSyncView.as_view(), name='sync_outbound'),
]
