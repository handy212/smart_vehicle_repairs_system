"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/store/authStore";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Car, Eye, EyeOff, ArrowLeft, Phone, Building2 } from "lucide-react";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";

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

    useEffect(() => {
        setIsMounted(true);
        // Force light mode for auth pages
        document.documentElement.classList.remove('dark');
    }, []);

    const { data: brandingSettings } = useQuery<SystemSetting[]>({
        queryKey: ["settings", "branding", "public"],
        queryFn: () => adminApi.settings.publicBranding(),
        staleTime: 5 * 60 * 1000,
        retry: 2,
    });

    const branding = useMemo(() => {
        if (!brandingSettings) {
            return {
                site_name: "American Autoparts Ltd",
                tagline: "Professional Auto Care",
                logo_path: null,
                logo_dark_path: null,
                login_background: null,
                primary_color: "#ff8040",
            };
        }

        const getSetting = (key: string): string | null => {
            const setting = brandingSettings.find((s) => s.key === key);
            return setting?.value && setting.value.trim() !== "" ? setting.value : null;
        };

        return {
            site_name: getSetting("site_name") || "American Autoparts Ltd",
            tagline: getSetting("company_tagline") || "Professional Auto Care",
            logo_path: getSetting("logo_path"),
            logo_dark_path: getSetting("logo_dark_path"),
            login_background: getSetting("login_background"),
            primary_color: getSetting("primary_color") || "#ff8040",
        };
    }, [brandingSettings]);

    const getImageUrl = (path: string | undefined, defaultPath: string) => {
        if (!path) return defaultPath;
        if (path.startsWith('http')) return path;

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
        const baseUrl = apiUrl.replace(/\/api\/?$/, '');
        const cleanPath = path.startsWith('/') ? path : `/${path}`;

        if (cleanPath.startsWith('/media/')) {
            return `${baseUrl}${cleanPath}`;
        }

        return `${baseUrl}/media${cleanPath}`;
    };

    const heroImage = branding.login_background
        ? getImageUrl(branding.login_background, DEFAULT_HERO_IMAGE)
        : DEFAULT_HERO_IMAGE;

    const heroLogo = branding.logo_dark_path || branding.logo_path;

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

    const onInitiate = async (data: RegisterFormData) => {
        setIsLoading(true);
        setError(null);

        try {
            await authApi.register.initiate({
                ...data,
                password_confirm: data.confirm_password
            });
            setPendingData(data);
            setCurrentStep('otp');
        } catch (err: any) {
            setError(err.response?.data?.email?.[0] || err.response?.data?.detail || "Registration failed. Please try again.");
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
            if (typeof window !== "undefined") {
                localStorage.setItem("access_token", authData.access);
                localStorage.setItem("refresh_token", authData.refresh);
            }
            setUser(authData.user);

            router.push(authData.user.role === "customer" ? "/portal" : "/dashboard");
        } catch (err: any) {
            setError(err.response?.data?.otp_code?.[0] || err.response?.data?.detail || "Verification failed.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2">
                {/* Left side: Hero Image & Branding (Matching Login) */}
                <div
                    className="hidden lg:flex relative flex-col justify-between p-12 overflow-hidden bg-gray-900 group"
                    style={{ backgroundColor: branding.primary_color }}
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
                            background: `linear-gradient(to top, ${branding.primary_color} 0%, ${branding.primary_color}40 40%, transparent 100%)`
                        }}
                    />

                    <div className="relative z-10 flex items-center gap-3">
                        {heroLogo ? (
                            <div className="p-3 bg-white rounded-xl shadow-lg">
                                <img
                                    src={getImageUrl(heroLogo, "")}
                                    alt={branding.site_name}
                                    className="h-10 w-auto object-contain"
                                />
                            </div>
                        ) : (
                            <div className="p-3 bg-white rounded-xl shadow-lg">
                                <Car className="w-8 h-8" style={{ color: branding.primary_color }} />
                            </div>
                        )}
                    </div>

                    <div className="relative z-10 space-y-4">
                        <h1 className="text-5xl font-extrabold text-white leading-tight">
                            Join the <br />
                            <span style={{ color: '#bfdbfe' }}>Revolution</span>
                        </h1>
                        <p className="text-xl text-white/90 max-w-md">
                            {branding.tagline}
                        </p>
                    </div>
                </div>

                {/* Right side: Registration Form */}
                <div className="flex items-center justify-center p-8 bg-gray-50/50">
                    <div className="w-full max-w-md space-y-6 animate-in fade-in zoom-in-95 duration-500">
                        <button
                            onClick={() => currentStep === 'otp' ? setCurrentStep('form') : router.push("/login")}
                            className="flex items-center text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors mb-4 group"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
                            {currentStep === 'otp' ? 'Back to details' : 'Back to login'}
                        </button>

                        <div className="text-center lg:text-left">
                            <h2 className="text-3xl font-bold text-gray-900">{branding.site_name}</h2>
                            <p className="mt-2 text-gray-600">
                                {currentStep === 'otp'
                                    ? `We sent a code to ${pendingData?.email}`
                                    : 'Join thousands of professionals today.'}
                            </p>
                        </div>

                        <Card className="border-0 shadow-2xl bg-white/80 backdrop-blur-lg rounded-2xl overflow-hidden">
                            <CardContent className="p-8">
                                {error && (
                                    <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium mb-4">
                                        {error}
                                    </div>
                                )}

                                {currentStep === 'form' ? (
                                    <form onSubmit={handleSubmit(onInitiate)} className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-gray-700 ml-1">First Name</label>
                                                <Input
                                                    {...register("first_name")}
                                                    placeholder="John"
                                                    className="h-11 rounded-xl border-gray-200"
                                                />
                                                {errors.first_name && <p className="text-xs text-red-500 ml-1">{errors.first_name.message}</p>}
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-gray-700 ml-1">Last Name</label>
                                                <Input
                                                    {...register("last_name")}
                                                    placeholder="Doe"
                                                    className="h-11 rounded-xl border-gray-200"
                                                />
                                                {errors.last_name && <p className="text-xs text-red-500 ml-1">{errors.last_name.message}</p>}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-gray-700 ml-1">Email Address</label>
                                            <Input
                                                type="email"
                                                {...register("email")}
                                                placeholder="john@example.com"
                                                className="h-11 rounded-xl border-gray-200"
                                            />
                                            {errors.email && <p className="text-xs text-red-500 ml-1">{errors.email.message}</p>}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-gray-700 ml-1">Phone Number</label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                <Input
                                                    {...register("phone")}
                                                    placeholder="+1 (555) 000-0000"
                                                    className="h-11 rounded-xl border-gray-200 pl-10"
                                                />
                                            </div>
                                            {errors.phone && <p className="text-xs text-red-500 ml-1">{errors.phone.message}</p>}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-gray-700 ml-1">Account Type</label>
                                            <Select
                                                onValueChange={(val) => setValue("customer_type", val as any)}
                                                defaultValue="individual"
                                            >
                                                <SelectTrigger className="h-11 rounded-xl border-gray-200">
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="individual">Individual</SelectItem>
                                                    <SelectItem value="business">Business</SelectItem>
                                                    <SelectItem value="fleet">Fleet Owner</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {(customerType === "business" || customerType === "fleet") && (
                                            <div className="space-y-4 pt-2 animate-in slide-in-from-top-2 fade-in">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-semibold text-gray-700 ml-1">Company Name</label>
                                                    <div className="relative">
                                                        <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                        <Input
                                                            {...register("company_name")}
                                                            placeholder="Acme Inc."
                                                            className="h-11 rounded-xl border-gray-200 pl-10"
                                                        />
                                                    </div>
                                                    {errors.company_name && <p className="text-xs text-red-500 ml-1">{errors.company_name.message}</p>}
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-gray-700 ml-1">Password</label>
                                            <div className="relative">
                                                <Input
                                                    type={showPassword ? "text" : "password"}
                                                    {...register("password")}
                                                    placeholder="••••••••"
                                                    className="h-11 rounded-xl border-gray-200 pr-12"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                                                >
                                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                                </button>
                                            </div>
                                            {errors.password && <p className="text-xs text-red-500 ml-1">{errors.password.message}</p>}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-gray-700 ml-1">Confirm Password</label>
                                            <Input
                                                type="password"
                                                {...register("confirm_password")}
                                                placeholder="••••••••"
                                                className="h-11 rounded-xl border-gray-200"
                                            />
                                            {errors.confirm_password && <p className="text-xs text-red-500 ml-1">{errors.confirm_password.message}</p>}
                                        </div>

                                        <Button
                                            type="submit"
                                            className="w-full h-11 rounded-xl text-white font-bold shadow-lg mt-2 transition-all hover:opacity-90"
                                            style={{ backgroundColor: branding.primary_color }}
                                            disabled={isLoading}
                                        >
                                            {isLoading ? "Checking details..." : "Continue"}
                                        </Button>

                                        <div className="relative my-6 text-center text-sm font-medium text-gray-400 line-through">
                                            <span className="bg-white px-4 relative z-10 no-underline">OR</span>
                                            <hr className="absolute top-1/2 left-0 w-full border-gray-100" />
                                        </div>

                                        <GoogleLoginButton
                                            onSuccess={() => router.push("/portal")}
                                            onRegistrationRequired={() => { }}
                                            onError={(msg) => setError(msg)}
                                        />
                                    </form>
                                ) : (
                                    <form onSubmit={onVerify} className="space-y-6">
                                        <div className="space-y-4">
                                            <div className="bg-primary/10 p-4 rounded-xl text-center">
                                                <p className="text-sm text-primary mb-2">Enter the 6-digit code sent to your email</p>
                                                <Input
                                                    value={otpCode}
                                                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    className="text-center text-2xl tracking-[0.5em] font-mono h-14 rounded-xl border-orange-200 focus:border-primary"
                                                    placeholder="000000"
                                                    autoFocus
                                                />
                                            </div>
                                        </div>

                                        <Button
                                            type="submit"
                                            className="w-full h-11 rounded-xl text-white font-bold shadow-lg transition-all hover:opacity-90"
                                            style={{ backgroundColor: branding.primary_color }}
                                            disabled={isLoading || otpCode.length !== 6}
                                        >
                                            {isLoading ? "Verifying..." : "Create Account"}
                                        </Button>

                                        <p className="text-center text-sm text-gray-500">
                                            Didn't receive code? <button type="button" onClick={() => handleSubmit(onInitiate)()} className="text-primary font-semibold hover:underline">Resend</button>
                                        </p>
                                    </form>
                                )}
                            </CardContent>
                        </Card>

                        <p className="text-center text-gray-600">
                            Already have an account?{" "}
                            <button
                                onClick={() => router.push("/login")}
                                className="font-bold underline-offset-4 hover:underline"
                                style={{ color: branding.primary_color }}
                            >
                                Sign in instead
                            </button>
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 py-4 px-8">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 text-sm text-gray-600">
                    <p>© <span suppressHydrationWarning>{new Date().getFullYear()}</span> <span suppressHydrationWarning>{branding.site_name}</span>. All rights reserved.</p>
                    <p>Developed by <a href="https://github.com/handy212" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: branding.primary_color }}>SafeTrack Systems</a></p>
                </div>
            </footer>
        </div>
    );
}
