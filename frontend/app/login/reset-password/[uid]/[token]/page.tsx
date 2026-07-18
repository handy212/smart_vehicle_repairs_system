"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertCircle } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import { useBranding } from "@/lib/hooks/useBranding";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams();
  const uid = params.uid as string;
  const token = params.token as string;

  const { primaryColor } = useBranding("public");

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        new_password_confirm: confirmPassword,
      });
      setIsSubmitted(true);
    } catch (err: unknown) {
      console.error("Reset Password error:", err);
      const axiosError = err as { response?: { data?: Record<string, unknown> } };
      const data = axiosError?.response?.data;
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
    <>
      <DynamicPageTitle title="Reset Password" />
      <AuthShell
        description="Create a strong new password to regain access to your account."
        panelTitle={isSubmitted ? undefined : "Set new password"}
        panelDescription={
          isSubmitted ? undefined : "Enter and confirm your new password below."
        }
        backHref="/login"
      >
        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="animate-in shake flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive duration-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="reset-password"
                className="text-sm font-medium text-foreground"
              >
                New Password
              </label>
              <Input
                id="reset-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 rounded-lg border-border bg-background transition-all focus:ring-2 focus:ring-offset-0 lg:h-11"
                style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="reset-password-confirm"
                className="text-sm font-medium text-foreground"
              >
                Confirm New Password
              </label>
              <Input
                id="reset-password-confirm"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 rounded-lg border-border bg-background transition-all focus:ring-2 focus:ring-offset-0 lg:h-11"
                style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              className="h-10 w-full rounded-lg font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] lg:h-11"
              style={{ backgroundColor: primaryColor }}
              disabled={isLoading}
            >
              {isLoading ? "Updating..." : "Update password"}
            </Button>
          </form>
        ) : (
          <div className="space-y-6 py-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-success/15 text-success">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Success</h2>
              <p className="text-sm text-muted-foreground">
                Your password has been changed successfully.
              </p>
            </div>
            <Button
              onClick={() => router.push("/login")}
              className="h-11 w-full rounded-lg font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              Log in to your account
            </Button>
          </div>
        )}
      </AuthShell>
    </>
  );
}
