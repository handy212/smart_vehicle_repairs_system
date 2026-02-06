"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, Eye, EyeOff } from "lucide-react";
import { setSystemThemeMode } from "@/lib/hooks/useTheme";
import { ReCAPTCHAComponent } from "@/components/ui/recaptcha";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";
import CompleteRegistrationForm from "@/components/auth/CompleteRegistrationForm";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  recaptcha_token: z.string().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

const DEFAULT_HERO_IMAGE = "/images/login-hero.png";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  // Partial registration state
  const [regData, setRegData] = useState<{ user_data: any, google_token_info: any } | null>(null);
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
  }>({
    queryKey: ["settings", "integrations", "public"],
    queryFn: () => adminApi.settings.publicIntegrations(),
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

      // Store tokens
      if (typeof window !== "undefined") {
        localStorage.setItem("access_token", authData.access);
        localStorage.setItem("refresh_token", authData.refresh);
      }

      // Update global state
      const user = await authApi.getCurrentUser();
      setUser(user);

      // Redirect based on role
      if (user.role === "customer") {
        router.push("/portal");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError("Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

  // Resolve image paths (handle relative/absolute URLs from backend)
  const getImageUrl = (path: string | undefined, defaultPath: string) => {
    if (!path) return defaultPath;
    if (path.startsWith('http')) return path;

    // Get base URL by removing /api suffix
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
    const baseUrl = apiUrl.replace(/\/api\/?$/, '');

    // Ensure path starts with /
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    // If path already includes /media, don't add it again
    if (cleanPath.startsWith('/media/')) {
      return `${baseUrl}${cleanPath}`;
    }

    return `${baseUrl}/media${cleanPath}`;
  };

  const heroImage = branding.login_background
    ? getImageUrl(branding.login_background, DEFAULT_HERO_IMAGE)
    : DEFAULT_HERO_IMAGE;

  const heroLogo = branding.logo_dark_path || branding.logo_path;

  return (
    <div className="min-h-screen flex flex-col">
      <DynamicPageTitle title="Login" />
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
              The Future of <br />
              <span style={{ color: '#bfdbfe' }}>Automotive Care</span>
            </h1>
            <p className="text-xl text-white/90 max-w-md">
              {branding.tagline}
            </p>
          </div>
        </div>

        {/* Right side: Login Form */}
        <div className="flex items-center justify-center p-8 bg-muted/50">
          <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center lg:text-left">
              <h2 className="text-3xl font-bold text-foreground">{branding.site_name}</h2>
              <p className="mt-2 text-muted-foreground">
                Welcome back! Please enter your details.
              </p>
            </div>

            <Card className="border-0 shadow-xl bg-card rounded-2xl overflow-hidden">
              <CardContent className="p-8">
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
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    {error && (
                      <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium animate-in shake duration-300">
                        {error}
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground ml-1">Email Address</label>
                      <Input
                        type="email"
                        {...register("email")}
                        placeholder="name@company.com"
                        className="h-12 rounded-xl border-border bg-card focus:bg-card focus:ring-2 focus:ring-offset-0 transition-all"
                        style={{ '--tw-ring-color': branding.primary_color } as React.CSSProperties}
                        disabled={isLoading}
                      />
                      {errors.email && <p className="text-xs text-red-500 ml-1">{errors.email.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-sm font-semibold text-foreground">Password</label>
                        <button
                          type="button"
                          onClick={() => router.push("/login/forgot-password")}
                          className="text-xs font-semibold hover:underline"
                          style={{ color: branding.primary_color }}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          {...register("password")}
                          placeholder="••••••••"
                          className="h-12 rounded-xl border-border bg-card focus:bg-card focus:ring-2 focus:ring-offset-0 pr-12 transition-all"
                          style={{ '--tw-ring-color': branding.primary_color } as React.CSSProperties}
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    {/* reCAPTCHA */}
                    {(integrations?.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) && (
                      <div className="flex justify-center py-2">
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
                      className="w-full h-12 rounded-xl text-white font-bold text-lg shadow-lg transition-all hover:opacity-90 active:scale-95"
                      style={{ backgroundColor: branding.primary_color }}
                      disabled={isLoading}
                    >
                      {isLoading ? "Signing in..." : "Sign in"}
                    </Button>

                    <div className="relative my-8 text-center text-sm font-medium text-muted-foreground line-through">
                      <span className="bg-card px-4 relative z-10 no-underline">OR</span>
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
                )}
              </CardContent>
            </Card>

            <p className="text-center text-muted-foreground">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/register")}
                className="font-bold underline-offset-4 hover:underline"
                style={{ color: branding.primary_color }}
              >
                Start for free
              </button>
            </p>
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


