"""
Signals for subscription module
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
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
    
    # Find the subscription explicitly linked to this invoice.
    from .models import Subscription
    from .services import SubscriptionService
    
    subscription = Subscription.objects.filter(
        customer=invoice.customer,
        metadata__invoice_id=invoice.id,
    ).first()
    if not subscription:
        subscription = Subscription.objects.filter(
            customer=invoice.customer,
            metadata__renewal_invoice_id=invoice.id,
        ).first()
    
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
    if not instance.vehicle:
        return

    existing = Subscription.objects.filter(
        vehicle=instance.vehicle,
        status__in=['active', 'pending', 'suspended']
    ).exclude(pk=instance.pk).first()

    if existing:
        message = (
            f"Vehicle {instance.vehicle.license_plate} already has an existing live or pending subscription. "
            f"Duplicate subscriptions for the same vehicle are not allowed."
        )
        raise DRFValidationError(message)
