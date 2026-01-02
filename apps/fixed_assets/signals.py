"""
Signals for fixed assets - automatic GL integration
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


# Signals commented out for accounting module archival
# Will be replaced by custom accounting system

# @receiver(post_save, sender='fixed_assets.FixedAsset')
# def post_asset_acquisition_to_gl(sender, instance, created, **kwargs):
#     ...

# @receiver(post_save, sender='fixed_assets.FixedAsset')
# def post_asset_disposal_to_gl(sender, instance, created, update_fields, **kwargs):
#     ...
