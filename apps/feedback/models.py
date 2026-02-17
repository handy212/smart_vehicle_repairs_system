from django.db import models
from django.utils.translation import gettext_lazy as _

class Feedback(models.Model):
    """
    Captures customer suggestions, complaints, and compliments.
    """
    CATEGORY_CHOICES = (
        ('suggestion', _('Suggestion')),
        ('complaint', _('Complaint')),
        ('compliment', _('Compliment')),
        ('other', _('Other')),
    )

    STATUS_CHOICES = (
        ('new', _('New')),
        ('in_progress', _('In Progress')),
        ('resolved', _('Resolved')),
        ('archived', _('Archived')),
    )

    message = models.TextField(_('message'))
    category = models.CharField(
        _('category'), 
        max_length=50, 
        choices=CATEGORY_CHOICES, 
        default='suggestion'
    )
    status = models.CharField(
        _('status'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='new'
    )
    internal_notes = models.TextField(_('internal notes'), blank=True)
    branch = models.ForeignKey(
        'branches.Branch', 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        related_name='feedback',
        help_text=_('The branch this feedback is related to')
    )
    is_anonymous = models.BooleanField(
        _('anonymous'), 
        default=True,
        help_text=_('Whether this feedback was submitted anonymously')
    )
    
    # Optional: contact info if not anonymous
    name = models.CharField(_('name'), max_length=100, blank=True)
    email = models.EmailField(_('email address'), blank=True)
    phone = models.CharField(_('phone number'), max_length=20, blank=True)

    created_at = models.DateTimeField(_('created at'), auto_now_add=True)
    updated_at = models.DateTimeField(_('updated at'), auto_now=True)

    class Meta:
        verbose_name = _('feedback')
        verbose_name_plural = _('feedback')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_category_display()} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"
