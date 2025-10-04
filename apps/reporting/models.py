from django.db import models
from django.utils import timezone
from apps.accounts.models import User


class ReportSchedule(models.Model):
    """Scheduled reports that are automatically generated and emailed"""
    
    REPORT_TYPE_CHOICES = [
        ('revenue', 'Revenue Report'),
        ('work_orders', 'Work Orders Report'),
        ('inventory', 'Inventory Report'),
        ('customers', 'Customer Report'),
        ('technician_performance', 'Technician Performance'),
        ('appointments', 'Appointments Report'),
        ('overdue_invoices', 'Overdue Invoices'),
        ('low_stock', 'Low Stock Alert'),
    ]
    
    FREQUENCY_CHOICES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
    ]
    
    name = models.CharField(max_length=200)
    report_type = models.CharField(max_length=50, choices=REPORT_TYPE_CHOICES)
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES)
    
    # Recipients
    email_recipients = models.TextField(help_text="Comma-separated email addresses")
    
    # Schedule settings
    is_active = models.BooleanField(default=True)
    next_run_date = models.DateTimeField()
    last_run_date = models.DateTimeField(null=True, blank=True)
    
    # Report parameters (stored as JSON)
    parameters = models.JSONField(default=dict, blank=True)
    
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='report_schedules_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} - {self.get_frequency_display()}"


class SavedReport(models.Model):
    """User-saved reports with custom parameters"""
    
    REPORT_TYPE_CHOICES = [
        ('revenue', 'Revenue Report'),
        ('work_orders', 'Work Orders Report'),
        ('inventory', 'Inventory Report'),
        ('customers', 'Customer Report'),
        ('technician_performance', 'Technician Performance'),
        ('appointments', 'Appointments Report'),
        ('custom', 'Custom Report'),
    ]
    
    name = models.CharField(max_length=200)
    report_type = models.CharField(max_length=50, choices=REPORT_TYPE_CHOICES)
    description = models.TextField(blank=True)
    
    # Report parameters (stored as JSON)
    parameters = models.JSONField(default=dict)
    
    # Sharing
    is_public = models.BooleanField(default=False, help_text="Share with all users")
    
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='saved_reports')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name


class DashboardWidget(models.Model):
    """User-customizable dashboard widgets"""
    
    WIDGET_TYPE_CHOICES = [
        ('revenue_today', 'Revenue Today'),
        ('revenue_week', 'Revenue This Week'),
        ('revenue_month', 'Revenue This Month'),
        ('appointments_today', 'Today\'s Appointments'),
        ('active_work_orders', 'Active Work Orders'),
        ('overdue_invoices', 'Overdue Invoices'),
        ('low_stock', 'Low Stock Items'),
        ('top_technicians', 'Top Technicians'),
        ('recent_customers', 'Recent Customers'),
        ('pending_estimates', 'Pending Estimates'),
        ('chart_revenue_trend', 'Revenue Trend Chart'),
        ('chart_service_breakdown', 'Service Breakdown Chart'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='dashboard_widgets')
    widget_type = models.CharField(max_length=50, choices=WIDGET_TYPE_CHOICES)
    
    # Layout
    position = models.PositiveIntegerField(default=0)
    width = models.PositiveIntegerField(default=6, help_text="Grid width (1-12)")
    height = models.PositiveIntegerField(default=4, help_text="Grid height")
    
    # Widget settings (stored as JSON)
    settings = models.JSONField(default=dict, blank=True)
    
    is_visible = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['user', 'position']
        unique_together = ['user', 'widget_type']
    
    def __str__(self):
        return f"{self.user.email} - {self.get_widget_type_display()}"
