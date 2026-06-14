"""
Shared HTML email layout for notification templates.
Uses system branding and company settings.
"""
from typing import Optional

from django.conf import settings

from apps.accounts.settings_utils import get_branding_settings, get_company_info, get_site_url


def _logo_url() -> str:
    branding = get_branding_settings()
    logo_path = branding.get('logo_path', '')
    if not logo_path:
        return ''
    site_url = get_site_url()
    media_url = getattr(settings, 'MEDIA_URL', '/media/')
    if site_url:
        base = site_url.rstrip('/')
        if logo_path.startswith('http'):
            return logo_path
        return f"{base}{media_url}{logo_path.lstrip('/')}"
    return f"{media_url}{logo_path}"


def _primary_color() -> str:
    return get_branding_settings().get('primary_color') or '#2563eb'


def wrap_email_html(
    content_html: str,
    *,
    title: Optional[str] = None,
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
) -> str:
    """
    Wrap inner HTML in a table-based, email-client-safe layout.
    Placeholders like {company_name} remain for .format() rendering.
    """
    company = get_company_info()
    primary = _primary_color()
    logo = _logo_url()
    header_title = title or '{company_name}'

    logo_block = ''
    if logo:
        logo_block = (
            f'<img src="{logo}" alt="{{company_name}}" '
            'style="max-height:48px;max-width:200px;margin-bottom:12px;" />'
        )
    else:
        logo_block = (
            f'<div style="font-size:20px;font-weight:700;color:{primary};'
            'margin-bottom:8px;">{company_name}</div>'
        )

    cta_block = ''
    if cta_label and cta_url:
        cta_block = f'''
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
          <tr>
            <td style="border-radius:6px;background:{primary};">
              <a href="{cta_url}" style="display:inline-block;padding:12px 24px;color:#ffffff;
                 font-size:14px;font-weight:600;text-decoration:none;">{cta_label}</a>
            </td>
          </tr>
        </table>'''

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{header_title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;
  font-size:15px;line-height:1.6;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
          style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;
          overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:28px 32px 16px;border-bottom:3px solid {primary};">
              {logo_block}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              {content_html}
              {cta_block}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;
              font-size:12px;color:#6b7280;">
              <strong style="color:#374151;">{{company_name}}</strong><br />
              {{company_address}}<br />
              Phone: {{company_phone}} &nbsp;|&nbsp; Email: {{company_email}}<br />
              <a href="{{site_url}}" style="color:{primary};text-decoration:none;">{{site_url}}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'''


def detail_card_html(rows_html: str) -> str:
    """Styled detail card for key-value rows (HTML inside)."""
    primary = _primary_color()
    return f'''
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:#f9fafb;border-radius:6px;border-left:4px solid {primary};margin:16px 0;">
      <tr>
        <td style="padding:16px 20px;">
          {rows_html}
        </td>
      </tr>
    </table>'''


def plain_footer() -> str:
    return '''
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{company_name}
{company_address}
Phone: {company_phone} | Email: {company_email}
{site_url}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'''
