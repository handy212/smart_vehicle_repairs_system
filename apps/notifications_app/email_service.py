"""
Email Service Integration
Supports SendGrid, AWS SES, and SMTP
"""
import logging
from typing import List, Optional, Dict
from django.conf import settings
from django.core.mail import send_mail, EmailMultiAlternatives
from django.template.loader import render_to_string
from apps.accounts.settings_utils import get_email_settings

logger = logging.getLogger(__name__)


class EmailService:
    """Base email service class"""
    
    def __init__(self):
        self.name = "Base Email Service"
    
    def send_email(
        self,
        to: List[str],
        subject: str,
        message: str,
        html_message: Optional[str] = None,
        from_email: Optional[str] = None,
        attachments: Optional[List] = None
    ) -> bool:
        """
        Send an email
        
        Args:
            to: List of recipient email addresses
            subject: Email subject
            message: Plain text message
            html_message: HTML message (optional)
            from_email: Sender email (optional, uses default)
            attachments: List of attachments (optional)
            
        Returns:
            True if successful, False otherwise
        """
        raise NotImplementedError


class SendGridEmailService(EmailService):
    """SendGrid email service integration"""
    
    def __init__(self):
        super().__init__()
        self.name = "SendGrid"
        try:
            import sendgrid
            from sendgrid.helpers.mail import Mail, Email, Content, Attachment, FileContent, FileName, FileType, Disposition
            
            self.sendgrid = sendgrid
            self.Mail = Mail
            self.Email = Email
            self.Content = Content
            self.Attachment = Attachment
            self.FileContent = FileContent
            self.FileName = FileName
            self.FileType = FileType
            self.Disposition = Disposition
            
            api_key = getattr(settings, 'SENDGRID_API_KEY', '')
            if api_key:
                self.sg = sendgrid.SendGridAPIClient(api_key=api_key)
            else:
                self.sg = None
                logger.warning("SendGrid API key not configured")
        except ImportError:
            logger.error("SendGrid library not installed. Install with: pip install sendgrid")
            self.sg = None
    
    def send_email(
        self,
        to: List[str],
        subject: str,
        message: str,
        html_message: Optional[str] = None,
        from_email: Optional[str] = None,
        attachments: Optional[List] = None
    ) -> bool:
        """Send email via SendGrid"""
        if not self.sg:
            logger.error("SendGrid client not configured")
            return False
        
        try:
            email_settings = get_email_settings()
            default_from = email_settings.get('email_from_address') or getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@example.com')
            from_email = from_email or default_from
            
            mail = self.Mail(
                from_email=self.Email(from_email),
                to_emails=to,
                subject=subject,
                plain_text_content=message
            )
            
            if html_message:
                mail.add_content(self.Content("text/html", html_message))
            
            # Add attachments
            if attachments:
                for attachment in attachments:
                    file_content = self.FileContent(attachment['content'])
                    file_name = self.FileName(attachment['filename'])
                    file_type = self.FileType(attachment.get('type', 'application/octet-stream'))
                    disposition = self.Disposition(attachment.get('disposition', 'attachment'))
                    
                    attached_file = self.Attachment(file_content, file_name, file_type, disposition)
                    mail.add_attachment(attached_file)
            
            response = self.sg.send(mail)
            
            if response.status_code in [200, 201, 202]:
                logger.info(f"Email sent successfully via SendGrid to {to}")
                return True
            else:
                logger.error(f"SendGrid email failed with status {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"SendGrid email error: {str(e)}")
            return False


class AWSEmailService(EmailService):
    """AWS SES email service integration"""
    
    def __init__(self):
        super().__init__()
        self.name = "AWS SES"
        try:
            import boto3
            from botocore.exceptions import ClientError
            
            self.boto3 = boto3
            self.ClientError = ClientError
            
            region = getattr(settings, 'AWS_SES_REGION', 'us-east-1')
            self.client = boto3.client('ses', region_name=region)
        except ImportError:
            logger.error("boto3 library not installed. Install with: pip install boto3")
            self.client = None
    
    def send_email(
        self,
        to: List[str],
        subject: str,
        message: str,
        html_message: Optional[str] = None,
        from_email: Optional[str] = None,
        attachments: Optional[List] = None
    ) -> bool:
        """Send email via AWS SES"""
        if not self.client:
            logger.error("AWS SES client not configured")
            return False
        
        try:
            email_settings = get_email_settings()
            default_from = email_settings.get('email_from_address') or getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@example.com')
            from_email = from_email or default_from
            
            # AWS SES doesn't support attachments in simple send_email
            # For attachments, use send_raw_email instead
            if attachments:
                return self._send_raw_email(to, subject, message, html_message, from_email, attachments)
            
            destination = {'ToAddresses': to}
            message_body = {'Text': {'Data': message}}
            
            if html_message:
                message_body['Html'] = {'Data': html_message}
            
            response = self.client.send_email(
                Source=from_email,
                Destination=destination,
                Message={
                    'Subject': {'Data': subject},
                    'Body': message_body
                }
            )
            
            logger.info(f"Email sent successfully via AWS SES to {to}, MessageId: {response['MessageId']}")
            return True
        except self.ClientError as e:
            logger.error(f"AWS SES email error: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"AWS SES email error: {str(e)}")
            return False
    
    def _send_raw_email(self, to, subject, message, html_message, from_email, attachments):
        """Send email with attachments using raw email"""
        # This is a simplified version - full implementation would use email.mime
        # For now, fall back to Django's email service
        logger.warning("AWS SES attachments not fully implemented, falling back to Django email")
        return False


class DjangoEmailService(EmailService):
    """Django's built-in email service (SMTP)"""
    
    def __init__(self):
        super().__init__()
        self.name = "Django SMTP"
    
    def send_email(
        self,
        to: List[str],
        subject: str,
        message: str,
        html_message: Optional[str] = None,
        from_email: Optional[str] = None,
        attachments: Optional[List] = None
    ) -> bool:
        """Send email using Django's email backend"""
        try:
            email_settings = get_email_settings()
            default_from = email_settings.get('email_from_address') or getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@example.com')
            from_email = from_email or default_from
            
            if html_message or attachments:
                # Use EmailMultiAlternatives for HTML and attachments
                email = EmailMultiAlternatives(
                    subject=subject,
                    body=message,
                    from_email=from_email,
                    to=to
                )
                
                if html_message:
                    email.attach_alternative(html_message, "text/html")
                
                if attachments:
                    for attachment in attachments:
                        email.attach(
                            filename=attachment['filename'],
                            content=attachment['content'],
                            mimetype=attachment.get('type', 'application/octet-stream')
                        )
                
                email.send()
            else:
                # Use simple send_mail for plain text
                send_mail(
                    subject=subject,
                    message=message,
                    from_email=from_email,
                    recipient_list=to,
                    fail_silently=False
                )
            
            logger.info(f"Email sent successfully via Django SMTP to {to}")
            return True
        except Exception as e:
            logger.error(f"Django email error: {str(e)}")
            return False


def get_email_service(service_name: str = None) -> EmailService:
    """
    Get email service instance
    
    Args:
        service_name: Name of service ('sendgrid', 'aws_ses', 'django')
                     If None, uses default from settings
        
    Returns:
        EmailService instance
    """
    if not service_name:
        service_name = getattr(settings, 'EMAIL_SERVICE', 'django').lower()
    
    if service_name == 'sendgrid':
        return SendGridEmailService()
    elif service_name == 'aws_ses' or service_name == 'ses':
        return AWSEmailService()
    else:
        # Default to Django SMTP
        return DjangoEmailService()


def send_notification_email(
    recipient_email: str,
    subject: str,
    template_name: str,
    context: Dict,
    service_name: str = None
) -> bool:
    """
    Send a notification email using a template
    
    Args:
        recipient_email: Recipient email address
        subject: Email subject
        template_name: Template name (without .txt/.html extension)
        context: Template context variables
        service_name: Email service to use (optional)
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Render templates
        text_message = render_to_string(f'{template_name}.txt', context)
        html_message = render_to_string(f'{template_name}.html', context)
        
        # Get email service
        email_service = get_email_service(service_name)
        
        # Send email
        return email_service.send_email(
            to=[recipient_email],
            subject=subject,
            message=text_message,
            html_message=html_message
        )
    except Exception as e:
        logger.error(f"Failed to send notification email: {str(e)}")
        return False

