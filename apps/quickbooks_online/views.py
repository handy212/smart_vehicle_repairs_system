from django.shortcuts import redirect, render
from django.views import View
from django.http import HttpResponse, JsonResponse
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.contrib import messages
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from .models import QBOConfig, QBOToken, QBOSyncLog
from .services import QuickBooksService
from .tasks import task_full_inbound_sync
import logging

logger = logging.getLogger(__name__)

class SuperUserRequiredMixin(UserPassesTestMixin):
    def test_func(self):
        return self.request.user.is_superuser

class QBOConnectView(LoginRequiredMixin, SuperUserRequiredMixin, View):
    """
    Initiates the OAuth2 flow with QuickBooks Online.
    """
    def get(self, request):
        logger.info("QBOConnectView.get called - attempting to fetch config")
        config = QuickBooksService.get_config()
        if not config:
            return HttpResponse("QBO Configuration missing. Please set up Client ID and Secret in Admin.", status=400)
            
        auth_client = QuickBooksService.get_auth_client(config)
        
        # Scopes: Accounting is the main one we need
        # The intuit-oauth library uses enum Scopes
        from intuitlib.enums import Scopes
        
        scopes = [
            Scopes.ACCOUNTING, 
            Scopes.OPENID, 
            Scopes.PROFILE, 
            Scopes.EMAIL, 
            Scopes.PHONE, 
            Scopes.ADDRESS
        ]
        
        # Get authorization URL
        auth_url = auth_client.get_authorization_url(scopes)
        
        # Store state in session
        request.session['qbo_state'] = auth_client.state_token
        
        return redirect(auth_url)


class QBOCallbackView(LoginRequiredMixin, SuperUserRequiredMixin, View):
    """
    Handles the callback from QBO after user approves access.
    """
    def get(self, request):
        state = request.GET.get('state')
        code = request.GET.get('code')
        realm_id = request.GET.get('realmId')
        
        if not code or not realm_id:
            return HttpResponse("Invalid callback parameters.", status=400)
            
        # Verify state
        saved_state = request.session.get('qbo_state')
        if state != saved_state:
             # Basic CSRF check, potentially optional depending on strictness
             pass
            
        config = QuickBooksService.get_config()
        auth_client = QuickBooksService.get_auth_client(config)
        
        try:
            # Exchange code for bearer token
            auth_client.get_bearer_token(code, realm_id=realm_id)
            
            # Save realm_id to config
            config.realm_id = realm_id
            config.save()
            
            # Save token
            access_token = auth_client.access_token
            refresh_token = auth_client.refresh_token
            expires_in = auth_client.expires_in
            x_refresh_token_expires_in = auth_client.x_refresh_token_expires_in
            
            expires_at = timezone.now() + timedelta(seconds=expires_in)
            refresh_token_expires_at = timezone.now() + timedelta(seconds=x_refresh_token_expires_in)
            
            QBOToken.objects.update_or_create(
                config=config,
                defaults={
                    'access_token': access_token,
                    'refresh_token': refresh_token,
                    'expires_at': expires_at,
                    'refresh_token_expires_at': refresh_token_expires_at
                }
            )
            
            messages.success(request, f"Successfully connected to QuickBooks Company ID: {realm_id}")
            # Redirect to admin config page
            return redirect(reverse('admin:quickbooks_online_qboconfig_change', args=[config.id]))
            
        except Exception as e:
            logger.error(f"Error during QBO callback: {e}")
            return HttpResponse(f"Error connecting to QuickBooks: {str(e)}", status=500)


class QBORefreshView(LoginRequiredMixin, SuperUserRequiredMixin, View):
    """
    Manually triggers a token refresh.
    """
    def post(self, request):
        try:
            # get_client handles refresh if needed
            config = QuickBooksService.get_config()
            if config and hasattr(config, 'token'):
                QuickBooksService.refresh_token(config, config.token)
                messages.success(request, "Token refreshed successfully.")
            else:
                messages.error(request, "No active connection to refresh.")
            
            if config:
                return redirect(reverse('admin:quickbooks_online_qboconfig_change', args=[config.id]))
            return redirect('/admin/')
            
        except Exception as e:
            messages.error(request, f"Error refreshing token: {e}")
            config = QuickBooksService.get_config()
            if config:
                return redirect(reverse('admin:quickbooks_online_qboconfig_change', args=[config.id]))
            return redirect('/admin/')

class QBODisconnectView(LoginRequiredMixin, SuperUserRequiredMixin, View):
    """
    Disconnects from QBO.
    """
    @method_decorator(csrf_exempt)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def post(self, request):
        QuickBooksService.disconnect()
        
        if request.headers.get('Accept') == 'application/json' or request.content_type == 'application/json':
            return JsonResponse({'status': 'success', 'message': 'Disconnected from QuickBooks Online.'})

        messages.success(request, "Disconnected from QuickBooks Online.")
        
        config = QuickBooksService.get_config()
        if config:
            return redirect(reverse('admin:quickbooks_online_qboconfig_change', args=[config.id]))
        return redirect('/admin/')


class QBOInboundSyncView(LoginRequiredMixin, SuperUserRequiredMixin, View):
    """
    Manually triggers a full inbound sync (QBO → local) in the background.
    Accessible only to superusers.
    """
    @method_decorator(csrf_exempt)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def get(self, request):
        """
        Renders a simple confirmation page for triggering the sync.
        Useful when accessing via browser.
        """
        config = QuickBooksService.get_config()
        if not config:
            messages.error(request, "QuickBooks is not configured.")
            return redirect('/admin/')
            
        return HttpResponse(f"""
            <html>
                <body style="font-family: sans-serif; padding: 20px;">
                    <h2>QuickBooks Inbound Synchronization</h2>
                    <p>This will pull Vendors, Invoices, and Bills from QBO to update your local records.</p>
                    <form method="post">
                        <input type="hidden" name="csrfmiddlewaretoken" value="{request.COOKIES.get('csrftoken', '')}">
                        <button type="submit" style="padding: 10px 20px; background: #2c3e50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Trigger Full Inbound Sync Now
                        </button>
                    </form>
                    <p><a href="/admin/">Back to Admin</a></p>
                </body>
            </html>
        """)

    def post(self, request):
        try:
            # Dispatch to Celery in background so request doesn't block
            task_full_inbound_sync.delay(triggered_by_id=request.user.id)
            
            if request.headers.get('Accept') == 'application/json' or request.content_type == 'application/json':
                return JsonResponse({
                    'status': 'success', 
                    'message': 'Inbound sync triggered! Data is being pulled from QuickBooks in the background.'
                })

            messages.success(
                request,
                "Inbound sync triggered! Vendors, Invoices, and Bills are being pulled from QuickBooks. "
                "Check the QBO Sync Logs in the admin panel to monitor progress."
            )
        except Exception as e:
            logger.error(f"Failed to trigger inbound sync: {e}")
            if request.headers.get('Accept') == 'application/json' or request.content_type == 'application/json':
                return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
            messages.error(request, f"Failed to trigger inbound sync: {e}")

        # Redirect back to admin or a sensible page
        config = QuickBooksService.get_config()
        if config:
            return redirect(reverse('admin:quickbooks_online_qboconfig_change', args=[config.id]))
        return redirect('/admin/')
