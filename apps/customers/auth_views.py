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
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.template.loader import render_to_string
from django.core.mail import send_mail
from django.conf import settings

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
                
                # Log the user in (outside transaction to avoid session conflicts)
                # Create a fresh session to avoid race conditions
                try:
                    # Try to cycle the session key first (prevents session fixation)
                    if hasattr(request, 'session'):
                        if request.session.session_key:
                            request.session.cycle_key()
                        else:
                            # Create a new session if one doesn't exist
                            request.session.create()
                except Exception:
                    # If cycling fails, flush and create new
                    request.session.flush()
                
                # Now login with a clean session
                login(request, user, backend='django.contrib.auth.backends.ModelBackend')
                
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


def customer_logout(request):
    """Customer logout view"""
    if not request.user.is_authenticated:
        return redirect('customer_login')
    logout(request)
    messages.success(request, 'You have been logged out successfully.')
    return redirect('customer_login')


class CustomerPasswordResetForm(forms.Form):
    """Customer password reset request form"""
    email = forms.EmailField(required=True, label="Email Address")


class CustomerPasswordResetConfirmForm(forms.Form):
    """Customer password reset confirmation form"""
    new_password = forms.CharField(
        widget=forms.PasswordInput,
        min_length=8,
        required=True,
        label="New Password"
    )
    confirm_password = forms.CharField(
        widget=forms.PasswordInput,
        required=True,
        label="Confirm Password"
    )
    
    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get('new_password')
        confirm = cleaned_data.get('confirm_password')
        
        if password and confirm and password != confirm:
            raise forms.ValidationError('Passwords do not match.')
        
        return cleaned_data


def customer_forgot_password(request):
    """Customer password reset request"""
    if request.user.is_authenticated and hasattr(request.user, 'customer_profile'):
        return redirect('portal:home')
    
    if request.method == 'POST':
        form = CustomerPasswordResetForm(request.POST)
        if form.is_valid():
            email = form.cleaned_data['email']
            try:
                user = User.objects.get(email=email, role='customer')
                
                # Generate password reset token
                token = default_token_generator.make_token(user)
                uid = urlsafe_base64_encode(force_bytes(user.pk))
                
                # Build reset link
                reset_link = request.build_absolute_uri(
                    f'/customer/reset-password/{uid}/{token}/'
                )
                
                # Prepare email context
                context = {
                    'user': user,
                    'reset_link': reset_link,
                    'site_name': getattr(settings, 'SITE_NAME', 'Smart Vehicle Repairs'),
                }
                
                # Send password reset email
                subject = 'Password Reset Request'
                message = f"""
Hello {user.get_full_name()},

You requested to reset your password for your customer account.

Click the link below to reset your password:
{reset_link}

This link will expire in 24 hours.

If you did not request this password reset, please ignore this email.

Best regards,
{context['site_name']} Team
"""
                
                try:
                    send_mail(
                        subject,
                        message,
                        settings.DEFAULT_FROM_EMAIL,
                        [user.email],
                        fail_silently=False,
                    )
                    messages.success(
                        request,
                        'Password reset instructions have been sent to your email address.'
                    )
                except Exception as e:
                    messages.warning(
                        request,
                        f'Password reset link generated, but email could not be sent. '
                        f'Please contact support. Error: {str(e)}'
                    )
                    # Still show success to user for security (don't reveal if email exists)
                
                return redirect('customer_login')
                
            except User.DoesNotExist:
                # For security, don't reveal if email exists or not
                messages.success(
                    request,
                    'If an account exists with that email, password reset instructions have been sent.'
                )
                return redirect('customer_login')
        else:
            for error in form.errors.values():
                messages.error(request, error)
    else:
        form = CustomerPasswordResetForm()
    
    return render(request, 'customers/customer_forgot_password.html', {'form': form})


def customer_reset_password_confirm(request, uidb64, token):
    """Customer password reset confirmation"""
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid, role='customer')
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None
    
    if user is not None and default_token_generator.check_token(user, token):
        if request.method == 'POST':
            form = CustomerPasswordResetConfirmForm(request.POST)
            if form.is_valid():
                # Set new password
                new_password = form.cleaned_data['new_password']
                user.set_password(new_password)
                user.save()
                
                messages.success(
                    request,
                    'Your password has been reset successfully. You can now login with your new password.'
                )
                return redirect('customer_login')
            else:
                for error in form.errors.values():
                    messages.error(request, error)
        else:
            form = CustomerPasswordResetConfirmForm()
        
        context = {
            'form': form,
            'validlink': True,
            'uidb64': uidb64,
            'token': token,
        }
        return render(request, 'customers/customer_reset_password_confirm.html', context)
    else:
        messages.error(
            request,
            'The password reset link is invalid or has expired. Please request a new one.'
        )
        return redirect('customer_forgot_password')
