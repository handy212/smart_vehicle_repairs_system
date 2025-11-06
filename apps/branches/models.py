"""
Branch models for multi-branch support
"""
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.core.validators import RegexValidator


class Branch(models.Model):
    """
    Branch/Location for the vehicle repair business
    Each branch has its own sequence numbers for documents
    """
    
    # Basic Information
    name = models.CharField(
        _('branch name'), 
        max_length=200, 
        unique=True,
        help_text="Full name of the branch (e.g., 'Downtown Location', 'Main Street Branch')"
    )
    code = models.CharField(
        _('branch code'),
        max_length=10,
        unique=True,
        validators=[RegexValidator(
            regex=r'^[A-Z0-9]+$',
            message='Branch code must contain only uppercase letters and numbers'
        )],
        help_text="Short code for the branch (e.g., 'DTN', 'MS', 'HQ') - used in document numbers"
    )
    description = models.TextField(_('description'), blank=True)
    
    # Contact Information
    phone = models.CharField(_('phone number'), max_length=20)
    email = models.EmailField(_('email address'), blank=True)
    fax = models.CharField(_('fax number'), max_length=20, blank=True)
    
    # Address
    address = models.TextField(_('street address'))
    city = models.CharField(_('city'), max_length=100)
    state = models.CharField(_('state'), max_length=100)
    zip_code = models.CharField(_('zip code'), max_length=20)
    country = models.CharField(_('country'), max_length=100, default='USA')
    
    # Operational Settings
    is_active = models.BooleanField(
        _('active'), 
        default=True,
        help_text="Inactive branches cannot create new documents"
    )
    is_headquarters = models.BooleanField(
        _('headquarters'), 
        default=False,
        help_text="Mark as headquarters/main branch"
    )
    opening_time = models.TimeField(_('opening time'), null=True, blank=True)
    closing_time = models.TimeField(_('closing time'), null=True, blank=True)
    timezone = models.CharField(_('timezone'), max_length=50, default='America/New_York')
    
    # Document Sequence Numbers
    # These track the next available number for each document type
    next_workorder_number = models.PositiveIntegerField(
        _('next work order number'),
        default=1,
        help_text="Next sequential number for work orders"
    )
    next_estimate_number = models.PositiveIntegerField(
        _('next estimate number'),
        default=1,
        help_text="Next sequential number for estimates"
    )
    next_invoice_number = models.PositiveIntegerField(
        _('next invoice number'),
        default=1,
        help_text="Next sequential number for invoices"
    )
    next_diagnosis_number = models.PositiveIntegerField(
        _('next diagnosis number'),
        default=1,
        help_text="Next sequential number for diagnosis reports"
    )
    next_inspection_number = models.PositiveIntegerField(
        _('next inspection number'),
        default=1,
        help_text="Next sequential number for inspections"
    )
    
    # Metadata
    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)
    created_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.PROTECT,
        related_name='branches_created',
        limit_choices_to={'role__in': ['admin']}
    )
    
    class Meta:
        verbose_name = _('branch')
        verbose_name_plural = _('branches')
        ordering = ['name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['is_active']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.code})"
    
    def save(self, *args, **kwargs):
        # Ensure only one headquarters
        if self.is_headquarters:
            Branch.objects.exclude(pk=self.pk).update(is_headquarters=False)
        
        # Convert code to uppercase
        if self.code:
            self.code = self.code.upper()
        
        super().save(*args, **kwargs)
    
    def get_next_workorder_number(self):
        """Get and increment the next work order number for this branch"""
        current = self.next_workorder_number
        self.next_workorder_number += 1
        self.save(update_fields=['next_workorder_number'])
        return f"{self.code}-WO{current:06d}"
    
    def get_next_estimate_number(self):
        """Get and increment the next estimate number for this branch"""
        current = self.next_estimate_number
        self.next_estimate_number += 1
        self.save(update_fields=['next_estimate_number'])
        return f"{self.code}-EST{current:06d}"
    
    def get_next_invoice_number(self):
        """Get and increment the next invoice number for this branch"""
        current = self.next_invoice_number
        self.next_invoice_number += 1
        self.save(update_fields=['next_invoice_number'])
        return f"{self.code}-INV{current:06d}"
    
    def get_next_diagnosis_number(self):
        """Get and increment the next diagnosis number for this branch"""
        current = self.next_diagnosis_number
        self.next_diagnosis_number += 1
        self.save(update_fields=['next_diagnosis_number'])
        return f"{self.code}-DGN{current:06d}"
    
    def get_next_inspection_number(self):
        """Get and increment the next inspection number for this branch"""
        current = self.next_inspection_number
        self.next_inspection_number += 1
        self.save(update_fields=['next_inspection_number'])
        return f"{self.code}-INS{current:06d}"
    
    @property
    def staff_count(self):
        """Get count of staff assigned to this branch"""
        return self.staff_members.count()
    
    @property
    def manager_count(self):
        """Get count of managers assigned to this branch"""
        return self.managers.count()
    
    @property
    def full_address(self):
        """Get formatted full address"""
        return f"{self.address}, {self.city}, {self.state} {self.zip_code}, {self.country}"
