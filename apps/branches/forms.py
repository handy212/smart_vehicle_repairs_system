"""
Forms for branches app
"""
from django import forms
from django.utils.translation import gettext_lazy as _
import pytz

from .models import Branch
from apps.accounts.models import User


INPUT_CLASS = "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
TEXTAREA_CLASS = "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
SELECT_CLASS = "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
CHECKBOX_CLASS = "h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"


class BranchForm(forms.ModelForm):
    """Form for creating and editing branches"""

    timezone = forms.ChoiceField(
        label=_('timezone'),
        choices=[('', _('Select a timezone'))] + [(tz, tz) for tz in pytz.common_timezones],
        widget=forms.Select(attrs={'class': SELECT_CLASS}),
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not self.is_bound:
            default_timezone = getattr(self.instance, 'timezone', None) or Branch._meta.get_field('timezone').default
            self.fields['timezone'].initial = default_timezone
    
    class Meta:
        model = Branch
        fields = [
            'name', 'code', 'description',
            'phone', 'email', 'fax',
            'address', 'city', 'state', 'zip_code', 'country',
            'is_active', 'is_headquarters',
            'opening_time', 'closing_time', 'timezone'
        ]
        widgets = {
            'name': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'e.g., Downtown Location'
            }),
            'code': forms.TextInput(attrs={
                'class': f"{INPUT_CLASS} uppercase",
                'placeholder': 'e.g., DTN'
            }),
            'description': forms.Textarea(attrs={
                'class': f"{TEXTAREA_CLASS} min-h-[7rem]",
                'rows': 3,
                'placeholder': 'Optional description of this branch'
            }),
            'phone': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': '(555) 123-4567'
            }),
            'email': forms.EmailInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'branch@example.com'
            }),
            'fax': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'Optional fax number'
            }),
            'address': forms.Textarea(attrs={
                'class': f"{TEXTAREA_CLASS} min-h-[5rem]",
                'rows': 2,
                'placeholder': 'Street address'
            }),
            'city': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'City'
            }),
            'state': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'State'
            }),
            'zip_code': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'ZIP Code'
            }),
            'country': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'Country'
            }),
            'opening_time': forms.TimeInput(attrs={
                'class': INPUT_CLASS,
                'type': 'time'
            }),
            'closing_time': forms.TimeInput(attrs={
                'class': INPUT_CLASS,
                'type': 'time'
            }),
            'is_active': forms.CheckboxInput(attrs={
                'class': CHECKBOX_CLASS
            }),
            'is_headquarters': forms.CheckboxInput(attrs={
                'class': CHECKBOX_CLASS
            }),
        }
    
    def clean_code(self):
        """Ensure code is uppercase"""
        code = self.cleaned_data.get('code')
        if code:
            return code.upper()
        return code


class StaffBranchAssignmentForm(forms.ModelForm):
    """Form for assigning staff to a branch"""
    
    class Meta:
        model = User
        fields = ['branch']
        widgets = {
            'branch': forms.Select(attrs={
                'class': SELECT_CLASS
            })
        }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Only show active branches
        self.fields['branch'].queryset = Branch.objects.filter(is_active=True)
        self.fields['branch'].empty_label = "-- Select Branch --"


class ManagerBranchAssignmentForm(forms.ModelForm):
    """Form for assigning managers to multiple branches"""
    
    managed_branches = forms.ModelMultipleChoiceField(
        queryset=Branch.objects.filter(is_active=True),
        widget=forms.CheckboxSelectMultiple(attrs={
            'class': CHECKBOX_CLASS
        }),
        required=False,
        label=_('Managed Branches'),
        help_text=_('Select all branches this manager should have access to')
    )
    
    class Meta:
        model = User
        fields = ['managed_branches']
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Only show active branches
        self.fields['managed_branches'].queryset = Branch.objects.filter(is_active=True).order_by('name')
