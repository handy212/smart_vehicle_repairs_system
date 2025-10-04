from django import forms
from .models import VehicleInspection, InspectionTemplate
from apps.vehicles.models import Vehicle
from apps.accounts.models import User


class InspectionForm(forms.ModelForm):
    """Form for creating and editing vehicle inspections"""
    
    template = forms.ModelChoiceField(
        queryset=InspectionTemplate.objects.filter(is_active=True),
        required=True,
        label="Inspection Template",
        widget=forms.Select(attrs={'class': 'form-select'})
    )
    
    vehicle = forms.ModelChoiceField(
        queryset=Vehicle.objects.select_related('owner__user').filter(status='active'),
        required=True,
        label="Vehicle",
        widget=forms.Select(attrs={'class': 'form-select'})
    )
    
    performed_by = forms.ModelChoiceField(
        queryset=User.objects.filter(role='technician', is_active=True),
        required=True,
        label="Technician",
        widget=forms.Select(attrs={'class': 'form-select'})
    )
    
    inspection_date = forms.DateTimeField(
        required=True,
        label="Inspection Date",
        widget=forms.DateTimeInput(attrs={
            'class': 'form-control',
            'type': 'datetime-local'
        })
    )
    
    odometer_reading = forms.IntegerField(
        required=False,
        label="Odometer Reading",
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'placeholder': 'Enter current mileage'
        })
    )
    
    notes = forms.CharField(
        required=False,
        label="Notes",
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'rows': 4,
            'placeholder': 'Additional notes or observations...'
        })
    )
    
    class Meta:
        model = VehicleInspection
        fields = ['template', 'vehicle', 'performed_by', 'inspection_date', 'odometer_reading', 'notes']
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Add help text
        self.fields['vehicle'].help_text = 'Select the vehicle to inspect'
        self.fields['performed_by'].help_text = 'Technician performing the inspection'
        self.fields['template'].help_text = 'Choose inspection checklist template'
