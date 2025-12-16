"""
Subscription services for business logic
"""
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from decimal import Decimal
from .models import Subscription, SubscriptionUsage, Package
from apps.billing.models import Invoice, InvoiceLineItem
from apps.customers.models import Customer


class SubscriptionService:
    """Service class for subscription operations"""
    
    @staticmethod
    @transaction.atomic
    def create_subscription_with_invoice(customer, package, start_date=None, auto_renew=False, created_by=None):
        """
        Create a subscription and associated invoice
        
        Args:
            customer: Customer instance
            package: Package instance
            start_date: Optional start date (defaults to today)
            auto_renew: Whether to auto-renew
            created_by: User who created the subscription (optional, defaults to system user)
            
        Returns:
            tuple: (subscription, invoice)
        """
        if start_date is None:
            start_date = timezone.now().date()
        
        # Get system user if created_by not provided
        if created_by is None:
            from apps.accounts.models import User
            # Try to get a system/admin user, or create a system user
            system_user = User.objects.filter(role__in=['admin', 'manager']).first()
            if system_user:
                created_by = system_user
            else:
                # If no admin exists, we need to handle this - for now, raise an error
                raise ValidationError(
                    "No system user available to create invoice. Please ensure at least one admin user exists."
                )
        
        # Check for duplicate active subscription
        existing = Subscription.objects.filter(
            customer=customer,
            package=package,
            status='active'
        ).first()
        
        if existing and existing.is_active():
            raise ValidationError(
                f"Customer already has an active subscription for {package.name}"
            )
        
        # Calculate end date using relativedelta for proper month handling
        from dateutil.relativedelta import relativedelta
        end_date = start_date + relativedelta(months=package.duration_months)
        
        # Create subscription
        subscription = Subscription.objects.create(
            customer=customer,
            package=package,
            start_date=start_date,
            end_date=end_date,
            auto_renew=auto_renew,
            purchase_price=package.price,
            payment_status='pending',
            status='pending'  # Will be active after payment
        )
        
        # Get a default vehicle for the customer (for subscription invoices, vehicle is required by model)
        # Use the customer's first vehicle, or find/create a placeholder if none exists
        vehicle = customer.vehicles.first()
        if not vehicle:
            # Look for existing placeholder vehicle for this customer
            from apps.vehicles.models import Vehicle
            vehicle = Vehicle.objects.filter(
                customer=customer,
                license_plate__startswith='SUB-'
            ).first()
            
            if not vehicle:
                # Create a placeholder vehicle for subscription invoices if customer has no vehicles
                vehicle = Vehicle.objects.create(
                    customer=customer,
                    make='N/A',
                    model='Subscription Service',
                    year=timezone.now().year,
                    license_plate='SUB-{}'.format(customer.id),
                    vin='SUB-{}-{}'.format(customer.id, timezone.now().strftime('%Y%m%d')),
                )
        
        # Create invoice
        invoice = Invoice.objects.create(
            customer=customer,
            vehicle=vehicle,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),  # Due immediately for subscriptions
            description=f"Subscription: {package.name} ({package.duration_months} months)",
            subtotal=package.price,
            total=package.price,
            amount_due=package.price,
            status='pending',
            created_by=created_by
        )
        
        # Add line item
        InvoiceLineItem.objects.create(
            invoice=invoice,
            item_type='service',
            description=f"Subscription Package: {package.name}",
            quantity=1,
            unit_price=package.price,
            total=package.price,
            is_taxable=False,
            order=1
        )
        
        # Store invoice_id in subscription metadata for reliable linking
        subscription.metadata = subscription.metadata or {}
        subscription.metadata['invoice_id'] = invoice.id
        subscription.save(update_fields=['metadata'])
        
        # Send notification
        SubscriptionNotificationService.send_purchase_notification(subscription, invoice)
        
        return subscription, invoice
    
    @staticmethod
    @transaction.atomic
    def activate_subscription(subscription, invoice=None):
        """
        Activate a subscription after payment
        
        Args:
            subscription: Subscription instance
            invoice: Optional invoice instance (if None, finds associated invoice)
        """
        if subscription.status == 'active' and subscription.is_active():
            return  # Already active
        
        subscription.status = 'active'
        subscription.payment_status = 'paid'
        subscription.save()
        
        # Mark invoice as paid if provided
        if invoice:
            invoice.status = 'paid'
            invoice.amount_paid = invoice.total
            invoice.amount_due = Decimal('0')
            invoice.save()
        
        # Send activation notification
        SubscriptionNotificationService.send_activation_notification(subscription)
    
    @staticmethod
    @transaction.atomic
    def renew_subscription(subscription, months=None, created_by=None):
        """
        Renew a subscription and create invoice
        
        Args:
            subscription: Subscription instance
            months: Optional months to renew (defaults to package duration)
            created_by: User who created the renewal (optional, defaults to system user)
            
        Returns:
            tuple: (renewed_subscription, invoice)
        """
        if months is None:
            months = subscription.package.duration_months
        
        # Get system user if created_by not provided
        if created_by is None:
            from apps.accounts.models import User
            system_user = User.objects.filter(role__in=['admin', 'manager']).first()
            if system_user:
                created_by = system_user
            else:
                raise ValidationError(
                    "No system user available to create invoice. Please ensure at least one admin user exists."
                )
        
        # Calculate new dates using relativedelta
        from dateutil.relativedelta import relativedelta
        
        new_start_date = subscription.end_date + relativedelta(days=1)
        new_end_date = new_start_date + relativedelta(months=months)
        
        # Update subscription
        subscription.start_date = new_start_date
        subscription.end_date = new_end_date
        subscription.status = 'pending'  # Pending payment
        subscription.payment_status = 'pending'
        subscription.save()
        
        # Get a default vehicle for the customer (for subscription invoices, vehicle is required by model)
        # Use the customer's first vehicle, or find/create a placeholder if none exists
        vehicle = subscription.customer.vehicles.first()
        if not vehicle:
            # Look for existing placeholder vehicle for this customer
            from apps.vehicles.models import Vehicle
            vehicle = Vehicle.objects.filter(
                customer=subscription.customer,
                license_plate__startswith='SUB-'
            ).first()
            
            if not vehicle:
                # Create a placeholder vehicle for subscription invoices if customer has no vehicles
                vehicle = Vehicle.objects.create(
                    customer=subscription.customer,
                    make='N/A',
                    model='Subscription Service',
                    year=timezone.now().year,
                    license_plate='SUB-{}'.format(subscription.customer.id),
                    vin='SUB-{}-{}'.format(subscription.customer.id, timezone.now().strftime('%Y%m%d')),
                )
        
        # Create renewal invoice
        invoice = Invoice.objects.create(
            customer=subscription.customer,
            vehicle=vehicle,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            description=f"Subscription Renewal: {subscription.package.name} ({months} months)",
            subtotal=subscription.package.price,
            total=subscription.package.price,
            amount_due=subscription.package.price,
            status='pending',
            created_by=created_by
        )
        
        InvoiceLineItem.objects.create(
            invoice=invoice,
            item_type='service',
            description=f"Subscription Renewal: {subscription.package.name}",
            quantity=1,
            unit_price=subscription.package.price,
            total=subscription.package.price,
            is_taxable=False,
            order=1
        )
        
        # Store renewal invoice_id in subscription metadata
        subscription.metadata = subscription.metadata or {}
        subscription.metadata['renewal_invoice_id'] = invoice.id
        subscription.save(update_fields=['metadata'])
        
        # Send renewal notification
        SubscriptionNotificationService.send_renewal_notification(subscription, invoice)
        
        return subscription, invoice


class SubscriptionUsageService:
    """Service class for subscription usage operations"""
    
    @staticmethod
    @transaction.atomic
    def consume_allowance(subscription, usage_type, quantity_used=1, reference_type=None, reference_id=None, description='', created_by=None):
        """
        Consume subscription allowance atomically
        
        Args:
            subscription: Subscription instance
            usage_type: Type of usage (e.g., 'kilometer', 'call_out', 'towing')
            quantity_used: Amount to consume (default: 1)
            reference_type: Type of related object (e.g., 'workorder', 'appointment')
            reference_id: ID of related object
            description: Description of usage
            created_by: User who recorded the usage
            
        Returns:
            SubscriptionUsage instance
            
        Raises:
            ValidationError: If insufficient allowance
        """
        # Check if subscription is active
        if not subscription.is_active() or subscription.is_expired():
            raise ValidationError('Subscription is not active or has expired')
        
        # Map usage types to feature keys for package lookup
        usage_to_feature = {
            'towing': 'towing_services',
            'call_out': 'call_out_charges',
            'kilometer': 'kilometers',
            'inspection': 'free_inspections',
        }
        
        feature_key = usage_to_feature.get(usage_type, usage_type)
        
        # Check remaining allowance using feature key
        remaining = subscription.get_remaining_allowance(feature_key)
        if remaining < quantity_used:
            raise ValidationError(
                f'Insufficient allowance. Remaining {feature_key}: {remaining}, requested: {quantity_used}'
            )
        
        # Create usage record
        usage = SubscriptionUsage.objects.create(
            subscription=subscription,
            usage_type=usage_type,
            quantity_used=quantity_used,
            service_date=timezone.now().date(),
            reference_type=reference_type,
            reference_id=reference_id,
            description=description,
            created_by=created_by
        )
        
        # Check for low allowance and send notification
        if remaining - quantity_used <= 1:
            SubscriptionNotificationService.send_low_allowance_notification(
                subscription, feature_key, remaining - quantity_used
            )
        
        return usage
    
    @staticmethod
    def check_allowance(customer, feature_key, quantity_needed=1):
        """
        Check if customer has sufficient allowance for a service
        
        Args:
            customer: Customer instance
            feature_key: Feature key from package (e.g., 'towing_services', 'call_out_charges')
            quantity_needed: Amount needed
            
        Returns:
            tuple: (has_allowance: bool, subscription: Subscription or None, remaining: int)
        """
        # Find active subscription
        subscription = Subscription.objects.filter(
            customer=customer,
            status='active'
        ).first()
        
        if not subscription or not subscription.is_active():
            return False, None, 0
        
        # Map feature keys to usage types
        feature_to_usage_type = {
            'towing_services': 'towing',
            'call_out_charges': 'call_out',
            'kilometers': 'kilometer',
            'free_inspections': 'inspection',
        }
        
        usage_type = feature_to_usage_type.get(feature_key, feature_key)
        remaining = subscription.get_remaining_allowance(feature_key)  # Use feature_key for package lookup
        has_allowance = remaining >= quantity_needed
        
        return has_allowance, subscription, remaining


class SubscriptionNotificationService:
    """Service class for subscription notifications"""
    
    @staticmethod
    def send_purchase_notification(subscription, invoice):
        """Send notification when subscription is purchased"""
        try:
            # Check if notifications app exists
            from apps.notifications_app.models import Notification
            
            customer = subscription.customer
            if hasattr(customer, 'user') and customer.user:
                Notification.objects.create(
                    user=customer.user,
                    title='Subscription Purchased',
                    message=f'Your subscription for {subscription.package.name} has been created. Invoice #{invoice.id} is pending payment.',
                    notification_type='subscription_purchase',
                    related_object_type='subscription',
                    related_object_id=subscription.id,
                )
        except ImportError:
            # Notifications app not available, skip
            pass
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send purchase notification: {e}")
    
    @staticmethod
    def send_activation_notification(subscription):
        """Send notification when subscription is activated"""
        try:
            from apps.notifications_app.models import Notification
            
            customer = subscription.customer
            if hasattr(customer, 'user') and customer.user:
                Notification.objects.create(
                    user=customer.user,
                    title='Subscription Activated',
                    message=f'Your subscription for {subscription.package.name} is now active!',
                    notification_type='subscription_activated',
                    related_object_type='subscription',
                    related_object_id=subscription.id,
                )
        except ImportError:
            pass
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send activation notification: {e}")
    
    @staticmethod
    def send_renewal_notification(subscription, invoice):
        """Send notification when subscription is renewed"""
        try:
            from apps.notifications_app.models import Notification
            
            customer = subscription.customer
            if hasattr(customer, 'user') and customer.user:
                Notification.objects.create(
                    user=customer.user,
                    title='Subscription Renewed',
                    message=f'Your subscription for {subscription.package.name} has been renewed. Invoice #{invoice.id} is pending payment.',
                    notification_type='subscription_renewed',
                    related_object_type='subscription',
                    related_object_id=subscription.id,
                )
        except ImportError:
            pass
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send renewal notification: {e}")
    
    @staticmethod
    def send_expiration_reminder(subscription, days_until_expiry):
        """Send notification when subscription is expiring soon"""
        try:
            from apps.notifications_app.models import Notification
            
            customer = subscription.customer
            if hasattr(customer, 'user') and customer.user:
                Notification.objects.create(
                    user=customer.user,
                    title='Subscription Expiring Soon',
                    message=f'Your subscription for {subscription.package.name} expires in {days_until_expiry} days.',
                    notification_type='subscription_expiring',
                    related_object_type='subscription',
                    related_object_id=subscription.id,
                )
        except ImportError:
            pass
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send expiration reminder: {e}")
    
    @staticmethod
    def send_low_allowance_notification(subscription, feature_type, remaining):
        """Send notification when allowance is running low"""
        try:
            from apps.notifications_app.models import Notification
            
            customer = subscription.customer
            if hasattr(customer, 'user') and customer.user:
                Notification.objects.create(
                    user=customer.user,
                    title='Low Subscription Allowance',
                    message=f'Your {subscription.package.name} subscription has only {remaining} {feature_type} remaining.',
                    notification_type='subscription_low_allowance',
                    related_object_type='subscription',
                    related_object_id=subscription.id,
                )
        except ImportError:
            pass
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send low allowance notification: {e}")

