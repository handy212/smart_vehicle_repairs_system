"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Car, ArrowLeft, MailCheck } from "lucide-react";

const DEFAULT_HERO_IMAGE = "/images/login-hero.png";

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [email, setEmail] = useState("");
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (email) {
            setIsSubmitted(true);
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
                            Recover Your <br />
                            <span style={{ color: '#bfdbfe' }}>Access</span>
                        </h1>
                        <p className="text-xl text-white/90 max-w-md">
                            Enter your email and we'll send you a link to reset your password.
                        </p>
                    </div>
                </div>

                {/* Right side: Forgot Password Form */}
                <div className="flex items-center justify-center p-8 bg-gray-50/50">
                    <div className="w-full max-w-sm space-y-8 animate-in fade-in duration-500">
                        <button
                            onClick={() => router.push("/login")}
                            className="flex items-center text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors mb-4 group"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
                            Back to login
                        </button>

                        <div className="text-center lg:text-left">
                            <h2 className="text-3xl font-bold text-gray-900">{branding.site_name}</h2>
                            <p className="mt-2 text-gray-600">
                                {!isSubmitted
                                    ? "No worries! We'll send you reset instructions."
                                    : `Instructions have been sent to ${email}`}
                            </p>
                        </div>

                        <Card className="border-0 shadow-2xl bg-white/80 backdrop-blur-lg rounded-2xl overflow-hidden p-8">
                            {!isSubmitted ? (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">Forgot Password</h2>
                                        <p className="mt-2 text-sm text-gray-600">
                                            No worries! We'll send you reset instructions.
                                        </p>
                                    </div>

                                    <form onSubmit={handleSubmit} className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-gray-700 ml-1">Email Address</label>
                                            <Input
                                                type="email"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="john@example.com"
                                                className="h-12 rounded-xl border-gray-200"
                                            />
                                        </div>

                                        <Button
                                            type="submit"
                                            className="w-full h-12 rounded-xl text-white font-bold shadow-lg transition-all hover:opacity-90"
                                            style={{ backgroundColor: branding.primary_color }}
                                        >
                                            Reset Password
                                        </Button>
                                    </form>
                                </div>
                            ) : (
                                <div className="text-center space-y-6 py-4">
                                    <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-primary">
                                        <MailCheck className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">Check your email</h2>
                                        <p className="mt-2 text-sm text-gray-600">
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
                                    <p className="text-sm text-gray-500">
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
            <footer className="bg-white border-t border-gray-200 py-4 px-8">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 text-sm text-gray-600">
                    <p>© <span suppressHydrationWarning>{new Date().getFullYear()}</span> <span suppressHydrationWarning>{branding.site_name}</span>. All rights reserved.</p>
                    <p>Developed by <a href="https://github.com/handy212" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: branding.primary_color }}>SafeTrack Systems</a></p>
                </div>
            </footer>
        </div>
    );
}
