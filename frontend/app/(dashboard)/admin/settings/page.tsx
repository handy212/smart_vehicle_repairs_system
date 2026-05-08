"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useToast } from "@/lib/hooks/useToast";
import { cn } from "@/lib/utils";
import { ArrowLeft, Eye, EyeOff, Image as ImageIcon, Mail, Save, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const CATEGORIES = [
  { value: "company", label: "Company" },
  { value: "branding", label: "Branding" },
  { value: "email", label: "Email" },
  { value: "payment", label: "Billing" },
  { value: "notification", label: "Notifications" },
  { value: "security", label: "Security" },
  { value: "business", label: "Business" },
  { value: "tax", label: "Tax" },
  { value: "maintenance", label: "Maintenance" },
];

const SELECT_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  theme_mode: [
    { value: "perfex", label: "Light" },
    { value: "perfex-dark", label: "Dark" },
  ],
  sms_provider: [
    { value: "hubtel", label: "Hubtel" },
  ],
  payment_gateway: [
    { value: "paystack", label: "Paystack" },
  ],
  late_fee_type: [
    { value: "percentage", label: "Percentage" },
    { value: "fixed", label: "Fixed amount" },
  ],
  email_backend: [
    { value: "django.core.mail.backends.smtp.EmailBackend", label: "SMTP" },
    { value: "django.core.mail.backends.console.EmailBackend", label: "Console" },
  ],
  currency: [
    { value: "GHS", label: "GHS - Ghanaian Cedi" },
    { value: "USD", label: "USD - US Dollar" },
    { value: "NGN", label: "NGN - Nigerian Naira" },
    { value: "EUR", label: "EUR - Euro" },
    { value: "GBP", label: "GBP - British Pound" },
  ],
  currency_code: [
    { value: "USD", label: "USD - US Dollar" },
    { value: "GHS", label: "GHS - Ghanaian Cedi" },
    { value: "NGN", label: "NGN - Nigerian Naira" },
    { value: "EUR", label: "EUR - Euro" },
    { value: "GBP", label: "GBP - British Pound" },
  ],
  currency_symbol: [
    { value: "$", label: "$" },
    { value: "₵", label: "₵" },
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
    { value: "09:00-15:00", label: "09:00-15:00" },
    { value: "08:00-18:00", label: "08:00-18:00" },
  ],
  log_level: [
    { value: "DEBUG", label: "Debug" },
    { value: "INFO", label: "Info" },
    { value: "WARNING", label: "Warning" },
    { value: "ERROR", label: "Error" },
    { value: "CRITICAL", label: "Critical" },
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

function getApiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { detail?: string; error?: string; value?: string[] } } })?.response?.data;
  return data?.detail || data?.error || data?.value?.[0] || fallback;
}

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
  return /(enabled|require|is_|_enabled)$/i.test(key) || [
    "maintenance_mode",
    "online_booking_enabled",
    "allow_online_booking",
    "deposit_required",
    "require_deposit",
    "debug_mode",
  ].includes(key);
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
  return key.includes("address") || key.includes("footer") || key.includes("message") || value.length > 90;
}

function isNumberSetting(key: string) {
  return /(rate|amount|price|port|timeout|duration|max_|min_|length|attempts|days|hours|minutes|mb|size|retention|buffer|count|percentage)$/i.test(key);
}

function imageUrl(value: string) {
  if (!value) return "";
  if (/^https?:\/\//.test(value)) return value;
  return value.startsWith("/") ? value : `/media/${value}`;
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

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings", selectedCategory],
    queryFn: () => adminApi.settings.list({ category: selectedCategory }),
  });

  const settings = data?.results || [];
  const dirtyCount = Object.keys(drafts).length;

  const bulkUpdateMutation = useMutation({
    mutationFn: (payload: Array<{ id: number; value?: string; is_active?: boolean }>) =>
      adminApi.settings.bulkUpdate(payload),
    onSuccess: () => {
      setDrafts({});
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "branding"] });
      queryClient.refetchQueries({ queryKey: ["settings", "branding"] });
      toast({ title: "Saved", description: "Settings updated successfully" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getApiErrorMessage(error, "Failed to update settings"),
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ settingId, file }: { settingId: number; file: File }) =>
      adminApi.settings.uploadFile(settingId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "branding"] });
      queryClient.refetchQueries({ queryKey: ["settings", "branding"] });
      toast({ title: "Uploaded", description: "Image updated successfully" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Upload failed",
        description: getApiErrorMessage(error, "Failed to upload image"),
        variant: "destructive",
      });
    },
  });

  const selectedLabel = useMemo(
    () => CATEGORIES.find((category) => category.value === selectedCategory)?.label || "Settings",
    [selectedCategory]
  );

  const handleCategorySelect = (category: string) => {
    setDrafts({});
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (category === "company") params.delete("category");
    else params.set("category", category);
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, { scroll: false });
  };

  const valueFor = (setting: SystemSetting) => drafts[setting.id]?.value ?? setting.value ?? "";
  const activeFor = (setting: SystemSetting) => drafts[setting.id]?.is_active ?? setting.is_active;

  const updateDraft = (setting: SystemSetting, next: Draft) => {
    const currentValue = setting.value ?? "";
    const merged: Draft = {
      ...drafts[setting.id],
      ...next,
    };
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

  const renderValueControl = (setting: SystemSetting) => {
    const value = valueFor(setting);
    if (isBooleanSetting(setting.key)) {
      return (
        <Select
          value={isTruthy(value) ? "true" : "false"}
          onValueChange={(next) => updateDraft(setting, { value: next })}
          disabled={!canManage}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (SELECT_OPTIONS[setting.key]) {
      return (
        <Select
          value={value || SELECT_OPTIONS[setting.key][0]?.value}
          onValueChange={(next) => updateDraft(setting, { value: next })}
          disabled={!canManage}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
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
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={value || "#000000"}
            onChange={(event) => updateDraft(setting, { value: event.target.value })}
            disabled={!canManage}
            className="h-8 w-12 p-1"
          />
          <Input
            value={value}
            onChange={(event) => updateDraft(setting, { value: event.target.value.toUpperCase() })}
            disabled={!canManage}
            className="h-8 font-mono text-xs"
          />
        </div>
      );
    }

    if (isImageSetting(setting.key)) {
      return (
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl(value)} alt={labelFor(setting)} className="h-full w-full object-contain p-1" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-foreground">
              {value ? "Image uploaded" : "No image selected"}
            </div>
            <label className={cn(
              "mt-1 inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted",
              !canManage && "pointer-events-none opacity-50"
            )}>
              <Upload className="h-3.5 w-3.5" />
              Replace
              <input
                type="file"
                accept={setting.key.includes("favicon") ? ".ico,.png,.svg" : "image/*"}
                className="hidden"
                disabled={!canManage}
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
        <div className="flex items-center gap-2">
          <Input
            type={visibleSecrets[setting.id] ? "text" : "password"}
            value={value}
            onChange={(event) => updateDraft(setting, { value: event.target.value })}
            disabled={!canManage}
            className="h-8 text-xs"
            autoComplete="new-password"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setVisibleSecrets((prev) => ({ ...prev, [setting.id]: !prev[setting.id] }))}
            title={visibleSecrets[setting.id] ? "Hide value" : "Show value"}
          >
            {visibleSecrets[setting.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        </div>
      );
    }

    if (isLongTextSetting(setting.key, value)) {
      return (
        <Textarea
          value={value}
          onChange={(event) => updateDraft(setting, { value: event.target.value })}
          disabled={!canManage}
          rows={2}
          className="min-h-16 text-xs"
        />
      );
    }

    return (
      <Input
        type={isNumberSetting(setting.key) ? "number" : setting.key.includes("email") ? "email" : "text"}
        value={value}
        onChange={(event) => updateDraft(setting, { value: event.target.value })}
        disabled={!canManage}
        className="h-8 text-xs"
      />
    );
  };

  if (isLoading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Settings</h1>
            <p className="text-xs text-muted-foreground">{selectedLabel} configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/settings/email-templates">
            <Button variant="outline" size="sm" className="h-8">
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              Templates
            </Button>
          </Link>
          <Button
            size="sm"
            className="h-8"
            disabled={!canManage || dirtyCount === 0 || bulkUpdateMutation.isPending}
            onClick={saveAll}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save Changes{dirtyCount ? ` (${dirtyCount})` : ""}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[180px_1fr]">
        <Card className="h-fit border-border shadow-sm">
          <CardContent className="p-2">
            <div className="space-y-1">
              {CATEGORIES.map((category) => (
                <button
                  key={category.value}
                  onClick={() => handleCategorySelect(category.value)}
                  className={cn(
                    "flex h-8 w-full items-center rounded-md px-2 text-left text-xs font-medium",
                    selectedCategory === category.value
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <div className="text-sm font-semibold text-foreground">{selectedLabel}</div>
              <div className="text-xs text-muted-foreground">{data?.count || settings.length} settings</div>
            </div>

            {settings.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No settings found.</div>
            ) : (
              <div className="divide-y divide-border">
                {settings.map((setting) => (
                  <div key={setting.id} className="grid gap-3 px-4 py-3 md:grid-cols-[240px_1fr_90px]">
                    <div className="flex min-w-0 items-center">
                      <div className="truncate text-sm font-medium text-foreground" title={labelFor(setting)}>
                        {labelFor(setting)}
                      </div>
                    </div>
                    <div>{renderValueControl(setting)}</div>
                    <div className="flex items-center justify-end gap-2">
                      <Checkbox
                        checked={activeFor(setting)}
                        disabled={!canManage}
                        onCheckedChange={(checked) => updateDraft(setting, { is_active: Boolean(checked) })}
                        className="h-4 w-4"
                      />
                      <span className="text-xs text-muted-foreground">Active</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
