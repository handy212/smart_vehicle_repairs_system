"""
Depreciation calculation service for fixed assets
"""
from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from dateutil.relativedelta import relativedelta
from django.db import transaction
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


class DepreciationService:
    """Service for calculating and posting asset depreciation"""
    
    @staticmethod
    def calculate_straight_line_depreciation(asset, period_months=1):
        """
        Calculate straight-line depreciation for a period
        
        Formula: (Cost - Salvage Value) / Useful Life in Months
        
        Args:
            asset: FixedAsset instance
            period_months: Number of months in the period (default: 1)
        
        Returns:
            Decimal: Depreciation amount for the period
        """
        if asset.is_fully_depreciated:
            return Decimal('0.00')
        
        depreciable_amount = asset.depreciable_amount
        total_months = asset.useful_life_years * 12
        monthly_depreciation = depreciable_amount / total_months
        
        period_depreciation = monthly_depreciation * period_months
        
        # Ensure we don't exceed depreciable amount
        remaining = depreciable_amount - asset.accumulated_depreciation
        return min(period_depreciation, remaining).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    @staticmethod
    def calculate_declining_balance_depreciation(asset, period_months=1):
        """
        Calculate declining balance depreciation for a period
        
        Formula: Book Value * (Rate / 12 months) * period_months
        Rate = (Declining Balance Multiplier / Useful Life Years)
        
        Args:
            asset: FixedAsset instance
            period_months: Number of months in the period (default: 1)
        
        Returns:
            Decimal: Depreciation amount for the period
        """
        if asset.is_fully_depreciated:
            return Decimal('0.00')
        
        book_value = asset.net_book_value
        rate = asset.declining_balance_rate / Decimal(asset.useful_life_years)
        monthly_rate = rate / Decimal('12')
        
        period_depreciation = book_value * monthly_rate * period_months
        
        # Ensure we don't depreciate below salvage value
        depreciable_amount = asset.depreciable_amount
        remaining = depreciable_amount - asset.accumulated_depreciation
        
        return min(period_depreciation, remaining).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    @staticmethod
    def calculate_units_of_production_depreciation(asset, units_produced_in_period):
        """
        Calculate units of production depreciation
        
        Formula: (Cost - Salvage Value) * (Units Produced / Total Units)
        
        Args:
            asset: FixedAsset instance
            units_produced_in_period: Units produced in the period
        
        Returns:
            Decimal: Depreciation amount for the period
        """
        if asset.is_fully_depreciated or not asset.total_units:
            return Decimal('0.00')
        
        depreciable_amount = asset.depreciable_amount
        per_unit_depreciation = depreciable_amount / Decimal(asset.total_units)
        period_depreciation = per_unit_depreciation * units_produced_in_period
        
        # Ensure we don't exceed depreciable amount
        remaining = depreciable_amount - asset.accumulated_depreciation
        return min(period_depreciation, remaining).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    @classmethod
    def calculate_depreciation(cls, asset, period_months=1, units_produced=0):
        """
        Calculate depreciation based on asset's depreciation method
        
        Args:
            asset: FixedAsset instance
            period_months: Number of months in the period
            units_produced: Units produced (for units of production method)
        
        Returns:
            Decimal: Depreciation amount for the period
        """
        if asset.status != 'active' or asset.depreciation_method == 'none':
            return Decimal('0.00')
        
        if asset.depreciation_method == 'straight_line':
            return cls.calculate_straight_line_depreciation(asset, period_months)
        elif asset.depreciation_method == 'declining_balance':
            return cls.calculate_declining_balance_depreciation(asset, period_months)
        elif asset.depreciation_method == 'units_of_production':
            return cls.calculate_units_of_production_depreciation(asset, units_produced)
        else:
            logger.warning(f'Unknown depreciation method: {asset.depreciation_method}')
            return Decimal('0.00')
    
    @classmethod
    @transaction.atomic
    def post_depreciation(cls, asset, depreciation_amount, period_start_date, period_end_date, post_to_gl=True):
        """
        Post depreciation for an asset and optionally create GL entry
        
        Args:
            asset: FixedAsset instance
            depreciation_amount: Amount to depreciate
            period_start_date: Start date of the depreciation period
            period_end_date: End date of the depreciation period
            post_to_gl: Whether to create GL journal entry
        
        Returns:
            tuple: (DepreciationSchedule instance, journal_entry_id or None)
        """
        from apps.fixed_assets.models import DepreciationSchedule
        
        if depreciation_amount <= 0:
            logger.info(f'Skipping depreciation for {asset.asset_number}: amount is zero')
            return None, None
        
        opening_book_value = asset.net_book_value
        new_accumulated = asset.accumulated_depreciation + depreciation_amount
        closing_book_value = asset.acquisition_cost - new_accumulated
        
        # Create depreciation schedule entry
        schedule = DepreciationSchedule.objects.create(
            asset=asset,
            period_start_date=period_start_date,
            period_end_date=period_end_date,
            opening_book_value=opening_book_value,
            depreciation_amount=depreciation_amount,
            accumulated_depreciation=new_accumulated,
            closing_book_value=closing_book_value,
            is_posted=False
        )
        
        # Update asset
        asset.accumulated_depreciation = new_accumulated
        asset.net_book_value = closing_book_value
        asset.last_depreciation_date = period_end_date
        asset.save(update_fields=['accumulated_depreciation', 'net_book_value', 'last_depreciation_date', 'updated_at'])
        
        journal_entry_id = None
        
        # Post to GL if requested
        if post_to_gl:
            journal_entry_id = cls.post_depreciation_to_gl(asset, depreciation_amount, period_end_date)
            if journal_entry_id:
                schedule.is_posted = True
                schedule.posted_at = timezone.now()
                schedule.journal_entry_id = journal_entry_id
                schedule.save(update_fields=['is_posted', 'posted_at', 'journal_entry_id'])
        
        logger.info(f'Posted depreciation for {asset.asset_number}: {depreciation_amount}')
        
        return schedule, journal_entry_id
    
    @staticmethod
    def post_depreciation_to_gl(asset, depreciation_amount, posting_date, user=None):
        """Create GL journal entry for depreciation."""
        try:
            from apps.accounting.services import AccountingService

            entry = AccountingService.post_fixed_asset_depreciation(
                asset,
                depreciation_amount,
                posting_date,
                user=user,
            )
            return str(entry.id) if entry else None
        except Exception as exc:
            logger.error(
                'Failed to post depreciation to GL for %s: %s',
                asset.asset_number,
                exc,
                exc_info=True,
            )
            return None
    
    @classmethod
    def run_monthly_depreciation(cls, target_month=None, target_year=None, branch=None, post_to_gl=True):
        """
        Run monthly depreciation for all active assets
        
        Args:
            target_month: Month to depreciate (1-12), defaults to previous month
            target_year: Year to depreciate, defaults to current year
            branch: Optional branch filter
            post_to_gl: Whether to post to GL
        
        Returns:
            dict: Summary of depreciation run
        """
        from apps.fixed_assets.models import FixedAsset
        
        # Default to previous month if not specified
        if target_month is None or target_year is None:
            today = date.today()
            last_month = today.replace(day=1) - relativedelta(days=1)
            target_month = last_month.month
            target_year = last_month.year
        
        # Calculate period dates
        period_start = date(target_year, target_month, 1)
        period_end = period_start + relativedelta(months=1) - relativedelta(days=1)
        
        # Get assets to depreciate
        assets = FixedAsset.objects.filter(
            status='active',
            depreciation_start_date__lte=period_end
        ).exclude(depreciation_method='none')
        
        if branch:
            assets = assets.filter(branch=branch)
        
        summary = {
            'period_start': period_start,
            'period_end': period_end,
            'assets_processed': 0,
            'total_depreciation': Decimal('0.00'),
            'assets_skipped': 0,
            'errors': []
        }
        
        for asset in assets:
            try:
                # Skip if already depreciated for this period
                if asset.last_depreciation_date and asset.last_depreciation_date >= period_end:
                    summary['assets_skipped'] += 1
                    continue
                
                # Skip if depreciation hasn't started yet
                if asset.depreciation_start_date > period_end:
                    summary['assets_skipped'] += 1
                    continue
                
                # Calculate depreciation
                depreciation_amount = cls.calculate_depreciation(asset, period_months=1)
                
                if depreciation_amount > 0:
                    # Post depreciation
                    schedule, je_id = cls.post_depreciation(
                        asset,
                        depreciation_amount,
                        period_start,
                        period_end,
                        post_to_gl=post_to_gl
                    )
                    
                    if schedule:
                        summary['assets_processed'] += 1
                        summary['total_depreciation'] += depreciation_amount
                else:
                    summary['assets_skipped'] += 1
                    
            except Exception as e:
                logger.error(f'Error depreciating asset {asset.asset_number}: {e}', exc_info=True)
                summary['errors'].append({
                    'asset': asset.asset_number,
                    'error': str(e)
                })
        
        logger.info(f'Monthly depreciation completed: {summary["assets_processed"]} assets, '
                   f'Total: {summary["total_depreciation"]}')
        
        return summary
