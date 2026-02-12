"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { authApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Car, MoveLeft, MailCheck } from "lucide-react";
import { ReCAPTCHAComponent } from "@/components/ui/recaptcha";

const DEFAULT_HERO_IMAGE = "/images/login-hero.png";

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);

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

    const handleRecaptchaChange = (token: string | null) => {
        setRecaptchaToken(token);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            await authApi.forgotPassword(email, recaptchaToken || undefined);
            setIsSubmitted(true);
        } catch (err: unknown) {
            console.error("Forgot Password error:", err);

            // Extract meaningful error message
            const axiosError = err as { response?: { data?: Record<string, unknown>; status?: number } };
            const data = axiosError?.response?.data;

            if (data) {
                const message =
                    (typeof data.detail === "string" && data.detail) ||
                    (typeof data.recaptcha_token === "string" && data.recaptcha_token) ||
                    (Array.isArray(data.recaptcha_token) && data.recaptcha_token[0]) ||
                    (typeof data.email === "string" && data.email) ||
                    (Array.isArray(data.email) && data.email[0]) ||
                    null;

                setError(message || "Something went wrong. Please try again.");
            } else {
                setError("Unable to connect. Please check your internet and try again.");
            }
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
                            <div className="p-3 bg-card rounded-xl shadow-lg">
                                <img
                                    src={getImageUrl(heroLogo, "")}
                                    alt={branding.site_name}
                                    className="h-10 w-auto object-contain"
                                />
                            </div>
                        ) : (
                            <div className="p-3 bg-card rounded-xl shadow-lg">
                                <Car className="w-8 h-8" style={{ color: branding.primary_color }} />
                            </div>
                        )}
                    </div>

                    <div className="relative z-10 space-y-4">
                        <h1 className="text-5xl font-extrabold text-white leading-tight">
                            Recover Your <br />
                            <span style={{ color: '#bfdbfe' }}>Access</span>
                        </h1>
                        <p className="text-xl text-white/90 max-w-md">
                            Enter your email and we'll send you a link to reset your password.
                        </p>
                    </div>
                </div>

                {/* Right side: Forgot Password Form */}
                <div className="flex items-center justify-center p-4 lg:p-8 bg-muted/50">
                    <div className="w-full max-w-sm space-y-6 animate-in fade-in duration-500">
                        <button
                            onClick={() => router.push("/login")}
                            className="flex items-center text-xs lg:text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2 group"
                        >
                            <MoveLeft className="w-3 h-3 lg:w-4 lg:h-4 mr-2 transition-transform group-hover:-translate-x-1" />
                            Back to login
                        </button>

                        <div className="text-center lg:text-left">
                            <h2 className="text-2xl lg:text-3xl font-bold text-foreground">{branding.site_name}</h2>
                            <p className="mt-1 lg:mt-2 text-sm text-muted-foreground">
                                {!isSubmitted
                                    ? "No worries! We'll send you reset instructions."
                                    : `Instructions have been sent to ${email}`}
                            </p>
                        </div>

                        <Card className="border-0 shadow-2xl bg-card/80 backdrop-blur-lg rounded-2xl overflow-hidden p-5 lg:p-8">
                            {!isSubmitted ? (
                                <div className="space-y-4 lg:space-y-6">
                                    <div>
                                        <h2 className="text-xl lg:text-2xl font-bold text-foreground">Forgot Password</h2>
                                        <p className="mt-1 lg:mt-2 text-xs lg:text-sm text-muted-foreground">
                                            Enter the email address associated with your account.
                                        </p>
                                    </div>

                                    {error && (
                                        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-xl text-sm font-medium animate-in shake duration-300">
                                            {error}
                                        </div>
                                    )}

                                    <form onSubmit={handleSubmit} className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs lg:text-sm font-semibold text-foreground ml-1">Email Address</label>
                                            <Input
                                                type="email"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="john@example.com"
                                                className="h-10 lg:h-11 rounded-xl border-border bg-card focus:bg-card focus:ring-2 focus:ring-offset-0 transition-all"
                                                style={{ '--tw-ring-color': branding.primary_color } as React.CSSProperties}
                                                disabled={isLoading}
                                            />
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
                                            className="w-full h-10 lg:h-11 rounded-xl text-white font-bold shadow-lg transition-all hover:opacity-90 active:scale-95"
                                            style={{ backgroundColor: branding.primary_color }}
                                            disabled={isLoading || (recaptchaRequired && !recaptchaToken)}
                                        >
                                            {isLoading ? "Sending..." : "Reset Password"}
                                        </Button>
                                    </form>
                                </div>
                            ) : (
                                <div className="text-center space-y-6 py-4">
                                    <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-primary">
                                        <MailCheck className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-foreground">Check your email</h2>
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            Instruction have been sent to <strong>{email}</strong>
                                        </p>
                                    </div>
                                    <Button
                                        onClick={() => router.push("/login")}
                                        className="w-full h-11 rounded-xl text-white transition-all hover:opacity-90"
                                        style={{ backgroundColor: branding.primary_color }}
                                    >
                                        Return to login
                                    </Button>
                                    <p className="text-sm text-muted-foreground">
                                        Didn't receive the email?{" "}
                                        <button
                                            onClick={() => setIsSubmitted(false)}
                                            className="font-semibold hover:underline"
                                            style={{ color: branding.primary_color }}
                                        >
                                            Click to try again
                                        </button>
                                    </p>
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-card border-t border-border py-4 px-8">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 text-sm text-muted-foreground">
                    <p>© <span suppressHydrationWarning>{new Date().getFullYear()}</span> <span suppressHydrationWarning>{branding.site_name}</span>. All rights reserved.</p>
                    <p>Developed by <a href="https://github.com/handy212" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: branding.primary_color }}>SafeTrack Systems</a></p>
                </div>
            </footer>
        </div>
    );
}
