"""
Signals for subscription module
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.core.exceptions import ValidationError
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
def check_duplicate_active_subscription(sender, instance, **kwargs):
    """
    Prevent duplicate active subscriptions for same package/customer
    """
    if instance.pk is None:  # New instance
        # Check for existing active subscription
        existing = Subscription.objects.filter(
            customer=instance.customer,
            package=instance.package,
            status='active'
        ).exclude(pk=instance.pk).first()
        
        if existing and existing.is_active():
            raise ValidationError(
                f"Customer already has an active subscription for {instance.package.name}. "
                f"Please cancel the existing subscription first or wait for it to expire."
            )

