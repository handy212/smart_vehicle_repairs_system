"""
Firebase Cloud Messaging Integration
Handles push notification delivery via Firebase
"""
import logging
from django.conf import settings
import firebase_admin
from firebase_admin import credentials, messaging

logger = logging.getLogger(__name__)

# Firebase app instance
_firebase_app = None


def initialize_firebase():
    """
    Initialize Firebase Admin SDK
    Should be called once on application startup
    """
    global _firebase_app
    
    # Check if already initialized
    if _firebase_app is not None:
        return _firebase_app
    
    # Check if Firebase is enabled
    if not settings.FIREBASE_ENABLED:
        logger.info("Firebase is disabled in settings")
        return None
    
    # Check for credentials path
    if not settings.FIREBASE_CREDENTIALS_PATH:
        logger.warning("FIREBASE_CREDENTIALS_PATH not configured in settings")
        return None
    
    try:
        # Initialize Firebase with service account
        cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
        _firebase_app = firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized successfully")
        return _firebase_app
        
    except Exception as e:
        logger.error(f"Failed to initialize Firebase: {str(e)}")
        return None


def is_firebase_available():
    """
    Check if Firebase is properly initialized and available
    """
    return _firebase_app is not None or firebase_admin._apps


def send_push_notification(token, title, body, data=None):
    """
    Send a push notification via Firebase Cloud Messaging
    
    Args:
        token (str): FCM device token
        title (str): Notification title
        body (str): Notification body
        data (dict): Optional data payload
        
    Returns:
        tuple: (success: bool, message_id: str or error: str)
    """
    if not is_firebase_available():
        # Try to initialize if not already done
        initialize_firebase()
        
        if not is_firebase_available():
            return False, "Firebase not initialized"
    
    try:
        # Build the message
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=data or {},
            token=token,
        )
        
        # Send the message
        response = messaging.send(message)
        logger.info(f"Successfully sent push notification: {response}")
        
        return True, response
        
    except firebase_admin.exceptions.FirebaseError as e:
        logger.error(f"Firebase error sending push notification: {str(e)}")
        return False, f"Firebase error: {str(e)}"
        
    except Exception as e:
        logger.error(f"Unexpected error sending push notification: {str(e)}")
        return False, f"Error: {str(e)}"


def send_multicast_notification(tokens, title, body, data=None):
    """
    Send a push notification to multiple devices
    
    Args:
        tokens (list): List of FCM device tokens
        title (str): Notification title
        body (str): Notification body
        data (dict): Optional data payload
        
    Returns:
        tuple: (success_count: int, failure_count: int, responses: list)
    """
    if not is_firebase_available():
        initialize_firebase()
        
        if not is_firebase_available():
            return 0, len(tokens), ["Firebase not initialized"] * len(tokens)
    
    try:
        # Build the multicast message
        message = messaging.MulticastMessage(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=data or {},
            tokens=tokens,
        )
        
        # Send to multiple devices
        batch_response = messaging.send_multicast(message)
        
        logger.info(
            f"Multicast notification sent: {batch_response.success_count} successful, "
            f"{batch_response.failure_count} failed"
        )
        
        return batch_response.success_count, batch_response.failure_count, batch_response.responses
        
    except Exception as e:
        logger.error(f"Error sending multicast notification: {str(e)}")
        return 0, len(tokens), [str(e)] * len(tokens)


def validate_token(token):
    """
    Validate if a token is properly formatted
    Basic validation - actual validation happens when sending
    
    Args:
        token (str): FCM device token
        
    Returns:
        bool: True if token appears valid
    """
    if not token or not isinstance(token, str):
        return False
    
    # FCM tokens are typically 152+ characters
    if len(token) < 100:
        return False
    
    return True
