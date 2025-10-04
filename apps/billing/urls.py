from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.billing import views, hubtel_views

router = DefaultRouter()
router.register(r'tax-rates', views.TaxRateViewSet, basename='taxrate')
router.register(r'estimates', views.EstimateViewSet, basename='estimate')
router.register(r'estimate-items', views.EstimateLineItemViewSet, basename='estimatelineitem')
router.register(r'invoices', views.InvoiceViewSet, basename='invoice')
router.register(r'payments', views.PaymentViewSet, basename='payment')

urlpatterns = [
    path('', include(router.urls)),
    
    # Hubtel Payment Gateway endpoints
    path('payments/hubtel/initiate/', hubtel_views.initiate_payment, name='hubtel-payment-initiate'),
    path('payments/hubtel/callback/', hubtel_views.payment_callback, name='hubtel-payment-callback'),
    path('payments/hubtel/verify/<str:transaction_id>/', hubtel_views.verify_payment_status, name='hubtel-payment-verify'),
    path('payments/hubtel/status/<int:payment_id>/', hubtel_views.check_payment_status, name='hubtel-payment-status'),
]
