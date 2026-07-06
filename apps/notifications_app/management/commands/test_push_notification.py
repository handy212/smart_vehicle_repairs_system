"""
Management command to test Firebase push notifications
"""
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from apps.notifications_app.firebase import send_push_notification, is_firebase_available
from apps.notifications_app.models import Notification

User = get_user_model()


class Command(BaseCommand):
    help = 'Test Firebase push notification for a user'

    def add_arguments(self, parser):
        parser.add_argument(
            'email',
            type=str,
            help='Email address of the user to send test notification'
        )
        parser.add_argument(
            '--title',
            type=str,
            default='Test Notification',
            help='Notification title'
        )
        parser.add_argument(
            '--body',
            type=str,
            default='This is a test push notification from Smart Vehicle Repairs System',
            help='Notification body'
        )

    def handle(self, *args, **options):
        email = options['email']
        title = options['title']
        body = options['body']

        # Check Firebase availability
        if not is_firebase_available():
            self.stdout.write(
                self.style.ERROR('❌ Firebase is not configured or initialized')
            )
            self.stdout.write('Please check:')
            self.stdout.write('1. FIREBASE_ENABLED=True in .env')
            self.stdout.write('2. FIREBASE_CREDENTIALS_PATH points to valid JSON file')
            self.stdout.write('3. Service account JSON file exists and is readable')
            return

        self.stdout.write(self.style.SUCCESS('✅ Firebase is initialized'))

        # Find user
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise CommandError(f'User with email "{email}" does not exist')

        self.stdout.write(f'Found user: {user.email}')

        # Check for notification preferences
        if not hasattr(user, 'notification_preferences'):
            self.stdout.write(
                self.style.ERROR('❌ User has no notification preferences')
            )
            self.stdout.write('Create preferences in Django admin first')
            return

        prefs = user.notification_preferences

        # Check for push token
        if not prefs.push_token:
            self.stdout.write(
                self.style.ERROR('❌ User has no push token registered')
            )
            self.stdout.write('User needs to:')
            self.stdout.write('1. Install your app on their device')
            self.stdout.write('2. Register for push notifications')
            self.stdout.write('3. App will send FCM token to backend via API')
            return

        self.stdout.write(f'✅ Push token found: {prefs.push_token[:30]}...')

        # Check if push is enabled
        if not prefs.push_enabled:
            self.stdout.write(
                self.style.WARNING('⚠️  Push notifications are disabled for this user')
            )
            self.stdout.write('Enable in notification preferences')

        # Send test notification
        self.stdout.write('Sending test push notification...')

        success, response = send_push_notification(
            token=prefs.push_token,
            title=title,
            body=body,
            data={
                'test': 'true',
                'type': 'test_notification',
                'timestamp': str(timezone.now())
            }
        )

        if success:
            self.stdout.write(
                self.style.SUCCESS(f'✅ Push notification sent successfully!')
            )
            self.stdout.write(f'Message ID: {response}')
            
            # Create notification record
            notification = Notification.objects.create(
                recipient=user,
                title=title,
                message=body,
                notification_type='test',
                channel='push',
                status='sent'
            )
            notification.mark_as_delivered()
            
            self.stdout.write(f'Notification record created: #{notification.id}')
        else:
            self.stdout.write(
                self.style.ERROR(f'❌ Failed to send push notification')
            )
            self.stdout.write(f'Error: {response}')
            
            # Check for common errors
            if 'registration-token-not-registered' in str(response):
                self.stdout.write(
                    self.style.WARNING('Token is invalid or expired')
                )
                self.stdout.write('User needs to re-register for push notifications')
            elif 'invalid' in str(response).lower():
                self.stdout.write(
                    self.style.WARNING('Token format is invalid')
                )
                self.stdout.write('Check client-side FCM token generation')


# Import timezone at module level
from django.utils import timezone
