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
import { applyLoginTokens } from "@/lib/auth/session";
import { adminApi } from "@/lib/api/admin";
import { useBranding } from "@/lib/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Car, Eye, EyeOff } from "lucide-react";
import { ReCAPTCHAComponent } from "@/components/ui/recaptcha";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";
import CompleteRegistrationForm from "@/components/auth/CompleteRegistrationForm";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import Script from "next/script";
import { useTheme } from "@/lib/hooks/useTheme";
import { getPostLoginPath } from "@/lib/utils/post-login-redirect";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  recaptcha_token: z.string().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;
type GoogleRegistrationUserData = ComponentProps<typeof CompleteRegistrationForm>["userData"];
type GoogleRegistrationData = {
  user_data: GoogleRegistrationUserData;
  google_token_info: Record<string, unknown>;
};

const DEFAULT_HERO_IMAGE = "/images/login-hero.png";

export default function LoginPage() {
  const router = useRouter();
  useTheme(); // Ensure stored theme (perfex/classic) is applied to document
  const { setUser } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  // 2FA state
  const [twoFactorData, setTwoFactorData] = useState<{ temp_token: string; user_id: number } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  // Partial registration state

  const [regData, setRegData] = useState<GoogleRegistrationData | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Force light mode for auth pages
    document.documentElement.classList.remove('dark');
  }, []);

  const {
    siteName,
    tagline,
    primaryColor,
    logoPath,
    logoDarkPath,
    loginBackground,
    selfRegistrationEnabled,
    getMediaUrl,
  } = useBranding("public");

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

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const handleRecaptchaChange = (token: string | null) => {
    setRecaptchaToken(token);
    setValue("recaptcha_token", token || "");
  };

  const handleRecaptchaExpired = () => {
    setRecaptchaToken(null);
    setValue("recaptcha_token", "");
  };

  const handleRecaptchaError = () => {
    setRecaptchaToken(null);
    setValue("recaptcha_token", "");
    setError("reCAPTCHA verification failed. Please try again.");
  };

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const authData = await authApi.login(data);

      if (authData.requires_2fa) {
        setTwoFactorData({
          temp_token: authData.temp_token!,
          user_id: authData.user_id!
        });
        return;
      }

      await applyLoginTokens(authData.access);

      const user = await authApi.getCurrentUser();
      setUser(user);

      // Redirect based on role
      router.push(getPostLoginPath(user.role));
    } catch (err: unknown) {
      console.error("Login error:", err);

      // Extract meaningful error message from API response
      const axiosError = err as { response?: { data?: Record<string, unknown>; status?: number } };
      const data = axiosError?.response?.data;

      if (data) {
        // Handle specific field errors (e.g. recaptcha_token, detail)
        const message =
          (typeof data.detail === "string" && data.detail) ||
          (typeof data.recaptcha_token === "string" && data.recaptcha_token) ||
          (Array.isArray(data.recaptcha_token) && data.recaptcha_token[0]) ||
          (typeof data.non_field_errors === "object" && Array.isArray(data.non_field_errors) && data.non_field_errors[0]) ||
          null;

        setError(message || "Invalid email or password.");
      } else {
        setError("Unable to connect. Please check your internet and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorData || twoFactorCode.length < 6) return;

    setIsLoading(true);
    setError(null);

    try {
      const authData = await authApi.verify2FALogin(twoFactorData.temp_token, twoFactorCode);

      // Store tokens
      await applyLoginTokens(authData.access);

      setUser(authData.user || await authApi.getCurrentUser());

      // Redirect based on role
      const role = authData.user?.role || (await authApi.getCurrentUser()).role;
      router.push(getPostLoginPath(role));
    } catch (err: unknown) {
      console.error("2FA error:", err);
      const axiosError = err as { response?: { data?: Record<string, unknown> } };
      const data = axiosError?.response?.data;

      const message =
        (typeof data?.detail === "string" && data.detail) ||
        (Array.isArray(data?.code) && data?.code[0]) ||
        "Invalid 2FA code.";

      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const heroImage = loginBackground
    ? getMediaUrl(loginBackground)
    : DEFAULT_HERO_IMAGE;

  const heroLogo = logoDarkPath || logoPath;

  return (
    <div className="min-h-screen flex flex-col">
      <DynamicPageTitle title="Login" />
      {/* Google Sign-In SDK — only loaded on login page */}
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
      />
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
            {heroLogo ? (
              <div className="p-3 bg-card rounded-xl shadow-lg">
                <img
                  src={getMediaUrl(heroLogo)}
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
              The Future of <br />
              <span style={{ color: '#bfdbfe' }}>Automotive Care</span>
            </h1>
            <p className="text-xl text-white/90 max-w-md">
              {tagline}
            </p>
          </div>
        </div>

        {/* Right side: Login Form */}
        <div className="flex items-start justify-center bg-background p-4 pt-10 lg:items-center lg:p-8">
          <div className="w-full max-w-md space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center lg:text-left">
              <h2 className="text-2xl lg:text-3xl font-bold leading-tight text-foreground text-balance">{siteName}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Welcome back! Please enter your details.
              </p>
            </div>

            <Card className="border border-border shadow-sm bg-card rounded-lg overflow-hidden">
              <CardContent className="p-6 lg:p-8">
                {regData ? (
                  <CompleteRegistrationForm
                    userData={regData.user_data}
                    onSuccess={(authData) => {
                      setUser(authData.user);
                      router.push(getPostLoginPath(authData.user.role));
                    }}
                    onCancel={() => setRegData(null)}
                  />
                ) : twoFactorData ? (
                  <form onSubmit={onTwoFactorSubmit} className="space-y-4 lg:space-y-5">
                    {error && (
                      <div
                        role="alert"
                        aria-live="polite"
                        className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-xl text-sm font-medium animate-in shake duration-300"
                      >
                        {error}
                      </div>
                    )}

                    <div className="space-y-2 text-center pb-2">
                      <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: primaryColor }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></svg>
                      </div>
                      <h3 className="text-xl font-semibold">Two-Factor Authentication</h3>
                      <p className="text-sm text-muted-foreground">
                        Enter the 6-digit code from your authenticator app.
                      </p>
                    </div>

                    <div className="space-y-1.5 flex flex-col items-center">
                      <Input
                        type="text"
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="h-12 w-48 text-center text-2xl tracking-[0.5em] font-mono rounded-xl border-border bg-card focus:bg-card focus:ring-2 focus:ring-offset-0 transition-all font-bold"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                        disabled={isLoading}
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-10 lg:h-11 rounded-xl font-medium"
                        onClick={() => {
                          setTwoFactorData(null);
                          setTwoFactorCode("");
                          setError(null);
                        }}
                        disabled={isLoading}
                      >
                        Back
                      </Button>
                      <Button
                        type="submit"
                        className="w-full h-10 lg:h-11 rounded-xl text-white font-bold shadow-lg transition-all hover:opacity-90 active:scale-95"
                        style={{ backgroundColor: primaryColor }}
                        disabled={isLoading || twoFactorCode.length !== 6}
                      >
                        {isLoading ? "Verifying..." : "Verify Code"}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 lg:space-y-5">
                    {error && (
                      <div
                        role="alert"
                        aria-live="polite"
                        className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-xl text-sm font-medium animate-in shake duration-300"
                      >
                        {error}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground ml-1">Email Address</label>
                      <Input
                        type="email"
                        {...register("email")}
                        placeholder="name@company.com"
                        className="h-10 lg:h-11 rounded-xl border-border bg-card focus:bg-card focus:ring-2 focus:ring-offset-0 transition-all"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                        disabled={isLoading}
                      />
                      {errors.email && <p className="text-xs text-red-500 ml-1">{errors.email.message}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-sm font-semibold text-foreground">Password</label>
                        <button
                          type="button"
                          onClick={() => router.push("/login/forgot-password")}
                          className="text-xs font-semibold hover:underline"
                          style={{ color: primaryColor }}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          {...register("password")}
                          placeholder="••••••••"
                          className="h-10 lg:h-11 rounded-xl border-border bg-card focus:bg-card focus:ring-2 focus:ring-offset-0 pr-12 transition-all"
                          style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4 lg:w-5 lg:h-5" /> : <Eye className="w-4 h-4 lg:w-5 lg:h-5" />}
                        </button>
                      </div>
                    </div>

                    {/* reCAPTCHA */}
                    {recaptchaRequired && (
                      <div className="flex justify-center py-1">
                        <ReCAPTCHAComponent
                          siteKey={integrations?.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
                          onChange={handleRecaptchaChange}
                          onExpired={handleRecaptchaExpired}
                          onError={handleRecaptchaError}
                          theme="light"
                        />
                      </div>
                    )}

                    <Button
                      type="submit"
                      className="w-full h-10 lg:h-11 rounded-xl text-white font-bold text-base lg:text-lg shadow-lg transition-all hover:opacity-90 active:scale-95"
                      style={{ backgroundColor: primaryColor }}
                      disabled={isLoading || (recaptchaRequired && !recaptchaToken)}
                    >
                      {isLoading ? "Signing in..." : "Sign in"}
                    </Button>

                    <div className="relative my-6 lg:my-8 text-center text-sm font-medium text-muted-foreground line-through">
                      <span className="bg-card px-4 relative z-10 no-underline">OR</span>
                      <hr className="absolute top-1/2 left-0 w-full border-border" />
                    </div>

                    <GoogleLoginButton
                      onSuccess={(data) => {
                        setUser(data.user);
                        router.push(getPostLoginPath(data.user.role));
                      }}
                      onRegistrationRequired={(data) => setRegData(data)}
                      onError={(msg) => setError(msg)}
                    />
                  </form>
                )}
              </CardContent>
            </Card>

            {selfRegistrationEnabled && (
              <p className="text-center text-sm lg:text-base text-muted-foreground">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => router.push("/register")}
                  className="font-bold underline-offset-4 hover:underline"
                  style={{ color: primaryColor }}
                >
                  Start for free
                </button>
              </p>
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
