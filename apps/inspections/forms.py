from django import forms
from .models import VehicleInspection, InspectionTemplate, InspectionCategory, InspectionItem
from apps.vehicles.models import Vehicle
from apps.accounts.models import User


class InspectionForm(forms.ModelForm):
    """Form for creating and editing vehicle inspections"""
    
    # Step 1: Customer Selection (added)
    customer = forms.ModelChoiceField(
        queryset=None,  # Will be set in __init__
        required=False,
        label="Customer",
        widget=forms.Select(attrs={
            'class': 'form-select',
            'id': 'id_customer'
        }),
        help_text='Select customer to load their vehicles'
    )
    
    template = forms.ModelChoiceField(
        queryset=InspectionTemplate.objects.filter(is_active=True),
        required=True,
        label="Inspection Template",
        widget=forms.Select(attrs={'class': 'form-select', 'id': 'id_template'}),
        help_text='Choose inspection checklist template'
    )
    
    vehicle = forms.ModelChoiceField(
        queryset=Vehicle.objects.select_related('owner__user').filter(status='active'),
        required=True,
        label="Vehicle",
        widget=forms.Select(attrs={
            'class': 'form-select',
            'id': 'id_vehicle'
        }),
        help_text='Select the vehicle to inspect'
    )
    
    performed_by = forms.ModelChoiceField(
        queryset=User.objects.filter(role='technician', is_active=True),
        required=True,
        label="Technician",
        widget=forms.Select(attrs={'class': 'form-select'}),
        help_text='Technician performing the inspection'
    )
    
    inspection_date = forms.DateTimeField(
        required=True,
        label="Inspection Date",
        widget=forms.DateTimeInput(attrs={
            'class': 'form-control',
            'type': 'datetime-local',
            'id': 'id_inspection_date'
        }),
        help_text='Date and time of inspection (auto-filled)'
    )
    
    odometer_reading = forms.IntegerField(
        required=False,
        label="Odometer Reading (miles)",
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'placeholder': 'Enter current mileage',
            'min': '0'
        })
    )
    
    notes = forms.CharField(
        required=False,
        label="General Notes",
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'rows': 3,
            'placeholder': 'Additional notes or observations...'
        })
    )
    
    vehicle_damage = forms.CharField(
        required=False,
        widget=forms.HiddenInput(),
        help_text='JSON data of vehicle damage markings'
    )

    class Meta:
        model = VehicleInspection
        fields = ['template', 'vehicle', 'performed_by', 'inspection_date', 'odometer_reading', 'notes', 'vehicle_damage']
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        # Import Customer model here to avoid circular import
        from apps.customers.models import Customer
        
        # Set customer queryset
        self.fields['customer'].queryset = Customer.objects.select_related('user').filter(
            user__is_active=True
        ).order_by('user__first_name', 'user__last_name')


class InspectionCategoryForm(forms.ModelForm):
    """Form for creating and editing inspection categories"""
    
    name = forms.CharField(
        max_length=200,
        required=True,
        label="Category Name",
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'e.g., Engine, Brakes, Electrical'
        })
    )
    
    description = forms.CharField(
        required=False,
        label="Description",
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'rows': 3,
            'placeholder': 'Brief description of this category...'
        })
    )
    
    order = forms.IntegerField(
        required=False,
        initial=0,
        label="Display Order",
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'placeholder': '0'
        }),
        help_text='Lower numbers appear first'
    )
    
    class Meta:
        model = InspectionCategory
        fields = ['name', 'description', 'order']


class InspectionItemForm(forms.ModelForm):
    """Form for creating and editing inspection items"""
    
    name = forms.CharField(
        max_length=200,
        required=True,
        label="Item Name",
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'e.g., Oil Level, Brake Pads, Battery Voltage'
        })
    )
    
    description = forms.CharField(
        required=False,
        label="Description",
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'rows': 2,
            'placeholder': 'Instructions or details...'
        })
    )
    
    item_type = forms.ChoiceField(
        choices=InspectionItem.ITEM_TYPE_CHOICES,
        required=True,
        label="Item Type",
        widget=forms.Select(attrs={'class': 'form-select'}),
        help_text='How this item should be evaluated'
    )
    
    measurement_unit = forms.CharField(
        max_length=50,
        required=False,
        label="Measurement Unit",
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'mm, psi, volts, etc.'
        }),
        help_text='For measurement type items only'
    )
    
    is_required = forms.BooleanField(
        required=False,
        initial=True,
        label="Required Item",
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'}),
        help_text='Must be checked during inspection'
    )
    
    is_critical = forms.BooleanField(
        required=False,
        initial=False,
        label="Critical Item",
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'}),
        help_text='Failure is a safety concern'
    )
    
    order = forms.IntegerField(
        required=False,
        initial=0,
        label="Display Order",
        widget=forms.NumberInput(attrs={
            'class': 'form-control',
            'placeholder': '0'
        }),
        help_text='Lower numbers appear first'
    )
    
    class Meta:
        model = InspectionItem
        fields = ['name', 'description', 'item_type', 'measurement_unit', 'is_required', 'is_critical', 'order']
