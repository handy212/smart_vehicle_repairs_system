from rest_framework.views import APIView

class TemplateRenderView(APIView):
    """
    Render a notification template for manual sending (e.g. WhatsApp)
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        template_type = request.data.get('template_type')
        object_id = request.data.get('object_id')
        channel = request.data.get('channel', 'whatsapp_manual')
        
        if not template_type or not object_id:
            return Response(
                {'error': 'template_type and object_id are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # 1. Find Template
        try:
            # Try specific channel first, then fallback to any active
            template = NotificationTemplate.objects.filter(
                template_type=template_type, 
                channel=channel,
                is_active=True
            ).first()
            
            if not template:
                 # Fallback to SMS if available (similar length)
                template = NotificationTemplate.objects.filter(
                    template_type=template_type, 
                    channel='sms',
                    is_active=True
                ).first()
                
            if not template:
                return Response(
                    {'error': f'No active template found for {template_type}'},
                    status=status.HTTP_404_NOT_FOUND
                )
        except Exception as e:
             return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # 2. Get Object and Context
        context = {}
        phone_number = ""
        
        try:
            if 'appointment' in template_type:
                from apps.appointments.models import Appointment
                obj = Appointment.objects.get(id=object_id)
                
                # Context
                customer_name = obj.customer.company_name if obj.customer.company_name else obj.customer.user.get_full_name()
                context = {
                    'appointment_id': obj.id,
                    'customer_name': customer_name,
                    'vehicle': f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}",
                    'appointment_date': str(obj.appointment_date),
                    'appointment_time': str(obj.appointment_time)
                }
                
                # Phone
                if obj.customer.phone:
                    phone_number = obj.customer.phone
                elif obj.customer.user.phone:
                    phone_number = obj.customer.user.phone
                    
            elif 'work_order' in template_type:
                from apps.workorders.models import WorkOrder
                obj = WorkOrder.objects.get(id=object_id)
                
                customer_name = obj.customer.company_name if obj.customer.company_name else obj.customer.user.get_full_name()
                context = {
                    'work_order_id': obj.id, 
                    'wo_number': obj.work_order_number,
                    'customer_name': customer_name,
                    'vehicle': f"{obj.vehicle.year} {obj.vehicle.make} {obj.vehicle.model}"
                }
                
                if obj.customer.phone:
                    phone_number = obj.customer.phone
                elif obj.customer.user.phone:
                    phone_number = obj.customer.user.phone

            elif 'invoice' in template_type:
                from apps.billing.models import Invoice
                obj = Invoice.objects.get(id=object_id)
                 
                context = {
                    'invoice_id': obj.id,
                    'invoice_number': obj.invoice_number,
                    'total': str(obj.total),
                    'due_date': str(obj.due_date)
                }
                
                # Invoice -> WorkOrder -> Customer or Invoice -> Customer
                if hasattr(obj, 'work_order') and obj.work_order:
                     c = obj.work_order.customer
                     if c.phone: phone_number = c.phone
                     elif c.user.phone: phone_number = c.user.phone
                elif hasattr(obj, 'customer') and obj.customer:
                     c = obj.customer
                     if c.phone: phone_number = c.phone
                     elif c.user.phone: phone_number = c.user.phone

            # Add more types as needed
            
        except Exception as e:
            return Response(
                {'error': f'Error fetching object: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # 3. Render Message
        service = NotificationService()
        # Prefer sms_body for WhatsApp, else body
        template_string = template.body
        if template.sms_body:
            template_string = template.sms_body
            
        message = service._render_template(template_string, context)
        
        return Response({
            'message': message,
            'phone_number': phone_number,
            'template_used': template.name
        })
