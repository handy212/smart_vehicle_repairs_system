"""
Signals for subscription module
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from .models import Subscription
from apps.billing.models import Invoice, Payment


@receiver(post_save, sender=Payment)
def activate_subscription_on_payment(sender, instance, created, **kwargs):
    """
    Activate subscription when associated invoice is paid
    """
    if not created:
        return
    
    # Check if payment is for a subscription invoice
    invoice = instance.invoice
    if not invoice:
        return
    
    # Look for subscription-related description
    if 'subscription' not in invoice.description.lower():
        return
    
    # Find pending subscription for this customer
    from .models import Subscription
    from .services import SubscriptionService
    
    subscription = Subscription.objects.filter(
        customer=invoice.customer,
        status='pending',
        payment_status='pending'
    ).order_by('-created_at').first()
    
    if subscription:
        try:
            SubscriptionService.activate_subscription(subscription, invoice)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to activate subscription {subscription.id} on payment: {e}")


@receiver(pre_save, sender=Subscription)
def check_duplicate_subscription(sender, instance, **kwargs):
    """
    Prevent duplicate subscriptions for same vehicle (regardless of status).
    """
    if instance.pk is None:  # New instance
        if not instance.vehicle:
            return
            
        # Check for existing ACTIVE or PENDING subscription for this vehicle
        existing = Subscription.objects.filter(
            vehicle=instance.vehicle,
            status__in=['active', 'pending', 'suspended']
        ).exclude(pk=instance.pk).first()
        
        if existing:
            # We raise DRFValidationError to ensure 400 response in API
            # but we also provide a way to handle it if called outside API
            message = (
                f"Vehicle {instance.vehicle.license_plate} already has an existing subscription. "
                f"Duplicate subscriptions for the same vehicle are not allowed."
            )
            # Use DRF ValidationError for API compatibility
            raise DRFValidationError(message)

