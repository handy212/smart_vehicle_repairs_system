"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { authApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MailCheck } from "lucide-react";
import { ReCAPTCHAComponent } from "@/components/ui/recaptcha";
import AuthShell from "@/components/auth/AuthShell";
import { useBranding } from "@/lib/hooks/useBranding";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  const { primaryColor } = useBranding("public");

  const { data: integrations } = useQuery<{
    recaptcha_site_key?: string;
    recaptcha_enabled?: string;
  }>({
    queryKey: ["settings", "integrations", "public"],
    queryFn: () => adminApi.settings.publicIntegrations(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const recaptchaRequired =
    integrations?.recaptcha_enabled === "true" &&
    !!(integrations?.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);

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

      const axiosError = err as {
        response?: { data?: Record<string, unknown>; status?: number };
      };
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
    <>
      <DynamicPageTitle title="Forgot Password" />
      <AuthShell
        description="Enter your email and we'll send you a link to reset your password."
        panelTitle={isSubmitted ? undefined : "Forgot password"}
        panelDescription={
          isSubmitted
            ? undefined
            : "No worries — we'll send reset instructions if an account exists."
        }
        backHref="/login"
      >
        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <label
                htmlFor="forgot-email"
                className="text-sm font-medium text-foreground"
              >
                Email Address
              </label>
              <Input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="h-10 rounded-lg border-border bg-background transition-all focus:ring-2 focus:ring-offset-0 lg:h-11"
                style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                disabled={isLoading}
              />
            </div>

            {recaptchaRequired && (
              <div className="flex justify-center py-1">
                <ReCAPTCHAComponent
                  siteKey={
                    integrations?.recaptcha_site_key ||
                    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
                  }
                  onChange={handleRecaptchaChange}
                  theme="light"
                  size="compact"
                />
              </div>
            )}

            <Button
              type="submit"
              className="h-10 w-full rounded-lg font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] lg:h-11"
              style={{ backgroundColor: primaryColor }}
              disabled={isLoading || (recaptchaRequired && !recaptchaToken)}
            >
              {isLoading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        ) : (
          <div className="space-y-6 py-2 text-center">
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
            >
              <MailCheck className="h-7 w-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Check your email
              </h2>
              <p className="text-sm text-muted-foreground">
                Instructions have been sent to <strong className="text-foreground">{email}</strong>
              </p>
            </div>
            <Button
              onClick={() => router.push("/login")}
              className="h-11 w-full rounded-lg font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              Return to login
            </Button>
            <p className="text-sm text-muted-foreground">
              Didn&apos;t receive the email?{" "}
              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="font-semibold underline-offset-2 hover:underline"
                style={{ color: primaryColor }}
              >
                Try again
              </button>
            </p>
          </div>
        )}
      </AuthShell>
    </>
  );
}
