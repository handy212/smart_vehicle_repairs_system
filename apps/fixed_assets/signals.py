"""Signals for fixed assets — GL integration via AccountingService."""
import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='fixed_assets.FixedAsset')
def post_asset_acquisition_to_gl(sender, instance, created, **kwargs):
    if not created or instance.status != 'active':
        return
    try:
        from apps.accounting.services import AccountingService

        AccountingService.post_fixed_asset_acquisition(instance)
    except Exception as exc:
        logger.error('Failed to post asset acquisition for %s: %s', instance.asset_number, exc, exc_info=True)


@receiver(post_save, sender='fixed_assets.FixedAsset')
def post_asset_disposal_to_gl(sender, instance, created, update_fields, **kwargs):
    if created or instance.status not in ('disposed', 'sold'):
        return
    if update_fields is not None and 'status' not in update_fields and 'disposal_date' not in update_fields:
        return
    try:
        from apps.accounting.services import AccountingService

        AccountingService.post_fixed_asset_disposal(instance)
    except Exception as exc:
        logger.error('Failed to post asset disposal for %s: %s', instance.asset_number, exc, exc_info=True)
