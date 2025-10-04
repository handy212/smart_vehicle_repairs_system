"""
Customer Authentication Views
Separate authentication system for customer portal
"""
from django.shortcuts import render, redirect
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django import forms
from django.contrib.auth import get_user_model
from apps.customers.models import Customer
from django.db import transaction

User = get_user_model()


class CustomerRegistrationForm(forms.Form):
    """Customer registration form"""
    first_name = forms.CharField(max_length=50, required=True)
    last_name = forms.CharField(max_length=50, required=True)
    email = forms.EmailField(required=True)
    phone = forms.CharField(max_length=20, required=True)
    password = forms.CharField(widget=forms.PasswordInput, min_length=8, required=True)
    password_confirm = forms.CharField(widget=forms.PasswordInput, required=True, label="Confirm Password")
    
    def clean_email(self):
        email = self.cleaned_data.get('email')
        if User.objects.filter(email=email).exists():
            raise forms.ValidationError('An account with this email already exists.')
        return email
    
    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get('password')
        password_confirm = cleaned_data.get('password_confirm')
        
        if password and password_confirm and password != password_confirm:
            raise forms.ValidationError('Passwords do not match.')
        
        return cleaned_data


class CustomerLoginForm(forms.Form):
    """Customer login form"""
    email = forms.EmailField(required=True)
    password = forms.CharField(widget=forms.PasswordInput, required=True)
    remember_me = forms.BooleanField(required=False)


def customer_register(request):
    """Customer registration view"""
    if request.user.is_authenticated and hasattr(request.user, 'customer_profile'):
        return redirect('portal:home')
    
    if request.method == 'POST':
        form = CustomerRegistrationForm(request.POST)
        if form.is_valid():
            try:
                with transaction.atomic():
                    # Create user account
                    user = User.objects.create_user(
                        username=form.cleaned_data['email'],  # Use email as username
                        email=form.cleaned_data['email'],
                        password=form.cleaned_data['password'],
                        first_name=form.cleaned_data['first_name'],
                        last_name=form.cleaned_data['last_name'],
                        phone=form.cleaned_data['phone'],
                        role='customer',  # Important: Set role to customer
                        is_active=True,
                        is_staff=False,  # Customers are NOT staff
                    )
                    
                    # Create customer profile (personal info comes from linked user model)
                    customer = Customer.objects.create(
                        user=user,
                        customer_type='individual',  # Default for self-registered customers
                    )
                    
                    # Log the user in
                    login(request, user)
                    
                    messages.success(request, f'Welcome {user.first_name}! Your account has been created successfully.')
                    return redirect('portal:home')
                    
            except Exception as e:
                messages.error(request, f'Registration failed: {str(e)}')
        else:
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f'{field}: {error}')
    else:
        form = CustomerRegistrationForm()
    
    return render(request, 'customers/customer_register.html', {'form': form})


def customer_login(request):
    """Customer login view"""
    if request.user.is_authenticated:
        # Check if user is a customer
        if hasattr(request.user, 'customer_profile') and request.user.role == 'customer':
            return redirect('portal:home')
        else:
            # If logged in as staff, show error
            messages.warning(request, 'Please use the Staff Portal for employee access.')
            logout(request)
            return redirect('customer_login')
    
    if request.method == 'POST':
        form = CustomerLoginForm(request.POST)
        if form.is_valid():
            email = form.cleaned_data['email']
            password = form.cleaned_data['password']
            remember_me = form.cleaned_data.get('remember_me', False)
            
            # Try to authenticate
            user = authenticate(request, username=email, password=password)
            
            if user is not None:
                # Check if user is actually a customer
                if user.role != 'customer' or not hasattr(user, 'customer_profile'):
                    messages.error(request, 'Invalid credentials. Staff members should use the Staff Portal.')
                    return render(request, 'customers/customer_login.html', {'form': form})
                
                # Check if account is active
                if not user.is_active:
                    messages.error(request, 'Your account has been deactivated. Please contact support.')
                    return render(request, 'customers/customer_login.html', {'form': form})
                
                # Login successful
                login(request, user)
                
                # Handle "remember me"
                if not remember_me:
                    request.session.set_expiry(0)  # Session expires when browser closes
                
                messages.success(request, f'Welcome back, {user.first_name}!')
                
                # Redirect to next page or portal home
                next_url = request.GET.get('next', 'portal:home')
                return redirect(next_url)
            else:
                messages.error(request, 'Invalid email or password.')
        else:
            messages.error(request, 'Please correct the errors below.')
    else:
        form = CustomerLoginForm()
    
    return render(request, 'customers/customer_login.html', {'form': form})


@login_required
def customer_logout(request):
    """Customer logout view"""
    logout(request)
    messages.success(request, 'You have been logged out successfully.')
    return redirect('customer_login')


def customer_forgot_password(request):
    """Customer password reset request"""
    # TODO: Implement password reset with email
    return render(request, 'customers/customer_forgot_password.html')
