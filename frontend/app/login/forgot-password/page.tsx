"use client";
/* eslint-disable @next/next/no-img-element -- Branding images are admin-configured and may come from arbitrary external URLs. */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { authApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MoveLeft, MailCheck } from "lucide-react";
import { ReCAPTCHAComponent } from "@/components/ui/recaptcha";
import AuthBrandMark from "@/components/auth/AuthBrandMark";
import { useBranding } from "@/lib/hooks/useBranding";

const DEFAULT_HERO_IMAGE = "/images/login-hero.png";

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    const { siteName, primaryColor, loginBackground, logoSrc, getMediaUrl } = useBranding("public");

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
        ? getMediaUrl(loginBackground) || DEFAULT_HERO_IMAGE
        : DEFAULT_HERO_IMAGE;

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

                    <div className="relative z-10">
                        <AuthBrandMark
                            logoSrc={logoSrc}
                            siteName={siteName}
                            primaryColor={primaryColor}
                            variant="hero"
                            size="lg"
                        />
                    </div>

                    <div className="relative z-10 space-y-4">
                        <h1 className="text-5xl font-extrabold text-white leading-tight">
                            Recover Your <br />
                            <span style={{ color: '#bfdbfe' }}>Access</span>
                        </h1>
                        <p className="text-xl text-white/90 max-w-md">
                            Enter your email and we&apos;ll send you a link to reset your password.
                        </p>
                    </div>
                </div>

                {/* Right side: Forgot Password Form */}
                <div className="flex items-start justify-center bg-background p-4 pt-10 lg:items-center lg:p-8">
                    <div className="w-full max-w-sm space-y-6 animate-in fade-in duration-500">
                        <button
                            onClick={() => router.push("/login")}
                            className="flex items-center text-xs lg:text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2 group"
                        >
                            <MoveLeft className="w-3 h-3 lg:w-4 lg:h-4 mr-2 transition-transform group-hover:-translate-x-1" />
                            Back to login
                        </button>

                        <div className="text-center lg:text-left">
                            <h2 className="text-2xl lg:text-3xl font-bold leading-tight text-foreground text-balance">{siteName}</h2>
                            <p className="mt-1 lg:mt-2 text-sm text-muted-foreground">
                                {!isSubmitted
                                    ? "No worries! We'll send you reset instructions."
                                    : `Instructions have been sent to ${email}`}
                            </p>
                        </div>

                        <Card className="border border-border shadow-sm bg-card rounded-lg p-5 lg:p-8">
                            {!isSubmitted ? (
                                <div className="space-y-4 lg:space-y-6">
                                    <div>
                                        <h2 className="text-xl lg:text-2xl font-bold text-foreground">Forgot Password</h2>

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
                                                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
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
                                            style={{ backgroundColor: primaryColor }}
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
                                        style={{ backgroundColor: primaryColor }}
                                    >
                                        Return to login
                                    </Button>
                                    <p className="text-sm text-muted-foreground">
                                        Didn&apos;t receive the email?{" "}
                                        <button
                                            onClick={() => setIsSubmitted(false)}
                                            className="font-semibold hover:underline"
                                            style={{ color: primaryColor }}
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
            <footer className="overflow-hidden bg-card border-t border-border px-4 py-4 sm:px-8">
                <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                    <p className="w-full max-w-full px-2 text-balance break-words">
                        Copyright American AutoParts @2026. Developed by{" "}
                        <a href="https://github.com/handy212" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: primaryColor }}>SafeTrack Systems</a>
                    </p>
                </div>
            </footer>
        </div>
    );
}
