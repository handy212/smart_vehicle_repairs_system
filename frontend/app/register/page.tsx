"use client";
/* eslint-disable @next/next/no-img-element -- Branding images are admin-configured and may come from arbitrary external URLs. */

import { useState, useEffect, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/store/authStore";
import { setTokens } from "@/lib/utils/token";
import { adminApi } from "@/lib/api/admin";
import { useBranding } from "@/lib/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Car, Eye, EyeOff, MoveLeft, Phone, Building2 } from "lucide-react";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";
import { ReCAPTCHAComponent } from "@/components/ui/recaptcha";
import CompleteRegistrationForm from "@/components/auth/CompleteRegistrationForm";

const registerSchema = z.object({
    first_name: z.string().min(2, "First name must be at least 2 characters"),
    last_name: z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string(),
    phone: z.string().min(10, "Phone number is required"),
    customer_type: z.enum(["individual", "business", "fleet"]),
    company_name: z.string().optional(),
    business_type: z.string().optional(),
    tax_id: z.string().optional(),
}).refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
}).refine((data) => {
    if (["business", "fleet"].includes(data.customer_type) && !data.company_name) {
        return false;
    }
    return true;
}, {
    message: "Company Name is required for business accounts",
    path: ["company_name"],
});

type RegisterFormData = z.infer<typeof registerSchema>;
type GoogleRegistrationUserData = ComponentProps<typeof CompleteRegistrationForm>["userData"];
type GoogleRegistrationData = {
    user_data: GoogleRegistrationUserData;
    google_token_info: Record<string, unknown>;
};

const DEFAULT_HERO_IMAGE = "/images/login-hero.png";

export default function RegisterPage() {
    const router = useRouter();
    const { setUser } = useAuthStore();
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    // Step state: 'form' or 'otp'
    const [currentStep, setCurrentStep] = useState<'form' | 'otp'>('form');
    // Store form data to submit with OTP
    const [pendingData, setPendingData] = useState<RegisterFormData | null>(null);
    // OTP input state
    const [otpCode, setOtpCode] = useState("");

    // Google Registration State
    const [regData, setRegData] = useState<GoogleRegistrationData | null>(null);

    // reCAPTCHA state
    const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

    const { siteName, tagline, primaryColor, loginBackground, logoSrc, getMediaUrl } = useBranding("public");

    useEffect(() => {
        setIsMounted(true);
        // Force light mode for auth pages
        document.documentElement.classList.remove('dark');
    }, []);

    const { data: integrations } = useQuery<{
        recaptcha_site_key?: string;
        recaptcha_enabled?: string;
    }>({
        queryKey: ["settings", "integrations", "public"],
        queryFn: () => adminApi.settings.publicIntegrations(),
        staleTime: 5 * 60 * 1000,
        retry: 2,
    });

    // reCAPTCHA is required when it's enabled AND a site key is available
    const recaptchaRequired =
        integrations?.recaptcha_enabled === "true" &&
        !!(integrations?.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);

    const heroImage = loginBackground
        ? getMediaUrl(loginBackground)
        : DEFAULT_HERO_IMAGE;

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors },
    } = useForm<RegisterFormData>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            first_name: "",
            last_name: "",
            email: "",
            password: "",
            confirm_password: "",
            phone: "",
            customer_type: "individual",
            company_name: "",
            business_type: "",
            tax_id: "",
        }
    });

    const customerType = watch("customer_type");

    const handleRecaptchaChange = (token: string | null) => {
        setRecaptchaToken(token);
    };

    const onInitiate = async (data: RegisterFormData) => {
        setIsLoading(true);
        setError(null);

        try {
            await authApi.register.initiate({
                ...data,
                password_confirm: data.confirm_password,
                recaptcha_token: recaptchaToken || undefined
            });
            setPendingData(data);
            setCurrentStep('otp');
        } catch (err: unknown) {
            console.error("Registration initiation error:", err);

            // Extract meaningful error message
            const axiosError = err as { response?: { data?: Record<string, unknown> } };
            const data = axiosError?.response?.data;

            if (data) {
                const message =
                    (typeof data.detail === "string" && data.detail) ||
                    (typeof data.recaptcha_token === "string" && data.recaptcha_token) ||
                    (Array.isArray(data.recaptcha_token) && data.recaptcha_token[0]) ||
                    (typeof data.email === "string" && data.email) ||
                    (Array.isArray(data.email) && data.email[0]) ||
                    null;

                setError(message || "Registration failed. Please try again.");
            } else {
                setError("Unable to connect. Please check your internet and try again.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const onVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pendingData || otpCode.length !== 6) return;

        setIsLoading(true);
        setError(null);

        try {
            const authData = await authApi.register.verify({
                ...pendingData,
                otp_code: otpCode
            });

            // Login user
            setTokens(authData.access, authData.refresh);
            setUser(authData.user);

            router.push(authData.user.role === "customer" ? "/portal" : "/dashboard");
        } catch (err: unknown) {
            console.error("Verification error:", err);
            // Extract meaningful error message
            const axiosError = err as { response?: { data?: Record<string, unknown> } };
            const data = axiosError?.response?.data;

            setError(
                (typeof data?.otp_code === 'string' && data.otp_code) ||
                (Array.isArray(data?.otp_code) && data.otp_code[0]) ||
                (typeof data?.detail === 'string' && data.detail) ||
                "Verification failed."
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2">
                {/* Left side: Hero Image & Branding */}
                <div
                    className="hidden lg:flex relative flex-col justify-between p-12 overflow-hidden bg-gray-900 group"
                    style={{ backgroundColor: primaryColor }}
                >
                    {isMounted && (
                        <img
                            src={heroImage}
                            alt="Service Center"
                            className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-overlay transition-transform duration-700 ease-in-out group-hover:scale-105"
                        />
                    )}
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `linear-gradient(to top, ${primaryColor} 0%, ${primaryColor}40 40%, transparent 100%)`
                        }}
                    />

                    <div className="relative z-10 flex items-center gap-3">
                        {logoSrc ? (
                            <div className="p-3 bg-card rounded-xl shadow-lg">
                                <img
                                    src={logoSrc}
                                    alt={siteName}
                                    className="h-10 w-auto object-contain"
                                />
                            </div>
                        ) : (
                            <div className="p-3 bg-card rounded-xl shadow-lg">
                                <Car className="w-8 h-8" style={{ color: primaryColor }} />
                            </div>
                        )}
                    </div>

                    <div className="relative z-10 space-y-4">
                        <h1 className="text-5xl font-extrabold text-white leading-tight">
                            Join the <br />
                            <span style={{ color: '#bfdbfe' }}>Revolution</span>
                        </h1>
                        <p className="text-xl text-white/90 max-w-md">
                            {tagline}
                        </p>
                    </div>
                </div>

                {/* Right side: Registration Form */}
                <div className="flex items-start justify-center bg-background p-4 pt-10 lg:items-center lg:p-8">
                    <div className="w-full max-w-md space-y-4 lg:space-y-6 animate-in fade-in zoom-in-95 duration-500">
                        {regData ? (
                            <CompleteRegistrationForm
                                userData={regData.user_data}
                                onSuccess={(authData) => {
                                    setUser(authData.user);
                                    router.push(authData.user.role === "customer" ? "/portal" : "/dashboard");
                                }}
                                onCancel={() => setRegData(null)}
                            />
                        ) : (
                            <>
                                <button
                                    onClick={() => currentStep === 'otp' ? setCurrentStep('form') : router.push("/login")}
                                    className="flex items-center text-xs lg:text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2 group"
                                >
                                    <MoveLeft className="w-3 h-3 lg:w-4 lg:h-4 mr-2 transition-transform group-hover:-translate-x-1" />
                                    {currentStep === 'otp' ? 'Back to details' : 'Back to login'}
                                </button>

                                <div className="text-center lg:text-left">
                                    <h2 className="text-2xl lg:text-3xl font-bold leading-tight text-foreground text-balance">{siteName}</h2>
                                    <p className="mt-1 lg:mt-2 text-sm text-muted-foreground">
                                        {currentStep === 'otp'
                                            ? `We sent a code to ${pendingData?.email}`
                                            : 'Join thousands of professionals today.'}
                                    </p>
                                </div>

                                <Card className="border border-border shadow-sm bg-card rounded-lg overflow-hidden">
                                    <CardContent className="p-5 lg:p-8">
                                        {error && (
                                            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm font-medium mb-4 animate-in shake duration-300">
                                                {error}
                                            </div>
                                        )}

                                        {currentStep === 'form' ? (
                                            <form onSubmit={handleSubmit(onInitiate)} className="space-y-3 lg:space-y-4">
                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
                                                    <div className="space-y-1">
                                                        <label className="text-xs lg:text-sm font-semibold text-foreground ml-1">First Name</label>
                                                        <Input
                                                            {...register("first_name")}
                                                            placeholder="John"
                                                            className="h-9 lg:h-10 rounded-lg border-border"
                                                        />
                                                        {errors.first_name && <p className="text-[10px] lg:text-xs text-red-500 ml-1">{errors.first_name.message}</p>}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs lg:text-sm font-semibold text-foreground ml-1">Last Name</label>
                                                        <Input
                                                            {...register("last_name")}
                                                            placeholder="Doe"
                                                            className="h-9 lg:h-10 rounded-lg border-border"
                                                        />
                                                        {errors.last_name && <p className="text-[10px] lg:text-xs text-red-500 ml-1">{errors.last_name.message}</p>}
                                                    </div>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-xs lg:text-sm font-semibold text-foreground ml-1">Email Address</label>
                                                    <Input
                                                        type="email"
                                                        {...register("email")}
                                                        placeholder="john@example.com"
                                                        className="h-9 lg:h-10 rounded-lg border-border"
                                                    />
                                                    {errors.email && <p className="text-[10px] lg:text-xs text-red-500 ml-1">{errors.email.message}</p>}
                                                </div>

                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
                                                    <div className="space-y-1">
                                                        <label className="text-xs lg:text-sm font-semibold text-foreground ml-1">Phone</label>
                                                        <div className="relative">
                                                            <Phone className="absolute left-3 top-2.5 lg:top-3 h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground" />
                                                            <Input
                                                                {...register("phone")}
                                                                placeholder="(555) 000-0000"
                                                                className="h-9 lg:h-10 rounded-lg border-border pl-9 lg:pl-10"
                                                            />
                                                        </div>
                                                        {errors.phone && <p className="text-[10px] lg:text-xs text-red-500 ml-1">{errors.phone.message}</p>}
                                                    </div>

                                                    <div className="space-y-1">
                                                        <label className="text-xs lg:text-sm font-semibold text-foreground ml-1">Account Type</label>
                                                        <Select
                                                            onValueChange={(val) => setValue("customer_type", val as RegisterFormData["customer_type"])}
                                                            defaultValue="individual"
                                                        >
                                                            <SelectTrigger className="h-9 lg:h-10 rounded-lg border-border">
                                                                <SelectValue placeholder="Select type" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="individual">Individual</SelectItem>
                                                                <SelectItem value="business">Business</SelectItem>
                                                                <SelectItem value="fleet">Fleet Owner</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                {(customerType === "business" || customerType === "fleet") && (
                                                    <div className="space-y-1 animate-in slide-in-from-top-2 fade-in">
                                                        <label className="text-xs lg:text-sm font-semibold text-foreground ml-1">Company Name</label>
                                                        <div className="relative">
                                                            <Building2 className="absolute left-3 top-2.5 lg:top-3 h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground" />
                                                            <Input
                                                                {...register("company_name")}
                                                                placeholder="Acme Inc."
                                                                className="h-9 lg:h-10 rounded-lg border-border pl-9 lg:pl-10"
                                                            />
                                                        </div>
                                                        {errors.company_name && <p className="text-[10px] lg:text-xs text-red-500 ml-1">{errors.company_name.message}</p>}
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
                                                    <div className="space-y-1">
                                                        <label className="text-xs lg:text-sm font-semibold text-foreground ml-1">Password</label>
                                                        <div className="relative">
                                                            <Input
                                                                type={showPassword ? "text" : "password"}
                                                                {...register("password")}
                                                                placeholder="••••••••"
                                                                className="h-9 lg:h-10 rounded-lg border-border pr-10 lg:pr-12"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowPassword(!showPassword)}
                                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                                            >
                                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                            </button>
                                                        </div>
                                                        {errors.password && <p className="text-[10px] lg:text-xs text-red-500 ml-1">{errors.password.message}</p>}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs lg:text-sm font-semibold text-foreground ml-1">Confirm</label>
                                                        <Input
                                                            type="password"
                                                            {...register("confirm_password")}
                                                            placeholder="••••••••"
                                                            className="h-9 lg:h-10 rounded-lg border-border"
                                                        />
                                                        {errors.confirm_password && <p className="text-[10px] lg:text-xs text-red-500 ml-1">{errors.confirm_password.message}</p>}
                                                    </div>
                                                </div>

                                                {/* reCAPTCHA */}
                                                {recaptchaRequired && (
                                                    <div className="flex justify-center py-1">
                                                        <ReCAPTCHAComponent
                                                            siteKey={integrations?.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
                                                            onChange={handleRecaptchaChange}
                                                            theme="light"
                                                            size="compact"
                                                        />
                                                    </div>
                                                )}

                                                <Button
                                                    type="submit"
                                                    className="w-full h-10 lg:h-11 rounded-lg text-white font-bold shadow-sm mt-1 transition-all hover:opacity-90 active:scale-95"
                                                    style={{ backgroundColor: primaryColor }}
                                                    disabled={isLoading || (recaptchaRequired && !recaptchaToken)}
                                                >
                                                    {isLoading ? "Checking..." : "Continue"}
                                                </Button>

                                                <div className="relative my-4 lg:my-6 text-center text-xs lg:text-sm font-medium text-muted-foreground">
                                                    <span className="bg-card px-4 relative z-10">OR</span>
                                                    <hr className="absolute top-1/2 left-0 w-full border-border" />
                                                </div>

                                                <GoogleLoginButton
                                                    onSuccess={(data) => {
                                                        setUser(data.user);
                                                        router.push(data.user.role === "customer" ? "/portal" : "/dashboard");
                                                    }}
                                                    onRegistrationRequired={(data) => setRegData(data)}
                                                    onError={(msg) => setError(msg)}
                                                />
                                            </form>
                                        ) : (
                                            <form onSubmit={onVerify} className="space-y-6">
                                                <div className="space-y-4">
                                                    <div className="bg-primary/10 p-4 rounded-lg text-center">
                                                        <p className="text-sm text-primary mb-2">Enter the 6-digit code sent to your email</p>
                                                        <Input
                                                            value={otpCode}
                                                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                            className="text-center text-2xl tracking-[0.5em] font-mono h-14 rounded-lg border-border focus:border-primary"
                                                            placeholder="000000"
                                                            autoFocus
                                                        />
                                                    </div>
                                                </div>

                                                <Button
                                                    type="submit"
                                                    className="w-full h-11 rounded-lg text-white font-bold shadow-sm transition-all hover:opacity-90"
                                                    style={{ backgroundColor: primaryColor }}
                                                    disabled={isLoading || otpCode.length !== 6}
                                                >
                                                    {isLoading ? "Verifying..." : "Create Account"}
                                                </Button>

                                                <p className="text-center text-sm text-muted-foreground">
                                                    Didn&apos;t receive code? <button type="button" onClick={() => handleSubmit(onInitiate)()} className="text-primary font-semibold hover:underline">Resend</button>
                                                </p>
                                            </form>
                                        )}
                                    </CardContent>
                                </Card>

                                <p className="text-center text-sm lg:text-base text-muted-foreground">
                                    Already have an account?{" "}
                                    <button
                                        onClick={() => router.push("/login")}
                                        className="font-bold underline-offset-4 hover:underline"
                                        style={{ color: primaryColor }}
                                    >
                                        Sign in instead
                                    </button>
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="overflow-hidden bg-card border-t border-border px-4 py-4 sm:px-8">
                <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 text-center text-sm text-muted-foreground sm:flex-row sm:text-left">
                    <p className="w-full max-w-full px-2 text-balance break-words sm:w-auto sm:px-0">
                        © <span suppressHydrationWarning>{new Date().getFullYear()}</span> <span suppressHydrationWarning>{siteName}</span>. All rights reserved.
                    </p>
                    <p className="w-full max-w-full px-2 text-balance break-words sm:w-auto sm:px-0">
                        Developed by <a href="https://github.com/handy212" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: primaryColor }}>SafeTrack Systems</a>
                    </p>
                </div>
            </footer>
        </div>
    );
}
