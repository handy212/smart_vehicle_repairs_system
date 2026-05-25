from rest_framework import viewsets, permissions, status
from apps.accounts.permissions import IsModuleEnabled
from rest_framework.response import Response
from .models import Feedback
from .serializers import FeedbackSerializer

class FeedbackViewSet(viewsets.ModelViewSet):
    queryset = Feedback.objects.all()
    serializer_class = FeedbackSerializer
    filterset_fields = ['category', 'status', 'branch']

    def get_permissions(self):
        """
        Allow anyone to submit feedback, but only admins/managers to list or retrieve.
        """
        if self.action == 'create':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), IsModuleEnabled('reports'), permissions.DjangoModelPermissions()]

    def create(self, request, *args, **kwargs):
        """
        Handle feedback creation with optional reCAPTCHA verification.
        """
        from apps.accounts.admin_models import SystemSettings
        import requests
        import logging

        logger = logging.getLogger(__name__)

        # Check if reCAPTCHA is enabled
        recaptcha_enabled = SystemSettings.get_setting('recaptcha_enabled', 'false').lower() == 'true'
        
        if recaptcha_enabled:
            recaptcha_token = request.data.get('recaptcha_token')
            if not recaptcha_token:
                return Response(
                    {'detail': 'reCAPTCHA verification is required.'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            secret_key = SystemSettings.get_setting('recaptcha_secret_key', '')
            if not secret_key:
                logger.warning("reCAPTCHA is enabled but 'recaptcha_secret_key' is not configured.")
            else:
                try:
                    verify_response = requests.post(
                        'https://www.google.com/recaptcha/api/siteverify',
                        data={
                            'secret': secret_key,
                            'response': recaptcha_token
                        },
                        timeout=5
                    )
                    verify_response.raise_for_status()
                    result = verify_response.json()
                    
                    if not result.get('success'):
                        logger.error(f"reCAPTCHA verification failed: {result.get('error-codes')}")
                        return Response(
                            {'detail': 'reCAPTCHA verification failed. Please try again.'}, 
                            status=status.HTTP_400_BAD_REQUEST
                        )
                except Exception as e:
                    logger.error(f"Error during reCAPTCHA verification: {str(e)}")
                    return Response(
                        {'detail': 'reCAPTCHA verification is temporarily unavailable. Please try again later.'},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE,
                    )

        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        # Force is_anonymous=True if no user is authenticated
        is_anonymous = not self.request.user.is_authenticated

        save_kwargs = {
            'status': 'new',
            'internal_notes': '',
        }
        if is_anonymous:
            save_kwargs['is_anonymous'] = True
            save_kwargs['branch'] = None

        instance = serializer.save(**save_kwargs)
            
        # Trigger notification to admins/managers
        self._notify_admins(instance)

    def _notify_admins(self, feedback):
        """Notify relevant administrators about new feedback"""
        try:
            from apps.notifications_app.services import NotificationService
            from apps.notifications_app.models import Notification
            from apps.accounts.models import User
            
            # Find recipients: Admins and Managers linked to the branch
            recipients = User.objects.filter(role='admin', is_active=True)
            if feedback.branch:
                branch_managers = feedback.branch.managers.filter(is_active=True)
                recipients = recipients | branch_managers
            
            recipients = recipients.distinct()
            
            service = NotificationService()
            for recipient in recipients:
                notification = Notification.objects.create(
                    recipient=recipient,
                    notification_type='system',
                    channel='in_app', # Start with in_app, can be expanded to email
                    priority='normal',
                    title=f"New {feedback.get_category_display()} Received",
                    message=f"New feedback received for {feedback.branch.name if feedback.branch else 'General'}: {feedback.message[:50]}...",
                    data={
                        'feedback_id': feedback.id,
                        'category': feedback.category,
                        'branch_id': feedback.branch_id if feedback.branch else None
                    },
                    related_object_type='feedback',
                    related_object_id=feedback.id
                )
                service.send_notification(notification)
        except Exception as e:
            # Don't fail the request if notification fails
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send feedback notification: {str(e)}")
