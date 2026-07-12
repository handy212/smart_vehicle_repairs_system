"""
Forms for Customer Management
"""
from django import forms
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from .models import Customer, CustomerNote

User = get_user_model()


class CustomerForm(forms.ModelForm):
    """
    Form for creating and editing customers
    Includes user fields (first_name, last_name, email, phone)
    """
    # User fields
    first_name = forms.CharField(
        max_length=150,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Enter first name'
        })
    )
    last_name = forms.CharField(
        max_length=150,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Enter last name'
        })
    )
    email = forms.EmailField(
        widget=forms.EmailInput(attrs={
            'class': 'form-control',
            'placeholder': 'customer@example.com'
        })
    )
    phone_number = forms.CharField(
        max_length=20,
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': '+1 (555) 123-4567'
        })
    )
    
    class Meta:
        model = Customer
        fields = [
            'customer_type', 'company_name', 'tax_id',
            'service_address', 'service_city', 'service_region', 'service_area',
            'billing_address', 'billing_city', 'billing_region', 'billing_area',
            'preferred_contact_method', 'payment_terms', 'credit_limit', 'status'
        ]
        widgets = {
            'customer_type': forms.Select(attrs={'class': 'form-select'}),
            'company_name': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'ABC Company Inc.'
            }),
            'tax_id': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'C0001234567'
            }),
            'service_address': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 2,
                'placeholder': 'Street / landmark'
            }),
            'service_city': forms.TextInput(attrs={
                'class': 'form-control', 
                'placeholder': 'e.g. Accra'
            }),
            'service_region': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'e.g. Greater Accra'
            }),
            'service_area': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'e.g. East Legon'
            }),
            'billing_address': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 2,
                'placeholder': 'Billing address (if different)'
            }),
            'billing_city': forms.TextInput(attrs={
                'class': 'form-control', 
                'placeholder': 'Billing city'
            }),
            'billing_region': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Billing region'
            }),
            'billing_area': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Billing area'
            }),
            'preferred_contact_method': forms.Select(attrs={'class': 'form-select'}),
            'payment_terms': forms.Select(attrs={'class': 'form-select'}),
            'credit_limit': forms.NumberInput(attrs={
                'class': 'form-control',
                'placeholder': '0.00',
                'step': '0.01'
            }),
            'status': forms.Select(attrs={'class': 'form-select'}),
        }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        # If editing existing customer, populate user fields
        if self.instance.pk:
            self.fields['first_name'].initial = self.instance.user.first_name
            self.fields['last_name'].initial = self.instance.user.last_name
            self.fields['email'].initial = self.instance.user.email
            self.fields['phone_number'].initial = self.instance.user.phone
    
    def clean_email(self):
        """
        Validate email uniqueness
        """
        email = self.cleaned_data['email']
        
        # Check if email already exists (excluding current customer if editing)
        user_query = User.objects.filter(email=email)
        if self.instance.pk:
            user_query = user_query.exclude(pk=self.instance.user.pk)
        
        if user_query.exists():
            raise ValidationError("A user with this email already exists.")
        
        return email
    
    def clean(self):
        """
        Custom validation
        """
        cleaned_data = super().clean()
        customer_type = cleaned_data.get('customer_type')
        company_name = cleaned_data.get('company_name')
        
        # Business and fleet customers must have company name
        if customer_type in ['business', 'fleet'] and not company_name:
            raise ValidationError({
                'company_name': 'Company name is required for business and fleet customers.'
            })
        
        return cleaned_data
    
    def save(self, commit=True):
        """
        Save customer and associated user
        """
        customer = super().save(commit=False)
        
        # Create or update user
        if customer.pk:
            # Update existing user
            user = customer.user
        else:
            # Create new user
            user = User.objects.create_user(
                username=self.cleaned_data['email'],
                email=self.cleaned_data['email'],
                first_name=self.cleaned_data['first_name'],
                last_name=self.cleaned_data['last_name'],
                role='customer'
            )
            customer.user = user
        
        # Update user fields
        user.first_name = self.cleaned_data['first_name']
        user.last_name = self.cleaned_data['last_name']  
        user.email = self.cleaned_data['email']
        user.phone = self.cleaned_data['phone_number']
        user.save()
        
        if commit:
            customer.save()
        
        return customer


class CustomerNoteForm(forms.ModelForm):
    """
    Form for adding customer notes
    """
    class Meta:
        model = CustomerNote
        fields = ['content']
        widgets = {
            'content': forms.Textarea(attrs={
                'class': 'form-control',
                'rows': 3,
                'placeholder': 'Add a note about this customer...'
            })
        }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['content'].label = 'Note'


class CustomerSearchForm(forms.Form):
    """
    Form for customer search and filtering
    """
    search = forms.CharField(
        max_length=255,
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Search customers...'
        })
    )
    
    customer_type = forms.ChoiceField(
        choices=[('', 'All Types')] + Customer.CUSTOMER_TYPE_CHOICES,
        required=False,
        widget=forms.Select(attrs={'class': 'form-select'})
    )
    
    status = forms.ChoiceField(
        choices=[('', 'All Statuses')] + Customer.STATUS_CHOICES,
        required=False,
        widget=forms.Select(attrs={'class': 'form-select'})
    )
    
    sort = forms.ChoiceField(
        choices=[
            ('newest', 'Newest First'),
            ('oldest', 'Oldest First'),
            ('name_az', 'Name A-Z'),
            ('name_za', 'Name Z-A'),
        ],
        required=False,
        widget=forms.Select(attrs={'class': 'form-select'})
    )


class QuickAddCustomerForm(forms.ModelForm):
    """
    Simplified form for quick customer addition (modal)
    """
    first_name = forms.CharField(max_length=150)
    last_name = forms.CharField(max_length=150)
    email = forms.EmailField()
    phone_number = forms.CharField(max_length=20, required=False)
    
    class Meta:
        model = Customer
        fields = ['customer_type', 'company_name']
        widgets = {
            'customer_type': forms.Select(attrs={'class': 'form-select'}),
            'company_name': forms.TextInput(attrs={
                'class': 'form-control',
                'placeholder': 'Company name (for business customers)'
            }),
        }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        # Add Bootstrap classes to user fields
        for field_name in ['first_name', 'last_name', 'email', 'phone_number']:
            self.fields[field_name].widget.attrs['class'] = 'form-control'
        
        # Set default status to active
        self.instance.status = 'active'
    
    def clean_email(self):
        email = self.cleaned_data['email']
        if User.objects.filter(email=email).exists():
            raise ValidationError("A user with this email already exists.")
        return email
    
    def save(self, commit=True):
        customer = super().save(commit=False)
        
        # Create user
        user = User.objects.create_user(
            username=self.cleaned_data['email'],
            email=self.cleaned_data['email'],
            first_name=self.cleaned_data['first_name'],
            last_name=self.cleaned_data['last_name'],
            role='customer'
        )
        user.phone = self.cleaned_data['phone_number']
        user.save()
        
        customer.user = user
        customer.status = 'active'
        
        if commit:
            customer.save()
        
        return customer


class CustomerImportForm(forms.Form):
    """
    Form for importing customers from CSV
    """
    csv_file = forms.FileField(
        label='Excel File',
        help_text='Upload a CSV file with customer data. Maximum file size: 2 MB.',
        widget=forms.FileInput(attrs={
            'class': 'form-control',
            'accept': '.csv'
        })
    )
    
    def clean_csv_file(self):
        csv_file = self.cleaned_data['csv_file']
        
        # Check file size (2 MB limit)
        if csv_file.size > 2 * 1024 * 1024:
            raise ValidationError('File size must be less than 2 MB.')
        
        # Check file extension
        if not csv_file.name.endswith('.csv'):
            raise ValidationError('Please upload a CSV file.')
        
        return csv_file