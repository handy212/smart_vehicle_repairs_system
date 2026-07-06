"""
Customer Profile Management Views
Allow customers to view and edit their profile information
"""
from django.shortcuts import render, redirect
from django.contrib import messages
from django import forms
from functools import wraps
from apps.accounts.permission_models import Role


def customer_login_required(view_func):
    """
    Custom decorator for customer portal authentication
    Redirects to customer login instead of staff login
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect('customer_login')
        
        if not hasattr(request.user, 'customer_profile'):
            messages.error(request, 'Access denied. This portal is for customers only.')
            return redirect('customer_login')
            
        return view_func(request, *args, **kwargs)
    return wrapper


def check_customer_permission(user, permission_code):
    """
    Check if customer has specific permission via role system
    """
    try:
        role = Role.objects.get(code='customer')
        return role.has_permission(permission_code)
    except Role.DoesNotExist:
        # Fallback: allow if no role system configured
        return True


class CustomerProfileForm(forms.Form):
    """Customer profile editing form"""
    first_name = forms.CharField(max_length=50, required=True)
    last_name = forms.CharField(max_length=50, required=True)
    email = forms.EmailField(required=True)
    phone = forms.CharField(max_length=20, required=True)
    address = forms.CharField(widget=forms.Textarea(attrs={'rows': 3}), required=False)
    city = forms.CharField(max_length=100, required=False)
    state = forms.CharField(max_length=100, required=False)
    zip_code = forms.CharField(max_length=20, required=False)
    
    # Customer-specific fields
    preferred_contact_method = forms.ChoiceField(
        choices=[
            ('email', 'Email'),
            ('phone', 'Phone'),
            ('sms', 'SMS'),
        ],
        required=False
    )
    marketing_emails = forms.BooleanField(required=False, label="Receive marketing emails")
    marketing_sms = forms.BooleanField(required=False, label="Receive marketing SMS")


class CustomerPasswordChangeForm(forms.Form):
    """Customer password change form"""
    current_password = forms.CharField(widget=forms.PasswordInput, required=True)
    new_password = forms.CharField(widget=forms.PasswordInput, min_length=8, required=True)
    confirm_password = forms.CharField(widget=forms.PasswordInput, required=True)
    
    def clean(self):
        cleaned_data = super().clean()
        new_password = cleaned_data.get('new_password')
        confirm_password = cleaned_data.get('confirm_password')
        
        if new_password and confirm_password and new_password != confirm_password:
            raise forms.ValidationError('New passwords do not match.')
        
        return cleaned_data


@customer_login_required
def customer_profile_settings(request):
    """Customer profile settings page"""
    customer = request.user.customer_profile
    user = request.user
    
    # Check if customer has permission to edit profile
    can_edit = check_customer_permission(user, 'edit_own_profile')
    
    if request.method == 'POST':
        # Check permission before allowing edits
        if not can_edit:
            messages.error(request, 'You do not have permission to edit your profile. Please contact support.')
            return redirect('portal:profile-settings')
            
        form = CustomerProfileForm(request.POST)
        if form.is_valid():
            # Update user fields
            user.first_name = form.cleaned_data['first_name']
            user.last_name = form.cleaned_data['last_name']
            user.email = form.cleaned_data['email']
            user.phone = form.cleaned_data['phone']
            user.address = form.cleaned_data.get('address', '')
            user.city = form.cleaned_data.get('city', '')
            user.state = form.cleaned_data.get('state', '')
            user.zip_code = form.cleaned_data.get('zip_code', '')
            user.save()
            
            # Update customer fields
            customer.preferred_contact_method = form.cleaned_data.get('preferred_contact_method', 'email')
            customer.marketing_emails = form.cleaned_data.get('marketing_emails', False)
            customer.marketing_sms = form.cleaned_data.get('marketing_sms', False)
            customer.save()
            
            messages.success(request, 'Your profile has been updated successfully.')
            return redirect('portal:profile-settings')
        else:
            for error in form.errors.values():
                messages.error(request, error)
    else:
        # Pre-populate form with current data
        form = CustomerProfileForm(initial={
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'phone': user.phone,
            'address': user.address,
            'city': user.city,
            'state': user.state,
            'zip_code': user.zip_code,
            'preferred_contact_method': customer.preferred_contact_method,
            'marketing_emails': customer.marketing_emails,
            'marketing_sms': customer.marketing_sms,
        })
    
    context = {
        'customer': customer,
        'form': form,
        'can_edit': can_edit,  # Pass permission to template
    }
    
    return render(request, 'portal/profile_settings.html', context)


@customer_login_required
def customer_change_password(request):
    """Customer password change page"""
    customer = request.user.customer_profile
    
    # Check if customer has permission to change password
    can_change_password = check_customer_permission(request.user, 'change_own_password')
    
    if not can_change_password:
        messages.error(request, 'You do not have permission to change your password. Please contact support.')
        return redirect('portal:home')
    
    if request.method == 'POST':
        form = CustomerPasswordChangeForm(request.POST)
        if form.is_valid():
            current_password = form.cleaned_data['current_password']
            new_password = form.cleaned_data['new_password']
            
            # Verify current password
            if not request.user.check_password(current_password):
                messages.error(request, 'Current password is incorrect.')
            else:
                # Set new password
                request.user.set_password(new_password)
                request.user.save()
                
                # Update session to prevent logout
                from django.contrib.auth import update_session_auth_hash
                update_session_auth_hash(request, request.user)
                
                messages.success(request, 'Your password has been changed successfully.')
                return redirect('portal:profile-settings')
        else:
            for error in form.errors.values():
                messages.error(request, error)
    else:
        form = CustomerPasswordChangeForm()
    
    context = {
        'customer': customer,
        'form': form,
    }
    
    return render(request, 'portal/change_password.html', context)
