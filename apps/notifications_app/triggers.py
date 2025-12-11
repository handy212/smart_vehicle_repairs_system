"""
Notification triggers for automatic notifications across the system.
This module provides functions to send notifications for key events.
"""
from django.utils import timezone
from .services import NotificationService, NotificationHelper
from .models import Notification, NotificationTemplate
from apps.accounts.settings_utils import get_setting, get_company_info


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
        }
    
    # ==================== APPOINTMENT NOTIFICATIONS ====================
    
    def appointment_confirmed(self, appointment):
        """Send confirmation notification when appointment is confirmed"""
        if not appointment.customer.user:
            return
        
        template = self._get_template('appointment_confirmation', 'email')
        customer_name = self._build_customer_name(appointment.customer)
        vehicle_display = self._build_vehicle_display(appointment.vehicle)
        technician_name = appointment.assigned_technician.get_full_name() if appointment.assigned_technician else "TBD"
        
        title = f'Appointment Confirmed - {appointment.appointment_date}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'appointment_date': str(appointment.appointment_date),
                'appointment_time': str(appointment.appointment_time),
                'customer_name': customer_name,
            })
        
        message = f'''Your appointment has been confirmed for {appointment.appointment_date} at {appointment.appointment_time}.

Vehicle: {vehicle_display}
Service: {appointment.service_description or "General Service"}
Technician: {technician_name}

Please arrive 10 minutes early.'''
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'appointment_number': appointment.appointment_number,
                'appointment_date': str(appointment.appointment_date),
                'appointment_time': str(appointment.appointment_time),
                'vehicle': vehicle_display,
                'vehicle_display': vehicle_display,
                'service_description': appointment.service_description or "General Service",
                'technician_name': technician_name,
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=appointment.customer.user,
            notification_type='appointment',
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data={
                'appointment_id': appointment.id,
                'appointment_number': appointment.appointment_number,
                'appointment_date': str(appointment.appointment_date),
                'appointment_time': str(appointment.appointment_time),
                'vehicle': vehicle_display,
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
                'service_description': appointment.service_description or "General Service",
                'technician_name': technician_name,
            },
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
        
        title = f'Appointment Cancelled - {appointment.appointment_date}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'appointment_date': str(appointment.appointment_date),
                'customer_name': customer_name,
            })
        
        message = f'''Your appointment scheduled for {appointment.appointment_date} at {appointment.appointment_time} has been cancelled.

{f"Reason: {reason}" if reason else ""}

Vehicle: {vehicle_display}

Please contact us to reschedule.'''
        if template and template.body:
            reason_text = f"Reason: {reason}" if reason else ""
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'appointment_number': appointment.appointment_number,
                'appointment_date': str(appointment.appointment_date),
                'appointment_time': str(appointment.appointment_time),
                'vehicle': vehicle_display,
                'vehicle_display': vehicle_display,
                'reason': reason,
                'reason_text': reason_text,
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=appointment.customer.user,
            notification_type='appointment',
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data={
                'appointment_id': appointment.id,
                'appointment_number': appointment.appointment_number,
                'reason': reason,
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
            },
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
        technician_name = appointment.assigned_technician.get_full_name() if appointment.assigned_technician else "TBD"
        
        title = f'Appointment Reminder: {appointment.appointment_date}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'appointment_date': str(appointment.appointment_date),
                'appointment_time': str(appointment.appointment_time),
                'customer_name': customer_name,
            })
        
        message = f'Reminder: You have an appointment on {appointment.appointment_date} at {appointment.appointment_time}'
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'appointment_number': appointment.appointment_number,
                'appointment_date': str(appointment.appointment_date),
                'appointment_time': str(appointment.appointment_time),
                'vehicle': vehicle_display,
                'vehicle_display': vehicle_display,
                'service_description': appointment.service_description or "General Service",
                'technician_name': technician_name,
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=appointment.customer.user,
            notification_type='appointment',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data={
                'appointment_id': appointment.id,
                'appointment_number': appointment.appointment_number,
                'customer_name': customer_name,
                'vehicle': vehicle_display,
                'vehicle_display': vehicle_display,
                'appointment_date': str(appointment.appointment_date),
                'appointment_time': str(appointment.appointment_time),
                'service_description': appointment.service_description or "General Service",
                'technician_name': technician_name,
            },
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
        
        title = f'Your {vehicle_display} is Ready for Pickup'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'vehicle_display': vehicle_display,
            })
        
        message = f'''Good news! Your vehicle is ready for pickup.

Vehicle: {vehicle_display}
Appointment: {appointment.appointment_date}

Please bring your appointment confirmation and payment method.'''
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
                'work_order_number': appointment.work_order.work_order_number if hasattr(appointment, 'work_order') and appointment.work_order else "N/A",
                'pickup_instructions': 'Please bring your appointment confirmation and payment method.',
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=appointment.customer.user,
            notification_type='vehicle',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data={
                'appointment_id': appointment.id,
                'vehicle_id': appointment.vehicle.id if appointment.vehicle else None,
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
            },
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
        
        title = f'Work Order Created - {work_order.work_order_number}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'work_order_number': work_order.work_order_number,
            })
        
        message = f'''A work order has been created for your vehicle.

Work Order: {work_order.work_order_number}
Vehicle: {vehicle_display}
Status: {work_order.get_status_display()}

Description: {work_order.description}

We'll keep you updated on the progress.'''
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'work_order_number': work_order.work_order_number,
                'vehicle': vehicle_display,
                'vehicle_display': vehicle_display,
                'problem_description': work_order.description or work_order.problem_description or "See work order for details",
                'status': work_order.get_status_display(),
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=work_order.customer.user,
            notification_type='work_order',
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data={
                'work_order_id': work_order.id,
                'work_order_number': work_order.work_order_number,
                'vehicle': vehicle_display,
                'vehicle_display': vehicle_display,
                'customer_name': customer_name,
                'problem_description': work_order.description or work_order.problem_description or "See work order for details",
            },
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
        
        title = f'Work Order {work_order.work_order_number} Completed'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'work_order_number': work_order.work_order_number,
                'vehicle_display': vehicle_display,
            })
        
        message = f'Work order {work_order.work_order_number} has been completed.'
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'work_order_number': work_order.work_order_number,
                'vehicle': vehicle_display,
                'vehicle_display': vehicle_display,
                'total_amount': str(work_order.actual_total or work_order.estimated_total or 0),
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=work_order.customer.user,
            notification_type='work_order',
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data={
                'work_order_id': work_order.id,
                'work_order_number': work_order.work_order_number,
                'wo_number': work_order.work_order_number,
                'customer_name': customer_name,
                'vehicle': vehicle_display,
                'vehicle_display': vehicle_display,
                'total_amount': str(work_order.actual_total or work_order.estimated_total or 0),
            },
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
        
        title = f'Approval Required - {work_order.work_order_number}'
        message = f'''Your approval is required for work order {work_order.work_order_number}.

Vehicle: {vehicle_display}
Diagnosis: {work_order.diagnosis_notes or "See work order for details"}

Estimated Cost: ${work_order.estimated_total or "TBD"}

Please review and approve to proceed with repairs.'''
        
        # Try to use template if available, otherwise use default message
        if template and template.body:
            # Adapt the template message for approval request
            try:
                message = self.service._render_template(template.body, {
                    'customer_name': customer_name,
                    'work_order_number': work_order.work_order_number,
                    'vehicle': vehicle_display,
                    'vehicle_display': vehicle_display,
                    'problem_description': work_order.diagnosis_notes or work_order.problem_description or "See work order for details",
                    'estimated_total': str(work_order.estimated_total or "TBD"),
                    'company_name': self._get_company_name(),
                })
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
            data={
                'work_order_id': work_order.id,
                'work_order_number': work_order.work_order_number,
                'estimated_total': str(work_order.estimated_total or 0),
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
                'problem_description': work_order.diagnosis_notes or work_order.problem_description or "See work order for details",
            },
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
        total_amount = str(work_order.actual_total or work_order.estimated_total or 0)
        
        title = f'Invoice Ready - {work_order.work_order_number}'
        message = f'''Your invoice is ready for work order {work_order.work_order_number}.

Vehicle: {vehicle_display}
Total: ${total_amount}

Please review and make payment when ready.'''
        
        # Try to use invoice template if available
        if template and template.body:
            try:
                # Get invoice from work order if linked
                invoice = getattr(work_order, 'invoice', None)
                invoice_number = invoice.invoice_number if invoice else work_order.work_order_number
                invoice_date = invoice.invoice_date if invoice else work_order.completed_at.date() if hasattr(work_order, 'completed_at') and work_order.completed_at else timezone.now().date()
                due_date = invoice.due_date if invoice else invoice_date
                
                message = self.service._render_template(template.body, {
                    'customer_name': customer_name,
                    'invoice_number': invoice_number,
                    'work_order_number': work_order.work_order_number,
                    'invoice_date': str(invoice_date),
                    'due_date': str(due_date),
                    'total': total_amount,
                    'balance_due': total_amount,
                    'vehicle_info': vehicle_display,
                    'vehicle_display': vehicle_display,
                    'work_order_number': work_order.work_order_number,
                    'company_name': self._get_company_name(),
                    'invoice_link': f'/billing/invoices/{invoice.id}' if invoice else f'/workorders/{work_order.id}',  # TODO: Get actual URL
                })
                if template and template.subject:
                    title = self.service._render_template(template.subject, {
                        'invoice_number': invoice_number,
                        'total': total_amount,
                        'customer_name': customer_name,
                    })
            except:
                pass  # Fall back to default message if template rendering fails
        
        notification = Notification.objects.create(
            recipient=work_order.customer.user,
            notification_type='work_order',
            channel='email',
            priority='normal',
            template=template,  # Use template if available
            title=title,
            message=message,
            data={
                'work_order_id': work_order.id,
                'work_order_number': work_order.work_order_number,
                'total': total_amount,
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
            },
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
        
        # Create push notification
        push_notification = Notification.objects.create(
            recipient=service_coordinator,
            notification_type='work_order',
            channel='push',
            priority='normal',
            title=f'New Work Order Assignment - {work_order.work_order_number}',
            message=f'You have been assigned as Service Coordinator for work order {work_order.work_order_number}. Please review and coordinate the diagnosis process.',
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
        self.service.send_notification(push_notification)
    
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
        
        title = f'Invoice {invoice.invoice_number} - ${invoice.total}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'invoice_number': invoice.invoice_number,
                'total': str(invoice.total),
                'customer_name': customer_name,
            })
        
        message = f'''Dear {customer_name},

Your invoice is ready for review.

INVOICE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Invoice Number: {invoice.invoice_number}
Invoice Date: {invoice.invoice_date}
Due Date: {invoice.due_date}

Work Order: {invoice.work_order.work_order_number if invoice.work_order else "N/A"}
Vehicle: {vehicle_info}

AMOUNT DUE: ${invoice.total}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please remit payment by the due date to avoid late fees.

For questions or to arrange payment, please contact us at your earliest convenience.

Thank you for your business!'''
        
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'invoice_number': invoice.invoice_number,
                'invoice_date': str(invoice.invoice_date),
                'due_date': str(invoice.due_date),
                'total': str(invoice.total),
                'work_order_number': invoice.work_order.work_order_number if invoice.work_order else "N/A",
                'vehicle_info': vehicle_info,
                'vehicle_display': vehicle_info,
                'balance_due': str(invoice.amount_due or invoice.total),
                'amount_paid': '0.00',  # TODO: Calculate from payments
                'company_name': self._get_company_name(),
                'invoice_link': f'{self._get_base_url()}/billing/invoices/{invoice.id}',
            })
        
        notification = Notification.objects.create(
            recipient=invoice.customer.user,
            notification_type='invoice',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data={
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'total': str(invoice.total),
                'due_date': str(invoice.due_date),
                'customer_name': customer_name,
                'vehicle_info': vehicle_info,
                'vehicle_display': vehicle_info,
                'balance_due': str(invoice.amount_due or invoice.total),
                'work_order_number': invoice.work_order.work_order_number if invoice.work_order else "N/A",
            },
            related_object_type='invoice',
            related_object_id=invoice.id
        )
        self.service.send_notification(notification)
    
    def invoice_due_soon(self, invoice, days_until_due):
        """Remind customer that invoice is due soon"""
        if not invoice.customer.user:
            return
        
        template = self._get_template('invoice_due', 'email')
        customer_name = self._build_customer_name(invoice.customer)
        vehicle_info = self._build_vehicle_display(invoice.vehicle) if invoice.vehicle else "N/A"
        
        title = f'Invoice Due in {days_until_due} Days - {invoice.invoice_number}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'invoice_number': invoice.invoice_number,
                'days_until_due': str(days_until_due),
                'due_date': str(invoice.due_date),
            })
        
        message = f'''Reminder: Your invoice is due soon.

Invoice Number: {invoice.invoice_number}
Amount Due: ${invoice.balance_due}
Due Date: {invoice.due_date} ({days_until_due} days)

Please remit payment to avoid late fees.'''
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'invoice_number': invoice.invoice_number,
                'due_date': str(invoice.due_date),
                'days_until_due': str(days_until_due),
                'balance_due': str(invoice.balance_due or invoice.total),
                'total': str(invoice.total),
                'work_order_number': invoice.work_order.work_order_number if invoice.work_order else "N/A",
                'vehicle_display': vehicle_info,
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=invoice.customer.user,
            notification_type='invoice',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data={
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'days_until_due': str(days_until_due),
                'balance_due': str(invoice.balance_due or invoice.total),
                'due_date': str(invoice.due_date),
                'customer_name': customer_name,
                'vehicle_display': vehicle_info,
            },
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
        
        title = f'OVERDUE: Invoice {invoice.invoice_number} - ${invoice.balance_due}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'invoice_number': invoice.invoice_number,
                'balance_due': str(invoice.balance_due or invoice.total),
                'days_overdue': str(days_overdue),
            })
        
        message = f'''Your invoice is now overdue.

Invoice Number: {invoice.invoice_number}
Amount Due: ${invoice.balance_due}
Due Date: {invoice.due_date} ({days_overdue} days overdue)

Late fees may apply. Please contact us to arrange payment.'''
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'invoice_number': invoice.invoice_number,
                'due_date': str(invoice.due_date),
                'days_overdue': str(days_overdue),
                'balance_due': str(invoice.balance_due or invoice.total),
                'total': str(invoice.total),
                'work_order_number': invoice.work_order.work_order_number if invoice.work_order else "N/A",
                'vehicle_display': vehicle_info,
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=invoice.customer.user,
            notification_type='invoice',
            channel='email',
            priority='urgent',
            template=template,
            title=title,
            message=message,
            data={
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'days_overdue': str(days_overdue),
                'balance_due': str(invoice.balance_due or invoice.total),
                'due_date': str(invoice.due_date),
                'customer_name': customer_name,
                'vehicle_display': vehicle_info,
            },
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
        
        title = f'Payment Received - ${payment.amount}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'payment_number': payment.payment_number if hasattr(payment, 'payment_number') else str(payment.id),
                'amount': str(payment.amount),
                'invoice_number': payment.invoice.invoice_number,
            })
        
        message = f'''Dear {customer_name},

Thank you for your payment!

PAYMENT RECEIPT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Payment Number: {payment.payment_number if hasattr(payment, 'payment_number') else payment.id}
Payment Date: {payment.payment_date.strftime("%B %d, %Y") if hasattr(payment.payment_date, 'strftime') else payment.payment_date}
Payment Method: {payment_method_display}
Amount: ${payment.amount}

Invoice: {payment.invoice.invoice_number}
Balance Remaining: ${payment.invoice.amount_due}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your payment has been successfully processed. This receipt serves as confirmation of your payment.

{f"Your invoice is now paid in full!" if payment.invoice.amount_due <= 0 else ""}

Thank you for your business!'''
        
        if template and template.body:
            payment_date_str = payment.payment_date.strftime("%B %d, %Y") if hasattr(payment.payment_date, 'strftime') else str(payment.payment_date)
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'payment_number': payment.payment_number if hasattr(payment, 'payment_number') else str(payment.id),
                'payment_date': payment_date_str,
                'payment_method': payment_method_display,
                'amount': str(payment.amount),
                'invoice_number': payment.invoice.invoice_number,
                'balance_remaining': str(payment.invoice.amount_due),
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=payment.invoice.customer.user,
            notification_type='payment',
            template=template,
            channel='email',
            priority='normal',
            title=title,
            message=message,
            data={
                'payment_id': payment.id,
                'invoice_id': payment.invoice.id,
                'amount': str(payment.amount),
                'balance_due': str(payment.invoice.balance_due),
                'balance_remaining': str(payment.invoice.amount_due),
                'customer_name': customer_name,
                'payment_number': payment.payment_number if hasattr(payment, 'payment_number') else str(payment.id),
                'payment_method': payment_method_display,
                'invoice_number': payment.invoice.invoice_number,
            },
            related_object_type='payment',
            related_object_id=payment.id
        )
        self.service.send_notification(notification)
    
    # ==================== INVENTORY NOTIFICATIONS ====================
    
    def low_stock_alert(self, part, recipient):
        """Alert parts manager about low stock"""
        notification = NotificationHelper.low_stock_alert(
            part=part,
            recipient=recipient
        )
        self.service.send_notification(notification)
    
    def parts_received(self, purchase_order):
        """Notify requester that ordered parts have been received"""
        if purchase_order.requested_by:
            notification = Notification.objects.create(
                recipient=purchase_order.requested_by,
                notification_type='inventory',
                channel='in_app',
                priority='normal',
                title=f'Parts Received - PO {purchase_order.po_number}',
                message=f'''Your ordered parts have been received.

PO Number: {purchase_order.po_number}
Supplier: {purchase_order.supplier}
Status: {purchase_order.get_status_display()}

Parts are now available for use.''',
                data={
                    'po_id': purchase_order.id,
                    'po_number': purchase_order.po_number,
                },
                related_object_type='purchase_order',
                related_object_id=purchase_order.id
            )
            self.service.send_notification(notification)
    
    # ==================== INSPECTION NOTIFICATIONS ====================
    
    def inspection_completed(self, inspection):
        """Notify customer when vehicle inspection is completed"""
        if not inspection.vehicle.customer.user:
            return
        
        template = self._get_template('inspection_completed', 'email')
        customer_name = self._build_customer_name(inspection.vehicle.customer)
        vehicle_display = self._build_vehicle_display(inspection.vehicle)
        
        title = f'Inspection Completed - {inspection.inspection_number}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'inspection_number': inspection.inspection_number,
            })
        
        message = f'''Your vehicle inspection is complete.

Inspection: {inspection.inspection_number}
Vehicle: {vehicle_display}
Result: {inspection.get_result_display()}

{inspection.summary or "See inspection report for details."}

{'⚠️ Some items require attention. Please review the full report.' if inspection.result == 'fail' else '✓ All items passed inspection.'}'''
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'inspection_number': inspection.inspection_number,
                'vehicle_display': vehicle_display,
                'inspection_date': str(inspection.created_at.date()) if hasattr(inspection, 'created_at') else str(inspection.inspection_date) if hasattr(inspection, 'inspection_date') else "N/A",
                'inspection_link': f'/inspections/{inspection.id}',  # TODO: Get actual URL from settings
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=inspection.vehicle.customer.user,
            notification_type='inspection',
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data={
                'inspection_id': inspection.id,
                'inspection_number': inspection.inspection_number,
                'result': inspection.result,
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
            },
            related_object_type='inspection',
            related_object_id=inspection.id
        )
        self.service.send_notification(notification)
    
    # ==================== SYSTEM NOTIFICATIONS ====================
    
    def service_due_reminder(self, vehicle):
        """Remind customer that service is due"""
        if not vehicle.customer.user:
            return
        
        template = self._get_template('service_due', 'email')
        customer_name = self._build_customer_name(vehicle.customer)
        vehicle_display = self._build_vehicle_display(vehicle)
        
        title = f'Service Due for Your {vehicle_display}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'vehicle_display': vehicle_display,
            })
        
        message = f'''It's time to schedule service for your vehicle.

Vehicle: {vehicle_display}
Last Service: {vehicle.last_service_date or "Never"}
Mileage: {vehicle.current_mileage or "Unknown"} miles

Regular maintenance keeps your vehicle running smoothly and prevents costly repairs.

Contact us to schedule an appointment.'''
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
                'service_type': 'Regular Maintenance',
                'due_date': 'Now',  # TODO: Calculate actual due date
                'mileage_due': str(vehicle.current_mileage or "Unknown"),
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=vehicle.customer.user,
            notification_type='vehicle',
            channel='email',
            priority='normal',
            template=template,
            title=title,
            message=message,
            data={
                'vehicle_id': vehicle.id,
                'last_service': str(vehicle.last_service_date) if vehicle.last_service_date else None,
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
            },
            related_object_type='vehicle',
            related_object_id=vehicle.id
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
        
        title = f'New Estimate #{estimate.estimate_number} - ${estimate.total}'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'estimate_number': estimate.estimate_number,
                'total': str(estimate.total),
            })
        
        message = f'''A new estimate has been prepared for your review.

Estimate Number: {estimate.estimate_number}
Amount: ${estimate.total}
Valid Until: {estimate.valid_until}
Vehicle: {vehicle_display}

Description: {estimate.description or "See estimate for details"}

Please review and approve or decline this estimate to proceed.'''
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'estimate_number': estimate.estimate_number,
                'total': str(estimate.total),
                'valid_until': str(estimate.valid_until),
                'vehicle_display': vehicle_display,
                'description': estimate.description or "See estimate for details",
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=estimate.customer.user,
            notification_type='estimate',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data={
                'estimate_id': estimate.id,
                'estimate_number': estimate.estimate_number,
                'total': str(estimate.total),
                'valid_until': str(estimate.valid_until),
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
                'description': estimate.description or "See estimate for details",
            },
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
        
        title = f'Estimate #{estimate.estimate_number} Expires in {days_until_expiration} Days'
        if template and template.subject:
            title = self.service._render_template(template.subject, {
                'estimate_number': estimate.estimate_number,
                'days_until_expiration': str(days_until_expiration),
            })
        
        message = f'''Your estimate is expiring soon.

Estimate Number: {estimate.estimate_number}
Amount: ${estimate.total}
Expires: {estimate.valid_until} ({days_until_expiration} days)

Please review and approve or decline this estimate before it expires.

Vehicle: {vehicle_display}'''
        if template and template.body:
            message = self.service._render_template(template.body, {
                'customer_name': customer_name,
                'estimate_number': estimate.estimate_number,
                'total': str(estimate.total),
                'valid_until': str(estimate.valid_until),
                'days_until_expiration': str(days_until_expiration),
                'vehicle_display': vehicle_display,
                'company_name': self._get_company_name(),
            })
        
        notification = Notification.objects.create(
            recipient=estimate.customer.user,
            notification_type='estimate',
            channel='email',
            priority='high',
            template=template,
            title=title,
            message=message,
            data={
                'estimate_id': estimate.id,
                'estimate_number': estimate.estimate_number,
                'days_until_expiration': str(days_until_expiration),
                'valid_until': str(estimate.valid_until),
                'total': str(estimate.total),
                'customer_name': customer_name,
                'vehicle_display': vehicle_display,
            },
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
            
            message = f'''Your estimate has expired.

Estimate Number: {estimate.estimate_number}
Amount: ${estimate.total}
Expired: {estimate.valid_until}

Please contact us to request a new estimate or update this one.

Vehicle: {vehicle_display}'''
            if template and template.body:
                message = self.service._render_template(template.body, {
                    'customer_name': customer_name,
                    'estimate_number': estimate.estimate_number,
                    'total': str(estimate.total),
                    'valid_until': str(estimate.valid_until),
                    'vehicle_display': vehicle_display,
                    'company_name': self._get_company_name(),
                })
            
            notification = Notification.objects.create(
                recipient=estimate.customer.user,
                notification_type='estimate',
                channel='email',
                priority='normal',
                template=template,
                title=title,
                message=message,
                data={
                    'estimate_id': estimate.id,
                    'estimate_number': estimate.estimate_number,
                    'valid_until': str(estimate.valid_until),
                    'total': str(estimate.total),
                    'customer_name': customer_name,
                    'vehicle_display': vehicle_display,
                },
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

Amount: ${estimate.total}
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
Amount: ${estimate.total}
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
Amount: ${estimate.total}
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


# Global instance for easy import
notification_triggers = NotificationTriggers()
