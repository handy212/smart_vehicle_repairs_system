"""
Management command to send low stock alerts to parts managers.
Run this command via cron job (e.g., daily at 7 AM) to alert managers about parts below reorder point.

Usage:
    python manage.py send_low_stock_alerts
"""
from django.core.management.base import BaseCommand
from django.db.models import F
from apps.inventory.models import Part
from apps.accounts.models import User
from apps.notifications_app.triggers import notification_triggers


class Command(BaseCommand):
    help = 'Send low stock alerts for parts below reorder point'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Checking for parts with low stock...'))
        
        # Get parts below reorder point
        low_stock_parts = Part.objects.filter(
            quantity_in_stock__lte=F('reorder_point'),
            is_active=True
        ).select_related('category', 'preferred_supplier')
        
        if not low_stock_parts.exists():
            self.stdout.write(self.style.SUCCESS('✓ No parts below reorder point'))
            return
        
        # Get parts managers
        parts_managers = User.objects.filter(role='parts_manager', is_active=True)
        
        if not parts_managers.exists():
            self.stdout.write(self.style.WARNING('⚠️  No active parts managers found'))
            return
        
        count = 0
        for part in low_stock_parts:
            for manager in parts_managers:
                try:
                    notification_triggers.low_stock_alert(part, manager)
                    count += 1
                except Exception as e:
                    self.stdout.write(self.style.ERROR(
                        f'  ✗ Failed to send alert for part {part.part_number}: {e}'
                    ))
            
            self.stdout.write(self.style.WARNING(
                f'  ⚠️  Low stock alert: {part.part_number} - {part.name} '
                f'(In stock: {part.quantity_in_stock}, Reorder point: {part.reorder_point})'
            ))
        
        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Sent {count} low stock alerts for {low_stock_parts.count()} parts to {parts_managers.count()} managers'
        ))
