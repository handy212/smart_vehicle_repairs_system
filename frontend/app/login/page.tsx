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

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  recaptcha_token: z.string().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  // Fetch branding settings using public endpoint (no auth required)
  const { data: brandingSettings } = useQuery<SystemSetting[]>({
    queryKey: ["settings", "branding", "public"],
    queryFn: () => adminApi.settings.publicBranding(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  // Fetch integration settings to get reCAPTCHA site key
  const { data: integrations } = useQuery<{
    google_analytics_id?: string;
    facebook_pixel_id?: string;
    recaptcha_site_key?: string;
  }>({
    queryKey: ["settings", "integrations", "public"],
    queryFn: () => adminApi.settings.publicIntegrations(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  // Extract branding values
  const branding = useMemo(() => {
    if (!brandingSettings) {
      return {
        siteName: "Smart Vehicle Repairs",
        tagline: "Management System",
        logoPath: null,
        loginBackground: null,
        loginBackgroundOverlay: "0.5",
        themeMode: null,
      };
    }

    const getSetting = (key: string): string | null => {
      const setting = brandingSettings.find((s) => s.key === key);
      return setting?.value && setting.value.trim() !== "" ? setting.value : null;
    };

    return {
      siteName: getSetting("site_name") || "Smart Vehicle Repairs",
      tagline: getSetting("company_tagline") || "Management System",
      logoPath: getSetting("logo_path"),
      loginBackground: getSetting("login_background") || getSetting("staff_login_background"),
      loginBackgroundOverlay: getSetting("login_background_overlay") || "0.5",
      themeMode: getSetting("theme_mode"),
    };
  }, [brandingSettings]);

  // Apply theme_mode from system settings
  useEffect(() => {
    if (branding.themeMode) {
      const themeMode = branding.themeMode.toLowerCase().trim();
      if (['light', 'dark', 'system', 'auto'].includes(themeMode)) {
        const themeValue = themeMode === 'auto' ? 'system' : themeMode;
        setSystemThemeMode(themeValue as 'light' | 'dark' | 'system');
        // Trigger theme application
        window.dispatchEvent(new CustomEvent('systemThemeModeChanged', { detail: themeValue }));
      }
    }
  }, [branding.themeMode]);

  // Get media base URL from API URL (remove /api suffix)
  const mediaBaseUrl = useMemo(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    return apiUrl.replace(/\/api\/?$/, "");
  }, []);

  const getMediaUrl = useCallback(
    (path: string) => {
      if (path.startsWith("http")) return path;
      return `${mediaBaseUrl}/media/${path}`;
    },
    [mediaBaseUrl]
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
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

    // Check if reCAPTCHA is required and validated
    // Use site key from backend settings if available, otherwise fall back to env var
    const recaptchaSiteKey = integrations?.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    if (recaptchaSiteKey && !recaptchaToken) {
      setError("Please complete the reCAPTCHA verification.");
      setIsLoading(false);
      return;
    }

    try {
      // Include reCAPTCHA token in login request
      const loginData = {
        email: data.email,
        password: data.password,
        ...(recaptchaToken && { recaptcha_token: recaptchaToken }),
      };
      
      const authResponse = await authApi.login(loginData);
      
      // Store tokens
      if (typeof window !== "undefined") {
        localStorage.setItem("access_token", authResponse.access);
        localStorage.setItem("refresh_token", authResponse.refresh);
      }

      // Get user info
      const user = await authApi.getCurrentUser();
      setUser(user);

      // Redirect based on user role
      if (user.role === "customer") {
        router.push("/portal");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Invalid email or password. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Background style with overlay
  const backgroundStyle = useMemo(() => {
    if (!branding.loginBackground) {
      return { backgroundColor: "#f9fafb" }; // bg-gray-50
    }

    const bgUrl = getMediaUrl(branding.loginBackground);
    const overlayOpacity = parseFloat(branding.loginBackgroundOverlay) || 0.5;

    return {
      backgroundImage: `linear-gradient(rgba(0, 0, 0, ${overlayOpacity}), rgba(0, 0, 0, ${overlayOpacity})), url(${bgUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }, [branding.loginBackground, branding.loginBackgroundOverlay, getMediaUrl]);

  // Logo URL
  const logoUrl = useMemo(() => {
    if (!branding.logoPath) return null;
    return getMediaUrl(branding.logoPath);
  }, [branding.logoPath, getMediaUrl]);

  return (
    <div 
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative"
      style={backgroundStyle}
    >
      <Card className="w-full max-w-md bg-white/95 backdrop-blur-sm shadow-xl border-0 animate-in fade-in-0 zoom-in-95 duration-200">
        <CardHeader className="space-y-4">
          {/* Logo */}
          {logoUrl ? (
            <div className="flex justify-center">
              <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-lg overflow-hidden bg-white flex items-center justify-center shadow-md border border-gray-200">
                <img
                  src={logoUrl}
                  alt={branding.siteName}
                  className="h-full w-full object-contain p-2"
                  onError={(e) => {
                    // Hide image if it fails to load
                    const target = e.target as HTMLImageElement;
                    if (target) {
                      target.style.display = "none";
                      const parent = target.parentElement;
                      if (parent && !parent.querySelector(".fallback-icon")) {
                        const icon = document.createElement("div");
                        icon.className = "fallback-icon h-full w-full flex items-center justify-center";
                        icon.innerHTML = '<svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>';
                        parent.appendChild(icon);
                      }
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-md">
                <Car className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
              </div>
            </div>
          )}
          
          <div>
            <CardTitle className="text-2xl text-center text-gray-900">
              {branding.siteName}
            </CardTitle>
            <CardDescription className="text-center mt-2">
              {branding.tagline}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm" role="alert">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                {...register("email")}
                // placeholder="you@example.com"
                className={errors.email ? "border-red-500" : ""}
                disabled={isLoading}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  {...register("password")}
                  placeholder="••••••••"
                  className={errors.password ? "border-red-500 pr-10" : "pr-10"}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            {/* reCAPTCHA */}
            {(integrations?.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) && (
              <div>
                <ReCAPTCHAComponent
                  siteKey={integrations?.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
                  onChange={handleRecaptchaChange}
                  onExpired={handleRecaptchaExpired}
                  onError={handleRecaptchaError}
                  theme="light"
                />
                {errors.recaptcha_token && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.recaptcha_token.message}
                  </p>
                )}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || (!!(integrations?.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) && !recaptchaToken)}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

