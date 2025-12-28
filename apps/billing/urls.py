from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.billing import views, hubtel_views, paystack_views

router = DefaultRouter()
router.register(r'tax-rates', views.TaxRateViewSet, basename='taxrate')
router.register(r'estimates', views.EstimateViewSet, basename='estimate')
router.register(r'estimate-items', views.EstimateLineItemViewSet, basename='estimatelineitem')
router.register(r'invoices', views.InvoiceViewSet, basename='invoice')
router.register(r'payments', views.PaymentViewSet, basename='payment')
router.register(r'accounting', views.AccountingViewSet, basename='accounting')
router.register(r'branch-pl-comparison', views.BranchPLComparisonViewSet, basename='branch-pl-comparison')
# Phase 2: Cash & Payment Management
router.register(r'tills', views.TillViewSet, basename='till')
router.register(r'refunds', views.RefundViewSet, basename='refund')

# Note: app_name removed - this file is used with namespace 'api_billing' in config/urls.py
# Frontend billing URLs use namespace 'billing' in frontend_urls.py

urlpatterns = [
    path('', include(router.urls)),
    path('tax/config/', views.TaxConfigurationView.as_view(), name='tax-config'),
    
    # Hubtel Payment Gateway endpoints (API)
    path('payments/hubtel/initiate/', hubtel_views.initiate_payment, name='hubtel-payment-initiate'),
    path('payments/hubtel/callback/', hubtel_views.payment_callback, name='hubtel-payment-callback'),
    path('payments/hubtel/verify/<str:transaction_id>/', hubtel_views.verify_payment_status, name='hubtel-payment-verify'),
    path('payments/hubtel/status/<int:payment_id>/', hubtel_views.check_payment_status, name='hubtel-payment-status'),
    
    # Paystack Payment Gateway endpoints (API)
    path('payments/paystack/initiate/<int:invoice_id>/', paystack_views.initiate_paystack_payment, name='paystack-payment-initiate'),
    path('payments/paystack/callback/', paystack_views.paystack_callback, name='paystack-payment-callback'),
    path('payments/paystack/webhook/', paystack_views.paystack_webhook, name='paystack-payment-webhook'),
]
