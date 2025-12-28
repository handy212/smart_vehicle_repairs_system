"""
Signals for fixed assets - automatic GL integration
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender='fixed_assets.FixedAsset')
def post_asset_acquisition_to_gl(sender, instance, created, **kwargs):
    """
    Automatically post asset acquisition to General Ledger
    
    Journal Entry:
    DR: Fixed Asset Account (specific asset account)
    CR: Cash/Bank or Accounts Payable (depending on payment)
    
    This only runs when an asset is first created.
    """
    if not created:
        return  # Only run on creation
    
    if instance.status != 'active':
        return  # Only post active assets
    
    try:
        from apps.billing.accounting_service import AccountingService
        
        # Get entity for the asset's branch
        entity = AccountingService.get_entity(instance.branch)
        if not entity:
            logger.error(f'No accounting entity found for branch {instance.branch.name}')
            return
        
        # Get  GL account code for the asset
        asset_account = instance.gl_asset_account_code or \
                       instance.category.gl_asset_account_code
        
        if not asset_account:
            logger.warning(f'No GL asset account code for asset {instance.asset_number}')
            return
        
        # For now, we'll credit a generic "Cash" account
        # In a production system, this should be configurable or linked to the payment method
        cash_account = '1010'  # Default cash account code
        
        # Create journal entry
        description = f"Asset Acquisition - {instance.name} ({instance.asset_number})"
        
        journal_entry = entity.commit_tx(
            user_model=instance.created_by,
            je_timestamp=instance.acquisition_date,
            je_desc=description,
            je_activity='op',
            ledger_posted=True,
            je_data=[
                {
                    'account': asset_account,
                    'tx_type': 'debit',
                    'amount': float(instance.acquisition_cost),
                    'description': description
                },
                {
                    'account': cash_account,
                    'tx_type': 'credit',
                    'amount': float(instance.acquisition_cost),
                    'description': description
                }
            ]
        )
        
        logger.info(f'Posted asset acquisition to GL: {instance.asset_number} for {instance.acquisition_cost}')
        
    except Exception as e:
        logger.error(f'Failed to post asset acquisition to GL for {instance.asset_number}: {e}', exc_info=True)


@receiver(post_save, sender='fixed_assets.FixedAsset')
def post_asset_disposal_to_gl(sender, instance, created, update_fields, **kwargs):
    """
    Automatically post asset disposal to General Ledger
    
    When an asset is disposed:
    1. Remove asset from books (CR: Asset Account)
    2. Remove accumulated depreciation (DR: Accumulated Depreciation)
    3. Record disposal proceeds if any (DR: Cash)
    4. Record gain/loss on disposal (DR/CR: Gain/Loss on Disposal)
    
    This runs when status changes to 'disposed' or 'sold'.
    """
    if created:
        return  # Don't run on creation
    
    # Check if status changed to disposed/sold
    if instance.status not in ['disposed', 'sold']:
        return
    
    # Make sure we have a disposal date
    if not instance.disposal_date:
        return
    
    # Skip if we've already posted (check if net book value is zero and accumulated depreciation equals acquisition cost)
    # This is a simple check - in production, you'd want a better tracking mechanism
    
    try:
        from apps.billing.accounting_service import AccountingService
        
        # Get entity for the asset's branch
        entity = AccountingService.get_entity(instance.branch)
        if not entity:
            logger.error(f'No accounting entity found for branch {instance.branch.name}')
            return
        
        # Get GL account codes
        asset_account = instance.gl_asset_account_code or instance.category.gl_asset_account_code
        accum_depreciation_account = instance.gl_accumulated_depreciation_account_code or \
                                    instance.category.gl_accumulated_depreciation_account_code
        
        if not asset_account or not accum_depreciation_account:
            logger.warning(f'Missing GL account codes for asset disposal {instance.asset_number}')
            return
        
        # Calculate gain/loss on disposal
        disposal_proceeds = instance.disposal_proceeds or Decimal('0.00')
        net_book_value = instance.net_book_value
        gain_or_loss = disposal_proceeds - net_book_value
        
        # Prepare journal entries
        je_data = []
        
        # 1. Remove accumulated depreciation (DR)
        if instance.accumulated_depreciation > 0:
            je_data.append({
                'account': accum_depreciation_account,
                'tx_type': 'debit',
                'amount': float(instance.accumulated_depreciation),
                'description': f'Remove accumulated depreciation - {instance.name}'
            })
        
        # 2. Record cash proceeds if any (DR)
        cash_account = '1010'  # Default cash account
        if disposal_proceeds > 0:
            je_data.append({
                'account': cash_account,
                'tx_type': 'debit',
                'amount': float(disposal_proceeds),
                'description': f'Disposal proceeds - {instance.name}'
            })
        
        # 3. Remove asset from books (CR)
        je_data.append({
            'account': asset_account,
            'tx_type': 'credit',
            'amount': float(instance.acquisition_cost),
            'description': f'Remove asset - {instance.name}'
        })
        
        # 4. Record gain or loss (to balance the entry)
        gain_loss_account = '8100' if gain_or_loss >= 0 else '5900'  # Income or Expense
        if gain_or_loss != 0:
            je_data.append({
                'account': gain_loss_account,
                'tx_type': 'credit' if gain_or_loss >= 0 else 'debit',
                'amount': float(abs(gain_or_loss)),
                'description': f'{"Gain" if gain_or_loss >= 0 else "Loss"} on disposal - {instance.name}'
            })
        
        # Create journal entry
        description = f"Asset Disposal - {instance.name} ({instance.asset_number})"
        
        journal_entry = entity.commit_tx(
            user_model=None,
            je_timestamp=instance.disposal_date,
            je_desc=description,
            je_activity='op',
            ledger_posted=True,
            je_data=je_data
        )
        
        logger.info(f'Posted asset disposal to GL: {instance.asset_number}, Gain/Loss: {gain_or_loss}')
        
    except Exception as e:
        logger.error(f'Failed to post asset disposal to GL for {instance.asset_number}: {e}', exc_info=True)
