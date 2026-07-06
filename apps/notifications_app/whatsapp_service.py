"""
WhatsApp Service Integration
Supports Meta WhatsApp Cloud API for sending messages and templates
"""
import logging
import requests
import json
from typing import List, Optional, Dict, Any, Union
from django.conf import settings
from apps.accounts.settings_utils import get_whatsapp_settings

logger = logging.getLogger(__name__)


class WhatsAppService:
    """Service for interacting with Meta WhatsApp Cloud API"""
    
    def __init__(self):
        self.name = "Meta WhatsApp Cloud API"
        self._load_config()
    
    def _load_config(self):
        """Load configuration from settings"""
        whatsapp_settings = get_whatsapp_settings()
        
        self.enabled = whatsapp_settings.get('whatsapp_enabled', 'false').lower() == 'true'
        self.access_token = whatsapp_settings.get('whatsapp_access_token', '')
        self.phone_number_id = whatsapp_settings.get('whatsapp_phone_number_id', '')
        self.business_account_id = whatsapp_settings.get('whatsapp_business_account_id', '')
        self.api_version = whatsapp_settings.get('whatsapp_api_version', 'v17.0')
        
        self.base_url = f"https://graph.facebook.com/{self.api_version}/{self.phone_number_id}/messages"
        
    def is_available(self) -> bool:
        """Check if service is configured and enabled"""
        return (
            self.enabled and 
            bool(self.access_token) and 
            bool(self.phone_number_id)
        )
        
    def send_message(
        self,
        to: str,
        message: str,
        preview_url: bool = False
    ) -> tuple[bool, Union[str, Dict[str, Any]]]:
        """
        Send a free-form text message (requires 24h user-initiated window)
        
        Args:
            to: Recipient phone number (E.164 without +)
            message: Message text
            preview_url: Whether to generate a preview for URLs in message
            
        Returns:
            Tuple of (success, message_id or error_message)
        """
        if not self.is_available():
            return False, "WhatsApp service not configured or enabled"
            
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": self._format_phone_number(to),
            "type": "text",
            "text": {
                "preview_url": preview_url,
                "body": message
            }
        }
        
        return self._make_request(payload)
    
    def send_template_message(
        self,
        to: str,
        template_name: str,
        language_code: str = "en",
        components: List[Dict[str, Any]] = None
    ) -> tuple[bool, Union[str, Dict[str, Any]]]:
        """
        Send a template message (required for business-initiated conversations)
        
        Args:
            to: Recipient phone number
            template_name: Name of the template in Meta Business Manager
            language_code: Language code of the template
            components: List of components (header, body parameters etc.)
            
        Returns:
            Tuple of (success, message_id or error_message)
        """
        if not self.is_available():
            return False, "WhatsApp service not configured or enabled"
            
        payload = {
            "messaging_product": "whatsapp",
            "to": self._format_phone_number(to),
            "type": "template",
            "template": {
                "name": template_name,
                "language": {
                    "code": language_code
                }
            }
        }
        
        if components:
            payload["template"]["components"] = components
            
        return self._make_request(payload)
        
    def send_document(
        self,
        to: str,
        media_url: str,
        caption: str = None,
        filename: str = None
    ) -> tuple[bool, Union[str, Dict[str, Any]]]:
        """
        Send a document (PDF, etc.)
        
        Args:
            to: Recipient phone number
            media_url: Publicly accessible URL of the document
            caption: Optional caption
            filename: Optional filename
            
        Returns:
            Tuple of (success, message_id or error_message)
        """
        if not self.is_available():
            return False, "WhatsApp service not configured or enabled"
            
        document_obj = {
            "link": media_url
        }
        
        if caption:
            document_obj["caption"] = caption
        if filename:
            document_obj["filename"] = filename
            
        payload = {
            "messaging_product": "whatsapp",
            "to": self._format_phone_number(to),
            "type": "document",
            "document": document_obj
        }
        
        return self._make_request(payload)

    def _make_request(self, payload: Dict[str, Any]) -> tuple[bool, Any]:
        """Make API request to Meta"""
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.post(
                self.base_url,
                headers=headers,
                json=payload,
                timeout=15
            )
            
            data = response.json()
            
            # Check for success (HTTP 200-299)
            if response.ok:
                # Meta API returns: {"messaging_product":"whatsapp","contacts":[...],"messages":[{"id":"..."}]}
                if 'messages' in data and len(data['messages']) > 0:
                    message_id = data['messages'][0].get('id')
                    return True, message_id
                return True, data
            else:
                # Error handling
                error_msg = data.get('error', {}).get('message', 'Unknown WhatsApp API error')
                error_code = data.get('error', {}).get('code', 'unknown')
                error_subcode = data.get('error', {}).get('error_subcode', '')
                
                detailed_error = f"{error_msg} (Code: {error_code}, Subcode: {error_subcode})"
                if str(error_code) == '131030':
                    detailed_error = (
                        f"{detailed_error}. If this is a Meta test WhatsApp number, add "
                        f"+{payload.get('to', '')} to the app's allowed recipient list in Meta."
                    )
                logger.error(f"WhatsApp API Error: {detailed_error}")
                return False, detailed_error
                
        except requests.exceptions.RequestException as e:
            logger.error(f"WhatsApp Request Error: {str(e)}")
            return False, f"Request failed: {str(e)}"
        except Exception as e:
            logger.error(f"WhatsApp Unknown Error: {str(e)}")
            return False, f"Unknown error: {str(e)}"
            
    def _format_phone_number(self, phone: str) -> str:
        """Format phone number for WhatsApp (E.164 without +)"""
        if not phone:
            return ""
            
        # Remove all non-digit characters
        digits = ''.join(filter(str.isdigit, phone))

        # Ghana local mobile numbers are commonly stored as 0XXXXXXXXX.
        # Meta expects international format without the leading +.
        if digits.startswith('233'):
            return digits
        if digits.startswith('0') and len(digits) == 10:
            return f"233{digits[1:]}"
        if len(digits) == 9:
            return f"233{digits}"

        return digits

# Global instance
_whatsapp_service = None

def get_whatsapp_service():
    """Get singleton WhatsApp service instance"""
    global _whatsapp_service
    if _whatsapp_service is None:
        _whatsapp_service = WhatsAppService()
    else:
        # Reload config in case settings changed
        _whatsapp_service._load_config()
    return _whatsapp_service
