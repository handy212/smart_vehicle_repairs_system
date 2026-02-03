"""
Forms for Vehicle Management
"""
from django import forms
from django.core.exceptions import ValidationError
from .models import Vehicle, VehicleDocument, VehiclePhoto, VehicleMileageHistory
from apps.customers.models import Customer


INPUT_CLASS = "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
TEXTAREA_CLASS = "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
SELECT_CLASS = "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
FILE_INPUT_CLASS = "block w-full cursor-pointer rounded-md border border-gray-300 bg-white text-sm text-gray-900 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 focus:border-indigo-500 focus:ring-indigo-500"
CHECKBOX_CLASS = "h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"


class VehicleForm(forms.ModelForm):
    """
    Form for creating and editing vehicles
    """
    
    class Meta:
        model = Vehicle
        fields = [
            'owner', 'vin', 'year', 'make', 'model', 'trim',
            'exterior_color', 'interior_color', 'license_plate', 'license_plate_state',
            'current_mileage', 'mileage_unit', 'engine_type', 'engine_size',
            'transmission_type', 'fuel_tank_capacity', 'tire_size',
            'condition_rating', 'purchase_date', 'warranty_expiry_date',
            'warranty_type', 'warranty_coverage', 'image', 'status', 'notes', 'tags'
        ]
        widgets = {
            'owner': forms.Select(attrs={
                'class': SELECT_CLASS,
                'required': True
            }),
            'vin': forms.TextInput(attrs={
                'class': f"{INPUT_CLASS} uppercase",
                'placeholder': 'Enter 17-character VIN',
                'maxlength': '17',
                'pattern': '[A-HJ-NPR-Z0-9]{17}'
            }),
            'year': forms.NumberInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'e.g., 2020',
                'min': '1900',
                'max': '2030'
            }),
            'make': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'e.g., Toyota, Ford, BMW'
            }),
            'model': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'e.g., Camry, F-150, X3'
            }),
            'trim': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'e.g., SE, XLT, xDrive30i'
            }),
            'exterior_color': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'e.g., Blue, White, Black'
            }),
            'interior_color': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'e.g., Tan, Black, Gray'
            }),
            'license_plate': forms.TextInput(attrs={
                'class': f"{INPUT_CLASS} uppercase",
                'placeholder': 'License plate number'
            }),
            'license_plate_state': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'State/Province'
            }),
            'current_mileage': forms.NumberInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'Current odometer reading',
                'min': '0'
            }),
            'mileage_unit': forms.Select(attrs={'class': SELECT_CLASS}),
            'engine_type': forms.Select(attrs={'class': SELECT_CLASS}),
            'engine_size': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'e.g., 2.0L, 3.5L V6'
            }),
            'transmission_type': forms.Select(attrs={'class': SELECT_CLASS}),
            'fuel_tank_capacity': forms.NumberInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'Tank capacity',
                'step': '0.1',
                'min': '0'
            }),
            'tire_size': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'e.g., 225/45R17'
            }),
            'condition_rating': forms.Select(attrs={'class': SELECT_CLASS}),
            'purchase_date': forms.DateInput(attrs={
                'class': INPUT_CLASS,
                'type': 'date'
            }),
            'warranty_expiry_date': forms.DateInput(attrs={
                'class': INPUT_CLASS,
                'type': 'date'
            }),
            'warranty_type': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'e.g., Bumper-to-bumper, Powertrain'
            }),
            'warranty_coverage': forms.Textarea(attrs={
                'class': f"{TEXTAREA_CLASS} min-h-[6.5rem]",
                'rows': 3,
                'placeholder': 'Warranty coverage details...'
            }),
            'image': forms.ClearableFileInput(attrs={
                'class': FILE_INPUT_CLASS,
                'accept': 'image/*'
            }),
            'tags': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'Comma-separated tags'
            }),
            'status': forms.Select(attrs={'class': SELECT_CLASS}),
            'notes': forms.Textarea(attrs={
                'class': f"{TEXTAREA_CLASS} min-h-[6.5rem]",
                'rows': 3,
                'placeholder': 'Additional notes about this vehicle...'
            }),
        }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Set up customer choices
        self.fields['owner'].queryset = Customer.objects.select_related('user').order_by(
            'user__first_name', 'user__last_name'
        )
        self.fields['owner'].empty_label = "Select customer..."

        # Add help text
        self.fields['vin'].help_text = "17-character Vehicle Identification Number (excluding I, O, Q)"
        self.fields['current_mileage'].help_text = "Enter the current odometer reading"

    def clean_vin(self):
        """Validate VIN format and uniqueness."""
        vin = self.cleaned_data['vin'].upper()

        # Check format
        if len(vin) != 17:
            raise ValidationError("VIN must be exactly 17 characters long.")

        # Check characters (no I, O, Q allowed)
        import re
        if not re.match(r'^[A-HJ-NPR-Z0-9]{17}$', vin):
            raise ValidationError("VIN contains invalid characters. Letters I, O, Q are not allowed.")

        # Check uniqueness (excluding current instance if editing)
        existing_vehicles = Vehicle.objects.filter(vin=vin)
        if self.instance.pk:
            existing_vehicles = existing_vehicles.exclude(pk=self.instance.pk)

        if existing_vehicles.exists():
            raise ValidationError("A vehicle with this VIN already exists.")

        return vin

    def clean_license_plate(self):
        """Validate license plate format and uniqueness."""
        license_plate = self.cleaned_data.get('license_plate', '').strip().upper()
        
        if not license_plate:
            raise ValidationError("License plate is required.")
        
        # Check uniqueness (excluding current instance if editing)
        existing_vehicles = Vehicle.objects.filter(license_plate=license_plate)
        if self.instance.pk:
            existing_vehicles = existing_vehicles.exclude(pk=self.instance.pk)
        
        if existing_vehicles.exists():
            raise ValidationError("A vehicle with this license plate already exists.")
        
        return license_plate

    def clean(self):
        """Perform additional validations for vehicle data."""
        cleaned_data = super().clean()

        # Validate year
        year = cleaned_data.get('year')
        if year:
            import datetime

            current_year = datetime.datetime.now().year
            if year > current_year + 1:
                raise ValidationError({
                    'year': 'Vehicle year cannot be more than one year in the future.'
                })

        # Validate mileage
        current_mileage = cleaned_data.get('current_mileage')
        if current_mileage is not None and current_mileage < 0:
            raise ValidationError({
                'current_mileage': 'Mileage cannot be negative.'
            })

        return cleaned_data



class VehicleDocumentForm(forms.ModelForm):
    """
    Form for uploading vehicle documents
    """
    
    class Meta:
        model = VehicleDocument
        fields = ['title', 'document_type', 'file', 'expiry_date', 'notes']
        widgets = {
            'title': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'Document title'
            }),
            'document_type': forms.Select(attrs={'class': SELECT_CLASS}),
            'file': forms.FileInput(attrs={
                'class': FILE_INPUT_CLASS,
                'accept': '.pdf,.doc,.docx,.jpg,.jpeg,.png'
            }),
            'expiry_date': forms.DateInput(attrs={
                'class': INPUT_CLASS,
                'type': 'date'
            }),
            'notes': forms.Textarea(attrs={
                'class': f"{TEXTAREA_CLASS} min-h-[6.5rem]",
                'rows': 3,
                'placeholder': 'Document notes (optional)'
            }),
        }
    
    def clean_file(self):
        """
        Validate uploaded file
        """
        file = self.cleaned_data['file']
        
        if file:
            # Check file size (max 10MB)
            if file.size > 10 * 1024 * 1024:
                raise ValidationError("File size cannot exceed 10MB.")
            
            # Check file extension
            allowed_extensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png']
            file_extension = file.name.lower().split('.')[-1]
            
            if f'.{file_extension}' not in allowed_extensions:
                raise ValidationError(
                    "Invalid file type. Allowed: PDF, DOC, DOCX, JPG, JPEG, PNG"
                )
        
        return file


class VehiclePhotoForm(forms.ModelForm):
    """
    Form for uploading vehicle photos
    """
    
    class Meta:
        model = VehiclePhoto
        fields = ['image', 'photo_type', 'caption', 'taken_date']
        widgets = {
            'image': forms.FileInput(attrs={
                'class': FILE_INPUT_CLASS,
                'accept': 'image/*'
            }),
            'photo_type': forms.Select(attrs={'class': SELECT_CLASS}),
            'caption': forms.TextInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'Photo caption (optional)'
            }),
            'taken_date': forms.DateInput(attrs={
                'class': INPUT_CLASS,
                'type': 'date'
            }),
        }
    
    def clean_image(self):
        """
        Validate uploaded image
        """
        image = self.cleaned_data['image']
        
        if image:
            # Check file size (max 5MB)
            if image.size > 5 * 1024 * 1024:
                raise ValidationError("Image size cannot exceed 5MB.")
            
            # Check if it's actually an image
            try:
                from PIL import Image
                img = Image.open(image)
                img.verify()
            except Exception:
                raise ValidationError("Invalid image file.")
        
        return image


class VehicleMileageHistoryForm(forms.ModelForm):
    """
    Form for recording vehicle mileage
    """
    
    class Meta:
        model = VehicleMileageHistory
        fields = ['mileage', 'recorded_date', 'notes']
        widgets = {
            'mileage': forms.NumberInput(attrs={
                'class': INPUT_CLASS,
                'placeholder': 'Current mileage',
                'min': '0'
            }),
            'recorded_date': forms.DateInput(attrs={
                'class': INPUT_CLASS,
                'type': 'date'
            }),
            'notes': forms.Textarea(attrs={
                'class': f"{TEXTAREA_CLASS} min-h-[5rem]",
                'rows': 2,
                'placeholder': 'Notes about this mileage reading (optional)'
            }),
        }
    
    def clean_mileage(self):
        """
        Validate mileage reading
        """
        mileage = self.cleaned_data['mileage']
        
        if mileage < 0:
            raise ValidationError("Mileage cannot be negative.")
        
        return mileage


class VehicleSearchForm(forms.Form):
    """
    Form for vehicle search and filtering
    """
    search = forms.CharField(
        max_length=255,
        required=False,
        widget=forms.TextInput(attrs={
            'class': INPUT_CLASS,
            'placeholder': 'Search by VIN, license plate, make, model, or owner...'
        })
    )
    
    status = forms.ChoiceField(
        choices=[('', 'All Statuses')] + Vehicle.STATUS_CHOICES,
        required=False,
        widget=forms.Select(attrs={'class': SELECT_CLASS})
    )
    
    make = forms.CharField(
        max_length=100,
        required=False,
        widget=forms.TextInput(attrs={
            'class': INPUT_CLASS,
            'placeholder': 'Make'
        })
    )
    
    year_from = forms.IntegerField(
        required=False,
        widget=forms.NumberInput(attrs={
            'class': INPUT_CLASS,
            'placeholder': 'From year',
            'min': '1900',
            'max': '2030'
        })
    )
    
    year_to = forms.IntegerField(
        required=False,
        widget=forms.NumberInput(attrs={
            'class': INPUT_CLASS,
            'placeholder': 'To year',
            'min': '1900',
            'max': '2030'
        })
    )
    
    customer = forms.ModelChoiceField(
        queryset=Customer.objects.select_related('user').order_by(
            'user__first_name', 'user__last_name'
        ),
        required=False,
        empty_label="All customers",
        widget=forms.Select(attrs={'class': SELECT_CLASS})
    )
    
    sort = forms.ChoiceField(
        choices=[
            ('-created_at', 'Newest First'),
            ('created_at', 'Oldest First'),
            ('year', 'Year (Ascending)'),
            ('-year', 'Year (Descending)'),
            ('make', 'Make A-Z'),
            ('-make', 'Make Z-A'),
            ('model', 'Model A-Z'),
            ('-model', 'Model Z-A'),
            ('current_mileage', 'Mileage (Low to High)'),
            ('-current_mileage', 'Mileage (High to Low)'),
        ],
        required=False,
        widget=forms.Select(attrs={'class': SELECT_CLASS})
    )