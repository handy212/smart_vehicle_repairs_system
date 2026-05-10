"""
Subscription services for business logic
"""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from decimal import Decimal
from dateutil.relativedelta import relativedelta
from .models import Subscription, SubscriptionUsage, Package
from apps.billing.models import Invoice, InvoiceLineItem
from apps.customers.models import Customer


class SubscriptionService:
    """Service class for subscription operations"""
    
    @staticmethod
    @transaction.atomic
    def create_subscription_with_invoice(customer, package, vehicle=None, start_date=None, auto_renew=False, created_by=None, request=None):
        """
        Create a subscription and associated invoice
        
        Args:
            customer: Customer instance
            package: Package instance
            start_date: Optional start date (defaults to today)
            auto_renew: Whether to auto-renew
            created_by: User who created the subscription (optional, defaults to system user)
            request: Optional HttpRequest to resolve branch from
            
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
        
        # Validate vehicle
        if vehicle is None:
            raise ValidationError("Vehicle is required for this subscription.")
        if vehicle.owner_id != customer.id:
            raise ValidationError("Vehicle does not belong to this customer.")
        
        # Check for duplicate live/pending subscription for same vehicle.
        existing = Subscription.objects.filter(
            customer=customer,
            vehicle=vehicle,
            status__in=['pending', 'active', 'suspended'],
        ).first()
        
        if existing:
            raise ValidationError(
                "Customer already has a live or pending subscription on this vehicle."
            )
        
        end_date = start_date + relativedelta(months=package.duration_months)
        
        # Calculate discounts
        discount_percentage = Decimal('0')
        discount_reason = ''
        
        # Rule 1: Corporate/Bulk Discount (5+ vehicles)
        if customer.vehicle_count >= 5:
            discount_percentage = Decimal('20')
            discount_reason = 'corporate'
        
        # Rule 2: Unused Subscription Renewal Discount (10%)
        # Check if this is a renewal (roughly, if there was a previous subscription for this vehicle)
        elif Subscription.objects.filter(customer=customer, vehicle=vehicle).exists():
            last_sub = Subscription.objects.filter(
                customer=customer, 
                vehicle=vehicle
            ).order_by('-end_date').first()
            
            if last_sub and last_sub.usage_records.count() == 0:
                discount_percentage = Decimal('10')
                discount_reason = 'unused_renewal'
        
        # Calculate final price
        original_price = package.price
        purchase_price = original_price
        if discount_percentage > 0:
            discount_amount = (original_price * discount_percentage) / Decimal('100')
            purchase_price = original_price - discount_amount
        
        # Create subscription
        subscription = Subscription.objects.create(
            customer=customer,
            vehicle=vehicle,
            package=package,
            start_date=start_date,
            end_date=end_date,
            auto_renew=auto_renew,
            original_price=original_price,
            purchase_price=purchase_price,
            discount_applied=discount_percentage,
            discount_reason=discount_reason,
            payment_status='pending',
            status='pending'  # Will be active after payment
        )
        
        # Get branch for invoice
        from apps.branches.utils import resolve_branch
        branch = None
        # Try to resolve branch from request first
        if request:
            branch = resolve_branch(request)
        # Fallback to customer's branch or user's primary branch
        if not branch:
            if hasattr(customer, 'branch') and customer.branch:
                branch = customer.branch
            elif created_by and getattr(created_by, 'branch', None):
                branch = created_by.branch
        
        # Create invoice
        invoice = Invoice.objects.create(
            customer=customer,
            vehicle=vehicle,
            branch=branch,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),  # Due immediately for subscriptions
            description=f"Subscription: {package.name} ({package.duration_months} months)",
            subtotal=purchase_price,
            total=purchase_price,
            amount_due=purchase_price,
            status='pending',
            created_by=created_by
        )
        
        # Add line item
        desc = f"Subscription Package: {package.name}"
        if discount_percentage > 0:
            desc += f" ({discount_percentage}% {discount_reason} discount applied)"
            
        InvoiceLineItem.objects.create(
            invoice=invoice,
            item_type='service',
            description=desc,
            quantity=1,
            unit_price=purchase_price,
            total=purchase_price,
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
        Activate a subscription after payment.
        Uses the selected subscription start date as the benefits start date.
        """
        if subscription.status == 'active' and subscription.is_active() and not (
            invoice and subscription.metadata and subscription.metadata.get('pending_renewal', {}).get('invoice_id') == invoice.id
        ):
            return subscription
        
        pending_renewal = (subscription.metadata or {}).get('pending_renewal')
        if pending_renewal and invoice and pending_renewal.get('invoice_id') == invoice.id:
            subscription.start_date = pending_renewal['start_date']
            subscription.end_date = pending_renewal['end_date']
            subscription.original_price = Decimal(str(pending_renewal['original_price']))
            subscription.purchase_price = Decimal(str(pending_renewal['purchase_price']))
            subscription.discount_applied = Decimal(str(pending_renewal.get('discount_applied') or '0'))
            subscription.discount_reason = pending_renewal.get('discount_reason') or ''
            subscription.metadata['last_renewal_invoice_id'] = invoice.id
            subscription.metadata.pop('pending_renewal', None)
            subscription.metadata.pop('renewal_invoice_id', None)
        subscription.activation_date = subscription.calculate_activation_date()
        
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
        return subscription
    
    @staticmethod
    @transaction.atomic
    def renew_subscription(subscription, months=None, created_by=None, request=None):
        """
        Renew a subscription and create invoice
        
        Args:
            subscription: Subscription instance
            months: Optional months to renew (defaults to package duration)
            created_by: User who created the renewal (optional, defaults to system user)
            request: Optional HttpRequest to resolve branch from
            
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
        
        if subscription.status in ['cancelled', 'suspended']:
            raise ValidationError("Cancelled or suspended subscriptions cannot be renewed.")
        if subscription.metadata and subscription.metadata.get('pending_renewal'):
            raise ValidationError("This subscription already has a pending renewal invoice.")

        new_start_date = subscription.end_date + relativedelta(days=1)
        new_end_date = new_start_date + relativedelta(months=months)
        
        # Calculate discounts for renewal
        discount_percentage = Decimal('0')
        discount_reason = ''
        
        # Rule 1: Corporate/Bulk Discount (5+ vehicles)
        if subscription.customer.vehicle_count >= 5:
            discount_percentage = Decimal('20')
            discount_reason = 'corporate'
        
        # Rule 2: Unused Subscription Renewal Discount (10%)
        # Check if the CURRENT subscription (the one being renewed) had 0 usage
        elif subscription.usage_records.count() == 0:
            discount_percentage = Decimal('10')
            discount_reason = 'unused_renewal'
        
        # Calculate final price
        original_price = subscription.package.price
        purchase_price = original_price
        if discount_percentage > 0:
            discount_amount = (original_price * discount_percentage) / Decimal('100')
            purchase_price = original_price - discount_amount
            
        # Vehicle must remain tied to the subscription
        vehicle = subscription.vehicle
        if not vehicle:
            raise ValidationError("Subscription is missing vehicle; cannot renew without vehicle.")
        
        # Get branch for invoice
        from apps.branches.utils import resolve_branch
        branch = None
        # Try to resolve branch from request first
        if request:
            branch = resolve_branch(request)
        # Fallback to customer's branch or user's primary branch
        if not branch:
            if hasattr(subscription.customer, 'branch') and subscription.customer.branch:
                branch = subscription.customer.branch
            elif created_by and getattr(created_by, 'branch', None):
                branch = created_by.branch
        
        # Create renewal invoice
        invoice = Invoice.objects.create(
            customer=subscription.customer,
            vehicle=vehicle,
            branch=branch,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            description=f"Subscription Renewal: {subscription.package.name} ({months} months)",
            subtotal=purchase_price,
            total=purchase_price,
            amount_due=purchase_price,
            status='pending',
            created_by=created_by
        )
        
        desc = f"Subscription Renewal: {subscription.package.name}"
        if discount_percentage > 0:
            desc += f" ({discount_percentage}% {discount_reason} discount applied)"
            
        InvoiceLineItem.objects.create(
            invoice=invoice,
            item_type='service',
            description=desc,
            quantity=1,
            unit_price=purchase_price,
            total=purchase_price,
            is_taxable=False,
            order=1
        )
        
        # Store pending renewal terms without interrupting current paid coverage.
        subscription.metadata = subscription.metadata or {}
        subscription.metadata['renewal_invoice_id'] = invoice.id
        subscription.metadata['pending_renewal'] = {
            'invoice_id': invoice.id,
            'months': months,
            'start_date': new_start_date.isoformat(),
            'end_date': new_end_date.isoformat(),
            'original_price': str(original_price),
            'purchase_price': str(purchase_price),
            'discount_applied': str(discount_percentage),
            'discount_reason': discount_reason,
        }
        subscription.save(update_fields=['metadata', 'updated_at'])
        
        # Send renewal notification
        SubscriptionNotificationService.send_renewal_notification(subscription, invoice)
        
        return subscription, invoice


class SubscriptionUsageService:
    """Service class for subscription usage operations"""
    
    # Map usage types to feature keys for package lookup (support both friendly and internal keys)
    USAGE_TO_FEATURE_KEY = {
        # Towing services
        'towing': 'towing_services_km',
        'towing_services': 'towing_services_km',
        'towing_services_km': 'towing_services_km',
        # Call out charges
        'call_out': 'call_out_charges',
        'call_out_charges': 'call_out_charges',
        # Kilometers
        'kilometer': 'kilometers',
        'kilometers': 'kilometers',
        # Inspections
        'inspection': 'free_inspections',
        'free_inspections': 'free_inspections',
        # Battery services
        'battery_boost': 'battery_boosts',
        'battery_boosts': 'battery_boosts',
        # Flat tyre
        'flat_tyre': 'flat_tyre_service',
        'flat_tyre_service': 'flat_tyre_service',
        # Extrication
        'extrication': 'extrication',
        # First aid / roadside assistance
        'first_aid': 'roadside_first_aid',
        'mechanical_first_aid': 'roadside_first_aid',
        'roadside_first_aid': 'roadside_first_aid',
        # Key lockout
        'key_lockout': 'key_lock_out',
        'key_lock_out': 'key_lock_out',
        # Emergency fuel
        'emergency_fuel': 'emergency_fuel',
        # Other services
        'accident_estimate': 'accident_estimate',
        'pre_purchase_inspection': 'pre_purchase_inspection',
    }
    
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
        subscription = Subscription.objects.select_for_update().get(pk=subscription.pk)
        quantity_used = Decimal(str(quantity_used or 0))
        if quantity_used <= 0:
            raise ValidationError('Quantity used must be greater than zero')

        # Enforce paid + active-date coverage before benefits can be consumed.
        if not subscription.is_active() or subscription.is_expired():
            raise ValidationError('Subscription is not active or has expired')
        
        feature_key = SubscriptionUsageService.USAGE_TO_FEATURE_KEY.get(usage_type, usage_type)
        
        # Check remaining allowance using feature key
        remaining = subscription.get_remaining_allowance(feature_key)
        if remaining < quantity_used:
            raise ValidationError(
                f'Insufficient allowance. Remaining {feature_key}: {remaining}, requested: {quantity_used}'
            )
        
        # Create usage record
        usage = SubscriptionUsage.objects.create(
            subscription=subscription,
            usage_type=feature_key, # Store canonical key
            quantity_used=quantity_used,
            service_date=timezone.now().date(),
            reference_type=reference_type,
            reference_id=reference_id,
            description=description,
            created_by=created_by
        )
        
        # Check for low allowance and send notification (non-blocking)
        if remaining - quantity_used <= 1:
            try:
                SubscriptionNotificationService.send_low_allowance_notification(
                    subscription, feature_key, remaining - quantity_used
                )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to send low allowance notification: {e}")
        
        return usage
    
    @staticmethod
    @transaction.atomic
    def refund_allowance(subscription, usage_type, quantity_to_refund, reference_type=None, reference_id=None, description='', created_by=None):
        """
        Refund subscription allowance (e.g. for cancelled services)
        Creates a negative usage record.
        """
        feature_key = SubscriptionUsageService.USAGE_TO_FEATURE_KEY.get(usage_type, usage_type)
        quantity_to_refund = Decimal(str(quantity_to_refund or 0))
        if quantity_to_refund <= 0:
            raise ValidationError('Quantity to refund must be greater than zero')
        
        # Create negative usage record
        usage = SubscriptionUsage.objects.create(
            subscription=subscription,
            usage_type=feature_key, # Store canonical key
            quantity_used=-abs(quantity_to_refund), # Ensure it is negative
            service_date=timezone.now().date(),
            reference_type=reference_type,
            reference_id=reference_id,
            description=description,
            created_by=created_by
        )
        return usage
    
    @staticmethod
    def check_allowance(customer, feature_key, quantity_needed=1, vehicle=None):
        """
        Check if customer has sufficient allowance for a service
        
        Args:
            customer: Customer instance
            feature_key: Feature key from package (e.g., 'towing_services', 'call_out_charges')
            quantity_needed: Amount needed
            
        Returns:
            tuple: (has_allowance: bool, subscription: Subscription or None, remaining: int)
        """
        # Find active subscription (per customer + optional vehicle)
        qs = Subscription.objects.filter(
            customer=customer,
            status='active'
        )
        if vehicle:
            qs = qs.filter(vehicle=vehicle)
        subscription = qs.order_by('-activation_date', '-start_date').first()
        
        if not subscription or subscription.status != 'active':
            return False, None, 0
        if not subscription.is_active():
            return False, subscription, 0
        
        # Map feature keys to usage types
        feature_to_usage_type = {
            'towing_services': 'towing',
            'call_out_charges': 'call_out',
            'kilometers': 'kilometer',
            'free_inspections': 'inspection',
        }
        
        usage_type = feature_to_usage_type.get(feature_key, feature_key)
        quantity_needed = Decimal(str(quantity_needed or 0))
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
                    recipient=customer.user,
                    title='Subscription Purchased',
                    message=f'Your subscription for {subscription.package.name} has been created. Invoice #{invoice.id} is pending payment.',
                    notification_type='subscription',
                    channel='in_app',
                    priority='normal',
                    data={
                        'subscription_id': subscription.id,
                        'invoice_id': invoice.id
                    },
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
                    recipient=customer.user,
                    title='Subscription Activated',
                    message=f'Your subscription for {subscription.package.name} is now active!',
                    notification_type='subscription',
                    channel='in_app',
                    priority='normal',
                    data={'subscription_id': subscription.id},
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
                    recipient=customer.user,
                    title='Subscription Renewed',
                    message=f'Your subscription for {subscription.package.name} has been renewed. Invoice #{invoice.id} is pending payment.',
                    notification_type='subscription',
                    channel='in_app',
                    priority='normal',
                    data={
                        'subscription_id': subscription.id,
                        'invoice_id': invoice.id
                    },
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
                    recipient=customer.user,
                    title='Subscription Expiring Soon',
                    message=f'Your subscription for {subscription.package.name} expires in {days_until_expiry} days.',
                    notification_type='subscription',
                    channel='in_app',
                    priority='high',
                    data={
                        'subscription_id': subscription.id,
                        'days_until_expiry': days_until_expiry
                    },
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
                    recipient=customer.user,
                    title='Low Subscription Allowance',
                    message=f'Your {subscription.package.name} subscription has only {remaining} {feature_type} remaining.',
                    notification_type='subscription',
                    channel='in_app',
                    priority='high',
                    data={
                        'subscription_id': subscription.id,
                        'feature': feature_type,
                        'remaining': remaining
                    },
                    related_object_type='subscription',
                    related_object_id=subscription.id,
                )
        except ImportError:
            pass
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send low allowance notification: {e}")
