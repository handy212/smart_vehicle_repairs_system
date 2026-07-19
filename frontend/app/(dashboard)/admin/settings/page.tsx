"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useToast } from "@/lib/hooks/useToast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Mail,
  Paintbrush,
  RefreshCw,
  Save,
  Shield,
  Bell,
  Briefcase,
  Receipt,
  Wrench,
  CreditCard,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { getUserFacingError } from "@/lib/api/errors";
import { getMediaUrl } from "@/lib/api/utils";
import { withCacheBuster } from "@/lib/branding/parse";

type CategoryDef = {
  value: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

const CATEGORIES: CategoryDef[] = [
  { value: "company", label: "Company", description: "Business identity and contact details", icon: Building2 },
  { value: "branding", label: "Branding", description: "Look, logos, and theme", icon: Paintbrush },
  { value: "email", label: "Email", description: "Outgoing mail and SMTP", icon: Mail },
  { value: "payment", label: "Billing", description: "Currency, taxes, and payments", icon: CreditCard },
  { value: "notification", label: "Notifications", description: "Email, SMS, push, and WhatsApp", icon: Bell },
  { value: "security", label: "Security", description: "Passwords, sessions, and access", icon: Shield },
  { value: "business", label: "Business", description: "Hours, booking, and document terms", icon: Briefcase },
  { value: "tax", label: "Tax", description: "Ghana VAT and levy rates", icon: Receipt },
  { value: "maintenance", label: "Maintenance", description: "System mode and logging", icon: Wrench },
];

const SELECT_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  theme_mode: [
    { value: "perfex", label: "Light" },
    { value: "perfex-dark", label: "Dark" },
  ],
  sms_provider: [
    { value: "hubtel", label: "Hubtel" },
    { value: "twilio", label: "Twilio" },
    { value: "infobip", label: "Infobip" },
  ],
  payment_gateway: [{ value: "paystack", label: "Paystack" }],
  late_fee_type: [
    { value: "percentage", label: "Percentage" },
    { value: "fixed", label: "Fixed amount" },
  ],
  email_backend: [
    { value: "django.core.mail.backends.smtp.EmailBackend", label: "SMTP" },
    { value: "django.core.mail.backends.console.EmailBackend", label: "Console" },
  ],
  currency: [
    { value: "GHS", label: "GHS — Ghanaian Cedi" },
    { value: "USD", label: "USD — US Dollar" },
    { value: "NGN", label: "NGN — Nigerian Naira" },
    { value: "EUR", label: "EUR — Euro" },
    { value: "GBP", label: "GBP — British Pound" },
  ],
  currency_code: [
    { value: "USD", label: "USD — US Dollar" },
    { value: "GHS", label: "GHS — Ghanaian Cedi" },
    { value: "NGN", label: "NGN — Nigerian Naira" },
    { value: "EUR", label: "EUR — Euro" },
    { value: "GBP", label: "GBP — British Pound" },
  ],
  currency_symbol: [
    { value: "₵", label: "₵" },
    { value: "$", label: "$" },
    { value: "₦", label: "₦" },
    { value: "€", label: "€" },
    { value: "£", label: "£" },
  ],
  backup_frequency: [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ],
  business_hours_sunday: [
    { value: "Closed", label: "Closed" },
    { value: "09:00-15:00", label: "09:00–15:00" },
    { value: "08:00-18:00", label: "08:00–18:00" },
  ],
  log_level: [
    { value: "DEBUG", label: "Debug" },
    { value: "INFO", label: "Info" },
    { value: "WARNING", label: "Warning" },
    { value: "ERROR", label: "Error" },
    { value: "CRITICAL", label: "Critical" },
  ],
};

const IMAGE_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,.jpg,.jpeg,.png,.gif,.webp,.svg";
const FAVICON_ACCEPT =
  ".ico,.png,.svg,.webp,image/x-icon,image/png,image/svg+xml,image/webp";

/** Preferred display order and section grouping per category */
const SECTION_GROUPS: Record<string, Array<{ title: string; keys: string[] }>> = {
  company: [
    {
      title: "Identity",
      keys: ["company_name", "company_registration", "company_tax_id", "company_website"],
    },
    {
      title: "Contact",
      keys: ["company_email", "company_phone"],
    },
    {
      title: "Address",
      keys: ["company_address", "company_area", "company_city", "company_region", "company_country"],
    },
  ],
  branding: [
    {
      title: "Identity",
      keys: ["site_name", "company_tagline", "theme_mode"],
    },
    {
      title: "Logos & images",
      keys: ["logo_path", "logo_dark_path", "favicon_path", "login_background", "login_background_overlay"],
    },
    {
      title: "Colors",
      keys: ["primary_color", "secondary_color", "success_color", "danger_color"],
    },
    {
      title: "Options",
      keys: ["self_registration_enabled", "document_watermark_enabled"],
    },
  ],
  email: [
    {
      title: "Connection",
      keys: ["email_enabled", "email_backend", "email_host", "email_port", "email_username", "email_password", "email_use_tls", "email_use_ssl"],
    },
    {
      title: "Sender",
      keys: ["email_from_name", "email_from_address", "email_reply_to", "email_signature"],
    },
  ],
  payment: [
    {
      title: "Currency",
      keys: ["currency", "currency_symbol", "currency_code"],
    },
    {
      title: "Tax & fees",
      keys: ["tax_name", "tax_rate", "payment_terms", "late_fee_enabled", "late_fee_type", "late_fee_amount"],
    },
    {
      title: "Online payments",
      keys: ["payment_gateway_enabled", "payment_gateway", "paystack_public_key", "paystack_secret_key"],
    },
  ],
  notification: [
    {
      title: "Channels",
      keys: ["notification_email_enabled", "notification_sms_enabled", "notification_push_enabled"],
    },
    {
      title: "WhatsApp",
      keys: ["whatsapp_enabled", "whatsapp_access_token", "whatsapp_phone_number_id", "whatsapp_business_account_id", "whatsapp_api_version"],
    },
  ],
  security: [
    {
      title: "Passwords",
      keys: [
        "password_min_length",
        "password_require_uppercase",
        "password_require_lowercase",
        "password_require_number",
        "password_require_special",
      ],
    },
    {
      title: "Sessions & lockout",
      keys: ["session_timeout", "max_login_attempts", "lockout_duration", "two_factor_enabled"],
    },
    {
      title: "Uploads",
      keys: ["allowed_file_types", "max_file_size"],
    },
  ],
  business: [
    {
      title: "Hours & booking",
      keys: [
        "business_hours_weekday",
        "business_hours_saturday",
        "business_hours_sunday",
        "appointment_duration",
        "appointment_buffer",
        "max_appointments_per_day",
        "online_booking_enabled",
        "deposit_required",
        "deposit_percentage",
        "cancellation_policy",
      ],
    },
    {
      title: "Document terms",
      keys: [
        "invoice_bank_details",
        "invoice_terms_and_conditions",
        "estimate_terms_and_conditions",
        "proforma_notice",
        "receipt_terms_and_conditions",
        "work_order_terms_and_conditions",
      ],
    },
  ],
  tax: [
    {
      title: "Ghana tax rates",
      keys: ["tax_enabled", "tax_regime", "tax_vat_rate", "tax_nhil_rate", "tax_getfund_rate"],
    },
  ],
  maintenance: [
    {
      title: "System",
      keys: ["maintenance_mode", "maintenance_message", "log_level", "debug_mode"],
    },
    {
      title: "Backups",
      keys: ["backup_frequency", "backup_retention_days", "backup_enabled"],
    },
  ],
};

type Draft = Partial<Pick<SystemSetting, "value" | "is_active">>;

const CATEGORY_KEY_PREFIXES: Record<string, string[]> = {
  company: ["company_"],
  branding: ["branding_"],
  email: ["email_"],
  payment: ["payment_"],
  notification: ["notification_"],
  security: ["security_"],
  business: ["business_"],
  tax: ["tax_"],
  maintenance: ["backup_", "maintenance_"],
};

function humanizeKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelFor(setting: SystemSetting) {
  const prefixes = CATEGORY_KEY_PREFIXES[setting.category] || [];
  const strippedKey = prefixes.reduce(
    (current, prefix) => (current.startsWith(prefix) ? current.slice(prefix.length) : current),
    setting.key
  );
  const categoryLabel = CATEGORIES.find((category) => category.value === setting.category)?.label;
  const displayName = setting.display_name || humanizeKey(strippedKey);

  if (categoryLabel && displayName.toLowerCase().startsWith(`${categoryLabel.toLowerCase()} `)) {
    return displayName.slice(categoryLabel.length + 1);
  }

  return displayName;
}

function isBooleanSetting(key: string) {
  return (
    /(enabled|require|is_|_enabled)$/i.test(key) ||
    ["maintenance_mode", "online_booking_enabled", "allow_online_booking", "deposit_required", "require_deposit", "debug_mode"].includes(
      key
    )
  );
}

function isTruthy(value: unknown) {
  const text = String(value ?? "").toLowerCase().trim();
  return ["true", "1", "yes", "on"].includes(text);
}

function isColorSetting(key: string) {
  return /(primary_color|secondary_color|success_color|danger_color|warning_color|info_color)$/i.test(key);
}

function isImageSetting(key: string) {
  return /(logo_path|logo_dark_path|favicon_path|background)$/i.test(key);
}

function isLongTextSetting(key: string, value: string) {
  return (
    key.includes("address") ||
    key.includes("footer") ||
    key.includes("message") ||
    key.includes("terms") ||
    key.includes("policy") ||
    key.includes("bank_details") ||
    key.includes("notice") ||
    key.includes("tagline") ||
    key.includes("signature") ||
    value.length > 90
  );
}

function isNumberSetting(key: string) {
  return /(rate|amount|price|port|timeout|duration|max_|min_|length|attempts|days|hours|minutes|mb|size|retention|buffer|count|percentage|overlay)$/i.test(
    key
  );
}

function imagePreviewSrc(value: string, updatedAt?: string) {
  const url = getMediaUrl(value);
  if (!url) return "";
  const version = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  return withCacheBuster(url, version);
}

function groupSettings(category: string, settings: SystemSetting[]) {
  const groups = SECTION_GROUPS[category] || [];
  const used = new Set<string>();
  const sections: Array<{ title: string; settings: SystemSetting[] }> = [];

  for (const group of groups) {
    const items = group.keys
      .map((key) => settings.find((s) => s.key === key))
      .filter((s): s is SystemSetting => Boolean(s));
    items.forEach((s) => used.add(s.key));
    if (items.length) sections.push({ title: group.title, settings: items });
  }

  const leftover = settings.filter((s) => !used.has(s.key) && s.key !== "tax_covid_rate");
  if (leftover.length) {
    sections.push({ title: sections.length ? "Other" : "Settings", settings: leftover });
  }

  return sections;
}

export default function SystemSettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("manage_settings");
  const requestedCategory = searchParams?.get("category") || "company";
  const selectedCategory = requestedCategory === "sms" ? "company" : requestedCategory;
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (requestedCategory === "sms") {
      router.push("/admin/integrations?category=communication");
    }
  }, [requestedCategory, router]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "settings", selectedCategory],
    queryFn: () => adminApi.settings.list({ category: selectedCategory }),
  });

  const settings = useMemo(
    () => (data?.results || []).filter((s) => s.key !== "tax_covid_rate"),
    [data?.results]
  );
  const sections = useMemo(() => groupSettings(selectedCategory, settings), [selectedCategory, settings]);
  const dirtyCount = Object.keys(drafts).length;
  const selectedMeta = CATEGORIES.find((c) => c.value === selectedCategory) || CATEGORIES[0];

  const refreshBrandingCaches = (opts?: { revalidatePublic?: boolean }) => {
    queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    queryClient.invalidateQueries({ queryKey: ["settings", "branding"] });
    queryClient.refetchQueries({ queryKey: ["settings", "branding"] });
    if (!opts?.revalidatePublic) return;
    void fetch("/api/revalidate-branding", { method: "POST" }).catch(() => undefined);
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: (payload: Array<{ id: number; value?: string; is_active?: boolean }>) =>
      adminApi.settings.bulkUpdate(payload),
    onSuccess: () => {
      setDrafts({});
      refreshBrandingCaches({
        revalidatePublic: selectedCategory === "branding" || selectedCategory === "company",
      });
      toast({ title: "Saved", description: "Settings updated successfully" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(err, "Failed to update settings"),
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ settingId, file }: { settingId: number; file: File }) =>
      adminApi.settings.uploadFile(settingId, file),
    onSuccess: () => {
      refreshBrandingCaches({ revalidatePublic: true });
      toast({ title: "Uploaded", description: "Image updated successfully" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Upload failed",
        description: getUserFacingError(err, "Failed to upload image"),
        variant: "destructive",
      });
    },
  });

  const handleCategorySelect = (category: string) => {
    if (category === selectedCategory) return;
    if (dirtyCount > 0) {
      const discard = window.confirm(
        `You have ${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}. Discard them and switch tabs?`
      );
      if (!discard) return;
    }
    setDrafts({});
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (category === "company") params.delete("category");
    else params.set("category", category);
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, { scroll: false });
  };

  const valueFor = (setting: SystemSetting) => drafts[setting.id]?.value ?? setting.value ?? "";

  const updateDraft = (setting: SystemSetting, next: Draft) => {
    const currentValue = setting.value ?? "";
    const merged: Draft = { ...drafts[setting.id], ...next };
    const clean: Draft = {};
    if (merged.value !== undefined && merged.value !== currentValue) clean.value = merged.value;
    if (merged.is_active !== undefined && merged.is_active !== setting.is_active) clean.is_active = merged.is_active;

    setDrafts((prev) => {
      const rest = { ...prev };
      delete rest[setting.id];
      return Object.keys(clean).length ? { ...rest, [setting.id]: clean } : rest;
    });
  };

  const saveAll = () => {
    const payload = Object.entries(drafts).map(([id, draft]) => ({
      id: Number(id),
      ...draft,
    }));
    bulkUpdateMutation.mutate(payload);
  };

  const renderControl = (setting: SystemSetting) => {
    const value = valueFor(setting);
    const controlId = `setting-${setting.id}`;
    const dirty = drafts[setting.id]?.value !== undefined;

    if (isBooleanSetting(setting.key)) {
      return (
        <Switch
          id={controlId}
          checked={isTruthy(value)}
          onCheckedChange={(checked) => updateDraft(setting, { value: checked ? "true" : "false" })}
          disabled={!canManage}
        />
      );
    }

    if (SELECT_OPTIONS[setting.key]) {
      return (
        <Select
          value={value || undefined}
          onValueChange={(next) => updateDraft(setting, { value: next })}
          disabled={!canManage}
        >
          <SelectTrigger id={controlId} className={cn("h-10", dirty && "border-primary/40 ring-1 ring-primary/15")}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {SELECT_OPTIONS[setting.key].map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (isColorSetting(setting.key)) {
      return (
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border shadow-sm">
            <Input
              id={controlId}
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#1e4d6b"}
              onChange={(event) => updateDraft(setting, { value: event.target.value.toUpperCase() })}
              disabled={!canManage}
              className="absolute inset-0 h-full w-full cursor-pointer border-0 p-0"
              aria-label={`${labelFor(setting)} color picker`}
            />
          </div>
          <Input
            value={value}
            onChange={(event) => updateDraft(setting, { value: event.target.value.toUpperCase() })}
            disabled={!canManage}
            placeholder="#6366F1"
            className={cn("h-10 font-mono text-sm", dirty && "border-primary/40 ring-1 ring-primary/15")}
            aria-label={`${labelFor(setting)} hex value`}
          />
        </div>
      );
    }

    if (isImageSetting(setting.key)) {
      const previewSrc = imagePreviewSrc(value, setting.updated_at);
      const hasImage = Boolean(previewSrc);
      const isUploading = uploadMutation.isPending && uploadMutation.variables?.settingId === setting.id;

      return (
        <div className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-muted/15 p-3">
          <div className="flex h-16 w-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
            {hasImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewSrc} alt={labelFor(setting)} className="h-full w-full object-contain p-1.5" />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground/70" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm text-foreground">
              {hasImage ? "Ready" : value ? "Missing file — upload a new one" : "No image yet"}
            </p>
            <label
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-background px-3 text-sm font-medium shadow-sm ring-1 ring-border transition hover:bg-muted",
                (!canManage || isUploading) && "pointer-events-none opacity-50"
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              {isUploading ? "Uploading…" : hasImage ? "Replace" : "Upload"}
              <input
                id={controlId}
                type="file"
                accept={setting.key.includes("favicon") ? FAVICON_ACCEPT : IMAGE_ACCEPT}
                className="hidden"
                disabled={!canManage || isUploading}
                aria-label={`${hasImage ? "Replace" : "Upload"} ${labelFor(setting)}`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadMutation.mutate({ settingId: setting.id, file });
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      );
    }

    if (setting.is_secret) {
      return (
        <div className="relative">
          <Input
            id={controlId}
            type={visibleSecrets[setting.id] ? "text" : "password"}
            value={value}
            onChange={(event) => updateDraft(setting, { value: event.target.value })}
            disabled={!canManage}
            className={cn("h-10 pr-10", dirty && "border-primary/40 ring-1 ring-primary/15")}
            autoComplete="new-password"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
            onClick={() => setVisibleSecrets((prev) => ({ ...prev, [setting.id]: !prev[setting.id] }))}
            aria-label={visibleSecrets[setting.id] ? "Hide value" : "Show value"}
          >
            {visibleSecrets[setting.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      );
    }

    if (isLongTextSetting(setting.key, value)) {
      const isDocumentTerms = setting.key.includes("terms_and_conditions") || setting.key.includes("policy");
      return (
        <Textarea
          id={controlId}
          value={value}
          onChange={(event) => updateDraft(setting, { value: event.target.value })}
          disabled={!canManage}
          rows={isDocumentTerms ? 6 : 3}
          className={cn("min-h-[5rem] resize-y text-sm", dirty && "border-primary/40 ring-1 ring-primary/15")}
        />
      );
    }

    const numberLike = isNumberSetting(setting.key);
    const isOverlay = setting.key.includes("overlay");

    return (
      <Input
        id={controlId}
        type={numberLike ? "number" : setting.key.includes("email") ? "email" : "text"}
        value={value}
        min={isOverlay ? 0 : undefined}
        max={isOverlay ? 1 : undefined}
        step={isOverlay ? 0.05 : numberLike ? "any" : undefined}
        onChange={(event) => updateDraft(setting, { value: event.target.value })}
        disabled={!canManage}
        className={cn("h-10", dirty && "border-primary/40 ring-1 ring-primary/15")}
      />
    );
  };

  const renderField = (setting: SystemSetting) => {
    const label = labelFor(setting);
    const controlId = `setting-${setting.id}`;
    const isToggle = isBooleanSetting(setting.key);
    const isWide = isLongTextSetting(setting.key, valueFor(setting)) || isImageSetting(setting.key) || isToggle;

    if (isToggle) {
      return (
        <div
          key={setting.id}
          className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/10 px-4 py-3 sm:col-span-2"
        >
          <div className="min-w-0">
            <Label htmlFor={controlId} className="text-sm font-medium text-foreground">
              {label}
            </Label>
            {setting.description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{setting.description}</p>
            ) : null}
          </div>
          {renderControl(setting)}
        </div>
      );
    }

    return (
      <div key={setting.id} className={cn("space-y-2", isWide && "sm:col-span-2")}>
        <div>
          <Label htmlFor={controlId} className="text-sm font-medium text-foreground">
            {label}
          </Label>
          {setting.description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{setting.description}</p>
          ) : null}
        </div>
        {renderControl(setting)}
      </div>
    );
  };

  if (isLoading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const Icon = selectedMeta.icon;

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-9 w-9 shrink-0" aria-label="Go back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">Settings</h1>
              <p className="truncate text-xs text-muted-foreground">{selectedMeta.description}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/admin/settings/email-templates">
              <Button variant="outline" size="sm" className="hidden h-9 sm:inline-flex">
                <Mail className="mr-1.5 h-3.5 w-3.5" />
                Templates
              </Button>
            </Link>
            <Button
              size="sm"
              className="h-9"
              disabled={!canManage || dirtyCount === 0 || bulkUpdateMutation.isPending}
              onClick={saveAll}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {bulkUpdateMutation.isPending ? "Saving…" : dirtyCount ? `Save (${dirtyCount})` : "Save"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full gap-6 px-4 py-6 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-[4.25rem] lg:self-start">
          <nav
            className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:rounded-xl lg:border lg:border-border/80 lg:bg-background lg:p-2 lg:shadow-sm"
            aria-label="Settings categories"
          >
            {CATEGORIES.map((category) => {
              const selected = selectedCategory === category.value;
              const CatIcon = category.icon;
              return (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => handleCategorySelect(category.value)}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground shadow-sm lg:bg-primary/10 lg:text-primary lg:shadow-none"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <CatIcon className="h-4 w-4 shrink-0 opacity-80" />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 space-y-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 hidden h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">{selectedMeta.label}</h2>
                {isFetching && !isLoading ? (
                  <span className="text-xs text-muted-foreground">Refreshing…</span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {settings.length}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{selectedMeta.description}</p>
            </div>
          </div>

          {isError ? (
            <Card className="border-destructive/30 shadow-none">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="text-sm text-destructive">{getUserFacingError(error, "Failed to load settings")}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : settings.length === 0 ? (
            <Card className="shadow-none">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">No settings found.</CardContent>
            </Card>
          ) : (
            sections.map((section) => (
              <Card key={section.title} className="border-border/80 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">{section.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-5 sm:grid-cols-2">{section.settings.map(renderField)}</div>
                </CardContent>
              </Card>
            ))
          )}
        </main>
      </div>

      {dirtyCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden">
          <Button className="w-full" disabled={!canManage || bulkUpdateMutation.isPending} onClick={saveAll}>
            <Save className="mr-1.5 h-4 w-4" />
            Save {dirtyCount} change{dirtyCount === 1 ? "" : "s"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
