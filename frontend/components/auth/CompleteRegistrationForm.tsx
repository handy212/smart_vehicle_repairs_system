'use client';
/* eslint-disable @next/next/no-img-element -- Profile and branding images can come from external Google/admin-managed URLs. */

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import type { User as AuthUser } from '@/lib/api/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { User, Phone } from 'lucide-react';
import { useBranding } from '@/lib/hooks/useBranding';
import { cn } from '@/lib/utils/cn';

interface CompleteRegistrationFormProps {
    userData: {
        email: string;
        first_name: string;
        last_name: string;
        google_id: string;
        profile_picture?: string;
    };

    onSuccess: (data: CompleteRegistrationSuccess) => void;
    onCancel: () => void;
}

interface CompleteRegistrationFormData {
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    customer_type: 'individual' | 'business' | 'fleet';
    company_name: string;
    business_type: string;
    tax_id: string;
    otp_code: string;
    google_id: string;
}

interface CompleteRegistrationSuccess {
    access: string;
    refresh: string;
    user: AuthUser;
}

type ApiErrorResponse = {
    detail?: string;
    [key: string]: unknown;
};

export default function CompleteRegistrationForm({ userData, onSuccess, onCancel }: CompleteRegistrationFormProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendTimer, setResendTimer] = useState(0);

    const { primaryColor } = useBranding("public");

    const { register, handleSubmit, watch, control, formState: { errors } } = useForm<CompleteRegistrationFormData>({
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
                setError('Failed to resend code. Please request a new one from the support if this persists.');
            }
        } catch {
            setError('Connection error. Please try again.');
        }
    };


    const onSubmit = async (data: CompleteRegistrationFormData) => {
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
                const errorData = (await apiResponse.json()) as ApiErrorResponse;
                const firstError = Object.values(errorData).flat().find((value): value is string => typeof value === 'string');
                throw new Error(errorData.detail || firstError || 'Registration failed');
            }

            const authData = (await apiResponse.json()) as CompleteRegistrationSuccess;

            // Store tokens
            localStorage.setItem('access_token', authData.access);
            localStorage.setItem('refresh_token', authData.refresh);
            localStorage.setItem('user', JSON.stringify(authData.user));

            onSuccess(authData);

        } catch (err: unknown) {
            console.error('Registration error:', err);
            setError(err instanceof Error ? err.message : 'Registration failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Card className="w-full max-w-md mx-auto border-none shadow-none bg-transparent">
            <CardHeader className="text-center pb-2">
                <div className="mx-auto w-20 h-20 rounded-full overflow-hidden border-4 border-background shadow-xl mb-4 bg-muted flex items-center justify-center group relative">
                    {userData.profile_picture ? (
                        <img src={userData.profile_picture} alt="Profile" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    ) : (
                        <User className="w-10 h-10 text-muted-foreground" />
                    )}
                    <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight">Complete Your Profile</CardTitle>
                <p className="text-muted-foreground text-sm mt-2">
                    Almost there! Verify your identity and finalize your details.
                </p>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    {error && (
                        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-xl text-sm font-medium animate-in shake duration-300">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="first_name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">First Name</Label>
                            <Input
                                id="first_name"
                                {...register('first_name', { required: true })}
                                className="rounded-xl focus:ring-2"
                                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="last_name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Last Name</Label>
                            <Input
                                id="last_name"
                                {...register('last_name', { required: true })}
                                className="rounded-xl focus:ring-2"
                                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Email</Label>
                        <Input id="email" type="email" readOnly disabled {...register('email')} className="bg-muted/50 rounded-xl cursor-not-allowed border-dashed" />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Phone Number <span className="text-destructive">*</span></Label>
                        <div className="relative">
                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="phone"
                                placeholder="+233 XX XXX XXXX"
                                className={cn(
                                    "pl-11 rounded-xl focus:ring-2 transition-all",
                                    errors.phone ? 'border-destructive ring-destructive/20' : ''
                                )}
                                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                                {...register('phone', { required: 'Phone number is required' })}
                            />
                        </div>
                        {errors.phone && <p className="text-xs text-destructive mt-1 ml-1">{errors.phone.message as string}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">I am signing up as a...</Label>
                        <Controller
                            name="customer_type"
                            control={control}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <SelectTrigger className="rounded-xl focus:ring-2 h-11" style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}>
                                        <SelectValue placeholder="Select account type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="individual">Individual / Regular Customer</SelectItem>
                                        <SelectItem value="business">Business / Fleet Owner</SelectItem>
                                        <SelectItem value="fleet">Fleet Account (Commercial)</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </div>

                    {/* Business Fields (Conditional) */}
                    {(customerType === 'business' || customerType === 'fleet') && (
                        <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="space-y-1.5">
                                <Label htmlFor="company_name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Company Name <span className="text-destructive">*</span></Label>
                                <Input
                                    id="company_name"
                                    placeholder="e.g. Acme Solar Systems"
                                    className="rounded-xl focus:ring-2"
                                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                                    {...register('company_name')}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="business_type" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Business Type</Label>
                                    <Input
                                        id="business_type"
                                        placeholder="e.g. Construction"
                                        className="rounded-xl focus:ring-2"
                                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                                        {...register('business_type')}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="tax_id" className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Tax ID / EIN</Label>
                                    <Input
                                        id="tax_id"
                                        placeholder="XX-XXXXXXX"
                                        className="rounded-xl focus:ring-2"
                                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                                        {...register('tax_id')}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="pt-4 flex flex-col gap-3">
                        <div className="bg-muted/30 p-5 rounded-2xl border border-border/50 transition-all hover:bg-muted/40 group">
                            <Label htmlFor="otp_code" className="text-sm font-bold mb-2 block ml-1" style={{ color: primaryColor }}>
                                Verification Code
                            </Label>
                            <p className="text-xs text-muted-foreground mb-4 ml-1">
                                Enter the 6-digit code sent to <strong>{userData.email}</strong>
                            </p>
                            <Input
                                id="otp_code"
                                placeholder="000000"
                                className="text-center text-3xl tracking-[0.5em] font-mono h-14 rounded-xl border-dashed focus:border-solid transition-all bg-background"
                                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                                maxLength={6}
                                {...register('otp_code', { required: true, minLength: 6, maxLength: 6 })}
                            />
                            <div className="mt-3 text-center">
                                <button
                                    type="button"
                                    onClick={handleResendOTP}
                                    disabled={resendTimer > 0}
                                    className={cn(
                                        "text-xs font-semibold underline-offset-4 hover:underline transition-colors",
                                        resendTimer > 0 ? 'text-muted-foreground cursor-not-allowed' : 'text-primary'
                                    )}
                                    style={resendTimer === 0 ? { color: primaryColor } : {}}
                                >
                                    {resendTimer > 0 ? `Resend code in ${resendTimer}s` : "Didn't receive a code? Resend"}
                                </button>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-12 rounded-xl text-lg font-bold shadow-lg transition-all active:scale-[0.98]"
                            style={{ backgroundColor: primaryColor }}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <span className="flex items-center gap-2">
                                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                                    Finalizing setup...
                                </span>
                            ) : (
                                "Verify & Complete Setup"
                            )}
                        </Button>
                        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting} className="rounded-xl h-11">
                            Use a different account
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
