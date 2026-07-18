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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Phone, Building2 } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";
import { ReCAPTCHAComponent } from "@/components/ui/recaptcha";
import CompleteRegistrationForm from "@/components/auth/CompleteRegistrationForm";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import Script from "next/script";
import { getPostLoginPath } from "@/lib/utils/post-login-redirect";

const registerSchema = z
  .object({
    first_name: z.string().min(2, "First name must be at least 2 characters"),
    last_name: z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string(),
    phone: z.string().min(10, "Phone number is required"),
    customer_type: z.enum(["individual", "business", "fleet"]),
    company_name: z.string().optional(),
    business_type: z.string().optional(),
    tax_id: z.string().optional(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  })
  .refine(
    (data) => {
      if (["business", "fleet"].includes(data.customer_type) && !data.company_name) {
        return false;
      }
      return true;
    },
    {
      message: "Company Name is required for business accounts",
      path: ["company_name"],
    },
  );

type RegisterFormData = z.infer<typeof registerSchema>;
type GoogleRegistrationUserData = ComponentProps<typeof CompleteRegistrationForm>["userData"];
type GoogleRegistrationData = {
  user_data: GoogleRegistrationUserData;
  google_token_info: Record<string, unknown>;
};

export default function RegisterPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentStep, setCurrentStep] = useState<"form" | "otp">("form");
  const [pendingData, setPendingData] = useState<RegisterFormData | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [regData, setRegData] = useState<GoogleRegistrationData | null>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  const { tagline, primaryColor, selfRegistrationEnabled } = useBranding("public");

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
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      confirm_password: "",
      phone: "",
      customer_type: "individual",
      company_name: "",
      business_type: "",
      tax_id: "",
    },
  });

  const customerType = watch("customer_type");

  const handleRecaptchaChange = (token: string | null) => {
    setRecaptchaToken(token);
  };

  const onInitiate = async (data: RegisterFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      await authApi.register.initiate({
        ...data,
        password_confirm: data.confirm_password,
        recaptcha_token: recaptchaToken || undefined,
      });
      setPendingData(data);
      setCurrentStep("otp");
    } catch (err: unknown) {
      console.error("Registration initiation error:", err);

      const axiosError = err as { response?: { data?: Record<string, unknown> } };
      const data = axiosError?.response?.data;

      if (data) {
        const message =
          (typeof data.detail === "string" && data.detail) ||
          (typeof data.recaptcha_token === "string" && data.recaptcha_token) ||
          (Array.isArray(data.recaptcha_token) && data.recaptcha_token[0]) ||
          (typeof data.email === "string" && data.email) ||
          (Array.isArray(data.email) && data.email[0]) ||
          null;

        setError(message || "Registration failed. Please try again.");
      } else {
        setError("Unable to connect. Please check your internet and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingData || otpCode.length !== 6) return;

    setIsLoading(true);
    setError(null);

    try {
      const authData = await authApi.register.verify({
        ...pendingData,
        otp_code: otpCode,
      });

      await applyLoginTokens(authData.access);
      setUser(authData.user);
      router.push(getPostLoginPath(authData.user.role));
    } catch (err: unknown) {
      console.error("Verification error:", err);
      const axiosError = err as { response?: { data?: Record<string, unknown> } };
      const data = axiosError?.response?.data;

      setError(
        (typeof data?.otp_code === "string" && data.otp_code) ||
          (Array.isArray(data?.otp_code) && data.otp_code[0]) ||
          (typeof data?.detail === "string" && data.detail) ||
          "Verification failed.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const panelTitle = !selfRegistrationEnabled
    ? "Registration is closed"
    : regData
      ? undefined
      : currentStep === "otp"
        ? "Verify your email"
        : "Create your account";

  const panelDescription = !selfRegistrationEnabled
    ? "Self registration is currently disabled. Contact the service team for account access."
    : regData
      ? undefined
      : currentStep === "otp"
        ? `We sent a 6-digit code to ${pendingData?.email}`
        : "Join the shop floor in a few minutes.";

  return (
    <>
      <DynamicPageTitle title="Register" />
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <AuthShell
        description={
          tagline?.trim() || "Create an account to track repairs, invoices, and vehicles."
        }
        panelTitle={panelTitle}
        panelDescription={panelDescription}
        panelSize="lg"
        backHref={currentStep === "otp" ? undefined : "/login"}
        backLabel={
          currentStep === "otp" && selfRegistrationEnabled
            ? "Back to details"
            : "Back to login"
        }
        onBack={
          currentStep === "otp" && selfRegistrationEnabled
            ? () => {
                setCurrentStep("form");
                setError(null);
              }
            : undefined
        }
        panelFooter={
          selfRegistrationEnabled && !regData ? (
            <p className="text-center text-sm text-white/75">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="font-semibold text-white underline-offset-4 hover:underline"
              >
                Sign in instead
              </button>
            </p>
          ) : null
        }
      >
        {!selfRegistrationEnabled ? (
          <Button
            type="button"
            onClick={() => router.push("/login")}
            className="h-10 w-full rounded-lg font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Back to login
          </Button>
        ) : regData ? (
          <CompleteRegistrationForm
            userData={regData.user_data}
            onSuccess={(authData) => {
              setUser(authData.user);
              router.push(getPostLoginPath(authData.user.role));
            }}
            onCancel={() => setRegData(null)}
          />
        ) : (
          <>
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-4 animate-in shake rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive duration-300"
              >
                {error}
              </div>
            )}

            {currentStep === "form" ? (
              <form onSubmit={handleSubmit(onInitiate)} className="space-y-3 lg:space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">First Name</label>
                    <Input
                      {...register("first_name")}
                      placeholder="John"
                      className="h-10 rounded-lg border-border bg-background"
                    />
                    {errors.first_name && (
                      <p className="text-xs text-destructive">{errors.first_name.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Last Name</label>
                    <Input
                      {...register("last_name")}
                      placeholder="Doe"
                      className="h-10 rounded-lg border-border bg-background"
                    />
                    {errors.last_name && (
                      <p className="text-xs text-destructive">{errors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Email Address</label>
                  <Input
                    type="email"
                    {...register("email")}
                    placeholder="john@example.com"
                    className="h-10 rounded-lg border-border bg-background"
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Phone</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        {...register("phone")}
                        placeholder="(555) 000-0000"
                        className="h-10 rounded-lg border-border bg-background pl-10"
                      />
                    </div>
                    {errors.phone && (
                      <p className="text-xs text-destructive">{errors.phone.message}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Account Type</label>
                    <Select
                      onValueChange={(val) =>
                        setValue("customer_type", val as RegisterFormData["customer_type"])
                      }
                      defaultValue="individual"
                    >
                      <SelectTrigger className="h-10 rounded-lg border-border bg-background">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="fleet">Fleet Owner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(customerType === "business" || customerType === "fleet") && (
                  <div className="animate-in fade-in slide-in-from-top-2 space-y-1">
                    <label className="text-sm font-medium text-foreground">Company Name</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        {...register("company_name")}
                        placeholder="Acme Inc."
                        className="h-10 rounded-lg border-border bg-background pl-10"
                      />
                    </div>
                    {errors.company_name && (
                      <p className="text-xs text-destructive">{errors.company_name.message}</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Password</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        {...register("password")}
                        placeholder="••••••••"
                        className="h-10 rounded-lg border-border bg-background pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-xs text-destructive">{errors.password.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Confirm</label>
                    <Input
                      type="password"
                      {...register("confirm_password")}
                      placeholder="••••••••"
                      className="h-10 rounded-lg border-border bg-background"
                    />
                    {errors.confirm_password && (
                      <p className="text-xs text-destructive">
                        {errors.confirm_password.message}
                      </p>
                    )}
                  </div>
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
                  className="mt-1 h-10 w-full rounded-lg font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] lg:h-11"
                  style={{ backgroundColor: primaryColor }}
                  disabled={isLoading || (recaptchaRequired && !recaptchaToken)}
                >
                  {isLoading ? "Checking..." : "Continue"}
                </Button>

                {googleSignInEnabled && (
                  <>
                    <div className="relative my-2">
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
            ) : (
              <form onSubmit={onVerify} className="space-y-5">
                <div
                  className="space-y-3 rounded-lg p-4 text-center"
                  style={{ backgroundColor: `${primaryColor}12` }}
                >
                  <p className="text-sm text-muted-foreground">
                    Enter the 6-digit code sent to your email
                  </p>
                  <Input
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="h-14 rounded-lg border-border bg-background text-center font-mono text-2xl tracking-[0.5em]"
                    placeholder="000000"
                    autoFocus
                  />
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full rounded-lg font-semibold text-white shadow-sm transition-all hover:opacity-90"
                  style={{ backgroundColor: primaryColor }}
                  disabled={isLoading || otpCode.length !== 6}
                >
                  {isLoading ? "Verifying..." : "Create Account"}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Didn&apos;t receive a code?{" "}
                  <button
                    type="button"
                    onClick={() => handleSubmit(onInitiate)()}
                    className="font-semibold underline-offset-2 hover:underline"
                    style={{ color: primaryColor }}
                  >
                    Resend
                  </button>
                </p>
              </form>
            )}
          </>
        )}
      </AuthShell>
    </>
  );
}
