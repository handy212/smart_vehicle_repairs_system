"""
Notification triggers for automatic notifications across the system.
This module provides functions to send notifications for key events.
"""
from django.utils import timezone
from .services import NotificationService, NotificationHelper
from .models import Notification


class NotificationTriggers:
    """
    Centralized notification triggers for system events.
    Call these methods from views/signals to send notifications.
    """
    
    def __init__(self):
        self.service = NotificationService()
    
    # ==================== APPOINTMENT NOTIFICATIONS ====================
    
    def appointment_confirmed(self, appointment):
        """Send confirmation notification when appointment is confirmed"""
        if not appointment.customer.user:
            return
        
        notification = Notification.objects.create(
            recipient=appointment.customer.user,
            notification_type='appointment',
            channel='email',
            priority='normal',
            title=f'Appointment Confirmed - {appointment.appointment_date}',
            message=f'''Your appointment has been confirmed for {appointment.appointment_date} at {appointment.appointment_time}.

Vehicle: {appointment.vehicle}
Service: {appointment.service_description or "General Service"}
Technician: {appointment.assigned_technician.get_full_name() if appointment.assigned_technician else "TBD"}

Please arrive 10 minutes early.''',
            data={
                'appointment_id': appointment.id,
                'appointment_number': appointment.appointment_number,
                'appointment_date': str(appointment.appointment_date),
                'appointment_time': str(appointment.appointment_time),
                'vehicle': str(appointment.vehicle),
            },
            related_object_type='appointment',
            related_object_id=appointment.id
        )
        self.service.send_notification(notification)
    
    def appointment_cancelled(self, appointment, reason=''):
        """Send cancellation notification"""
        if not appointment.customer.user:
            return
        
        notification = Notification.objects.create(
            recipient=appointment.customer.user,
            notification_type='appointment',
            channel='email',
            priority='normal',
            title=f'Appointment Cancelled - {appointment.appointment_date}',
            message=f'''Your appointment scheduled for {appointment.appointment_date} at {appointment.appointment_time} has been cancelled.

{f"Reason: {reason}" if reason else ""}

Vehicle: {appointment.vehicle}

Please contact us to reschedule.''',
            data={
                'appointment_id': appointment.id,
                'appointment_number': appointment.appointment_number,
                'reason': reason,
            },
            related_object_type='appointment',
            related_object_id=appointment.id
        )
        self.service.send_notification(notification)
    
    def appointment_reminder(self, appointment):
        """Send appointment reminder (to be called by scheduled task)"""
        if not appointment.customer.user:
            return
        
        notification = NotificationHelper.appointment_reminder(
            appointment=appointment,
            recipient=appointment.customer.user
        )
        self.service.send_notification(notification)
    
    def vehicle_ready(self, appointment):
        """Notify customer that vehicle is ready for pickup"""
        if not appointment.customer.user:
            return
        
        notification = Notification.objects.create(
            recipient=appointment.customer.user,
            notification_type='vehicle',
            channel='email',
            priority='high',
            title=f'Your {appointment.vehicle} is Ready for Pickup',
            message=f'''Good news! Your vehicle is ready for pickup.

Vehicle: {appointment.vehicle}
Appointment: {appointment.appointment_date}

Please bring your appointment confirmation and payment method.''',
            data={
                'appointment_id': appointment.id,
                'vehicle_id': appointment.vehicle.id,
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
        
        notification = Notification.objects.create(
            recipient=work_order.customer.user,
            notification_type='work_order',
            channel='email',
            priority='normal',
            title=f'Work Order Created - {work_order.work_order_number}',
            message=f'''A work order has been created for your vehicle.

Work Order: {work_order.work_order_number}
Vehicle: {work_order.vehicle}
Status: {work_order.get_status_display()}

Description: {work_order.description}

We'll keep you updated on the progress.''',
            data={
                'work_order_id': work_order.id,
                'work_order_number': work_order.work_order_number,
                'vehicle': str(work_order.vehicle),
            },
            related_object_type='work_order',
            related_object_id=work_order.id
        )
        self.service.send_notification(notification)
    
    def work_order_approved(self, work_order):
        """Notify staff when work order is approved by customer"""
        # Notify primary technician
        if work_order.primary_technician:
            notification = Notification.objects.create(
                recipient=work_order.primary_technician,
                notification_type='work_order',
                channel='in_app',
                priority='high',
                title=f'Work Order Approved - {work_order.work_order_number}',
                message=f'''Customer has approved work order {work_order.work_order_number}.

Vehicle: {work_order.vehicle}
Customer: {work_order.customer}

You can now start work.''',
                data={
                    'work_order_id': work_order.id,
                    'work_order_number': work_order.work_order_number,
                },
                related_object_type='work_order',
                related_object_id=work_order.id
            )
            self.service.send_notification(notification)
    
    def work_order_completed(self, work_order):
        """Notify customer when work order is completed"""
        if not work_order.customer.user:
            return
        
        notification = NotificationHelper.work_order_completed(
            work_order=work_order,
            recipient=work_order.customer.user
        )
        self.service.send_notification(notification)
    
    def work_order_requires_approval(self, work_order):
        """Notify customer that work order requires their approval"""
        if not work_order.customer.user:
            return
        
        notification = Notification.objects.create(
            recipient=work_order.customer.user,
            notification_type='work_order',
            channel='email',
            priority='high',
            title=f'Approval Required - {work_order.work_order_number}',
            message=f'''Your approval is required for work order {work_order.work_order_number}.

Vehicle: {work_order.vehicle}
Diagnosis: {work_order.diagnosis_notes or "See work order for details"}

Estimated Cost: ${work_order.estimated_total or "TBD"}

Please review and approve to proceed with repairs.''',
            data={
                'work_order_id': work_order.id,
                'work_order_number': work_order.work_order_number,
                'estimated_total': str(work_order.estimated_total or 0),
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
        
        notification = Notification.objects.create(
            recipient=work_order.customer.user,
            notification_type='work_order',
            channel='email',
            priority='normal',
            title=f'Invoice Ready - {work_order.work_order_number}',
            message=f'''Your invoice is ready for work order {work_order.work_order_number}.

Vehicle: {work_order.vehicle}
Total: ${work_order.actual_total or work_order.estimated_total}

Please review and make payment when ready.''',
            data={
                'work_order_id': work_order.id,
                'work_order_number': work_order.work_order_number,
                'total': str(work_order.actual_total or work_order.estimated_total),
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
    
    # ==================== INVOICE NOTIFICATIONS ====================
    
    def invoice_generated(self, invoice):
        """Notify customer when invoice is generated"""
        if not invoice.customer.user:
            return
        
        notification = NotificationHelper.invoice_generated(
            invoice=invoice,
            recipient=invoice.customer.user
        )
        self.service.send_notification(notification)
    
    def invoice_sent(self, invoice):
        """Notify customer when invoice is sent"""
        if not invoice.customer.user:
            return
        
        notification = Notification.objects.create(
            recipient=invoice.customer.user,
            notification_type='invoice',
            channel='email',
            priority='high',
            title=f'Invoice {invoice.invoice_number} - ${invoice.total}',
            message=f'''Your invoice is ready.

Invoice Number: {invoice.invoice_number}
Amount Due: ${invoice.total}
Due Date: {invoice.due_date}

Work Order: {invoice.work_order.work_order_number if invoice.work_order else "N/A"}
Vehicle: {invoice.vehicle}

Please remit payment by the due date to avoid late fees.''',
            data={
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'total': str(invoice.total),
                'due_date': str(invoice.due_date),
            },
            related_object_type='invoice',
            related_object_id=invoice.id
        )
        self.service.send_notification(notification)
    
    def invoice_due_soon(self, invoice, days_until_due):
        """Remind customer that invoice is due soon"""
        if not invoice.customer.user:
            return
        
        notification = Notification.objects.create(
            recipient=invoice.customer.user,
            notification_type='invoice',
            channel='email',
            priority='high',
            title=f'Invoice Due in {days_until_due} Days - {invoice.invoice_number}',
            message=f'''Reminder: Your invoice is due soon.

Invoice Number: {invoice.invoice_number}
Amount Due: ${invoice.balance_due}
Due Date: {invoice.due_date} ({days_until_due} days)

Please remit payment to avoid late fees.''',
            data={
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'days_until_due': days_until_due,
            },
            related_object_type='invoice',
            related_object_id=invoice.id
        )
        self.service.send_notification(notification)
    
    def invoice_overdue(self, invoice):
        """Notify customer that invoice is overdue"""
        if not invoice.customer.user:
            return
        
        days_overdue = (timezone.now().date() - invoice.due_date).days
        
        notification = Notification.objects.create(
            recipient=invoice.customer.user,
            notification_type='invoice',
            channel='email',
            priority='urgent',
            title=f'OVERDUE: Invoice {invoice.invoice_number} - ${invoice.balance_due}',
            message=f'''Your invoice is now overdue.

Invoice Number: {invoice.invoice_number}
Amount Due: ${invoice.balance_due}
Due Date: {invoice.due_date} ({days_overdue} days overdue)

Late fees may apply. Please contact us to arrange payment.''',
            data={
                'invoice_id': invoice.id,
                'invoice_number': invoice.invoice_number,
                'days_overdue': days_overdue,
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
        
        notification = Notification.objects.create(
            recipient=payment.invoice.customer.user,
            notification_type='payment',
            channel='email',
            priority='normal',
            title=f'Payment Received - ${payment.amount}',
            message=f'''Thank you! Your payment has been received.

Payment Amount: ${payment.amount}
Payment Method: {payment.get_payment_method_display()}
Invoice: {payment.invoice.invoice_number}
Remaining Balance: ${payment.invoice.balance_due}

{f"Your invoice is now paid in full!" if payment.invoice.balance_due == 0 else ""}''',
            data={
                'payment_id': payment.id,
                'invoice_id': payment.invoice.id,
                'amount': str(payment.amount),
                'balance_due': str(payment.invoice.balance_due),
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
        
        notification = Notification.objects.create(
            recipient=inspection.vehicle.customer.user,
            notification_type='inspection',
            channel='email',
            priority='normal',
            title=f'Inspection Completed - {inspection.inspection_number}',
            message=f'''Your vehicle inspection is complete.

Inspection: {inspection.inspection_number}
Vehicle: {inspection.vehicle}
Result: {inspection.get_result_display()}

{inspection.summary or "See inspection report for details."}

{'⚠️ Some items require attention. Please review the full report.' if inspection.result == 'fail' else '✓ All items passed inspection.'}''',
            data={
                'inspection_id': inspection.id,
                'inspection_number': inspection.inspection_number,
                'result': inspection.result,
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
        
        notification = Notification.objects.create(
            recipient=vehicle.customer.user,
            notification_type='vehicle',
            channel='email',
            priority='normal',
            title=f'Service Due for Your {vehicle.year} {vehicle.make} {vehicle.model}',
            message=f'''It's time to schedule service for your vehicle.

Vehicle: {vehicle}
Last Service: {vehicle.last_service_date or "Never"}
Mileage: {vehicle.current_mileage or "Unknown"} miles

Regular maintenance keeps your vehicle running smoothly and prevents costly repairs.

Contact us to schedule an appointment.''',
            data={
                'vehicle_id': vehicle.id,
                'last_service': str(vehicle.last_service_date) if vehicle.last_service_date else None,
            },
            related_object_type='vehicle',
            related_object_id=vehicle.id
        )
        self.service.send_notification(notification)


# Global instance for easy import
notification_triggers = NotificationTriggers()
