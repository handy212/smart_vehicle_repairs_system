'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { User, Phone } from 'lucide-react'; // Removed CheckCircle2 to resolve import errors

interface CompleteRegistrationFormProps {
    userData: {
        email: string;
        first_name: string;
        last_name: string;
        google_id: string;
        profile_picture?: string;
    };
    onSuccess: (data: any) => void;
    onCancel: () => void;
}

export default function CompleteRegistrationForm({ userData, onSuccess, onCancel }: CompleteRegistrationFormProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendTimer, setResendTimer] = useState(0);

    const { register, handleSubmit, watch, formState: { errors } } = useForm({
        defaultValues: {
            email: userData.email,
            first_name: userData.first_name,
            last_name: userData.last_name,
            phone: '',
            customer_type: 'individual',
            company_name: '',
            business_type: '',
            tax_id: '',
            otp_code: '',
            google_id: userData.google_id
        }
    });

    const customerType = watch('customer_type');

    useEffect(() => {
        if (resendTimer > 0) {
            const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendTimer]);

    const handleResendOTP = async () => {
        if (resendTimer > 0) return;
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/auth/google/resend_otp/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userData.email })
            });
            if (response.ok) {
                setResendTimer(60); // 1 minute cooldown
            } else {
                setError('Failed to resend code. Please try again.');
            }
        } catch (err) {
            setError('Connection error. Please try again.');
        }
    };

    const onSubmit = async (data: any) => {
        setSubmitting(true);
        setError(null);

        // Final validation for business fields
        if ((data.customer_type === 'business' || data.customer_type === 'fleet') && !data.company_name) {
            setError('Company Name is required for business accounts');
            setSubmitting(false);
            return;
        }

        if (data.otp_code.length !== 6) {
            setError('Please enter the 6-digit verification code');
            setSubmitting(false);
            return;
        }

        try {
            const apiResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/auth/google/complete_registration/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            if (!apiResponse.ok) {
                const errorData = await apiResponse.json();
                throw new Error(errorData.detail || Object.values(errorData).flat()[0] as string || 'Registration failed');
            }

            const authData = await apiResponse.json();

            // Store tokens
            localStorage.setItem('access_token', authData.access);
            localStorage.setItem('refresh_token', authData.refresh);
            localStorage.setItem('user', JSON.stringify(authData.user));

            onSuccess(authData);
        } catch (err: any) {
            console.error('Registration error:', err);
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Card className="w-full max-w-md mx-auto border-none shadow-none">
            <CardHeader className="text-center pb-2">
                <div className="mx-auto w-16 h-16 rounded-full overflow-hidden border-2 border-orange-100 mb-4 bg-muted flex items-center justify-center">
                    {userData.profile_picture ? (
                        <img src={userData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <User className="w-8 h-8 text-muted-foreground" />
                    )}
                </div>
                <CardTitle className="text-2xl font-bold">Complete Your Profile</CardTitle>
                <p className="text-muted-foreground text-sm mt-2">
                    Almost there! We just need a few more details to set up your account.
                </p>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    {error && (
                        <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="first_name">First Name</Label>
                            <Input id="first_name" {...register('first_name', { required: true })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="last_name">Last Name</Label>
                            <Input id="last_name" {...register('last_name', { required: true })} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" readOnly disabled {...register('email')} className="bg-muted" />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number <span className="text-red-500">*</span></Label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="phone"
                                placeholder="+233 XX XXX XXXX"
                                className={`pl-10 ${errors.phone ? 'border-red-500' : ''}`}
                                {...register('phone', { required: 'Phone number is required' })}
                            />
                        </div>
                        {errors.phone && <p className="text-xs text-red-500">{errors.phone.message as string}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="customer_type">I am signing up as a...</Label>
                        <Select {...register('customer_type', { required: true })}>
                            <option value="individual">Individual / Regular Customer</option>
                            <option value="business">Business / Fleet Owner</option>
                            <option value="fleet">Fleet Account (Commercial)</option>
                        </Select>
                    </div>

                    {/* Business Fields (Conditional) */}
                    {(customerType === 'business' || customerType === 'fleet') && (
                        <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="space-y-2">
                                <Label htmlFor="company_name">Company Name <span className="text-red-500">*</span></Label>
                                <Input
                                    id="company_name"
                                    placeholder="e.g. Acme Solar Systems"
                                    {...register('company_name')}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="business_type">Business Type</Label>
                                    <Input
                                        id="business_type"
                                        placeholder="e.g. Construction"
                                        {...register('business_type')}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="tax_id">Tax ID / EIN</Label>
                                    <Input
                                        id="tax_id"
                                        placeholder="XX-XXXXXXX"
                                        {...register('tax_id')}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="pt-4 flex flex-col gap-3">
                        <div className="bg-primary/10 p-4 rounded-md mb-2">
                            <Label htmlFor="otp_code" className="text-orange-800 font-semibold mb-2 block">
                                Verification Code
                            </Label>
                            <p className="text-xs text-primary mb-3">
                                We've sent a 6-digit code to <strong>{userData.email}</strong> to verify your account.
                            </p>
                            <Input
                                id="otp_code"
                                placeholder="000000"
                                className="text-center text-xl tracking-widest font-mono"
                                maxLength={6}
                                {...register('otp_code', { required: true, minLength: 6, maxLength: 6 })}
                            />
                            <div className="mt-2 text-right">
                                <button
                                    type="button"
                                    onClick={handleResendOTP}
                                    disabled={resendTimer > 0}
                                    className={`text-xs font-medium ${resendTimer > 0 ? 'text-muted-foreground' : 'text-primary hover:text-orange-800 underline'}`}
                                >
                                    {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Didn\'t receive a code? Resend'}
                                </button>
                            </div>
                        </div>

                        <Button type="submit" className="w-full" disabled={submitting}>
                            {submitting ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Verifying and setting up...
                                </span>
                            ) : (
                                "Verify & Complete Setup"
                            )}
                        </Button>
                        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
