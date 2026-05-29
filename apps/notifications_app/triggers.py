"""
Notification triggers for automatic notifications across the system.
This module provides functions to send notifications for key events.
"""
from django.utils import timezone
from .services import NotificationService, NotificationHelper
from .models import Notification, NotificationTemplate
from apps.accounts.settings_utils import get_setting, get_company_info, get_whatsapp_settings
from .currency import format_money, enrich_money_context, get_currency_symbol


class NotificationTriggers:
    """
    Centralized notification triggers for system events.
    Call these methods from views/signals to send notifications.
    """
    
    def __init__(self):
        self.service = NotificationService()
    
    def _get_template(self, template_type, channel='email'):
        """Helper method to get active template for a type and channel"""
        try:
            return NotificationTemplate.objects.filter(
                template_type=template_type,
                channel=channel,
                is_active=True
            ).first()
        except Exception:
            return None
    
    def _build_customer_name(self, customer):
        """Helper to build customer name consistently"""
        if hasattr(customer, 'company_name') and customer.company_name:
            return customer.company_name
        elif hasattr(customer, 'user') and customer.user:
            return customer.user.get_full_name() or customer.user.email
        return str(customer)
    
    def _build_vehicle_display(self, vehicle):
        """Helper to build vehicle display string"""
        if vehicle and hasattr(vehicle, 'year') and hasattr(vehicle, 'make') and hasattr(vehicle, 'model'):
            return f"{vehicle.year} {vehicle.make} {vehicle.model}"
        elif vehicle:
            return str(vehicle)
        return "N/A"
    
    def _get_company_name(self):
        """Get company name from settings"""
        return get_setting('company_name', 'Smart Vehicle Repairs System')
    
    def _get_company_email(self):
        """Get company email from settings"""
        return get_setting('company_email', '')
    
    def _get_base_url(self):
        """Get base URL from settings"""
        return get_setting('site_url', 'http://localhost:3000')
    
    def _get_default_context(self):
        """Get default context variables for templates"""
        company_info = get_company_info()
        return {
            'company_name': company_info.get('company_name', 'Smart Vehicle Repairs System'),
            'company_email': company_info.get('company_email', ''),
            'company_phone': company_info.get('company_phone', ''),
            'company_address': company_info.get('company_address', ''),
            'site_url': get_setting('site_url', 'http://localhost:3000'),
            'currency_symbol': get_currency_symbol(),
        }

    def _with_money_context(self, context):
        """Merge default context and add formatted money display fields."""
        base = self._get_default_context()
        base.update(context)
        return enrich_money_context(base)
    
    # ==================== APPOINTMENT NOTIFICATIONS ====================
    
    def appointment_created(self, appointment):
        """Notify staff when customer creates appointment, or customer when staff creates it"""
        # If created by customer, notify staff
        if appointment.created_by == appointment.customer.user:
            # Notify admins/managers for now
            from apps.accounts.models import User
            recipients = User.objects.filter(role__in=['admin', 'manager', 'receptionist'])
            
            customer_name = self._build_customer_name(appointment.customer)
            vehicle_display = self._build_vehicle_display(appointment.vehicle)
            
            for recipient in recipients:
                notification = Notification.objects.create(
                    recipient=recipient,
                    notification_type='appointment',
                    channel='in_app',
                    priority='normal',
                    title=f'New Appointment Request - {customer_name}',
                    message=f'''New appointment request from {customer_name}.
    
    Date: {appointment.appointment_date}
    Time: {appointment.appointment_time}
    Vehicle: {vehicle_display}
    Service: {appointment.customer_concerns or "General Service"}
    
    Please review and confirm.''',
                    data={
                        'appointment_id': appointment.id,
                        'appointment_number': appointment.appointment_number,
                        'customer_name': customer_name,
                        'vehicle_display': vehicle_display,
                    },
                    related_object_type='appointment',
                    related_object_id=appointment.id
                )
                self.service.send_notification(notification)
        
        # If created by staff, notify customer (Confirmation request or just info)
        elif appointment.status == 'pending':
            # Notify customer
            if appointment.customer.user:
                customer_name = self._build_customer_name(appointment.customer)
                vehicle_display = self._build_vehicle_display(appointment.vehicle)
                
                notification = Notification.objects.create(
                    recipient=appointment.customer.user,
                    notification_type='appointment',
                    channel='email', # And in-app
                    priority='normal',
                    title=f'Appointment Created - {appointment.appointment_date}',
                    message=f'''An appointment has been scheduled for you.
    
    Date: {appointment.appointment_date}
    Time: {appointment.appointment_time}
    Vehicle: {vehicle_display}
    
    Status: Pending Confirmation''',
                    data={
                        'appointment_id': appointment.id,
                        'appointment_number': appointment.appointment_number,
                        'customer_name': customer_name,
                        'vehicle_display': vehicle_display,
                    },
                    related_object_type='appointment',
                    related_object_id=appointment.id
                )
                self.service.send_notification(notification)
    
    def appointment_confirmed(self, appointment):
        """Send confirmation notification when appointment is confirmed"""
        if not appointment.customer.user:
            return
        
        template = self._get_template('appointment_confirmation', 'email')
        customer_name = self._build_customer_name(appointment.customer)
        vehicle_display = self._build_vehicle_display(appointment.vehicle)
        technician = appointment.assigned_technicians.first()
        technician_name = technician.get_full_name() if technician else "TBD"
        
        # Build context
        context = self._get_default_context()
        context.update({
            'customer_name': customer_name,
            'appointment_number': appointment.appointment_number,
            'appointment_date': str(appointment.appointment_date),
            'appointment_time': str(appointment.appointment_time),
            'vehicle': vehicle_display,
            'vehicle_display': vehicle_display,
            'service_description': appointment.customer_concerns or "General Service",
            'technician_name': technician_name,
        })
        
        title = f'Appointment Confirmed - {appointment.appointment_date}'
        if template and template.subject:
            title = self.service._render_template(template.subject, context)
        
        message = f'''Your appointment has been confirmed for {appointment.appointment_date} at {appointment.appointment_time}.

Vehicle: {vehicle_display}
Service: {appointment.customer_concerns or "General Service"}
Technician: {technician_name}

Please arrive 10 minutes early.'''
        if template and template.body:
            message = self.service._render_template(template.body, context)
        
        notification = Notification.objects.create(
            recipient=appointment.customer.user,
            notification_type='appointment',
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='appointment',
            related_object_id=appointment.id
        )
        self.service.send_notification(notification)
    
    def appointment_cancelled(self, appointment, reason=''):
        """Send cancellation notification"""
        if not appointment.customer.user:
            return
        
        template = self._get_template('appointment_cancelled', 'email')
        customer_name = self._build_customer_name(appointment.customer)
        vehicle_display = self._build_vehicle_display(appointment.vehicle)
        
        # Build context
        context = self._get_default_context()
        reason_text = f"Reason: {reason}" if reason else ""
        context.update({
            'customer_name': customer_name,
            'appointment_number': appointment.appointment_number,
            'appointment_date': str(appointment.appointment_date),
            'appointment_time': str(appointment.appointment_time),
            'vehicle': vehicle_display,
            'vehicle_display': vehicle_display,
            'reason': reason,
            'reason_text': reason_text,
        })
        
        title = f'Appointment Cancelled - {appointment.appointment_date}'
        if template and template.subject:
            title = self.service._render_template(template.subject, context)
        
        message = f'''Your appointment scheduled for {appointment.appointment_date} at {appointment.appointment_time} has been cancelled.

{reason_text}

Vehicle: {vehicle_display}

Please contact us to reschedule.'''
        if template and template.body:
            message = self.service._render_template(template.body, context)
        
        notification = Notification.objects.create(
            recipient=appointment.customer.user,
            notification_type='appointment',
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='appointment',
            related_object_id=appointment.id
        )
        self.service.send_notification(notification)
    
    def appointment_reminder(self, appointment):
        """Send appointment reminder (to be called by scheduled task)"""
        if not appointment.customer.user:
            return
        
        template = self._get_template('appointment_reminder', 'email')
        customer_name = self._build_customer_name(appointment.customer)
        vehicle_display = self._build_vehicle_display(appointment.vehicle)
        technician = appointment.assigned_technicians.first()
        technician_name = technician.get_full_name() if technician else "TBD"
        
        # Build context
        context = self._get_default_context()
        context.update({
            'customer_name': customer_name,
            'appointment_number': appointment.appointment_number,
            'appointment_date': str(appointment.appointment_date),
            'appointment_time': str(appointment.appointment_time),
            'vehicle': vehicle_display,
            'vehicle_display': vehicle_display,
            'service_description': appointment.service_description or "General Service",
            'technician_name': technician_name,
        })
        
        title = f'Appointment Reminder: {appointment.appointment_date}'
        if template and template.subject:
            title = self.service._render_template(template.subject, context)
        
        message = f'Reminder: You have an appointment on {appointment.appointment_date} at {appointment.appointment_time}'
        if template and template.body:
            message = self.service._render_template(template.body, context)
        
        notification = Notification.objects.create(
            recipient=appointment.customer.user,
            notification_type='appointment',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='appointment',
            related_object_id=appointment.id
        )
        self.service.send_notification(notification)
    
    def vehicle_ready(self, appointment):
        """Notify customer that vehicle is ready for pickup"""
        if not appointment.customer.user:
            return
        
        template = self._get_template('vehicle_ready', 'email')
        customer_name = self._build_customer_name(appointment.customer)
        vehicle_display = self._build_vehicle_display(appointment.vehicle)
        
        # Build context
        context = self._get_default_context()
        context.update({
            'customer_name': customer_name,
            'vehicle_display': vehicle_display,
            'vehicle': vehicle_display,
            'work_order_number': appointment.work_order.work_order_number if hasattr(appointment, 'work_order') and appointment.work_order else "N/A",
            'ready_time': timezone.now().strftime("%Y-%m-%d %H:%M"),
            'pickup_location': get_company_info().get('company_address', 'Workshop'),
            'pickup_instructions': 'Please bring your appointment confirmation and payment method.',
        })
        
        title = f'Your {vehicle_display} is Ready for Pickup'
        if template and template.subject:
            title = self.service._render_template(template.subject, context)
        
        message = f'''Good news! Your vehicle is ready for pickup.

Vehicle: {vehicle_display}
Appointment: {appointment.appointment_date}

Please bring your appointment confirmation and payment method.'''
        if template and template.body:
            message = self.service._render_template(template.body, context)
        
        notification = Notification.objects.create(
            recipient=appointment.customer.user,
            notification_type='vehicle',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='appointment',
            related_object_id=appointment.id
        )
        self.service.send_notification(notification)
    
    # ==================== WORK ORDER NOTIFICATIONS ====================
    
    def work_order_created(self, work_order):
        """Notify customer when work order is created"""
        if not work_order.customer.user:
            return
        
        template = self._get_template('work_order_created', 'email')
        customer_name = self._build_customer_name(work_order.customer)
        vehicle_display = self._build_vehicle_display(work_order.vehicle)
        
        # Build context
        context = self._get_default_context()
        context.update({
            'work_order_id': work_order.id,
            'work_order_number': work_order.work_order_number,
            'vehicle': vehicle_display,
            'vehicle_display': vehicle_display,
            'customer_name': customer_name,
            'problem_description': work_order.customer_concerns or "See work order for details",
            'service_description': work_order.customer_concerns or "General Service",
            'estimated_completion': work_order.estimated_completion.strftime("%Y-%m-%d %H:%M") if work_order.estimated_completion else "TBD",
            'status': work_order.get_status_display(),
        })
        
        title = f'Work Order Created - {work_order.work_order_number}'
        if template and template.subject:
            title = self.service._render_template(template.subject, context)
        
        message = f'''A work order has been created for your vehicle.

Work Order: {work_order.work_order_number}
Vehicle: {vehicle_display}
Status: {work_order.get_status_display()}

Description: {work_order.customer_concerns}

We'll keep you updated on the progress.'''
        if template and template.body:
            message = self.service._render_template(template.body, context)
        
        notification = Notification.objects.create(
            recipient=work_order.customer.user,
            notification_type='work_order',
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='work_order',
            related_object_id=work_order.id
        )
        self.service.send_notification(notification)
    
    def work_order_approved(self, work_order):
        """Notify staff when work order is approved by customer"""
        # Notify primary technician
        if work_order.primary_technician:
            template = self._get_template('work_order_approved', 'in_app')
            customer_name = self._build_customer_name(work_order.customer)
            vehicle_display = self._build_vehicle_display(work_order.vehicle)
            
            title = f'Work Order Approved - {work_order.work_order_number}'
            message = f'''Customer has approved work order {work_order.work_order_number}.

Vehicle: {vehicle_display}
Customer: {customer_name}

You can now start work.'''
            # In-app notifications typically don't use email templates, but we can prepare message
            if template and template.body:
                message = self.service._render_template(template.body, {
                    'work_order_number': work_order.work_order_number,
                    'vehicle_display': vehicle_display,
                    'customer_name': customer_name,
                })
            
            notification = Notification.objects.create(
                recipient=work_order.primary_technician,
                notification_type='work_order',
                channel='in_app',
                priority='high',
                template=None,  # In-app notifications don't typically use email templates
                title=title,
                message=message,
                data={
                    'work_order_id': work_order.id,
                    'work_order_number': work_order.work_order_number,
                    'customer_name': customer_name,
                    'vehicle_display': vehicle_display,
                },
                related_object_type='work_order',
                related_object_id=work_order.id
            )
            self.service.send_notification(notification)
    
    def work_order_completed(self, work_order):
        """Notify customer when work order is completed"""
        if not work_order.customer.user:
            return
        
        template = self._get_template('work_order_completed', 'email')
        customer_name = self._build_customer_name(work_order.customer)
        vehicle_display = self._build_vehicle_display(work_order.vehicle)
        
        context = self._with_money_context({
            'work_order_id': work_order.id,
            'work_order_number': work_order.work_order_number,
            'wo_number': work_order.work_order_number,
            'customer_name': customer_name,
            'vehicle': vehicle_display,
            'vehicle_display': vehicle_display,
            'completion_date': work_order.completed_at.strftime("%Y-%m-%d %H:%M") if work_order.completed_at else timezone.now().strftime("%Y-%m-%d %H:%M"),
            'total_amount': str(work_order.actual_total or work_order.estimated_total or 0),
            'estimate_amount': str(work_order.estimated_total or 0),
        })
        
        title = f'Work Order {work_order.work_order_number} Completed'
        if template and template.subject:
            title = self.service._render_template(template.subject, context)
        
        message = f'Work order {work_order.work_order_number} has been completed.'
        if template and template.body:
            message = self.service._render_template(template.body, context)
        
        notification = Notification.objects.create(
            recipient=work_order.customer.user,
            notification_type='work_order',
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='work_order',
            related_object_id=work_order.id
        )
        self.service.send_notification(notification)
    
    def work_order_requires_approval(self, work_order):
        """Notify customer that work order requires their approval"""
        if not work_order.customer.user:
            return
        
        # Use work_order_created template or create a custom one - for now use work_order_created
        template = self._get_template('work_order_created', 'email')
        customer_name = self._build_customer_name(work_order.customer)
        vehicle_display = self._build_vehicle_display(work_order.vehicle)
        
        # Build context
        context = self._get_default_context()
        context.update({
            'work_order_id': work_order.id,
            'work_order_number': work_order.work_order_number,
            'estimated_total': str(work_order.estimated_total or 0),
            'customer_name': customer_name,
            'vehicle': vehicle_display,
            'vehicle_display': vehicle_display,
            'problem_description': work_order.diagnosis_notes or work_order.customer_concerns or "See work order for details",
        })
        
        title = f'Approval Required - {work_order.work_order_number}'
        message = f'''Your approval is required for work order {work_order.work_order_number}.

Vehicle: {vehicle_display}
Diagnosis: {work_order.diagnosis_notes or "See work order for details"}

Estimated Cost: {format_money(work_order.estimated_total) if work_order.estimated_total else "TBD"}

Please review and approve to proceed with repairs.'''
        
        # Try to use template if available, otherwise use default message
        if template and template.body:
            # Adapt the template message for approval request
            try:
                message = self.service._render_template(template.body, context)
            except:
                pass  # Fall back to default message if template rendering fails
        
        notification = Notification.objects.create(
            recipient=work_order.customer.user,
            notification_type='work_order',
            channel='email',
            priority='high',
            template=template,  # Use template if available
            title=title,
            message=message,
            data=context,
            related_object_type='work_order',
            related_object_id=work_order.id
        )
        self.service.send_notification(notification)
    
    def work_order_started(self, work_order):
        """Notify technicians when work order starts"""
        # Notify all assigned technicians
        technicians = []
        if work_order.primary_technician:
            technicians.append(work_order.primary_technician)
        technicians.extend(work_order.assigned_technicians.all())
        
        for tech in set(technicians):  # Remove duplicates
            notification = Notification.objects.create(
                recipient=tech,
                notification_type='work_order',
                channel='in_app',
                priority='normal',
                title=f'Work Started - {work_order.work_order_number}',
                message=f'''Work order {work_order.work_order_number} has started.

Vehicle: {work_order.vehicle}
Customer: {work_order.customer}

You can now begin work on this order.''',
                data={
                    'work_order_id': work_order.id,
                    'work_order_number': work_order.work_order_number,
                },
                related_object_type='work_order',
                related_object_id=work_order.id
            )
            self.service.send_notification(notification)
    
    def work_order_paused(self, work_order, reason=''):
        """Notify when work order is paused"""
        # Notify customer if they're waiting
        if work_order.is_customer_waiting and work_order.customer.user:
            notification = Notification.objects.create(
                recipient=work_order.customer.user,
                notification_type='work_order',
                channel='email',
                priority='normal',
                title=f'Work Order Paused - {work_order.work_order_number}',
                message=f'''Work on your vehicle has been temporarily paused.

Work Order: {work_order.work_order_number}
Vehicle: {work_order.vehicle}
{f"Reason: {reason}" if reason else ""}

We'll resume work shortly.''',
                data={
                    'work_order_id': work_order.id,
                    'work_order_number': work_order.work_order_number,
                },
                related_object_type='work_order',
                related_object_id=work_order.id
            )
            self.service.send_notification(notification)
    
    def work_order_quality_check_failed(self, work_order):
        """Notify when quality check fails"""
        # Notify assigned technicians
        technicians = []
        if work_order.primary_technician:
            technicians.append(work_order.primary_technician)
        technicians.extend(work_order.assigned_technicians.all())
        
        for tech in set(technicians):
            notification = Notification.objects.create(
                recipient=tech,
                notification_type='work_order',
                channel='in_app',
                priority='high',
                title=f'Quality Check Failed - {work_order.work_order_number}',
                message=f'''Quality check failed for work order {work_order.work_order_number}.

Vehicle: {work_order.vehicle}
Notes: {work_order.quality_check_notes or "See work order for details"}

Please review and make necessary corrections.''',
                data={
                    'work_order_id': work_order.id,
                    'work_order_number': work_order.work_order_number,
                },
                related_object_type='work_order',
                related_object_id=work_order.id
            )
            self.service.send_notification(notification)
    
    def work_order_invoiced(self, work_order):
        """Notify customer when work order is invoiced"""
        if not work_order.customer.user:
            return
        
        # Use invoice_generated template since work order invoiced is essentially an invoice notification
        template = self._get_template('invoice_generated', 'email')
        customer_name = self._build_customer_name(work_order.customer)
        vehicle_display = self._build_vehicle_display(work_order.vehicle)
        from apps.billing.work_order_invoices import get_primary_invoice

        invoice = get_primary_invoice(work_order)
        total_amount = str(invoice.total if invoice else (work_order.estimated_total or 0))
        
        base = self._get_base_url()
        
        invoice_number = invoice.invoice_number if invoice else work_order.work_order_number
        invoice_date = invoice.invoice_date if invoice else work_order.completed_at.date() if hasattr(work_order, 'completed_at') and work_order.completed_at else timezone.now().date()
        due_date = invoice.due_date if invoice else invoice_date
        
        context = self._with_money_context({
            'work_order_id': work_order.id,
            'work_order_number': work_order.work_order_number,
            'customer_name': customer_name,
            'vehicle': vehicle_display,
            'vehicle_display': vehicle_display,
            'total_amount': total_amount,
            'total': total_amount,
            'invoice_number': invoice_number,
            'invoice_date': str(invoice_date),
            'due_date': str(due_date),
            'balance_due': str(invoice.amount_due if invoice else total_amount),
            'vehicle_info': vehicle_display,
            'invoice_link': f'{base}/portal/invoices/{invoice.id}' if invoice else f'{base}/portal/work-orders/{work_order.id}',
            'payment_link': f'{base}/portal/payment/{invoice.id}' if invoice else None,
            'invoice_pdf_url': f'{base}/api/billing/invoices/{invoice.id}/pdf/' if invoice else None,
            'filename': f'Invoice_{invoice_number}.pdf' if invoice else None,
        })
        
        title = f'Invoice Ready - {work_order.work_order_number}'
        message = f'''Your invoice is ready for work order {work_order.work_order_number}.

Vehicle: {vehicle_display}
Total: {context.get("total_display", format_money(total_amount))}

Please review and make payment when ready.'''
        
        # Try to use invoice template if available
        if template and template.body:
            try:
                message = self.service._render_template(template.body, context)
                if template and template.subject:
                    title = self.service._render_template(template.subject, context)
            except:
                pass  # Fall back to default message if template rendering fails
        
        
        # Determine enabled channels
        channels = ['email']
        
        # Check if WhatsApp is enabled globally and for the user
        whatsapp_settings = get_whatsapp_settings()
        whatsapp_enabled = whatsapp_settings.get('whatsapp_enabled', 'false').lower() == 'true'
        
        user_whatsapp_enabled = True
        if hasattr(work_order.customer.user, 'notification_preferences'):
            user_whatsapp_enabled = work_order.customer.user.notification_preferences.whatsapp_enabled
            
        if whatsapp_enabled and user_whatsapp_enabled:
            channels.append('whatsapp')
            
        for channel in channels:
            # Create notification for each channel
            notification = Notification.objects.create(
                recipient=work_order.customer.user,
                notification_type='work_order',
                channel=channel,
                priority='normal',
                template=self._get_template('invoice_generated', channel),  # Get template for specific channel
                title=title,
                message=message,
                data=context,
                related_object_type='work_order',
                related_object_id=work_order.id
            )
            self.service.send_notification(notification)
    
    def work_order_overdue(self, work_order):
        """Notify when work order becomes overdue"""
        # Notify manager and assigned technicians
        from apps.accounts.models import User
        
        managers = User.objects.filter(role='manager')
        technicians = []
        if work_order.primary_technician:
            technicians.append(work_order.primary_technician)
        technicians.extend(work_order.assigned_technicians.all())
        
        recipients = list(managers) + list(set(technicians))
        
        for recipient in recipients:
            notification = Notification.objects.create(
                recipient=recipient,
                notification_type='work_order',
                channel='in_app',
                priority='high',
                title=f'Work Order Overdue - {work_order.work_order_number}',
                message=f'''Work order {work_order.work_order_number} is overdue.

Vehicle: {work_order.vehicle}
Customer: {work_order.customer}
Estimated Completion: {work_order.estimated_completion.strftime("%Y-%m-%d %H:%M") if work_order.estimated_completion else "N/A"}

Please review and update status.''',
                data={
                    'work_order_id': work_order.id,
                    'work_order_number': work_order.work_order_number,
                },
                related_object_type='work_order',
                related_object_id=work_order.id
            )
            self.service.send_notification(notification)
    
    def work_order_service_coordinator_assigned(self, work_order, service_coordinator):
        """Notify service coordinator when assigned to a work order"""
        if not service_coordinator:
            return
        
        # Get customer name
        customer_name = work_order.customer.company_name if hasattr(work_order.customer, 'company_name') and work_order.customer.company_name else work_order.customer.user.get_full_name() if work_order.customer.user else str(work_order.customer)
        
        # Get vehicle info
        vehicle_info = f"{work_order.vehicle.year} {work_order.vehicle.make} {work_order.vehicle.model}" if work_order.vehicle else "N/A"
        
        # Create email notification
        email_notification = Notification.objects.create(
            recipient=service_coordinator,
            notification_type='work_order',
            channel='email',
            priority='normal',
            title=f'Assigned as Service Coordinator - {work_order.work_order_number}',
            message=f'''You have been assigned as the Service Coordinator for work order {work_order.work_order_number}.

Work Order: {work_order.work_order_number}
Customer: {customer_name}
Vehicle: {vehicle_info}
Status: {work_order.get_status_display()}
Created: {work_order.created_at.strftime("%Y-%m-%d %H:%M") if work_order.created_at else "N/A"}

Please review the work order and coordinate the diagnosis process.''',
            data={
                'work_order_id': work_order.id,
                'work_order_number': work_order.work_order_number,
                'customer_name': customer_name,
                'vehicle': vehicle_info,
                'status': work_order.status,
            },
            related_object_type='work_order',
            related_object_id=work_order.id
        )
        self.service.send_notification(email_notification)

    # ==================== VEHICLE/SERVICE NOTIFICATIONS ====================

    def service_due(self, schedule):
        """Notify customer when a vehicle service is due based on schedule"""
        if not schedule.vehicle.owner.user:
            return
            
        template = self._get_template('service_due', 'email')
        customer_name = self._build_customer_name(schedule.vehicle.owner)
        vehicle_display = self._build_vehicle_display(schedule.vehicle)
        
        # Build context
        context = self._get_default_context()
        
        service_name = schedule.service_type.name if schedule.service_type else "Scheduled Service"
        due_date_str = str(schedule.next_service_due_date) if schedule.next_service_due_date else "soon"
        due_mileage_str = f"{schedule.next_service_due_mileage} {schedule.vehicle.mileage_unit}" if schedule.next_service_due_mileage else ""
        
        due_text = due_date_str
        if due_mileage_str:
            due_text += f" or at {due_mileage_str}"
            
        context.update({
            'customer_name': customer_name,
            'vehicle': vehicle_display,
            'vehicle_display': vehicle_display,
            'service_name': service_name,
            'due_text': due_text,
            'current_mileage': str(schedule.vehicle.current_mileage),
        })
        
        title = f'Service Due: {service_name} for {vehicle_display}'
        message = f'''It's time for service for your vehicle!
        
Vehicle: {vehicle_display}
Service: {service_name}
Due: {due_text}

Please contact us to schedule an appointment or book online.'''

        if template and template.subject:
            try:
                title = self.service._render_template(template.subject, context)
            except:
                pass
                
        if template and template.body:
            try:
                message = self.service._render_template(template.body, context)
            except:
                pass
                
        notification = Notification.objects.create(
            recipient=schedule.vehicle.owner.user,
            notification_type='marketing', # Or 'vehicle' depending on categories
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='vehicle',
            related_object_id=schedule.vehicle.id
        )
        self.service.send_notification(notification)

    def parts_estimate_requested(self, work_order, diagnosis, requested_by):
        """Notify Parts Managers that a parts estimate is requested"""
        from apps.accounts.models import User
        
        # Find parts managers in the same branch
        # If branch filtering is strict, only show same branch
        parts_managers = User.objects.filter(
            branch=work_order.branch, 
            role='parts_manager', 
            is_active=True
        )
        
        # Fallback to managers if no parts manager found
        if not parts_managers.exists():
            parts_managers = User.objects.filter(
                managed_branches=work_order.branch,
                role='manager',
                is_active=True
            )
            
        count = 0
        for pm in parts_managers:
            # Note: Explicitly using 'in_app' to avoid SMS as requested, but also 'email' for visibility
            # The previous implementation only created 'in_app'. We'll stick to 'in_app' and 'email'.
            
            # 1. In-App Notification
            notification_in_app = Notification.objects.create(
                recipient=pm,
                notification_type='work_order',
                channel='in_app',
                priority='high',
                title=f"Parts Estimate Requested: WO #{work_order.work_order_number}",
                message=f"Technician {requested_by.get_full_name()} has requested an estimate for parts on Work Order #{work_order.work_order_number}.",
                data={
                    'work_order_id': work_order.id,
                    'diagnosis_id': diagnosis.id,
                    'action': 'estimate_required'
                },
                related_object_type='work_order',
                related_object_id=work_order.id
            )
            self.service.send_notification(notification_in_app)
            
            # 2. Email Notification (if they have email enabled)
            # We don't have a specific template yet, so we'll construct a generic message
            notification_email = Notification.objects.create(
                recipient=pm,
                notification_type='work_order',
                channel='email',
                priority='high',
                title=f"Parts Estimate Requested: WO #{work_order.work_order_number}",
                message=f'''Parts Estimate Requested
                
Work Order: {work_order.work_order_number}
Technician: {requested_by.get_full_name()}

Please review the parts required and provide an estimate.
''',
                data={
                    'work_order_id': work_order.id,
                    'diagnosis_id': diagnosis.id,
                    'action': 'estimate_required'
                },
                related_object_type='work_order',
                related_object_id=work_order.id
            )
            self.service.send_notification(notification_email)
            
            count += 1
            
        return count
    
    def part_requisition_created(self, part):
        """Notify Parts Managers when a part is requested via requisition"""
        from apps.accounts.models import User
        
        work_order = part.work_order
        
        # Find parts managers in the same branch
        recipients = User.objects.filter(
            branch=work_order.branch, 
            role__in=['parts_manager', 'manager', 'service_coordinator'], 
            is_active=True
        )
        
        if not recipients.exists():
            return

        customer_name = self._build_customer_name(work_order.customer)
        vehicle_display = self._build_vehicle_display(work_order.vehicle)
        requested_by_name = part.requested_by.get_full_name() if part.requested_by else "Technician"

        for recipient in recipients:
            if recipient == part.requested_by:
                continue # Don't notify self
                
            notification = Notification.objects.create(
                recipient=recipient,
                notification_type='work_order',
                channel='in_app',
                priority='high',
                title=f'Part Requisition - {part.requisition_number}',
                message=f'''New part requisition from {requested_by_name}.
    
    Part: {part.part_name} ({part.quantity})
    WO: {work_order.work_order_number}
    Vehicle: {vehicle_display}
    
    Please review and approve.''',
                data={
                    'work_order_id': work_order.id,
                    'work_order_number': work_order.work_order_number,
                    'part_id': part.id,
                    'requisition_number': part.requisition_number
                },
                related_object_type='work_order_part',
                related_object_id=part.id
            )
            self.service.send_notification(notification)

    def part_requisition_approved(self, part):
        """Notify requester when part requisition is approved"""
        if not part.requested_by:
            return
            
        work_order = part.work_order
        vehicle_display = self._build_vehicle_display(work_order.vehicle)
        approved_by_name = part.approved_by.get_full_name() if part.approved_by else "Manager"
        
        notification = Notification.objects.create(
            recipient=part.requested_by,
            notification_type='work_order',
            channel='in_app',
            priority='normal',
            title=f'Requisition Approved - {part.requisition_number}',
            message=f'''Your requisition for {part.part_name} has been approved by {approved_by_name}.
    
    WO: {work_order.work_order_number}
    Quantity: {part.quantity}
    
    You may now proceed.''',
            data={
                'work_order_id': work_order.id,
                'work_order_number': work_order.work_order_number,
                'part_id': part.id,
                'requisition_number': part.requisition_number
            },
            related_object_type='work_order_part',
            related_object_id=part.id
        )
        self.service.send_notification(notification)

    # ==================== INVOICE NOTIFICATIONS ====================
    
    def invoice_generated(self, invoice):
        """Notify customer when invoice is generated"""
        # invoice_generated is the same as invoice_sent, so delegate to it
        self.invoice_sent(invoice)
    
    def invoice_sent(self, invoice):
        """Notify customer when invoice is sent"""
        if not invoice.customer.user:
            return
        
        template = self._get_template('invoice_generated', 'email')
        customer_name = self._build_customer_name(invoice.customer)
        vehicle_info = self._build_vehicle_display(invoice.vehicle) if invoice.vehicle else "N/A"
        
        context = self._with_money_context({
             'invoice_id': invoice.id,
             'invoice_number': invoice.invoice_number,
             'total': str(invoice.total),
             'due_date': str(invoice.due_date),
             'customer_name': customer_name,
             'vehicle_info': vehicle_info,
             'vehicle_display': vehicle_info,
             'balance_due': str(invoice.amount_due or invoice.total),
             'work_order_number': invoice.work_order.work_order_number if invoice.work_order else "N/A",
             'invoice_date': str(invoice.invoice_date),
             'amount_paid': str(invoice.amount_paid),
             'invoice_link': f'{self._get_base_url()}/portal/invoices/{invoice.id}',
             'payment_link': f'{self._get_base_url()}/portal/payment/{invoice.id}',
        })
        
        title = f'Invoice {invoice.invoice_number} - {context["total_display"]}'
        if template and template.subject:
            title = self.service._render_template(template.subject, context)
        
        message = f'''Dear {customer_name},

Your invoice is ready for review.

INVOICE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Invoice Number: {invoice.invoice_number}
Invoice Date: {invoice.invoice_date}
Due Date: {invoice.due_date}

Work Order: {invoice.work_order.work_order_number if invoice.work_order else "N/A"}
Vehicle: {vehicle_info}

AMOUNT DUE: {context["total_display"]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please remit payment by the due date to avoid late fees.

For questions or to arrange payment, please contact us at your earliest convenience.

Thank you for your business!'''
        
        if template and template.body:
            message = self.service._render_template(template.body, context)
        
        notification = Notification.objects.create(
            recipient=invoice.customer.user,
            notification_type='invoice',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='invoice',
            related_object_id=invoice.id
        )
        self.service.send_notification(notification)

        # --- SMS delivery ---
        prefs = getattr(invoice.customer.user, 'notification_preferences', None)
        sms_enabled = not prefs or (prefs.sms_enabled and getattr(prefs, 'invoice_sms', True))
        customer_phone = (
            (prefs.phone_number if prefs else None)
            or getattr(invoice.customer, 'phone', None)
            or getattr(invoice.customer.user, 'phone', None)
        )
        if sms_enabled and customer_phone:
            portal_pay = f"{self._get_base_url()}/portal/payment/{invoice.id}"
            sms_body = (
                f"Invoice {invoice.invoice_number} ready. "
                f"Amount due: {format_money(invoice.amount_due or invoice.total)}. "
                f"Due: {invoice.due_date}. "
                f"Pay: {portal_pay}"
            )
            sms_notification = Notification.objects.create(
                recipient=invoice.customer.user,
                notification_type='invoice',
                channel='sms',
                priority='high',
                title=f'Invoice {invoice.invoice_number}',
                message=sms_body,
                data=context,
                related_object_type='invoice',
                related_object_id=invoice.id
            )
            self.service.send_notification(sms_notification)

        # --- Delivery tracking: stamp sent_at on the invoice ---
        from django.utils import timezone as tz
        if not invoice.sent_at:
            from apps.billing.models import Invoice as _Invoice
            _Invoice.objects.filter(pk=invoice.pk).update(sent_at=tz.now())

    def invoice_due_soon(self, invoice, days_until_due):
        """Remind customer that invoice is due soon"""
        if not invoice.customer.user:
            return
        
        template = self._get_template('invoice_due', 'email')
        customer_name = self._build_customer_name(invoice.customer)
        vehicle_info = self._build_vehicle_display(invoice.vehicle) if invoice.vehicle else "N/A"
        
        context = self._with_money_context({
            'invoice_id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'days_until_due': str(days_until_due),
            'balance_due': str(invoice.balance_due or invoice.total),
            'due_date': str(invoice.due_date),
            'customer_name': customer_name,
            'vehicle_display': vehicle_info,
            'vehicle_info': vehicle_info,
            'total': str(invoice.total),
            'work_order_number': invoice.work_order.work_order_number if invoice.work_order else "N/A",
            'invoice_link': f'{self._get_base_url()}/portal/invoices/{invoice.id}',
            'payment_link': f'{self._get_base_url()}/portal/payment/{invoice.id}',
        })
        
        title = f'Invoice Due in {days_until_due} Days - {invoice.invoice_number}'
        if template and template.subject:
            title = self.service._render_template(template.subject, context)
        
        message = f'''Reminder: Your invoice is due soon.

Invoice Number: {invoice.invoice_number}
Amount Due: {context["balance_due_display"]}
Due Date: {invoice.due_date} ({days_until_due} days)

Please remit payment to avoid late fees.'''
        if template and template.body:
            message = self.service._render_template(template.body, context)
        
        notification = Notification.objects.create(
            recipient=invoice.customer.user,
            notification_type='invoice',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='invoice',
            related_object_id=invoice.id
        )
        self.service.send_notification(notification)
    
    def invoice_overdue(self, invoice):
        """Notify customer that invoice is overdue"""
        if not invoice.customer.user:
            return
        
        template = self._get_template('invoice_overdue', 'email')
        customer_name = self._build_customer_name(invoice.customer)
        vehicle_info = self._build_vehicle_display(invoice.vehicle) if invoice.vehicle else "N/A"
        days_overdue = (timezone.now().date() - invoice.due_date).days
        
        context = self._with_money_context({
            'invoice_id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'days_overdue': str(days_overdue),
            'balance_due': str(invoice.balance_due or invoice.total),
            'due_date': str(invoice.due_date),
            'customer_name': customer_name,
            'vehicle_display': vehicle_info,
            'vehicle_info': vehicle_info,
            'total': str(invoice.total),
            'work_order_number': invoice.work_order.work_order_number if invoice.work_order else "N/A",
            'invoice_link': f'{self._get_base_url()}/portal/invoices/{invoice.id}',
            'payment_link': f'{self._get_base_url()}/portal/payment/{invoice.id}',
        })
        
        title = f'OVERDUE: Invoice {invoice.invoice_number} - {context["balance_due_display"]}'
        if template and template.subject:
            title = self.service._render_template(template.subject, context)
        
        message = f'''Your invoice is now overdue.

Invoice Number: {invoice.invoice_number}
Amount Due: {context["balance_due_display"]}
Due Date: {invoice.due_date} ({days_overdue} days overdue)

Late fees may apply. Please contact us to arrange payment.'''
        if template and template.body:
            message = self.service._render_template(template.body, context)
        
        notification = Notification.objects.create(
            recipient=invoice.customer.user,
            notification_type='invoice',
            channel='email',
            priority='urgent',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='invoice',
            related_object_id=invoice.id
        )
        self.service.send_notification(notification)
    
    # ==================== PAYMENT NOTIFICATIONS ====================
    
    def payment_received(self, payment):
        """Notify customer when payment is received"""
        if not payment.invoice.customer.user:
            return
        
        template = self._get_template('payment_received', 'email')
        customer_name = self._build_customer_name(payment.invoice.customer)
        
        # Get payment method display name
        payment_method_display = dict(payment.PAYMENT_METHOD_CHOICES).get(payment.payment_method, payment.payment_method) if hasattr(payment, 'PAYMENT_METHOD_CHOICES') else str(payment.payment_method)
        
        payment_date_str = payment.payment_date.strftime("%B %d, %Y") if hasattr(payment.payment_date, 'strftime') else str(payment.payment_date)
        inv = payment.invoice
        base = self._get_base_url()
        context = self._with_money_context({
            'payment_id': payment.id,
            'invoice_id': inv.id,
            'amount': str(payment.amount),
            'balance_due': str(inv.amount_due),
            'balance_remaining': str(inv.amount_due),
            'customer_name': customer_name,
            'payment_number': payment.payment_number if hasattr(payment, 'payment_number') else str(payment.id),
            'payment_method': payment_method_display,
            'invoice_number': inv.invoice_number,
            'payment_date': payment_date_str,
            'invoice_link': f'{base}/portal/invoices/{inv.id}',
            'payment_link': f'{base}/portal/payment/{inv.id}',
        })
        
        title = f'Payment Received - {context["amount_display"]}'
        if template and template.subject:
            title = self.service._render_template(template.subject, context)
        
        message = f'''Dear {customer_name},

Thank you for your payment!

PAYMENT RECEIPT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Payment Number: {payment.payment_number if hasattr(payment, 'payment_number') else payment.id}
Payment Date: {payment_date_str}
Payment Method: {payment_method_display}
Amount: {context["amount_display"]}

Invoice: {payment.invoice.invoice_number}
Balance Remaining: {context["balance_remaining_display"]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your payment has been successfully processed. This receipt serves as confirmation of your payment.

{f"Your invoice is now paid in full!" if payment.invoice.amount_due <= 0 else ""}

Thank you for your business!'''
        
        if template and template.body:
            message = self.service._render_template(template.body, context)
        
        notification = Notification.objects.create(
            recipient=payment.invoice.customer.user,
            notification_type='payment',
            template=template,
            channel='email',
            priority='normal',
            title=title,
            message=message,
            data=context,
            related_object_type='payment',
            related_object_id=payment.id
        )
        self.service.send_notification(notification)

        prefs = getattr(payment.invoice.customer.user, 'notification_preferences', None)
        sms_enabled = not prefs or (prefs.sms_enabled and getattr(prefs, 'payment_notifications', True))
        customer_phone = (
            (prefs.phone_number if prefs else None)
            or getattr(payment.invoice.customer, 'phone', None)
            or getattr(payment.invoice.customer.user, 'phone', None)
        )
        if sms_enabled and customer_phone:
            paid_msg = (
                f"Payment received: {payment.amount} for invoice {inv.invoice_number}. "
                f"Balance: {inv.amount_due}."
            )
            if inv.amount_due <= 0:
                paid_msg = (
                    f"Thank you! {payment.amount} received for invoice {inv.invoice_number}. "
                    "Paid in full."
                )
            sms_notification = Notification.objects.create(
                recipient=payment.invoice.customer.user,
                notification_type='payment',
                channel='sms',
                priority='normal',
                title=f'Payment received — {inv.invoice_number}',
                message=paid_msg,
                data=context,
                related_object_type='payment',
                related_object_id=payment.id,
            )
            self.service.send_notification(sms_notification)
    
    # ==================== INVENTORY NOTIFICATIONS ====================
    
    def low_stock_alert(self, part, recipient):
        """Alert parts manager about low stock"""
        template = self._get_template('low_stock_alert', 'in_app')
        
        # Build context
        context = self._get_default_context()
        context.update({
            'part_id': part.id,
            'part_number': part.part_number,
            'part_name': part.name,
            'quantity': str(part.quantity_in_stock),
            'reorder_point': str(part.reorder_point),
            'current_stock': str(part.quantity_in_stock),
        })
        
        title = f'Low Stock Alert: {part.name}'
        if template and template.push_title:
             title = self.service._render_template(template.push_title, context)
             
        message = f'Part {part.part_number} ({part.name}) is low in stock. Current: {part.quantity_in_stock}, Reorder point: {part.reorder_point}'
        if template and template.push_body:
             message = self.service._render_template(template.push_body, context)
             
        notification = Notification.objects.create(
            recipient=recipient,
            notification_type='inventory',
            channel='in_app',
            priority='high',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='part',
            related_object_id=part.id
        )
        self.service.send_notification(notification)
    
    def parts_received(self, purchase_order):
        """Notify requester that ordered parts have been received"""
        if not purchase_order.requested_by:
            return
            
        # No specific template for parts_received yet, use generic logic or add type later
        # Using in_app mostly
        
        context = self._get_default_context()
        context.update({
            'po_id': purchase_order.id,
            'po_number': purchase_order.po_number,
            'supplier': purchase_order.supplier.name,
            'status': purchase_order.get_status_display(),
        })
        
        notification = Notification.objects.create(
            recipient=purchase_order.requested_by,
            notification_type='inventory',
            channel='in_app',
            priority='normal',
            title=f'Parts Received - PO {purchase_order.po_number}',
            message=f'''Your ordered parts have been received.

PO Number: {purchase_order.po_number}
Supplier: {purchase_order.supplier.name}
Status: {purchase_order.get_status_display()}

Parts are now available for use.''',
            data=context,
            related_object_type='purchase_order',
            related_object_id=purchase_order.id
        )
        self.service.send_notification(notification)

    def purchase_order_approval_request(self, purchase_order, recipient):
        """Notify manager that purchase order requires approval"""
        if not recipient:
            return

        context = self._with_money_context({
            'po_id': purchase_order.id,
            'po_number': purchase_order.po_number,
            'supplier': purchase_order.supplier.name,
            'total': str(purchase_order.total) if purchase_order.total else '0.00',
            'requested_by': purchase_order.created_by.get_full_name() if purchase_order.created_by else 'Unknown',
        })
        
        title = f'Approval Required: PO {purchase_order.po_number}'
        message = f'''Purchase Order {purchase_order.po_number} from {purchase_order.supplier.name} requires your approval.

Total: {context["total_display"]}
Requested By: {context['requested_by']}

Please review and approve.'''

        # Send Email
        # Check if template exists (maybe custom type or generic)
        # For now, default to hardcoded but check for 'purchase_order_approval' just in case
        template = self._get_template('purchase_order_approval', 'email')
        if template:
             if template.subject: title = self.service._render_template(template.subject, context)
             if template.body: message = self.service._render_template(template.body, context)

        notification = Notification.objects.create(
            recipient=recipient,
            notification_type='inventory',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='purchase_order',
            related_object_id=purchase_order.id
        )
        self.service.send_notification(notification)
        
        # In-App
        in_app_notification = Notification.objects.create(
            recipient=recipient,
            notification_type='inventory',
            channel='in_app',
            priority='high',
            title=title,
            message=message,
            data=context,
            related_object_type='purchase_order',
            related_object_id=purchase_order.id
        )
        self.service.send_notification(in_app_notification)

    def bill_approval_request(self, bill, recipient):
        """Notify approver that a standalone vendor bill requires approval."""
        if not recipient:
            return

        context = self._with_money_context({
            'bill_id': bill.id,
            'bill_number': bill.bill_number,
            'vendor': bill.vendor.name,
            'total': str(bill.total) if bill.total else '0.00',
            'requested_by': bill.submitted_by.get_full_name() if bill.submitted_by else str(bill.created_by),
            'approval_url': f"{self._get_base_url()}/billing/bills/{bill.id}",
        })

        title = f'Approval Required: Bill {bill.bill_number}'
        message = f'''Vendor Bill {bill.bill_number} from {bill.vendor.name} requires your approval.

Total: {context["total_display"]}
Requested By: {context['requested_by']}

Please review and approve.'''

        for channel in ['email', 'in_app']:
            notification = Notification.objects.create(
                recipient=recipient,
                notification_type='payment',
                channel=channel,
                priority='high',
                title=title,
                message=message,
                data=context,
                related_object_type='bill',
                related_object_id=bill.id
            )
            self.service.send_notification(notification)

    def stock_transfer_approval_request(self, transfer, recipient):
        """Notify manager that stock transfer requires approval"""
        if not recipient:
            return

        # Build context
        context = self._get_default_context()
        context.update({
            'transfer_id': transfer.id,
            'transfer_number': transfer.transfer_number,
            'source_branch': transfer.source_branch.name,
            'destination_branch': transfer.destination_branch.name,
            'requested_by': transfer.created_by.get_full_name() if transfer.created_by else 'Unknown',
        })
        
        title = f'Approval Required: Transfer {transfer.transfer_number}'
        message = f'''Stock Transfer {transfer.transfer_number} requires your approval.

From: {transfer.source_branch.name}
To: {transfer.destination_branch.name}
Requested By: {context['requested_by']}

Please review and approve.'''

        template = self._get_template('stock_transfer_approval', 'email')
        if template:
             if template.subject: title = self.service._render_template(template.subject, context)
             if template.body: message = self.service._render_template(template.body, context)

        notification = Notification.objects.create(
            recipient=recipient,
            notification_type='inventory',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='transfer',
            related_object_id=transfer.id
        )
        self.service.send_notification(notification)
        
        # In-App
        in_app_notification = Notification.objects.create(
            recipient=recipient,
            notification_type='inventory',
            channel='in_app',
            priority='high',
            title=title,
            message=message,
            data=context,
            related_object_type='transfer',
            related_object_id=transfer.id
        )
        self.service.send_notification(in_app_notification)
    
    # ==================== INSPECTION NOTIFICATIONS ====================
    
    def inspection_completed(self, inspection):
        """Notify customer when vehicle inspection is completed"""
        if not inspection.vehicle.owner.user:
            return
        
        from django.conf import settings
        
        template = self._get_template('inspection_completed', 'email')
        customer_name = self._build_customer_name(inspection.vehicle.owner)
        vehicle_display = self._build_vehicle_display(inspection.vehicle)
        
        # Build portal link
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:3001')
        portal_link = f"{frontend_url}/portal/inspections/{inspection.id}/"
        
        # Prepare context data
        context_data = self._get_default_context()
        context_data.update({
            'customer_name': customer_name,
            'inspection_number': inspection.inspection_number,
            'vehicle_display': vehicle_display,
            'inspection_date': str(inspection.inspection_date.date()) if hasattr(inspection, 'inspection_date') and inspection.inspection_date else "N/A",
            'inspection_link': portal_link,
            'portal_link': portal_link,
            'overall_result': inspection.get_overall_result_display() if hasattr(inspection, 'get_overall_result_display') and inspection.overall_result else "Pending",
            'overall_result_display': inspection.get_overall_result_display() if hasattr(inspection, 'get_overall_result_display') and inspection.overall_result else "Pending",
        })
        
        title = f'Inspection Completed - {inspection.inspection_number}'
        if template and template.subject:
            title = self.service._render_template(template.subject, context_data)
        
        message = f'''Your vehicle inspection is complete.

Inspection: {inspection.inspection_number}
Vehicle: {vehicle_display}
Result: {inspection.get_overall_result_display() if hasattr(inspection, 'get_overall_result_display') and inspection.overall_result else "Pending"}

Please review and approve the inspection report by clicking the link below:
{portal_link}

Thank you for choosing our service.'''
        if template and template.body:
            message = self.service._render_template(template.body, context_data)
        
        # Create email notification
        email_notification = Notification.objects.create(
            recipient=inspection.vehicle.owner.user,
            notification_type='inspection',
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data=context_data,
            related_object_type='inspection',
            related_object_id=inspection.id
        )
        self.service.send_notification(email_notification)
        
        # Create in-app notification
        in_app_notification = Notification.objects.create(
            recipient=inspection.vehicle.owner.user,
            notification_type='inspection',
            channel='in_app',
            priority='normal',
            template=None,  # In-app notifications don't use email templates
            title=title,
            message=message,
            data=context_data,
            related_object_type='inspection',
            related_object_id=inspection.id
        )
        self.service.send_notification(in_app_notification)
    
    # ==================== ROADSIDE ASSISTANCE NOTIFICATIONS ====================
    
    def roadside_requested(self, roadside_request):
        """Notify customer when roadside request is created - Enhanced with SMS & Admin alerts"""
        # Build common context
        customer_name = self._build_customer_name(roadside_request.customer)
        vehicle_display = self._build_vehicle_display(roadside_request.vehicle)
        
        # ------------------------------------------------------------------
        # 1. CUSTOMER NOTIFICATIONS (Email + SMS)
        # ------------------------------------------------------------------
        if roadside_request.customer.user:
            # Check user preferences
            prefs = getattr(roadside_request.customer.user, 'notification_preferences', None)
            
            # --- EMAIL ---
            # Default to True if no prefs, or check specific setting
            send_email = not prefs or (prefs.email_enabled and prefs.roadside_requested_email)
            
            if send_email:
                template = self._get_template('roadside_requested', 'email')
                
                # Build context
                context = self._get_default_context()
                context.update({
                    'request_id': roadside_request.id,
                    'request_number': roadside_request.request_number,
                    'service_type': roadside_request.service_type,
                    'service_type_display': roadside_request.get_service_type_display(),
                    'customer_name': customer_name,
                    'vehicle_display': vehicle_display,
                    'breakdown_location': roadside_request.breakdown_location,
                })
                
                title = f'Roadside Assistance Requested - {roadside_request.request_number}'
                if template and template.subject:
                    title = self.service._render_template(template.subject, context)
                
                message = f'''Your roadside assistance request has been received.

Request: {roadside_request.request_number}
Service: {roadside_request.get_service_type_display()}
Vehicle: {vehicle_display}
Location: {roadside_request.breakdown_location}

We'll dispatch a service provider shortly.'''
                if template and template.body:
                    message = self.service._render_template(template.body, context)
                
                notification = Notification.objects.create(
                    recipient=roadside_request.customer.user,
                    notification_type='roadside',
                    channel='email',
                    priority='high',
                    template=template,
                    title=title,
                    message=message,
                    data=context,
                    related_object_type='roadside',
                    related_object_id=roadside_request.id
                )
                self.service.send_notification(notification)

            # --- SMS (NEW) ---
            # Check specific SMS preference
            # If prefs exists, use its setting; otherwise default to True if we have a phone number (Account or Prefs)
            has_phone = (prefs and prefs.phone_number) or (roadside_request.customer.user.phone)
            sms_enabled = False
            
            if prefs:
                sms_enabled = prefs.sms_enabled and prefs.roadside_requested_sms
            else:
                # Default to enabling SMS for critical alerts if user has a phone but no prefs set yet
                sms_enabled = True

            send_sms = sms_enabled and has_phone
            
            if send_sms:
                sms_message = f'''Roadside assistance requested - {roadside_request.request_number}

Service: {roadside_request.get_service_type_display()}
Location: {roadside_request.breakdown_location}

Help is on the way! - {self._get_company_name()}'''
                
                sms_notification = Notification.objects.create(
                    recipient=roadside_request.customer.user,
                    notification_type='roadside',
                    channel='sms',
                    priority='high',
                    title=f'Roadside Request {roadside_request.request_number}',
                    message=sms_message,
                    data={
                        'request_id': roadside_request.id,
                        'request_number': roadside_request.request_number,
                    },
                    related_object_type='roadside',
                    related_object_id=roadside_request.id
                )
                self.service.send_notification(sms_notification)

        # ------------------------------------------------------------------
        # 2. BRANCH STAFF NOTIFICATIONS (In-App)
        # ------------------------------------------------------------------
        from apps.roadside.branch_utils import get_roadside_branch_notification_recipients

        branch_name = (
            roadside_request.branch.name
            if roadside_request.branch_id and roadside_request.branch
            else 'Unassigned'
        )
        staff_recipients = get_roadside_branch_notification_recipients(roadside_request.branch)

        for staff_user in staff_recipients:
            staff_prefs = getattr(staff_user, 'notification_preferences', None)
            if staff_prefs and not staff_prefs.system_notifications:
                continue

            staff_notification = Notification.objects.create(
                recipient=staff_user,
                notification_type='roadside',
                channel='in_app',
                priority='high',
                title=f'New Roadside Request - {roadside_request.request_number}',
                message=f'''New roadside assistance request received.

Branch: {branch_name}
Customer: {customer_name}
Service: {roadside_request.get_service_type_display()}
Location: {roadside_request.breakdown_location}

Requires dispatch assignment.''',
                data={
                    'request_id': roadside_request.id,
                    'request_number': roadside_request.request_number,
                    'customer_name': customer_name,
                    'branch_id': roadside_request.branch_id,
                    'branch_name': branch_name,
                },
                related_object_type='roadside',
                related_object_id=roadside_request.id,
            )
            self.service.send_notification(staff_notification)
    
    def roadside_dispatched(self, roadside_request):
        """Notify customer when service provider is dispatched - Enhanced with Technician alerts"""
        customer_name = self._build_customer_name(roadside_request.customer)
        vehicle_display = self._build_vehicle_display(roadside_request.vehicle)
        technician_name = roadside_request.assigned_technician.get_full_name() if roadside_request.assigned_technician else "Service Provider"
        
        # ------------------------------------------------------------------
        # 1. CUSTOMER NOTIFICATIONS
        # ------------------------------------------------------------------
        if roadside_request.customer.user:
            prefs = getattr(roadside_request.customer.user, 'notification_preferences', None)
            
            # --- EMAIL ---
            send_email = not prefs or (prefs.email_enabled and prefs.roadside_dispatched_email)
            
            if send_email:
                template = self._get_template('roadside_dispatched', 'email')
                
                # Build context
                context = self._get_default_context()
                context.update({
                    'request_id': roadside_request.id,
                    'request_number': roadside_request.request_number,
                    'technician_id': roadside_request.assigned_technician.id if roadside_request.assigned_technician else None,
                    'technician_name': technician_name,
                    'customer_name': customer_name,
                    'vehicle_display': vehicle_display,
                    'service_type': roadside_request.get_service_type_display(),
                    'breakdown_location': roadside_request.breakdown_location,
                })
                
                title = f'Service Provider Dispatched - {roadside_request.request_number}'
                if template and template.subject:
                    title = self.service._render_template(template.subject, context)
                
                message = f'''A service provider has been dispatched to your location.

Request: {roadside_request.request_number}
Service Provider: {technician_name}
Service: {roadside_request.get_service_type_display()}
Vehicle: {vehicle_display}
Location: {roadside_request.breakdown_location}

They should arrive shortly.'''
                if template and template.body:
                    message = self.service._render_template(template.body, context)
                
                notification = Notification.objects.create(
                    recipient=roadside_request.customer.user,
                    notification_type='roadside',
                    channel='email',
                    priority='high',
                    template=template,
                    title=title,
                    message=message,
                    data=context,
                    related_object_type='roadside',
                    related_object_id=roadside_request.id
                )
                self.service.send_notification(notification)

            # --- SMS (NEW) ---
            has_phone = (prefs and prefs.phone_number) or (roadside_request.customer.user.phone)
            sms_enabled = False
            
            if prefs:
                sms_enabled = prefs.sms_enabled and prefs.roadside_dispatched_sms
            else:
                sms_enabled = True

            send_sms = sms_enabled and has_phone
            
            if send_sms:
                sms_message = f'''{technician_name} dispatched to your location!

Request: {roadside_request.request_number}
Service: {roadside_request.get_service_type_display()}

ETA: Shortly - {self._get_company_name()}'''
                
                sms_notification = Notification.objects.create(
                    recipient=roadside_request.customer.user,
                    notification_type='roadside',
                    channel='sms',
                    priority='high',
                    title=f'Provider Dispatched - {roadside_request.request_number}',
                    message=sms_message,
                    data={
                        'request_id': roadside_request.id,
                        'request_number': roadside_request.request_number,
                    },
                    related_object_type='roadside',
                    related_object_id=roadside_request.id
                )
                self.service.send_notification(sms_notification)
        
        # ------------------------------------------------------------------
        # 2. TECHNICIAN NOTIFICATIONS (In-App + SMS)
        # ------------------------------------------------------------------
        if roadside_request.assigned_technician:
            # In-App Notification
            tech_notification = Notification.objects.create(
                recipient=roadside_request.assigned_technician,
                notification_type='roadside',
                channel='in_app',
                priority='high',
                title=f'Roadside Assignment - {roadside_request.request_number}',
                message=f'''You have been assigned to a roadside assistance request.

Customer: {customer_name}
Phone: {roadside_request.customer_phone or "Not provided"}
Service: {roadside_request.get_service_type_display()}
Vehicle: {vehicle_display}
Location: {roadside_request.breakdown_location}

Open the Tech App to accept or decline this job.''',
                data={
                    'request_id': roadside_request.id,
                    'request_number': roadside_request.request_number,
                    'customer_phone': roadside_request.customer_phone,
                },
                related_object_type='roadside',
                related_object_id=roadside_request.id
            )
            self.service.send_notification(tech_notification)
            
            # SMS Notification (if technician has phone & prefs enabled)
            tech_prefs = getattr(roadside_request.assigned_technician, 'notification_preferences', None)
            if tech_prefs and tech_prefs.sms_enabled and tech_prefs.phone_number:
                tech_sms = Notification.objects.create(
                    recipient=roadside_request.assigned_technician,
                    notification_type='roadside',
                    channel='sms',
                    priority='high',
                    title=f'New Assignment - {roadside_request.request_number}',
                    message=f'''Roadside assignment: {roadside_request.request_number}

Service: {roadside_request.get_service_type_display()}
Location: {roadside_request.breakdown_location}
Customer: {roadside_request.customer_phone or "N/A"}

Check app for details.''',
                    data={'request_id': roadside_request.id},
                    related_object_type='roadside',
                    related_object_id=roadside_request.id
                )
                self.service.send_notification(tech_sms)

    def roadside_assignment_rejected(self, roadside_request, technician, reason=''):
        """Alert dispatch staff when a technician declines an assignment."""
        from apps.roadside.branch_utils import get_roadside_branch_notification_recipients

        tech_name = technician.get_full_name() or technician.username
        reason_line = f"\nReason: {reason}" if reason else ""
        message = (
            f"{tech_name} declined roadside assignment {roadside_request.request_number}."
            f"{reason_line}\n\nPlease assign another technician."
        )
        recipients = get_roadside_branch_notification_recipients(roadside_request.branch)
        for staff in recipients:
            if staff.id == technician.id:
                continue
            notification = Notification.objects.create(
                recipient=staff,
                notification_type='roadside',
                channel='in_app',
                priority='high',
                title=f'Assignment declined — {roadside_request.request_number}',
                message=message,
                data={
                    'request_id': roadside_request.id,
                    'request_number': roadside_request.request_number,
                    'technician_id': technician.id,
                },
                related_object_type='roadside',
                related_object_id=roadside_request.id,
            )
            self.service.send_notification(notification)

    def roadside_arrived(self, roadside_request):
        """Notify customer when service provider arrives - Enhanced with Optional SMS"""
        customer_name = self._build_customer_name(roadside_request.customer)
        technician_name = roadside_request.assigned_technician.get_full_name() if roadside_request.assigned_technician else "Service Provider"
        
        if roadside_request.customer.user:
            prefs = getattr(roadside_request.customer.user, 'notification_preferences', None)
            
            # --- EMAIL ---
            send_email = not prefs or (prefs.email_enabled and prefs.roadside_arrived_email)
            
            if send_email:
                template = self._get_template('roadside_arrived', 'email')
                
                title = f'Service Provider Arrived - {roadside_request.request_number}'
                if template and template.subject:
                    title = self.service._render_template(template.subject, {
                        'request_number': roadside_request.request_number,
                    })
                
                message = f'''Your service provider has arrived at your location.

Request: {roadside_request.request_number}
Service Provider: {technician_name}

They will begin service shortly.'''
                if template and template.body:
                    message = self.service._render_template(template.body, {
                        'customer_name': customer_name,
                        'request_number': roadside_request.request_number,
                        'technician_name': technician_name,
                        'company_name': self._get_company_name(),
                    })
                
                notification = Notification.objects.create(
                    recipient=roadside_request.customer.user,
                    notification_type='roadside',
                    channel='email',
                    priority='normal',
                    template=template,
                    title=title,
                    message=message,
                    data={
                        'request_id': roadside_request.id,
                        'request_number': roadside_request.request_number,
                        'customer_name': customer_name,
                    },
                    related_object_type='roadside',
                    related_object_id=roadside_request.id
                )
                self.service.send_notification(notification)

            # --- SMS (Optional, default False) ---
            has_phone = (prefs and prefs.phone_number) or (roadside_request.customer.user.phone)
            sms_enabled = False
            
            if prefs:
                sms_enabled = prefs.sms_enabled and prefs.roadside_arrived_sms
            else:
                # Arrival is less critical, maybe default True? Let's be consistent.
                sms_enabled = True
            
            send_sms = sms_enabled and has_phone
            
            if send_sms:
                sms_message = f'''{technician_name} has arrived!

Request: {roadside_request.request_number}

Service starting now - {self._get_company_name()}'''
                
                sms_notification = Notification.objects.create(
                    recipient=roadside_request.customer.user,
                    notification_type='roadside',
                    channel='sms',
                    priority='normal',
                    title=f'Provider Arrived - {roadside_request.request_number}',
                    message=sms_message,
                    data={
                        'request_id': roadside_request.id,
                        'request_number': roadside_request.request_number,
                    },
                    related_object_type='roadside',
                    related_object_id=roadside_request.id
                )
                self.service.send_notification(sms_notification)
    
    def roadside_completed(self, roadside_request):
        """Notify customer when roadside service is completed - Enhanced with SMS"""
        customer_name = self._build_customer_name(roadside_request.customer)
        vehicle_display = self._build_vehicle_display(roadside_request.vehicle)
        
        if roadside_request.customer.user:
            prefs = getattr(roadside_request.customer.user, 'notification_preferences', None)
            
            # --- EMAIL ---
            send_email = not prefs or (prefs.email_enabled and prefs.roadside_completed_email)
            
            if send_email:
                template = self._get_template('roadside_completed', 'email')
                
                title = f'Roadside Service Completed - {roadside_request.request_number}'
                if template and template.subject:
                    title = self.service._render_template(template.subject, {
                        'request_number': roadside_request.request_number,
                    })
                
                coverage_status = "covered by your subscription" if roadside_request.is_covered_by_subscription else "charged to your account"
                message = f'''Your roadside assistance service has been completed.

Request: {roadside_request.request_number}
Service: {roadside_request.get_service_type_display()}
Vehicle: {vehicle_display}
Status: {coverage_status}

Thank you for using our roadside assistance service.'''
                if template and template.body:
                    message = self.service._render_template(template.body, {
                        'customer_name': customer_name,
                        'request_number': roadside_request.request_number,
                        'service_type': roadside_request.get_service_type_display(),
                        'vehicle_display': vehicle_display,
                        'is_covered_by_subscription': roadside_request.is_covered_by_subscription,
                        'charge_amount': str(roadside_request.charge_amount) if roadside_request.charge_amount else "0.00",
                        'company_name': self._get_company_name(),
                    })
                
                notification = Notification.objects.create(
                    recipient=roadside_request.customer.user,
                    notification_type='roadside',
                    channel='email',
                    priority='normal',
                    template=template,
                    title=title,
                    message=message,
                    data={
                        'request_id': roadside_request.id,
                        'request_number': roadside_request.request_number,
                        'is_covered_by_subscription': roadside_request.is_covered_by_subscription,
                        'customer_name': customer_name,
                    },
                    related_object_type='roadside',
                    related_object_id=roadside_request.id
                )
                self.service.send_notification(notification)

            # --- SMS (NEW) ---
            has_phone = (prefs and prefs.phone_number) or (roadside_request.customer.user.phone)
            sms_enabled = False
            
            if prefs:
                sms_enabled = prefs.sms_enabled and prefs.roadside_completed_sms
            else:
                sms_enabled = True

            send_sms = sms_enabled and has_phone
            
            if send_sms:
                if roadside_request.is_covered_by_subscription:
                    sms_message = f'''Service completed - {roadside_request.request_number}

{roadside_request.get_service_type_display()} - Covered by subscription ✓

Thank you! - {self._get_company_name()}'''
                else:
                    charge = format_money(roadside_request.charge_amount) if roadside_request.charge_amount else "See invoice"
                    sms_message = f'''Service completed - {roadside_request.request_number}

{roadside_request.get_service_type_display()} - {charge}

Invoice sent. Thank you! - {self._get_company_name()}'''
                
                sms_notification = Notification.objects.create(
                    recipient=roadside_request.customer.user,
                    notification_type='roadside',
                    channel='sms',
                    priority='normal',
                    title=f'Service Complete - {roadside_request.request_number}',
                    message=sms_message,
                    data={
                        'request_id': roadside_request.id,
                        'request_number': roadside_request.request_number,
                    },
                    related_object_type='roadside',
                    related_object_id=roadside_request.id
                )
                self.service.send_notification(sms_notification)
    
    def roadside_cancelled(self, roadside_request):
        """Notify customer when roadside service is cancelled"""
        customer_name = self._build_customer_name(roadside_request.customer)
        vehicle_display = self._build_vehicle_display(roadside_request.vehicle)
        
        if roadside_request.customer.user:
            prefs = getattr(roadside_request.customer.user, 'notification_preferences', None)
            
            # --- EMAIL ---
            send_email = not prefs or prefs.email_enabled
            
            if send_email:
                template = self._get_template('roadside_cancelled', 'email')
                
                title = f'Roadside Service Cancelled - {roadside_request.request_number}'
                if template and template.subject:
                    title = self.service._render_template(template.subject, {
                        'request_number': roadside_request.request_number,
                    })
                
                message = f'''Your roadside assistance service has been cancelled.

Request: {roadside_request.request_number}
Service: {roadside_request.get_service_type_display()}
Vehicle: {vehicle_display}

If you did not request this cancellation or need to reschedule, please contact us.'''
                if template and template.body:
                    message = self.service._render_template(template.body, {
                        'customer_name': customer_name,
                        'request_number': roadside_request.request_number,
                        'service_type': roadside_request.get_service_type_display(),
                        'vehicle_display': vehicle_display,
                    })
                
                notification = Notification.objects.create(
                    recipient=roadside_request.customer.user,
                    notification_type='roadside',
                    channel='email',
                    priority='normal',
                    template=template,
                    title=title,
                    message=message,
                    data={
                        'request_id': roadside_request.id,
                        'request_number': roadside_request.request_number,
                    },
                    related_object_type='roadside',
                    related_object_id=roadside_request.id
                )
                self.service.send_notification(notification)

            # --- SMS ---
            has_phone = (prefs and prefs.phone_number) or (roadside_request.customer.user.phone)
            sms_enabled = not prefs or prefs.sms_enabled
            
            if sms_enabled and has_phone:
                sms_message = f'''Service cancelled - {roadside_request.request_number}

{roadside_request.get_service_type_display()}

Contact us to reschedule. - {self._get_company_name()}'''
                
                sms_notification = Notification.objects.create(
                    recipient=roadside_request.customer.user,
                    notification_type='roadside',
                    channel='sms',
                    priority='normal',
                    title=f'Service Cancelled - {roadside_request.request_number}',
                    message=sms_message,
                    data={
                        'request_id': roadside_request.id,
                        'request_number': roadside_request.request_number,
                    },
                    related_object_type='roadside',
                    related_object_id=roadside_request.id
                )
                self.service.send_notification(sms_notification)
    
    # ==================== SYSTEM NOTIFICATIONS ====================
    
    def service_due_reminder(self, schedule_or_vehicle, channel='email'):
        """
        Remind customer that service is due.
        
        Args:
            schedule_or_vehicle: VehicleServiceSchedule instance or Vehicle instance
            channel: 'email', 'sms', or 'call' (default: 'email')
        """
        from apps.vehicles.models import VehicleServiceSchedule, Vehicle
        
        # Handle both VehicleServiceSchedule and Vehicle for backward compatibility
        if isinstance(schedule_or_vehicle, VehicleServiceSchedule):
            schedule = schedule_or_vehicle
            vehicle = schedule.vehicle
            service_type = schedule.service_type
            service_type_name = service_type.name
            last_service_date = schedule.last_service_date
            last_service_mileage = schedule.last_service_mileage
            next_service_due_date = schedule.next_service_due_date
            next_service_due_mileage = schedule.next_service_due_mileage
            days_until_due = schedule.days_until_due
            miles_until_due = schedule.miles_until_due
            related_object_type = 'service_schedule'
            related_object_id = schedule.id
        elif isinstance(schedule_or_vehicle, Vehicle):
            # Backward compatibility: use vehicle's general service info
            vehicle = schedule_or_vehicle
            schedule = None
            service_type = None
            service_type_name = 'Regular Maintenance'
            last_service_date = vehicle.last_service_date
            last_service_mileage = None
            next_service_due_date = vehicle.next_service_due_date
            next_service_due_mileage = vehicle.next_service_due_mileage
            days_until_due = None
            miles_until_due = None
            if next_service_due_date:
                from django.utils import timezone
                today = timezone.now().date()
                days_until_due = (next_service_due_date - today).days
            if next_service_due_mileage:
                miles_until_due = next_service_due_mileage - (vehicle.current_mileage or 0)
            related_object_type = 'vehicle'
            related_object_id = vehicle.id
        else:
            return
        
        if not vehicle.owner or not vehicle.owner.user:
            return
        
        customer = vehicle.owner
        template = self._get_template('service_due', channel)
        customer_name = self._build_customer_name(customer)
        vehicle_display = self._build_vehicle_display(vehicle)
        
        # Format due date
        if next_service_due_date:
            due_date_str = next_service_due_date.strftime('%B %d, %Y')
            if days_until_due is not None:
                if days_until_due < 0:
                    due_date_str = f"{due_date_str} ({abs(days_until_due)} days overdue)"
                elif days_until_due == 0:
                    due_date_str = f"{due_date_str} (Due today)"
                else:
                    due_date_str = f"{due_date_str} (in {days_until_due} days)"
        else:
            due_date_str = "Not set"
        
        # Format mileage info
        current_mileage = vehicle.current_mileage or 0
        mileage_info = f"{current_mileage:,} {vehicle.mileage_unit}"
        if next_service_due_mileage:
            if miles_until_due is not None:
                if miles_until_due <= 0:
                    mileage_info = f"{current_mileage:,} {vehicle.mileage_unit} (Due: {next_service_due_mileage:,} {vehicle.mileage_unit} - {abs(miles_until_due):,} {vehicle.mileage_unit} overdue)"
                else:
                    mileage_info = f"{current_mileage:,} {vehicle.mileage_unit} (Due: {next_service_due_mileage:,} {vehicle.mileage_unit} - {miles_until_due:,} {vehicle.mileage_unit} remaining)"
        
        title = f'Service Due: {service_type_name} for Your {vehicle_display}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'vehicle_display': vehicle_display,
                'service_type': service_type_name,
                'due_date': due_date_str,
            })
        
        message = f'''Dear {customer_name},

This is a reminder that your vehicle is due for service.

VEHICLE SERVICE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vehicle: {vehicle_display}
Service Type: {service_type_name}
Due Date: {due_date_str}
Current Mileage: {mileage_info}
Last Service: {last_service_date.strftime('%B %d, %Y') if last_service_date else "Never"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please schedule an appointment to keep your vehicle in optimal condition.

Contact us to schedule your service appointment.

Best regards,
{self._get_company_name()} Team'''
        
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
                'service_type': service_type_name,
                'due_date': due_date_str,
                'next_service_due_date': next_service_due_date.strftime('%B %d, %Y') if next_service_due_date else "Not set",
                'days_until_due': days_until_due if days_until_due is not None else "N/A",
                'current_mileage': f"{current_mileage:,} {vehicle.mileage_unit}",
                'next_service_due_mileage': f"{next_service_due_mileage:,} {vehicle.mileage_unit}" if next_service_due_mileage else "Not set",
                'miles_remaining': miles_until_due if miles_until_due is not None else "N/A",
                'last_service_date': last_service_date.strftime('%B %d, %Y') if last_service_date else "Never",
                'last_service_mileage': f"{last_service_mileage:,} {vehicle.mileage_unit}" if last_service_mileage else "N/A",
                'company_name': self._get_company_name(),
            })
        
        # For SMS, create a shorter message
        if channel == 'sms':
            sms_message = (
                f"Service Reminder: {service_type_name} due for {vehicle_display}. "
                f"Due: {due_date_str}. Current: {current_mileage:,} {vehicle.mileage_unit}. "
                f"Call us to schedule. - {self._get_company_name()}"
            )
            # Truncate if too long (SMS limit ~160 chars)
            if len(sms_message) > 160:
                sms_message = sms_message[:157] + "..."
            message = sms_message
        
        notification = Notification.objects.create(
            recipient=vehicle.owner.user,
            notification_type='vehicle',
            channel=channel,
            priority='normal',
            template=template,
            title=title,
            message=message,
            data={
                'vehicle_id': vehicle.id,
                'service_schedule_id': schedule.id if schedule else None,
                'service_type_id': service_type.id if service_type else None,
                'service_type_name': service_type_name,
                'last_service_date': str(last_service_date) if last_service_date else None,
                'next_service_due_date': str(next_service_due_date) if next_service_due_date else None,
                'next_service_due_mileage': next_service_due_mileage,
                'days_until_due': days_until_due,
                'miles_until_due': miles_until_due,
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
            },
            related_object_type=related_object_type,
            related_object_id=related_object_id
        )
        self.service.send_notification(notification)
    
    # ==================== ESTIMATE NOTIFICATIONS ====================
    
    def estimate_sent(self, estimate):
        """Notify customer when estimate is sent"""
        if not estimate.customer.user:
            return
        
        template = self._get_template('estimate_sent', 'email')
        customer_name = self._build_customer_name(estimate.customer)
        vehicle_display = self._build_vehicle_display(estimate.vehicle) if estimate.vehicle else "N/A"
        
        estimate_ctx = self._with_money_context({
            'customer_name': customer_name,
            'estimate_number': estimate.estimate_number,
            'total': str(estimate.total),
            'valid_until': str(estimate.valid_until),
            'vehicle_display': vehicle_display,
            'description': estimate.description or "See estimate for details",
            'estimate_link': f'{self._get_base_url()}/portal/estimates/{estimate.id}',
        })
        title = f'New Estimate #{estimate.estimate_number} - {estimate_ctx["total_display"]}'
        if template and template.subject:
            title = self.service._render_template(template.subject, estimate_ctx)
        
        message = f'''A new estimate has been prepared for your review.

Estimate Number: {estimate.estimate_number}
Amount: {estimate_ctx["total_display"]}
Valid Until: {estimate.valid_until}
Vehicle: {vehicle_display}

Description: {estimate.description or "See estimate for details"}

Please review and approve or decline this estimate to proceed.'''
        if template and template.body:
            message = self.service._render_template(template.body, estimate_ctx)
        
        # Determine enabled channels
        channels = ['email']
        
        # Check if WhatsApp is enabled globally and for the user
        whatsapp_settings = get_whatsapp_settings()
        whatsapp_enabled = whatsapp_settings.get('whatsapp_enabled', 'false').lower() == 'true'
        
        user_whatsapp_enabled = True
        if hasattr(estimate.customer.user, 'notification_preferences'):
            user_whatsapp_enabled = estimate.customer.user.notification_preferences.whatsapp_enabled
            
        if whatsapp_enabled and user_whatsapp_enabled:
            channels.append('whatsapp')
            
        for channel in channels:
            notification = Notification.objects.create(
                recipient=estimate.customer.user,
                notification_type='estimate',
                channel=channel,
                priority='high',
                template=self._get_template('estimate_sent', channel),
                title=title,
                message=message,
                data=estimate_ctx,
                related_object_type='estimate',
                related_object_id=estimate.id
            )
            self.service.send_notification(notification)
    
    def estimate_expiring_soon(self, estimate, days_until_expiration):
        """Remind customer that estimate is expiring soon"""
        if not estimate.customer.user:
            return
        
        template = self._get_template('estimate_expiring_soon', 'email')
        customer_name = self._build_customer_name(estimate.customer)
        vehicle_display = self._build_vehicle_display(estimate.vehicle) if estimate.vehicle else "N/A"
        
        estimate_ctx = self._with_money_context({
            'estimate_id': estimate.id,
            'customer_name': customer_name,
            'estimate_number': estimate.estimate_number,
            'total': str(estimate.total),
            'valid_until': str(estimate.valid_until),
            'days_until_expiration': str(days_until_expiration),
            'vehicle_display': vehicle_display,
            'estimate_link': f'{self._get_base_url()}/portal/estimates/{estimate.id}',
        })
        title = f'Estimate #{estimate.estimate_number} Expires in {days_until_expiration} Days'
        if template and template.subject:
            title = self.service._render_template(template.subject, estimate_ctx)
        
        message = f'''Your estimate is expiring soon.

Estimate Number: {estimate.estimate_number}
Amount: {estimate_ctx["total_display"]}
Expires: {estimate.valid_until} ({days_until_expiration} days)

Please review and approve or decline this estimate before it expires.

Vehicle: {vehicle_display}'''
        if template and template.body:
            message = self.service._render_template(template.body, estimate_ctx)
        
        notification = Notification.objects.create(
            recipient=estimate.customer.user,
            notification_type='estimate',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data=estimate_ctx,
            related_object_type='estimate',
            related_object_id=estimate.id
        )
        self.service.send_notification(notification)
    
    def estimate_expired(self, estimate):
        """Notify customer and staff that estimate has expired"""
        # Notify customer
        if estimate.customer.user:
            template = self._get_template('estimate_expired', 'email')
            customer_name = self._build_customer_name(estimate.customer)
            vehicle_display = self._build_vehicle_display(estimate.vehicle) if estimate.vehicle else "N/A"
            
            title = f'Estimate #{estimate.estimate_number} Has Expired'
            if template and template.subject:
                title = self.service._render_template(template.subject, {
                    'estimate_number': estimate.estimate_number,
                })
            
            estimate_ctx = self._with_money_context({
                'estimate_id': estimate.id,
                'customer_name': customer_name,
                'estimate_number': estimate.estimate_number,
                'total': str(estimate.total),
                'valid_until': str(estimate.valid_until),
                'vehicle_display': vehicle_display,
            })
            message = f'''Your estimate has expired.

Estimate Number: {estimate.estimate_number}
Amount: {estimate_ctx["total_display"]}
Expired: {estimate.valid_until}

Please contact us to request a new estimate or update this one.

Vehicle: {vehicle_display}'''
            if template and template.body:
                message = self.service._render_template(template.body, estimate_ctx)
            
            notification = Notification.objects.create(
                recipient=estimate.customer.user,
                notification_type='estimate',
                channel='email',
                priority='normal',
                template=template,
                title=title,
                message=message,
                data=estimate_ctx,
                related_object_type='estimate',
                related_object_id=estimate.id
            )
            self.service.send_notification(notification)
        
        # Notify staff (branch manager or estimate creator) - in-app notification, no template needed
        from apps.accounts.models import User
        if estimate.created_by:
            customer_name = self._build_customer_name(estimate.customer)
            staff_notification = Notification.objects.create(
                recipient=estimate.created_by,
                notification_type='estimate',
                channel='in_app',
                priority='normal',
                title=f'Estimate #{estimate.estimate_number} Has Expired',
                message=f'''Estimate {estimate.estimate_number} for {customer_name} has expired.

Amount: {format_money(estimate.total)}
Expired: {estimate.valid_until}

Please contact the customer to update or create a new estimate.''',
                data={
                    'estimate_id': estimate.id,
                    'estimate_number': estimate.estimate_number,
                    'customer_name': customer_name,
                    'total': str(estimate.total),
                },
                related_object_type='estimate',
                related_object_id=estimate.id
            )
            self.service.send_notification(staff_notification)
    
    def estimate_approved(self, estimate):
        """Notify staff when estimate is approved"""
        if estimate.created_by:
            template = self._get_template('estimate_approved', 'email')
            customer_name = self._build_customer_name(estimate.customer)
            vehicle_display = self._build_vehicle_display(estimate.vehicle) if estimate.vehicle else "N/A"
            
            title = f'Estimate #{estimate.estimate_number} Approved'
            message = f'''Customer has approved estimate {estimate.estimate_number}.

Customer: {customer_name}
Amount: {format_money(estimate.total)}
Vehicle: {vehicle_display}

You can now proceed to convert it to a work order or invoice.'''
            # Note: estimate_approved is typically in_app, but we can use template if email is needed
            if template and template.body:
                message = self.service._render_template(template.body, {
                    'estimate_number': estimate.estimate_number,
                    'customer_name': customer_name,
                    'total': str(estimate.total),
                    'vehicle_display': vehicle_display,
                    'company_name': self._get_company_name(),
                })
            
            notification = Notification.objects.create(
                recipient=estimate.created_by,
                notification_type='estimate',
                channel='in_app',  # Staff notifications are typically in-app
                priority='high',
                template=None,  # In-app notifications don't typically use email templates
                title=title,
                message=message,
                data={
                    'estimate_id': estimate.id,
                    'estimate_number': estimate.estimate_number,
                    'customer_name': customer_name,
                    'total': str(estimate.total),
                    'vehicle_display': vehicle_display,
                },
                related_object_type='estimate',
                related_object_id=estimate.id
            )
            self.service.send_notification(notification)
    
    def estimate_declined(self, estimate):
        """Notify staff when estimate is declined"""
        if estimate.created_by:
            template = self._get_template('estimate_declined', 'email')
            customer_name = self._build_customer_name(estimate.customer)
            vehicle_display = self._build_vehicle_display(estimate.vehicle) if estimate.vehicle else "N/A"
            
            title = f'Estimate #{estimate.estimate_number} Declined'
            message = f'''Customer has declined estimate {estimate.estimate_number}.

Customer: {customer_name}
Amount: {format_money(estimate.total)}
Vehicle: {vehicle_display}

Please contact the customer to discuss alternatives.'''
            # Note: estimate_declined is typically in_app, but we can use template if email is needed
            if template and template.body:
                message = self.service._render_template(template.body, {
                    'estimate_number': estimate.estimate_number,
                    'customer_name': customer_name,
                    'total': str(estimate.total),
                    'vehicle_display': vehicle_display,
                    'company_name': self._get_company_name(),
                })
            
            notification = Notification.objects.create(
                recipient=estimate.created_by,
                notification_type='estimate',
                channel='in_app',  # Staff notifications are typically in-app
                priority='normal',
                template=None,  # In-app notifications don't typically use email templates
                title=title,
                message=message,
                data={
                    'estimate_id': estimate.id,
                    'estimate_number': estimate.estimate_number,
                    'customer_name': customer_name,
                    'total': str(estimate.total),
                    'vehicle_display': vehicle_display,
                },
                related_object_type='estimate',
                related_object_id=estimate.id
            )
            self.service.send_notification(notification)
    
    # ==================== USER AUTH NOTIFICATIONS ====================
    
    def password_reset(self, user, new_password, request=None):
        """
        Send notification when admin resets user password
        Variables: user_name, email, username, new_password, login_url, company_name
        """
        if not user:
            return
        
        template = self._get_template('password_reset', 'email')
        user_name = user.get_full_name() or user.first_name or "User"
        login_url = request.build_absolute_uri('/login') if request else f"{self._get_base_url()}/login"
        
        title = 'Your Password Has Been Reset'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'user_name': user_name,
                'email': user.email,
                'username': user.username,
                'company_name': self._get_company_name(),
            })
        
        message = f"""Dear {user_name},

Your password has been reset by an administrator.

Your new login credentials are:

Email/Username: {user.email}
Password: {new_password}

Please log in using the following link:
{login_url}

For security reasons, we strongly recommend changing your password after logging in.

If you did not request this password reset, please contact your administrator immediately.

Best regards,
{self._get_company_name()} Team"""
        
        if template and template.body:
            message = self.service._render_template(template.body, {
                'user_name': user_name,
                'email': user.email,
                'username': user.username,
                'new_password': new_password,
                'login_url': login_url,
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=user,
            notification_type='system',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data={
                'user_name': user_name,
                'email': user.email,
                'username': user.username,
                'new_password': new_password,
                'login_url': login_url,
                'company_name': self._get_company_name(),
            }
        )
        self.service.send_notification(notification)
    
    def password_reset_link(self, user, reset_link, request=None):
        """
        Send password reset link to user
        Variables: user_name, email, username, reset_link, company_name
        """
        if not user:
            return
        
        template = self._get_template('password_reset_link', 'email')
        user_name = user.get_full_name() or user.first_name or "User"
        
        title = 'Password Reset Request'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'user_name': user_name,
                'email': user.email,
                'username': user.username,
                'company_name': self._get_company_name(),
            })
        
        message = f"""Dear {user_name},

You (or an administrator) requested to reset your password for your account.

Click the link below to reset your password:
{reset_link}

This link will expire in 24 hours.

If you did not request this password reset, please ignore this email or contact your administrator if you have concerns.

Best regards,
{self._get_company_name()} Team"""
        
        if template and template.body:
            message = self.service._render_template(template.body, {
                'user_name': user_name,
                'email': user.email,
                'username': user.username,
                'reset_link': reset_link,
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=user,
            notification_type='system',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data={
                'user_name': user_name,
                'email': user.email,
                'username': user.username,
                'reset_link': reset_link,
                'company_name': self._get_company_name(),
            }
        )
        self.service.send_notification(notification)
    
    # ==================== GATE PASS NOTIFICATIONS ====================
    
    def gate_pass_created(self, gate_pass):
        """Notify customer when gate pass is created (vehicle ready for pickup)"""
        if not gate_pass.customer or not gate_pass.customer.user:
            return
        
        template = self._get_template('gate_pass_created', 'email')
        customer_name = self._build_customer_name(gate_pass.customer)
        vehicle_display = self._build_vehicle_display(gate_pass.vehicle)
        
        # Build pickup person info
        pickup_info = "Customer"
        if not gate_pass.picked_up_by_customer:
            pickup_info = gate_pass.pickup_person_name or "Authorized Representative"
            if gate_pass.pickup_person_relationship:
                pickup_info += f" ({gate_pass.pickup_person_relationship})"
        
        # Build branch info
        branch_name = gate_pass.branch.name if gate_pass.branch else "Our Location"
        branch_address = gate_pass.branch.address if gate_pass.branch and hasattr(gate_pass.branch, 'address') else ""
        
        title = f'Your {vehicle_display} is Ready for Pickup - {gate_pass.gate_pass_number}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'gate_pass_number': gate_pass.gate_pass_number,
                'vehicle_display': vehicle_display,
                'work_order_number': gate_pass.work_order.work_order_number if gate_pass.work_order else "N/A",
            })
        
        message = f'''Good news! Your vehicle is ready for pickup.

Gate Pass: {gate_pass.gate_pass_number}
Work Order: {gate_pass.work_order.work_order_number if gate_pass.work_order else "N/A"}
Vehicle: {vehicle_display}
Pickup By: {pickup_info}
Branch: {branch_name}
{f"Address: {branch_address}" if branch_address else ""}

Please bring your identification and payment method when picking up your vehicle.'''
        
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'gate_pass_number': gate_pass.gate_pass_number,
                'work_order_number': gate_pass.work_order.work_order_number if gate_pass.work_order else "N/A",
                'vehicle_display': vehicle_display,
                'pickup_info': pickup_info,
                'pickup_person_name': gate_pass.pickup_person_name if not gate_pass.picked_up_by_customer else customer_name,
                'pickup_person_relationship': gate_pass.pickup_person_relationship or "",
                'branch_name': branch_name,
                'branch_address': branch_address,
                'pickup_notes': gate_pass.pickup_notes or "",
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=gate_pass.customer.user,
            notification_type='gatepass',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data={
                'gate_pass_id': gate_pass.id,
                'gate_pass_number': gate_pass.gate_pass_number,
                'work_order_id': gate_pass.work_order.id if gate_pass.work_order else None,
                'work_order_number': gate_pass.work_order.work_order_number if gate_pass.work_order else "N/A",
                'customer_name': customer_name,
                'vehicle_id': gate_pass.vehicle.id if gate_pass.vehicle else None,
                'vehicle_display': vehicle_display,
                'pickup_info': pickup_info,
                'branch_name': branch_name,
            },
            related_object_type='gatepass',
            related_object_id=gate_pass.id
        )
        self.service.send_notification(notification)
    
    def gate_pass_issued(self, gate_pass):
        """Notify customer when gate pass is officially issued"""
        if not gate_pass.customer or not gate_pass.customer.user:
            return
        
        template = self._get_template('gate_pass_issued', 'email')
        customer_name = self._build_customer_name(gate_pass.customer)
        vehicle_display = self._build_vehicle_display(gate_pass.vehicle)
        
        # Build pickup person info
        pickup_info = "Customer"
        if not gate_pass.picked_up_by_customer:
            pickup_info = gate_pass.pickup_person_name or "Authorized Representative"
            if gate_pass.pickup_person_relationship:
                pickup_info += f" ({gate_pass.pickup_person_relationship})"
        
        # Build branch info
        branch_name = gate_pass.branch.name if gate_pass.branch else "Our Location"
        branch_address = gate_pass.branch.address if gate_pass.branch and hasattr(gate_pass.branch, 'address') else ""
        
        # Build issued by info
        issued_by_name = gate_pass.issued_by.get_full_name() if gate_pass.issued_by else "Staff"
        
        title = f'Gate Pass Issued - {gate_pass.gate_pass_number}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'gate_pass_number': gate_pass.gate_pass_number,
                'vehicle_display': vehicle_display,
            })
        
        message = f'''Your gate pass has been issued and your vehicle is ready for pickup.

Gate Pass: {gate_pass.gate_pass_number}
Work Order: {gate_pass.work_order.work_order_number if gate_pass.work_order else "N/A"}
Vehicle: {vehicle_display}
Pickup By: {pickup_info}
Branch: {branch_name}
{f"Address: {branch_address}" if branch_address else ""}
Issued At: {gate_pass.issued_at.strftime("%Y-%m-%d %H:%M") if gate_pass.issued_at else "N/A"}
Issued By: {issued_by_name}

Please bring your identification and payment method when picking up your vehicle.'''
        
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'gate_pass_number': gate_pass.gate_pass_number,
                'work_order_number': gate_pass.work_order.work_order_number if gate_pass.work_order else "N/A",
                'vehicle_display': vehicle_display,
                'pickup_info': pickup_info,
                'pickup_person_name': gate_pass.pickup_person_name if not gate_pass.picked_up_by_customer else customer_name,
                'pickup_person_relationship': gate_pass.pickup_person_relationship or "",
                'branch_name': branch_name,
                'branch_address': branch_address,
                'issued_at': gate_pass.issued_at.strftime("%Y-%m-%d %H:%M") if gate_pass.issued_at else "N/A",
                'issued_by_name': issued_by_name,
                'pickup_notes': gate_pass.pickup_notes or "",
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=gate_pass.customer.user,
            notification_type='gatepass',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data={
                'gate_pass_id': gate_pass.id,
                'gate_pass_number': gate_pass.gate_pass_number,
                'work_order_id': gate_pass.work_order.id if gate_pass.work_order else None,
                'work_order_number': gate_pass.work_order.work_order_number if gate_pass.work_order else "N/A",
                'customer_name': customer_name,
                'vehicle_id': gate_pass.vehicle.id if gate_pass.vehicle else None,
                'vehicle_display': vehicle_display,
                'pickup_info': pickup_info,
                'branch_name': branch_name,
                'issued_at': gate_pass.issued_at.strftime("%Y-%m-%d %H:%M") if gate_pass.issued_at else "N/A",
                'issued_by_name': issued_by_name,
            },
            related_object_type='gatepass',
            related_object_id=gate_pass.id
        )
        self.service.send_notification(notification)

    # ==================== FIXED ASSET ACQUISITIONS ====================

    def asset_acquisition_approval_request(self, acquisition_request, recipient):
        """Notify approvers that a fixed asset acquisition requires approval."""
        if not recipient:
            return

        context = self._get_default_context()
        context.update({
            'acquisition_id': acquisition_request.id,
            'request_number': acquisition_request.request_number,
            'title': acquisition_request.title,
            'expected_cost': str(acquisition_request.expected_acquisition_cost),
            'requested_by': acquisition_request.requested_by.get_full_name()
            if acquisition_request.requested_by
            else 'Unknown',
            'branch': acquisition_request.branch.name if acquisition_request.branch else '',
        })

        title = f'Approval Required: {acquisition_request.request_number}'
        message = (
            f'Acquisition request {acquisition_request.request_number}: {acquisition_request.title} '
            f'requires your approval.\n\nExpected cost: {context["expected_cost"]}\n'
            f'Requested by: {context["requested_by"]}'
        )

        template = self._get_template('asset_acquisition_approval', 'email')
        if template:
            if template.subject:
                title = self.service._render_template(template.subject, context)
            if template.body:
                message = self.service._render_template(template.body, context)

        notification = Notification.objects.create(
            recipient=recipient,
            notification_type='system',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data=context,
            related_object_type='asset_acquisition_request',
            related_object_id=acquisition_request.id,
        )
        self.service.send_notification(notification)

        in_app = Notification.objects.create(
            recipient=recipient,
            notification_type='system',
            channel='in_app',
            priority='high',
            title=title,
            message=message,
            data=context,
            related_object_type='asset_acquisition_request',
            related_object_id=acquisition_request.id,
        )
        self.service.send_notification(in_app)

    def asset_acquisition_notify_requester(self, acquisition_request, recipient, title, message):
        """Notify requester of approval / rejection / receipt outcomes."""
        if not recipient:
            return

        context = self._get_default_context()
        context.update({
            'acquisition_id': acquisition_request.id,
            'request_number': acquisition_request.request_number,
        })

        for channel in ('email', 'in_app'):
            note = Notification.objects.create(
                recipient=recipient,
                notification_type='system',
                channel=channel,
                priority='normal',
                title=title[:200],
                message=message,
                data=context,
                related_object_type='asset_acquisition_request',
                related_object_id=acquisition_request.id,
            )
            self.service.send_notification(note)


# Global instance for easy import
notification_triggers = NotificationTriggers()
