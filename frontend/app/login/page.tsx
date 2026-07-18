"use client";

import { useState, type ComponentProps } from "react";
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
import { Eye, EyeOff } from "lucide-react";
import { ReCAPTCHAComponent } from "@/components/ui/recaptcha";
import AuthShell from "@/components/auth/AuthShell";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";
import CompleteRegistrationForm from "@/components/auth/CompleteRegistrationForm";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import Script from "next/script";
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

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  const [twoFactorData, setTwoFactorData] = useState<{ temp_token: string; user_id: number } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [regData, setRegData] = useState<GoogleRegistrationData | null>(null);

  const { primaryColor, selfRegistrationEnabled, tagline } = useBranding("public");

  const { data: integrations } = useQuery({
    queryKey: ["settings", "integrations", "public"],
    queryFn: () => adminApi.settings.publicIntegrations(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

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
          user_id: authData.user_id!,
        });
        return;
      }

      await applyLoginTokens(authData.access);

      const user = await authApi.getCurrentUser();
      setUser(user);
      router.push(getPostLoginPath(user.role));
    } catch (err: unknown) {
      console.error("Login error:", err);

      const axiosError = err as { response?: { data?: Record<string, unknown>; status?: number } };
      const data = axiosError?.response?.data;

      if (data) {
        const message =
          (typeof data.detail === "string" && data.detail) ||
          (typeof data.recaptcha_token === "string" && data.recaptcha_token) ||
          (Array.isArray(data.recaptcha_token) && data.recaptcha_token[0]) ||
          (typeof data.non_field_errors === "object" &&
            Array.isArray(data.non_field_errors) &&
            data.non_field_errors[0]) ||
          (typeof data.email === "object" && Array.isArray(data.email) && data.email[0]) ||
          null;

        setError(message || "Invalid email or password.");
      } else if (axiosError?.response?.status && axiosError.response.status >= 500) {
        setError("Server error during sign-in. Restart the dev servers and try again.");
      } else {
        const networkMsg = err instanceof Error ? err.message : "Network error";
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
      await applyLoginTokens(authData.access);
      const user = authData.user ?? (await authApi.getCurrentUser());
      setUser(user);
      router.push(getPostLoginPath(user.role));
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

  const showWelcomeCopy = !regData && !twoFactorData;

  return (
    <>
      <DynamicPageTitle title="Login" />
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <AuthShell
        description={
          tagline?.trim() || "Sign in to manage jobs, pipelines, and the shop floor."
        }
        panelTitle={showWelcomeCopy ? "Welcome back" : undefined}
        panelDescription={
          showWelcomeCopy ? "Sign in to continue to your workspace." : undefined
        }
        panelFooter={
          selfRegistrationEnabled ? (
            <p className="text-center text-sm text-white/75">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/register")}
                className="font-semibold text-white underline-offset-4 hover:underline"
              >
                Start for free
              </button>
            </p>
          ) : null
        }
      >
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
                className="animate-in shake rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive duration-300"
              >
                {error}
              </div>
            )}

            <div className="space-y-2 pb-2 text-center">
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${primaryColor}18` }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: primaryColor }}
                  aria-hidden
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
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
                onChange={(e) =>
                  setTwoFactorCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                }
                placeholder="000000"
                className="h-12 w-48 rounded-lg border-border bg-background text-center font-mono text-2xl font-bold tracking-[0.5em] transition-all focus:ring-2 focus:ring-offset-0"
                style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-lg font-medium lg:h-11"
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
                className="h-10 w-full rounded-lg font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] lg:h-11"
                style={{ backgroundColor: primaryColor }}
                disabled={isLoading || twoFactorCode.length !== 6}
              >
                {isLoading ? "Verifying..." : "Verify Code"}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="animate-in shake rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive duration-300"
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
                className="h-10 rounded-lg border-border bg-background transition-all focus:ring-2 focus:ring-offset-0 lg:h-11"
                style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="text-sm font-medium text-foreground">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => router.push("/login/forgot-password")}
                  className="text-xs font-semibold underline-offset-2 hover:underline"
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
                  className="h-10 rounded-lg border-border bg-background pr-11 transition-all focus:ring-2 focus:ring-offset-0 lg:h-11"
                  style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 lg:h-5 lg:w-5" />
                  ) : (
                    <Eye className="h-4 w-4 lg:h-5 lg:w-5" />
                  )}
                </button>
              </div>
            </div>

            {recaptchaRequired && (
              <div className="flex justify-center py-1">
                <ReCAPTCHAComponent
                  siteKey={
                    integrations?.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
                  }
                  onChange={handleRecaptchaChange}
                  onExpired={handleRecaptchaExpired}
                  onError={handleRecaptchaError}
                  theme="light"
                />
              </div>
            )}

            <Button
              type="submit"
              className="h-10 w-full rounded-lg text-base font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] lg:h-11"
              style={{ backgroundColor: primaryColor }}
              disabled={isLoading || (recaptchaRequired && !recaptchaToken)}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>

            {googleSignInEnabled && (
              <>
                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center" aria-hidden>
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-wide">
                    <span className="bg-card px-3 font-medium text-muted-foreground">or</span>
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
      </AuthShell>
    </>
  );
}
