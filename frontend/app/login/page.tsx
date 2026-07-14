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
import { Eye, EyeOff } from "lucide-react";
import { ReCAPTCHAComponent } from "@/components/ui/recaptcha";
import AuthBrandMark from "@/components/auth/AuthBrandMark";
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

  const { data: integrations } = useQuery({
    queryKey: ["settings", "integrations", "public"],
    queryFn: () => adminApi.settings.publicIntegrations(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  // reCAPTCHA is required when it's enabled AND a site key is available
  const recaptchaRequired =
    integrations?.recaptcha_enabled === "true" &&
    !!(integrations?.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);

  const googleClientId =
    (integrations?.google_oauth_client_id || "").trim() ||
    (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "").trim() ||
    "";
  const googleSignInEnabled = Boolean(googleClientId);

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
          (typeof data.email === "object" && Array.isArray(data.email) && data.email[0]) ||
          null;

        setError(message || "Invalid email or password.");
      } else if (axiosError?.response?.status && axiosError.response.status >= 500) {
        setError("Server error during sign-in. Restart the dev servers and try again.");
      } else {
        const networkMsg =
          err instanceof Error ? err.message : "Network error";
        const isNetwork =
          networkMsg === "Network Error" ||
          networkMsg.includes("ECONNREFUSED") ||
          networkMsg.includes("ERR_NETWORK");
        setError(
          isNetwork
            ? "Cannot reach the API. Restart dev servers (bash scripts/dev-server.sh) and use http://127.0.0.1:3001 or http://localhost:3001."
            : networkMsg || "Unable to connect. Please try again.",
        );
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
    ? getMediaUrl(loginBackground) || DEFAULT_HERO_IMAGE
    : DEFAULT_HERO_IMAGE;

  // Prefer the dark-logo asset on the hero (often designed for dark/colored panels).
  const heroLogo = logoDarkPath || logoPath;
  const heroLogoSrc = heroLogo ? getMediaUrl(heroLogo) || null : null;
  const formLogoSrc = logoPath ? getMediaUrl(logoPath) || null : heroLogoSrc;

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
          className="hidden lg:flex relative flex-col justify-between p-10 xl:p-12 overflow-hidden bg-gray-900 group"
          style={{ backgroundColor: primaryColor }}
        >
          {isMounted && (
            <img
              src={heroImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-45 mix-blend-overlay transition-transform duration-700 ease-in-out group-hover:scale-105"
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, ${primaryColor} 0%, ${primaryColor}55 45%, transparent 100%)`,
            }}
          />

          <div className="relative z-10">
            <AuthBrandMark
              logoSrc={heroLogoSrc}
              siteName={siteName}
              primaryColor={primaryColor}
              variant="hero"
              size="lg"
            />
          </div>

          <div className="relative z-10 space-y-3 max-w-lg">
            <h1 className="text-4xl xl:text-5xl font-extrabold text-white tracking-tight leading-[1.15]">
              The Future of <br />
              <span className="text-white/80">Automotive Care</span>
            </h1>
            {tagline && (
              <p className="text-lg text-white/85 leading-relaxed">
                {tagline}
              </p>
            )}
          </div>
        </div>

        {/* Right side: Login Form */}
        <div className="flex items-start justify-center bg-background p-4 pt-8 sm:pt-10 lg:items-center lg:p-8">
          <div className="w-full max-w-md space-y-5 lg:space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
              <AuthBrandMark
                logoSrc={formLogoSrc}
                siteName={siteName}
                primaryColor={primaryColor}
                variant="form"
                size="md"
                className="lg:hidden"
              />
              <div>
                <h2 className="text-2xl lg:text-3xl font-bold leading-tight text-foreground text-balance">
                  {siteName}
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Welcome back — sign in to continue.
                </p>
              </div>
            </div>

            <Card className="border border-border shadow-sm bg-card rounded-xl overflow-hidden">
              <CardContent className="p-5 sm:p-6 lg:p-8">
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
                        className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm font-medium animate-in shake duration-300"
                      >
                        {error}
                      </div>
                    )}

                    <div className="space-y-2 text-center pb-2">
                      <div
                        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
                        style={{ backgroundColor: `${primaryColor}18` }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: primaryColor }} aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></svg>
                      </div>
                      <h3 className="text-xl font-semibold text-foreground">Two-Factor Authentication</h3>
                      <p className="text-sm text-muted-foreground">
                        Enter the 6-digit code from your authenticator app.
                      </p>
                    </div>

                    <div className="flex flex-col items-center space-y-1.5">
                      <Input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={twoFactorCode}
                        onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                        placeholder="000000"
                        className="h-12 w-48 text-center text-2xl tracking-[0.5em] font-mono rounded-lg border-border bg-background focus:ring-2 focus:ring-offset-0 transition-all font-bold"
                        style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                        disabled={isLoading}
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-10 lg:h-11 rounded-lg font-medium"
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
                        className="w-full h-10 lg:h-11 rounded-lg text-white font-semibold shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
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
                        className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm font-medium animate-in shake duration-300"
                      >
                        {error}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label htmlFor="login-email" className="text-sm font-medium text-foreground">
                        Email Address
                      </label>
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        {...register("email")}
                        placeholder="name@company.com"
                        className="h-10 lg:h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-offset-0 transition-all"
                        style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                        disabled={isLoading}
                      />
                      {errors.email && (
                        <p className="text-xs text-destructive">{errors.email.message}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label htmlFor="login-password" className="text-sm font-medium text-foreground">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => router.push("/login/forgot-password")}
                          className="text-xs font-semibold hover:underline underline-offset-2"
                          style={{ color: primaryColor }}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          {...register("password")}
                          placeholder="••••••••"
                          className="h-10 lg:h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-offset-0 pr-11 transition-all"
                          style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4 lg:w-5 lg:h-5" />
                          ) : (
                            <Eye className="w-4 h-4 lg:w-5 lg:h-5" />
                          )}
                        </button>
                      </div>
                    </div>

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
                      className="w-full h-10 lg:h-11 rounded-lg text-white font-semibold text-base shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{ backgroundColor: primaryColor }}
                      disabled={isLoading || (recaptchaRequired && !recaptchaToken)}
                    >
                      {isLoading ? "Signing in..." : "Sign in"}
                    </Button>

                    {googleSignInEnabled && (
                      <>
                        <div className="relative my-2">
                          <div className="absolute inset-0 flex items-center" aria-hidden>
                            <div className="w-full border-t border-border" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase tracking-wide">
                            <span className="bg-card px-3 text-muted-foreground font-medium">or</span>
                          </div>
                        </div>

                        <GoogleLoginButton
                          clientId={googleClientId}
                          onSuccess={(data) => {
                            setUser(data.user);
                            router.push(getPostLoginPath(data.user.role));
                          }}
                          onRegistrationRequired={(data) => setRegData(data)}
                          onError={(msg) => setError(msg)}
                        />
                      </>
                    )}
                  </form>
                )}
              </CardContent>
            </Card>

            {selfRegistrationEnabled && (
              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => router.push("/register")}
                  className="font-semibold underline-offset-4 hover:underline"
                  style={{ color: primaryColor }}
                >
                  Start for free
                </button>
              </p>
            )}
          </div>
        </div>
      </div>

      <footer className="overflow-hidden bg-card border-t border-border px-4 py-3.5 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-center text-center text-xs sm:text-sm text-muted-foreground">
          <p className="w-full max-w-full px-2 text-balance break-words">
            © 2026 American AutoParts. Developed by{" "}
            <a
              href="https://safetracksystems.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:underline"
              style={{ color: primaryColor }}
            >
              SafeTrack Systems
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
