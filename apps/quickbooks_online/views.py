from django.shortcuts import redirect, render
from django.conf import settings
from django.views import View
from django.http import HttpResponse, JsonResponse
from django.contrib.auth.mixins import AccessMixin, LoginRequiredMixin, UserPassesTestMixin
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.contrib import messages
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from urllib.parse import urlencode
from .models import QBOConfig, QBOToken, QBOSyncLog
from .services import QuickBooksService, get_qbo_redirect_uri, _infer_redirect_base
from .tasks import task_full_inbound_sync
from .oauth_state import persist_oauth_state, resolve_oauth_state, consume_oauth_state, invalidate_oauth_state
import logging

logger = logging.getLogger(__name__)

FRONTEND_QBO_PATH = "/admin/integrations"


def build_frontend_url(path, query=None):
    base_url = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3001").rstrip("/")
    url = f"{base_url}{path}"
    if query:
        query_string = urlencode({key: value for key, value in query.items() if value is not None})
        if query_string:
            url = f"{url}?{query_string}"
    return url


def build_qbo_integrations_url(**query):
    params = {"category": "accounting"}
    params.update(query)
    return build_frontend_url(FRONTEND_QBO_PATH, params)


def build_frontend_login_url():
    return build_frontend_url("/login", {"next": f"{FRONTEND_QBO_PATH}?category=accounting"})


def request_wants_json(request):
    accept = request.headers.get("Accept", "")
    requested_with = request.headers.get("X-Requested-With", "")
    return (
        "application/json" in accept
        or request.content_type == "application/json"
        or requested_with == "XMLHttpRequest"
    )


class FrontendAccessRedirectMixin(AccessMixin):
    permission_denied_message = "You do not have permission to manage QuickBooks."

    def handle_no_permission(self):
        if request_wants_json(self.request):
            if self.request.user.is_authenticated:
                return JsonResponse(
                    {"detail": self.get_permission_denied_message()},
                    status=403,
                )
            return JsonResponse(
                {
                    "detail": "Authentication required.",
                    "login_url": build_frontend_login_url(),
                },
                status=401,
            )

        if self.request.user.is_authenticated:
            messages.error(self.request, self.get_permission_denied_message())
            return redirect(build_qbo_integrations_url(qbo_status="forbidden"))

        return redirect(build_frontend_login_url())


class SuperUserRequiredMixin(UserPassesTestMixin):
    def test_func(self):
        return self.request.user.is_superuser


class QBOConnectView(FrontendAccessRedirectMixin, LoginRequiredMixin, SuperUserRequiredMixin, View):
    """
    Initiates the OAuth2 flow with QuickBooks Online.
    """
    def get(self, request):
        logger.info("QBOConnectView.get called - attempting to fetch config")
        config = QuickBooksService.get_config(active_only=False)
        if not config or not config.client_id or not config.client_secret:
            if request_wants_json(request):
                return JsonResponse(
                    {"detail": "QuickBooks configuration is incomplete."},
                    status=400,
                )
            messages.error(request, "QuickBooks configuration is incomplete.")
            return redirect(build_qbo_integrations_url(qbo_status="missing_config"))

        if not QuickBooksService.sdk_available():
            message = QuickBooksService.sdk_unavailable_message()
            if request_wants_json(request):
                return JsonResponse({"detail": message}, status=503)
            messages.error(request, message)
            return redirect(build_qbo_integrations_url(qbo_status="sdk_missing"))
            
        redirect_base = _infer_redirect_base(request)
        redirect_uri = get_qbo_redirect_uri(redirect_base)
        logger.info("QBO OAuth redirect_uri=%s (redirect_base=%s)", redirect_uri, redirect_base)
        auth_client = QuickBooksService.get_auth_client(config, redirect_uri=redirect_uri)
        
        # Accounting scope only — company name comes from CompanyInfo (Accounting API),
        # not OpenID profile scopes.
        from intuitlib.enums import Scopes

        scopes = [Scopes.ACCOUNTING]

        # Get authorization URL
        auth_url = auth_client.get_authorization_url(scopes)
        
        # Store state in session (fallback) and database (primary)
        request.session['qbo_state'] = auth_client.state_token
        request.session['qbo_redirect_uri'] = redirect_uri
        persist_oauth_state(
            state_token=auth_client.state_token,
            redirect_uri=redirect_uri,
            user=request.user,
        )
        
        return redirect(auth_url)


@method_decorator(csrf_exempt, name='dispatch')
class QBOCallbackView(FrontendAccessRedirectMixin, LoginRequiredMixin, SuperUserRequiredMixin, View):
    """
    Handles the callback from QBO after user approves access.
    Intuit redirects the browser here without a Referer; exempt CSRF checks.
    """
    def get(self, request):
        state = request.GET.get('state')
        code = request.GET.get('code')
        realm_id = request.GET.get('realmId')
        
        if not code or not realm_id:
            messages.error(request, "Invalid QuickBooks callback parameters.")
            return redirect(build_qbo_integrations_url(qbo_status="invalid_callback"))

        if not str(realm_id).isdigit():
            logger.warning('QBO OAuth callback rejected: invalid realmId format (%s)', realm_id)
            messages.error(request, "Invalid QuickBooks company ID.")
            return redirect(build_qbo_integrations_url(qbo_status="invalid_callback"))
            
        saved_state = request.session.get('qbo_state')
        redirect_uri, oauth_state = resolve_oauth_state(state, request.user, saved_state)
        if redirect_uri is None and oauth_state != 'session':
            logger.warning(
                "QBO OAuth callback rejected due to state mismatch (received=%s, expected=%s)",
                state,
                saved_state,
            )
            invalidate_oauth_state(state)
            messages.error(request, "QuickBooks authorization failed due to an invalid session state. Please try connecting again.")
            return redirect(build_qbo_integrations_url(qbo_status="invalid_state"))

        config = QuickBooksService.get_config(active_only=False)
        if not QuickBooksService.sdk_available():
            messages.error(request, QuickBooksService.sdk_unavailable_message())
            return redirect(build_qbo_integrations_url(qbo_status="sdk_missing"))

        if redirect_uri is None:
            redirect_uri = request.session.get("qbo_redirect_uri") or get_qbo_redirect_uri()
        auth_client = QuickBooksService.get_auth_client(config, redirect_uri=redirect_uri)
        
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
            
            # Activate config
            config.is_active = True
            config.save()

            QBOToken.objects.update_or_create(
                config=config,
                defaults={
                    'access_token': access_token,
                    'refresh_token': refresh_token,
                    'expires_at': expires_at,
                    'refresh_token_expires_at': refresh_token_expires_at
                }
            )
            
            if 'qbo_state' in request.session:
                del request.session['qbo_state']
            if 'qbo_redirect_uri' in request.session:
                del request.session['qbo_redirect_uri']

            consume_oauth_state(oauth_state)

            from .status_cache import clear_api_ready_cache
            clear_api_ready_cache(config.pk)

            QuickBooksService.fetch_and_store_company_name(config)

            messages.success(request, f"Successfully connected to QuickBooks Company ID: {realm_id}")
            return redirect(build_qbo_integrations_url(qbo_status="connected"))
            
        except Exception as e:
            logger.error(f"Error during QBO callback: {e}")
            invalidate_oauth_state(state)
            messages.error(request, "Error connecting to QuickBooks.")
            return redirect(build_qbo_integrations_url(qbo_status="error"))


class QBORefreshView(FrontendAccessRedirectMixin, LoginRequiredMixin, SuperUserRequiredMixin, View):
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
            
            return redirect(build_qbo_integrations_url(qbo_status="refreshed" if config else "not_connected"))
            
        except Exception as e:
            messages.error(request, f"Error refreshing token: {e}")
            return redirect(build_qbo_integrations_url(qbo_status="refresh_error"))

class QBODisconnectView(FrontendAccessRedirectMixin, LoginRequiredMixin, SuperUserRequiredMixin, View):
    """
    Disconnects from QBO.
    """
    @method_decorator(csrf_exempt)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def post(self, request):
        QuickBooksService.disconnect()
        
        if request_wants_json(request):
            return JsonResponse({'status': 'success', 'message': 'Disconnected from QuickBooks Online.'})

        messages.success(request, "Disconnected from QuickBooks Online.")
        return redirect(build_qbo_integrations_url(qbo_status="disconnected"))


class QBOInboundSyncView(FrontendAccessRedirectMixin, LoginRequiredMixin, SuperUserRequiredMixin, View):
    """
    Manually triggers a full inbound sync (QBO → local) in the background.
    Accessible only to superusers.
    """
    @method_decorator(csrf_exempt)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def get(self, request):
        """
        Redirect browser requests back to the frontend integrations screen.
        """
        config = QuickBooksService.get_config()
        if not config:
            messages.error(request, "QuickBooks is not configured.")
            return redirect(build_qbo_integrations_url(qbo_status="missing_config"))

        return redirect(build_qbo_integrations_url(qbo_status="sync_ready"))

    def post(self, request):
        config = QuickBooksService.get_config()
        if not config:
            if request_wants_json(request):
                return JsonResponse(
                    {'status': 'error', 'message': 'QuickBooks is not configured.'},
                    status=400,
                )
            messages.error(request, "QuickBooks is not configured.")
            return redirect(build_qbo_integrations_url(qbo_status="missing_config"))

        try:
            # Prefer the background worker, but allow a direct fallback so
            # manual sync still works when Celery/Redis is unavailable.
            try:
                task_full_inbound_sync.delay(triggered_by_id=request.user.id)
                message = 'Inbound sync triggered! Data is being pulled from QuickBooks in the background.'

                if request_wants_json(request):
                    return JsonResponse({
                        'status': 'success',
                        'message': message,
                        'queued': True,
                    })

                messages.success(
                    request,
                    "Inbound sync triggered! Vendors, invoices, bills, estimates, credit memos, and vendor credits are being pulled from QuickBooks. "
                    "Check the QBO Sync Logs in the admin panel to monitor progress."
                )
            except Exception as queue_error:
                logger.warning(
                    "Celery dispatch for QBO inbound sync failed, falling back to inline execution: %s",
                    queue_error,
                )
                task_full_inbound_sync(triggered_by_id=request.user.id)
                message = (
                    "Inbound sync completed directly because the background worker was unavailable."
                )

                if request_wants_json(request):
                    return JsonResponse({
                        'status': 'success',
                        'message': message,
                        'queued': False,
                    })

                messages.warning(request, message)

        except Exception as e:
            logger.error(f"Failed to trigger inbound sync: {e}", exc_info=True)
            if request_wants_json(request):
                return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
            messages.error(request, f"Failed to trigger inbound sync: {e}")

        return redirect(build_qbo_integrations_url(qbo_status="sync_started"))

class QBOStatusView(FrontendAccessRedirectMixin, LoginRequiredMixin, View):
    """
    Returns the current connection status and basic stats for QBO.
    Readable by any authenticated user (used to gate operational UI).
    """
    def get(self, request):
        config = QuickBooksService.get_config(active_only=False)

        has_keys = config and config.client_id and config.client_secret
        last_sync = QBOSyncLog.objects.order_by('-finished_at').first()

        company_name = config.company_name if config else None
        if (
            config
            and config.is_active
            and not company_name
            and QuickBooksService.is_connected()
        ):
            from django.core.cache import cache

            fetch_key = f'qbo:fetch-company-name:{config.pk}'
            if cache.add(fetch_key, '1', 86400):
                company_name = QuickBooksService.fetch_and_store_company_name(
                    config,
                    deactivate_on_auth_failure=False,
                )

        token_expires_at = None
        refresh_token_expires_at = None
        if config and hasattr(config, 'token') and config.token:
            token_expires_at = config.token.expires_at
            refresh_token_expires_at = config.token.refresh_token_expires_at

        payload = {
            'is_connected': QuickBooksService.is_connected(),
            'has_keys': bool(has_keys),
            'realm_id': config.realm_id if config else None,
            'is_sandbox': config.is_sandbox if config else True,
            'last_sync': last_sync.finished_at if last_sync else None,
            'company_name': company_name,
            'token_expires_at': token_expires_at,
            'refresh_token_expires_at': refresh_token_expires_at,
            'oauth_redirect_uri': get_qbo_redirect_uri(_infer_redirect_base(request)),
            'oauth_keys_environment': 'sandbox' if (config.is_sandbox if config else True) else 'production',
        }
        payload['api_ready'] = False
        payload['connection_issue'] = None
        if payload['is_connected']:
            from django.utils import timezone
            from datetime import timedelta
            from django.core.cache import cache
            from apps.quickbooks_online.bulk_outbound_sync import count_pending_outbound_syncs
            from apps.quickbooks_online.status_cache import api_ready_cache_key as build_api_ready_cache_key

            ready_cache_key = build_api_ready_cache_key(config.pk) if config else None
            cached_ready = cache.get(ready_cache_key) if ready_cache_key else None
            token = getattr(config, 'token', None) if config else None

            if cached_ready in ('0', '1'):
                payload['api_ready'] = cached_ready == '1'
            elif (
                token
                and token.refresh_token_expires_at
                and token.refresh_token_expires_at > timezone.now()
                and token.expires_at
                and token.expires_at > timezone.now() + timedelta(minutes=5)
            ):
                # Access token still valid locally — skip Intuit round-trip.
                payload['api_ready'] = True
                if ready_cache_key:
                    cache.set(ready_cache_key, '1', 60)
            elif QuickBooksService.get_client(deactivate_on_auth_failure=False) is not None:
                payload['api_ready'] = True
                if ready_cache_key:
                    cache.set(ready_cache_key, '1', 60)
            else:
                payload['connection_issue'] = (
                    'QuickBooks is linked but the live API session is unavailable. '
                    'Reconnect under Admin → Integrations, or refresh the OAuth token.'
                )
                if ready_cache_key:
                    cache.set(ready_cache_key, '0', 60)

            if not payload['api_ready'] and not payload['connection_issue']:
                payload['connection_issue'] = (
                    'QuickBooks is linked but the live API session is unavailable. '
                    'Reconnect under Admin → Integrations, or refresh the OAuth token.'
                )

            # Outbound counts can be expensive; cache briefly so status stays snappy.
            pending_key = f'qbo:outbound-pending:{config.pk}' if config else None
            pending = cache.get(pending_key) if pending_key else None
            if pending is None:
                pending = count_pending_outbound_syncs()
                if pending_key:
                    cache.set(pending_key, pending, 30)
            payload['outbound_pending'] = pending

            never_key = f'qbo:never-synced-customers:{config.pk}' if config else None
            never_count = cache.get(never_key) if never_key else None
            if never_count is None:
                from apps.quickbooks_online.bulk_outbound_sync import count_never_synced
                never_count = count_never_synced(entity_types=['customer']).get('customer', 0)
                if never_key:
                    cache.set(never_key, never_count, 120)
            payload['never_synced_customers'] = never_count
        elif has_keys:
            payload['connection_issue'] = 'QuickBooks credentials are saved but the company is not connected.'

        return JsonResponse(payload)


@method_decorator(csrf_exempt, name='dispatch')
class QBOWebhookView(View):
    """
    Receives real-time Event Notifications from QuickBooks Online.

    QBO sends a POST with a JSON payload containing entity change events.
    We validate the HMAC-SHA256 signature, then queue targeted sync tasks
    so only changed entities are re-pulled — avoiding full scans.

    Webhook verification token must be set in SystemSettings as
    'quickbooks_webhook_token' (the verifier token from Intuit Developer Portal).

    Reference:
      https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
    """

    def post(self, request):
        import json

        from .webhook_security import webhook_signature_accepted

        signature = request.headers.get('intuit-signature', '')
        payload_bytes = request.body

        try:
            from apps.accounts.admin_models import SystemSettings
            webhook_token = SystemSettings.get_setting('quickbooks_webhook_token', '')
        except Exception:
            webhook_token = ''

        from django.conf import settings as django_settings

        accepted, rejection_reason = webhook_signature_accepted(
            payload_bytes=payload_bytes,
            signature_header=signature,
            webhook_token=webhook_token,
            require_signatures=getattr(django_settings, 'REQUIRE_WEBHOOK_SIGNATURES', False),
            debug=getattr(django_settings, 'DEBUG', False),
        )
        if not accepted:
            status_code = 401 if rejection_reason in ('Invalid signature', 'Missing signature') else 401
            return JsonResponse({'error': rejection_reason or 'Invalid signature'}, status=status_code)

        # --- Parse payload ---
        try:
            data = json.loads(payload_bytes)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        # QBO payload structure:
        # { "eventNotifications": [ { "realmId": "...", "dataChangeEvent": { "entities": [...] } } ] }
        notifications = data.get('eventNotifications', [])
        queued = []

        from .webhook_dispatch import queue_inbound_pull_for_entity

        for notification in notifications:
            realm_id = notification.get('realmId')
            config = QuickBooksService.get_config()
            if not config or config.realm_id != realm_id:
                logger.warning(f"QBO webhook: unknown realmId {realm_id}, skipping.")
                continue

            entities = notification.get('dataChangeEvent', {}).get('entities', [])
            for entity in entities:
                entity_name = entity.get('name', '').lower()
                operation = entity.get('operation', '').lower()

                if operation == 'delete':
                    # We don't auto-delete local records from QBO deletes
                    continue

                if queue_inbound_pull_for_entity(entity_name):
                    queued.append(entity_name)

        logger.info(f"QBO webhook processed. Queued syncs: {list(set(queued))}")
        # QBO expects a 200 response
        return JsonResponse({'received': True, 'queued': list(set(queued))})
