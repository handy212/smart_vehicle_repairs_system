"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MoveLeft, CheckCircle2, AlertCircle } from "lucide-react";
import AuthBrandMark from "@/components/auth/AuthBrandMark";
import { useBranding } from "@/lib/hooks/useBranding";

const DEFAULT_HERO_IMAGE = "/images/login-hero.png";

export default function ResetPasswordPage() {
    const router = useRouter();
    const params = useParams();
    const uid = params.uid as string;
    const token = params.token as string;

    const { siteName, primaryColor, loginBackground, logoSrc, getMediaUrl } = useBranding("public");

    const [isSubmitted, setIsSubmitted] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        // Force light mode for auth pages
        document.documentElement.classList.remove('dark');
    }, []);

    const heroImage = loginBackground
        ? getMediaUrl(loginBackground) || DEFAULT_HERO_IMAGE
        : DEFAULT_HERO_IMAGE;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setIsLoading(true);

        try {
            await authApi.confirmResetPassword({
                uid,
                token,
                new_password: password,
                new_password_confirm: confirmPassword
            });
            setIsSubmitted(true);

        } catch (err: any) {
            console.error("Reset Password error:", err);
            const data = err?.response?.data;
            if (data) {
                const message =
                    (typeof data.detail === "string" && data.detail) ||
                    (typeof data.new_password === "string" && data.new_password) ||
                    (Array.isArray(data.new_password) && data.new_password[0]) ||
                    (typeof data.non_field_errors === "string" && data.non_field_errors) ||
                    (Array.isArray(data.non_field_errors) && data.non_field_errors[0]) ||
                    "Invalid or expired reset link.";
                setError(message);
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
                            Secure Your <br />
                            <span style={{ color: '#bfdbfe' }}>Account</span>
                        </h1>
                        <p className="text-xl text-white/90 max-w-md">
                            Create a strong, new password to regain access to your account.
                        </p>
                    </div>
                </div>

                {/* Right side: Reset Password Form */}
                <div className="flex items-center justify-center p-4 lg:p-8 bg-background">
                    <div className="w-full max-w-sm space-y-6 animate-in fade-in duration-500">
                        <button
                            onClick={() => router.push("/login")}
                            className="flex items-center text-xs lg:text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2 group"
                        >
                            <MoveLeft className="w-3 h-3 lg:w-4 lg:h-4 mr-2 transition-transform group-hover:-translate-x-1" />
                            Back to login
                        </button>

                        <div className="text-center lg:text-left">
                            <h2 className="text-2xl lg:text-3xl font-bold text-foreground">{siteName}</h2>
                            <p className="mt-1 lg:mt-2 text-sm text-muted-foreground">
                                Reset your password to continue.
                            </p>
                        </div>

                        <Card className="border border-border shadow-sm bg-card rounded-lg p-5 lg:p-8">
                            {!isSubmitted ? (
                                <div className="space-y-4 lg:space-y-6">
                                    <div>
                                        <h2 className="text-xl lg:text-2xl font-bold text-foreground">Set New Password</h2>
                                        <p className="mt-1 lg:mt-2 text-xs lg:text-sm text-muted-foreground">
                                            Please enter and confirm your new password.
                                        </p>
                                    </div>

                                    {error && (
                                        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-xl text-sm font-medium flex items-start gap-2 animate-in shake duration-300">
                                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    <form onSubmit={handleSubmit} className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs lg:text-sm font-semibold text-foreground ml-1">New Password</label>
                                            <Input
                                                type="password"
                                                required
                                                min={8}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="h-10 lg:h-11 rounded-xl border-border bg-card focus:bg-card focus:ring-2 focus:ring-offset-0 transition-all"
                                                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                                                disabled={isLoading}
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs lg:text-sm font-semibold text-foreground ml-1">Confirm New Password</label>
                                            <Input
                                                type="password"
                                                required
                                                min={8}
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="h-10 lg:h-11 rounded-xl border-border bg-card focus:bg-card focus:ring-2 focus:ring-offset-0 transition-all"
                                                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                                                disabled={isLoading}
                                            />
                                        </div>

                                        <Button
                                            type="submit"
                                            className="w-full h-10 lg:h-11 rounded-xl text-white font-bold shadow-lg transition-all hover:opacity-90 active:scale-95"
                                            style={{ backgroundColor: primaryColor }}
                                            disabled={isLoading}
                                        >
                                            {isLoading ? "Updating..." : "Update Password"}
                                        </Button>
                                    </form>
                                </div>
                            ) : (
                                <div className="text-center space-y-6 py-4">
                                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                                        <CheckCircle2 className="w-10 h-10" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-foreground">Success!</h2>
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            Your password has been changed successfully.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={() => router.push("/login")}
                                        className="w-full h-11 rounded-xl text-white transition-all hover:opacity-90"
                                        style={{ backgroundColor: primaryColor }}
                                    >
                                        Log in to your account
                                    </Button>
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-card border-t border-border py-4 px-8">
                <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                    <p>
                        Copyright American AutoParts @2026. Developed by{" "}
                        <a href="https://github.com/handy212" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: primaryColor }}>SafeTrack Systems</a>
                    </p>
                </div>
            </footer>
        </div>
    );
}
