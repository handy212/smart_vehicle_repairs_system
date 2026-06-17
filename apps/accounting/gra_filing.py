"""GRA VAT return export and e-filing submission."""
import csv
import io
import json
import logging
import xml.etree.ElementTree as ET
from decimal import Decimal

import requests
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.accounts.settings_utils import get_company_info, get_setting

logger = logging.getLogger(__name__)


class GraFilingService:
  """Build GRA-format exports and submit VAT returns."""

  @staticmethod
  def _company_tin():
    info = get_company_info()
    return (
      get_setting('gra_tin', '')
      or info.get('tax_id', '')
      or info.get('company_tax_id', '')
      or ''
    )

  @staticmethod
  def build_csv(vat_return):
    """GRA VAT return CSV layout for manual upload or API attachment."""
    ws = vat_return.worksheet or {}
    branch_name = vat_return.branch.name if vat_return.branch_id else 'ALL'
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
      'TIN', 'TaxpayerName', 'PeriodStart', 'PeriodEnd', 'Branch',
      'OutputVAT', 'OutputNHIL', 'OutputGETFund', 'OutputHRL',
      'TotalOutputTax', 'InputVAT', 'NetVATPayable', 'FilingReference',
    ])
    info = get_company_info()
    writer.writerow([
      GraFilingService._company_tin(),
      info.get('company_name', ''),
      vat_return.period_start.isoformat(),
      vat_return.period_end.isoformat(),
      branch_name,
      ws.get('output_vat', 0),
      ws.get('output_nhil', 0),
      ws.get('output_getfund', 0),
      ws.get('output_hrl', 0),
      ws.get('total_output_tax', 0),
      ws.get('input_vat', 0),
      ws.get('net_vat_payable', 0),
      vat_return.filing_reference or '',
    ])
    return output.getvalue()

  @staticmethod
  def build_xml(vat_return):
    """GRA e-filing XML payload."""
    ws = vat_return.worksheet or {}
    info = get_company_info()
    root = ET.Element('VATReturn')
    ET.SubElement(root, 'TIN').text = GraFilingService._company_tin()
    ET.SubElement(root, 'TaxpayerName').text = info.get('company_name', '')
    ET.SubElement(root, 'PeriodStart').text = vat_return.period_start.isoformat()
    ET.SubElement(root, 'PeriodEnd').text = vat_return.period_end.isoformat()
    if vat_return.branch_id:
      ET.SubElement(root, 'BranchCode').text = vat_return.branch.code or str(vat_return.branch_id)
    worksheet = ET.SubElement(root, 'Worksheet')
    for tag, key in (
      ('OutputVAT', 'output_vat'),
      ('OutputNHIL', 'output_nhil'),
      ('OutputGETFund', 'output_getfund'),
      ('OutputHRL', 'output_hrl'),
      ('TotalOutputTax', 'total_output_tax'),
      ('InputVAT', 'input_vat'),
      ('NetVATPayable', 'net_vat_payable'),
    ):
      ET.SubElement(worksheet, tag).text = str(ws.get(key, 0))
    return ET.tostring(root, encoding='unicode')

  @staticmethod
  def submit(vat_return, user=None, acknowledgment=''):
    """
    Submit VAT return to GRA.

    When gra_api_url and gra_api_key are configured, posts XML to the GRA endpoint.
    Otherwise records a manual submission with the provided acknowledgment reference.
    """
    if vat_return.status not in ('reviewed', 'filed'):
      raise ValidationError('VAT return must be reviewed or filed before GRA submission.')

    api_url = (get_setting('gra_api_url', '') or '').strip()
    api_key = (get_setting('gra_api_key', '') or '').strip()
    payload_xml = GraFilingService.build_xml(vat_return)
    submission_mode = 'manual'
    response_data = {}

    if api_url and api_key:
      try:
        response = requests.post(
          api_url,
          data=payload_xml.encode('utf-8'),
          headers={
            'Content-Type': 'application/xml',
            'Authorization': f'Bearer {api_key}',
            'X-GRA-TIN': GraFilingService._company_tin(),
          },
          timeout=30,
        )
        response.raise_for_status()
        submission_mode = 'api'
        try:
          response_data = response.json()
        except ValueError:
          response_data = {'raw_response': response.text[:2000]}
        acknowledgment = (
          acknowledgment
          or response_data.get('acknowledgment')
          or response_data.get('reference')
          or response_data.get('submission_id')
          or f'GRA-{timezone.now().strftime("%Y%m%d%H%M%S")}'
        )
      except requests.RequestException as exc:
        logger.exception('GRA API submission failed for VAT return %s', vat_return.pk)
        raise ValidationError(f'GRA API submission failed: {exc}') from exc
    else:
      if not acknowledgment:
        raise ValidationError(
          'Provide a GRA acknowledgment reference, or configure gra_api_url and gra_api_key in system settings.'
        )

    vat_return.gra_submission_mode = submission_mode
    vat_return.gra_acknowledgment = acknowledgment
    vat_return.gra_submitted_at = timezone.now()
    vat_return.gra_submission_payload = {
      'format': 'xml',
      'submitted_by': getattr(user, 'id', None),
      'response': response_data,
    }
    if vat_return.status == 'reviewed':
      vat_return.status = 'filed'
      vat_return.filed_at = timezone.now()
      vat_return.filed_by = user
      vat_return.filing_reference = acknowledgment
    vat_return.save(update_fields=[
      'gra_submission_mode', 'gra_acknowledgment', 'gra_submitted_at',
      'gra_submission_payload', 'status', 'filed_at', 'filed_by',
      'filing_reference', 'updated_at',
    ])
    return vat_return
