"""AI audit logging and feature-flag helpers."""
import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def is_ai_enabled(feature=None):
    """Return True when Gemini is configured and AI is enabled (optionally per feature)."""
    if not getattr(settings, 'GEMINI_API_KEY', ''):
        return False
    try:
        from apps.accounts.admin_models import SystemSettings
        if SystemSettings.get_setting('ai_enabled', 'true').lower() != 'true':
            return False
        if feature:
            key = f'ai_{feature}_enabled'
            return SystemSettings.get_setting(key, 'true').lower() == 'true'
    except Exception:
        pass
    return True


def get_gemini_model():
    model = getattr(settings, 'GEMINI_MODEL', 'gemini-flash-lite-latest')
    try:
        from apps.accounts.admin_models import SystemSettings
        return SystemSettings.get_setting('ai_gemini_model', model) or model
    except Exception:
        return model


def log_ai_call(feature, prompt_summary, output_summary='', user=None, branch_id=None, success=True, error=''):
    """Persist an AI call record for compliance and debugging."""
    try:
        from apps.reporting.models import AIAuditLog
        AIAuditLog.objects.create(
            feature=feature,
            prompt_summary=(prompt_summary or '')[:2000],
            output_summary=(output_summary or '')[:4000],
            user=user,
            branch_id=branch_id,
            success=success,
            error_message=(error or '')[:1000],
        )
    except Exception as exc:
        logger.warning('Failed to write AI audit log: %s', exc)


def summarize_for_audit(data, max_len=500):
    if data is None:
        return ''
    if isinstance(data, str):
        text = data
    else:
        try:
            text = json.dumps(data, default=str)
        except Exception:
            text = str(data)
    return text[:max_len]
