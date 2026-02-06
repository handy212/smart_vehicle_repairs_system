"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Save, Trash2, Eye, EyeOff, Info, Upload, Image as ImageIcon, Award, Tag } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { billingApi } from "@/lib/api/billing";
import { usePermissions } from "@/lib/hooks/usePermissions";

const CATEGORIES: Array<{ value: string; label: string; link?: string }> = [
  { value: "company", label: "Company Info" },
  { value: "branding", label: "Branding" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "payment", label: "Billing" },
  { value: "notification", label: "Notifications" },
  { value: "security", label: "Security" },
  { value: "business", label: "Business" },
  { value: "tax", label: "Tax" },
  { value: "integration", label: "Integrations" },
  { value: "maintenance", label: "Maintenance" },
];

export default function SystemSettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("manage_settings");
  const initialCategory = searchParams?.get("category") || "company";
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [showSecret, setShowSecret] = useState<Record<number, boolean>>({});
  const [showIntegrationAdvanced, setShowIntegrationAdvanced] = useState(false);
  const [showIntegrationKeys, setShowIntegrationKeys] = useState(false);
  const [rowEdits, setRowEdits] = useState<
    Record<number, Partial<Pick<SystemSetting, "value">>>
  >({});

  useEffect(() => {
    const category = searchParams?.get("category") || "company";
    if (category !== selectedCategory) {
      setSelectedCategory(category);
    }
  }, [searchParams, selectedCategory]);

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ["admin", "settings", selectedCategory],
    queryFn: () => adminApi.settings.list({ category: selectedCategory }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SystemSetting> }) =>
      adminApi.settings.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      toast({
        title: "Success",
        description: "Setting updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update setting",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.settings.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["settings", selectedCategory] });
      queryClient.invalidateQueries({ queryKey: ["settings", "branding"] });
      toast({
        title: "Success",
        description: "Setting deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete setting",
        variant: "destructive",
      });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: ({ settingId, file }: { settingId: number; file: File }) =>
      adminApi.settings.uploadFile(settingId, file),
    onSuccess: (data, variables) => {
      // Invalidate and refetch queries to update UI immediately
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", selectedCategory] });
      queryClient.invalidateQueries({ queryKey: ["settings", "branding"] });
      // Force refetch branding settings to update navbar immediately
      queryClient.refetchQueries({ queryKey: ["settings", "branding"] });

      // Update the row edit with the new file path
      setRowEdits((prev) => ({
        ...prev,
        [variables.settingId]: { value: data.file_path },
      }));
      toast({
        title: "File uploaded",
        description: "The file has been uploaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.response?.data?.error || "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (setting: SystemSetting) => {
    if (confirm(`Are you sure you want to delete setting "${setting.key}"?`)) {
      deleteMutation.mutate(setting.id);
    }
  };

  const toggleSecretVisibility = (id: number) => {
    setShowSecret((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getRowValue = (setting: SystemSetting) =>
    rowEdits[setting.id]?.value ?? setting.value ?? "";

  const handleRowChange = (
    setting: SystemSetting,
    updates: Partial<Pick<SystemSetting, "value">>
  ) => {
    setRowEdits((prev) => {
      const prevEntry = prev[setting.id] || {};
      const mergedValue =
        updates.value !== undefined ? updates.value : prevEntry.value;

      const diff: Partial<Pick<SystemSetting, "value">> = {};
      if (mergedValue !== undefined && mergedValue !== (setting.value ?? "")) {
        diff.value = mergedValue;
      }

      if (Object.keys(diff).length === 0) {
        const { [setting.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [setting.id]: diff };
    });
  };

  const validateSetting = (setting: SystemSetting, value: string): string | null => {
    // Email validation
    if (setting.key.includes('email') && value && !value.includes('')) {
      // Basic check, allows empty
    }

    // Numeric validation
    if (setting.key.match(/(rate|amount|price|timeout|duration|max_|min_|port)/i) && value) {
      if (isNaN(Number(value))) {
        return 'Must be a numeric value';
      }
      if (Number(value) < 0 && setting.key.match(/(rate|amount|price|timeout|duration)/i)) {
        return 'Must be a positive number';
      }
    }

    // Boolean validation
    if (setting.key.match(/(enabled|require|is_)/i) && value) {
      const lower = value.toLowerCase();
      if (!['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(lower)) {
        return 'Must be true/false, yes/no, or 1/0';
      }
    }

    return null;
  };

  const handleSaveRow = async (id: number) => {
    const payload = rowEdits[id];
    if (!payload) return;

    const setting = settings.find(s => s.id === id);
    if (!setting) return;

    // Validate if value is being changed
    if (payload.value !== undefined) {
      const error = validateSetting(setting, payload.value);
      if (error) {
        toast({
          title: "Validation Error",
          description: error,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      await updateMutation.mutateAsync({ id, data: payload });
      setRowEdits((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.response?.data?.value?.[0] || "Failed to update setting";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleActiveToggle = async (setting: SystemSetting, checked: boolean) => {
    if (setting.is_active === checked) return;
    try {
      await updateMutation.mutateAsync({ id: setting.id, data: { is_active: checked } });
    } catch (error) {
      // handled by mutation toast
    }
  };

  const settings = settingsData?.results || [];

  const recaptchaSettings =
    selectedCategory === "integration"
      ? settings.filter((s) => s.key.startsWith("recaptcha_"))
      : [];

  const firebaseSettings =
    selectedCategory === "integration"
      ? settings.filter((s) => s.key.startsWith("firebase_"))
      : [];

  const analyticsSettings =
    selectedCategory === "integration"
      ? settings.filter((s) =>
        /(google_analytics|facebook_pixel|google_tag_manager|gtm|pixel)/i.test(s.key)
      )
      : [];

  const analyticsSettingIds = new Set(analyticsSettings.map((s) => s.id));

  const tableSettings =
    selectedCategory === "integration"
      ? settings.filter(
        (s) =>
          !s.key.startsWith("recaptcha_") &&
          !s.key.startsWith("firebase_") &&
          !analyticsSettingIds.has(s.id)
      )
      : settings;

  const discardRowEdits = (id: number) => {
    setRowEdits((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };

  const humanizeKey = (key: string, prefix = "") => {
    const cleaned = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
    return cleaned.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const isTruthy = (val: unknown) => {
    if (typeof val === "boolean") return val;
    const str = String(val ?? "").toLowerCase().trim();
    return str === "true" || str === "1" || str === "yes" || str === "on";
  };

  const renderIntegrationField = (
    setting: SystemSetting,
    opts?: { prefix?: string; showKey?: boolean }
  ) => {
    const prefix = opts?.prefix ?? "";
    const showKey = opts?.showKey ?? false;
    const pendingChanges = !!rowEdits[setting.id];
    const label = setting.display_name || humanizeKey(setting.key, prefix);
    const value = getRowValue(setting);
    const isEnabledToggle = setting.key.match(/(enabled)$/i);

    return (
      <div key={setting.id} className="py-2.5 first:pt-0 last:pb-0 border-b last:border-0 border-border">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-medium text-sm text-foreground">{label}</div>
            {setting.description ? (
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                {setting.description}
              </div>
            ) : null}
            {showKey ? (
              <div className="text-[9px] text-muted-foreground font-mono mt-0.5">
                {setting.key}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[10px] text-muted-foreground">Active</span>
            <Checkbox
              checked={setting.is_active}
              onCheckedChange={(checked) => handleActiveToggle(setting, Boolean(checked))}
              disabled={updateMutation.isPending || !canManage}
              className="h-3.5 w-3.5"
            />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-start">
          <div className="space-y-1">
            {isEnabledToggle ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={isTruthy(value)}
                  onCheckedChange={(checked) =>
                    handleRowChange(setting, { value: checked ? "true" : "false" })
                  }
                  disabled={!canManage}
                  className="h-4 w-4"
                />
                <span className="text-xs text-muted-foreground font-medium">
                  {isTruthy(value) ? "Enabled" : "Disabled"}
                </span>
              </div>
            ) : (
              <div className="relative">
                <Input
                  data-setting-id={setting.id}
                  type={setting.is_secret && !showSecret[setting.id] ? "password" : "text"}
                  value={value}
                  onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                  placeholder={setting.is_secret ? "Enter secret value" : "Enter value"}
                  className={`h-8 text-sm ${setting.is_secret ? "pr-8" : ""}`}
                  disabled={!canManage}
                />
                {setting.is_secret && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1/2 right-1 -translate-y-1/2 h-6 w-6"
                    onClick={() => toggleSecretVisibility(setting.id)}
                  >
                    {showSecret[setting.id] ? (
                      <EyeOff className="w-3 h-3 text-gray-400" />
                    ) : (
                      <Eye className="w-3 h-3 text-gray-400" />
                    )}
                  </Button>
                )}
              </div>
            )}

            {rowEdits[setting.id]?.value !== undefined &&
              (() => {
                const error = validateSetting(setting, rowEdits[setting.id]!.value || "");
                return error ? (
                  <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p>
                ) : null;
              })()}
          </div>

          <div className="flex items-center justify-end gap-2">
            {pendingChanges ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => discardRowEdits(setting.id)}
                  disabled={updateMutation.isPending}
                  className="h-7 text-xs px-2"
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  disabled={
                    updateMutation.isPending ||
                    (() => {
                      const error =
                        rowEdits[setting.id]?.value !== undefined
                          ? validateSetting(setting, rowEdits[setting.id]!.value || "")
                          : null;
                      return !!error;
                    })()
                  }
                  onClick={() => handleSaveRow(setting.id)}
                  className="bg-primary hover:bg-primary/90 text-white h-7 text-xs px-2"
                >
                  <Save className="w-3 h-3 mr-1" />
                  Save
                </Button>
              </>
            ) : (
              <span className="text-[10px] text-gray-300 dark:text-gray-600 italic px-2">Saved</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (category === "company") {
      params.delete("category");
    } else {
      params.set("category", category);
    }
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, { scroll: false });
  };

  if (isLoading && !settingsData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
              <Link href="/admin" className="hover:text-primary transition-colors">Admin</Link>
              <span>/</span>
              <span className="text-foreground font-medium">Settings</span>
            </div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">System Configuration</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/settings/skills">
            <Button variant="outline" size="sm">
              <Award className="h-4 w-4 mr-2" />
              Skills
            </Button>
          </Link>
          <Link href="/admin/settings/asset-categories">
            <Button variant="outline" size="sm">
              <Tag className="h-4 w-4 mr-2" />
              Asset Categories
            </Button>
          </Link>
          <Link href="/admin/settings/email-templates">
            <Button variant="outline" size="sm">
              Email Templates
            </Button>
          </Link>
        </div>
      </div>

      {/* Settings Count Badge */}
      <div className="px-4">
        {settingsData && (
          <div className="text-xs text-gray-500 bg-border px-2.5 py-1 rounded-full border border-border inline-block">
            {settingsData.count} settings
          </div>
        )}
      </div>

      {/* Category Filter */}
      <div className="px-4 overflow-x-auto pb-1 scrollbar-hide">
        <div className="flex gap-1.5 min-w-max">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.value;
            return (
              <button
                key={cat.value}
                onClick={() => handleCategorySelect(cat.value)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${isSelected
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-muted border-border text-foreground dark:hover:bg-gray-700"
                  }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4">
        {selectedCategory === "tax" && <TaxInfoBanner />}

        {/* Info Banner for Company Settings */}
        {selectedCategory === "company" && (
          <Card className="mb-4 border-orange-100 bg-primary/5 dark:bg-orange-900/10 dark:border-orange-800/30 shadow-none">
            <CardContent className="p-3">
              <div className="flex items-start space-x-2">
                <Info className="w-4 h-4 text-primary dark:text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-orange-800 dark:text-orange-200 leading-relaxed">
                  <strong>Company Information:</strong> These settings are used throughout the application, including in emails, invoices, and notifications.
                  Make sure to keep this information up to date. Changes take effect immediately.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings List */}
        <Card className="shadow-sm border border-border">
          <CardHeader className="py-3 px-4 border-b bg-gray-50/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">
                {CATEGORIES.find((c) => c.value === selectedCategory)?.label} Settings
              </CardTitle>
              {selectedCategory === "integration" ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => setShowIntegrationKeys((v) => !v)}
                  >
                    {showIntegrationKeys ? "Hide keys" : "Show keys"}
                  </Button>
                  {tableSettings.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => setShowIntegrationAdvanced((v) => !v)}
                    >
                      {showIntegrationAdvanced
                        ? "Hide advanced"
                        : `Advanced (${tableSettings.length})`}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {settings.length > 0 ? (
              <div className="p-4 space-y-6">
                {selectedCategory === "integration" ? (
                  <div className="text-xs text-gray-500 mb-2">
                    Configure third‑party services used by the app.
                  </div>
                ) : null}

                {selectedCategory === "integration" &&
                  (recaptchaSettings.length > 0 || firebaseSettings.length > 0) ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {recaptchaSettings.length > 0 ? (
                      <Card className="border shadow-none">
                        <CardHeader className="py-2.5 px-3 bg-gray-50/50 border-b">
                          <CardTitle className="text-xs font-semibold text-foreground">
                            Google reCAPTCHA
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3">
                          <div className="flex flex-col gap-0">
                            {recaptchaSettings.map((s) =>
                              renderIntegrationField(s, {
                                prefix: "recaptcha_",
                                showKey: showIntegrationKeys,
                              })
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}

                    {firebaseSettings.length > 0 ? (
                      <Card className="border shadow-none">
                        <CardHeader className="py-2.5 px-3 bg-gray-50/50 border-b">
                          <CardTitle className="text-xs font-semibold text-foreground">
                            Firebase Messaging
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3">
                          <div className="flex flex-col gap-0">
                            {firebaseSettings.map((s) =>
                              renderIntegrationField(s, {
                                prefix: "firebase_",
                                showKey: showIntegrationKeys,
                              })
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}

                    {analyticsSettings.length > 0 ? (
                      <Card className="border shadow-none">
                        <CardHeader className="py-2.5 px-3 bg-gray-50/50 border-b">
                          <CardTitle className="text-xs font-semibold text-foreground">
                            Analytics
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3">
                          <div className="flex flex-col gap-0">
                            {analyticsSettings.map((s) =>
                              renderIntegrationField(s, { showKey: showIntegrationKeys })
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}
                  </div>
                ) : null}

                {(selectedCategory !== "integration" || showIntegrationAdvanced) &&
                  tableSettings.length > 0 && (
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50/80 text-[10px] uppercase text-gray-500 font-semibold border-b border-gray-100">
                          <tr>
                            <th className="px-4 py-2 w-1/4">Setting</th>
                            <th className="px-4 py-2">Value</th>
                            <th className="px-4 py-2 w-20 text-center">Active</th>
                            <th className="px-4 py-2 w-32 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                          {tableSettings.map((setting) => {
                            const pendingChanges = !!rowEdits[setting.id];
                            return (
                              <tr key={setting.id} className="group hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3 align-top">
                                  <div className="space-y-0.5">
                                    <div className="text-xs font-medium text-foreground">
                                      {setting.display_name || setting.key}
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-mono tracking-tight">
                                      {setting.key}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-2 align-top">
                                  <div className="max-w-xl">
                                    {/* Boolean/Toggle Settings - Use Checkbox */}
                                    {setting.key.match(/(enabled|require|is_|_enabled)$/i) ||
                                      ['maintenance_mode', 'online_booking_enabled', 'allow_online_booking',
                                        'deposit_required', 'require_deposit', 'two_factor_enabled', 'require_2fa',
                                        'debug_mode', 'backup_enabled', 'notification_email_enabled',
                                        'notification_sms_enabled', 'notification_push_enabled'].includes(setting.key) ? (
                                      <div className="flex items-center gap-2 mt-1">
                                        <Checkbox
                                          checked={(() => {
                                            const val = getRowValue(setting);
                                            if (typeof val === 'boolean') return val;
                                            const str = String(val).toLowerCase().trim();
                                            return str === 'true' || str === '1' || str === 'yes' || str === 'on';
                                          })()}
                                          onCheckedChange={(checked) =>
                                            handleRowChange(setting, { value: checked ? 'true' : 'false' })
                                          }
                                          disabled={!canManage}
                                          className="h-4 w-4"
                                        />
                                        <span className="text-xs text-muted-foreground font-medium">
                                          {(() => {
                                            const val = getRowValue(setting);
                                            if (typeof val === 'boolean') return val ? 'Enabled' : 'Disabled';
                                            const str = String(val).toLowerCase().trim();
                                            return (str === 'true' || str === '1' || str === 'yes' || str === 'on') ? 'Enabled' : 'Disabled';
                                          })()}
                                        </span>
                                      </div>
                                    ) : /* Theme Mode - Dropdown */
                                      setting.key === 'theme_mode' ? (
                                        <Select
                                          value={getRowValue(setting) || 'light'}
                                          onValueChange={(val) => handleRowChange(setting, { value: val })}
                                          disabled={!canManage}
                                        >
                                          <SelectTrigger className="w-full h-8 text-xs bg-white">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="light">Light</SelectItem>
                                            <SelectItem value="dark">Dark</SelectItem>
                                            <SelectItem value="auto">Auto (System Preference)</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      ) : /* SMS Provider - Dropdown */
                                        setting.key === 'sms_provider' ? (
                                          <Select
                                            value={getRowValue(setting) || 'hubtel'}
                                            onValueChange={(val) => handleRowChange(setting, { value: val })}
                                            disabled={!canManage}
                                          >
                                            <SelectTrigger className="w-full h-8 text-xs bg-white">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="hubtel">Hubtel</SelectItem>
                                              <SelectItem value="twilio">Twilio</SelectItem>
                                              <SelectItem value="africastalking">Africastalking</SelectItem>
                                              <SelectItem value="other">Other</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        ) : /* Email Backend - Dropdown */
                                          setting.key === 'email_backend' || setting.key.match(/email_backend/i) ? (
                                            <Select
                                              value={getRowValue(setting) || 'smtp'}
                                              onValueChange={(val) => handleRowChange(setting, { value: val })}
                                              disabled={!canManage}
                                            >
                                              <SelectTrigger className="w-full h-8 text-xs bg-white">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="smtp">SMTP</SelectItem>
                                                <SelectItem value="sendgrid">SendGrid</SelectItem>
                                                <SelectItem value="mailgun">Mailgun</SelectItem>
                                                <SelectItem value="ses">Amazon SES</SelectItem>
                                                <SelectItem value="django.core.mail.backends.smtp.EmailBackend">Django SMTP Backend</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          ) : /* Payment Gateway - Dropdown */
                                            setting.key === 'payment_gateway' ? (
                                              <Select
                                                value={getRowValue(setting) || ''}
                                                onValueChange={(val) => handleRowChange(setting, { value: val })}
                                                disabled={!canManage}
                                              >
                                                <SelectTrigger className="w-full h-8 text-xs bg-white">
                                                  <SelectValue placeholder="None" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="none">None</SelectItem>
                                                  <SelectItem value="stripe">Stripe</SelectItem>
                                                  <SelectItem value="paypal">PayPal</SelectItem>
                                                  <SelectItem value="square">Square</SelectItem>
                                                  <SelectItem value="other">Other</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            ) : /* Late Fee Type - Dropdown */
                                              setting.key === 'late_fee_type' ? (
                                                <Select
                                                  value={getRowValue(setting) || 'percentage'}
                                                  onValueChange={(val) => handleRowChange(setting, { value: val })}
                                                  disabled={!canManage}
                                                >
                                                  <SelectTrigger className="w-full h-8 text-xs bg-white">
                                                    <SelectValue />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                                                    <SelectItem value="percentage">Percentage</SelectItem>
                                                  </SelectContent>
                                                </Select>
                                              ) : /* Currency - Dropdown */
                                                setting.key === 'currency' ? (
                                                  <Select
                                                    value={getRowValue(setting) || 'USD'}
                                                    onValueChange={(val) => {
                                                      handleRowChange(setting, { value: val });
                                                      // Auto-update currency_symbol when currency changes
                                                      const currencyToSymbol: Record<string, string> = {
                                                        'USD': '$',
                                                        'EUR': '€',
                                                        'GBP': '£',
                                                        'GHS': '₵',
                                                        'NGN': '₦',
                                                        'KES': 'KSh',
                                                        'ZAR': 'R',
                                                        'CAD': 'CA$',
                                                        'AUD': 'A$',
                                                        'JPY': '¥',
                                                      };
                                                      const symbolSetting = settings.find(s => s.key === 'currency_symbol');
                                                      if (symbolSetting) {
                                                        handleRowChange(symbolSetting, { value: currencyToSymbol[val] || '$' });
                                                      }
                                                    }}
                                                    disabled={!canManage}
                                                  >
                                                    <SelectTrigger className="w-full h-8 text-xs bg-white">
                                                      <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      <SelectItem value="USD">USD - US Dollar</SelectItem>
                                                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                                                      <SelectItem value="GBP">GBP - British Pound</SelectItem>
                                                      <SelectItem value="GHS">GHS - Ghanaian Cedi</SelectItem>
                                                      <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                                                      <SelectItem value="KES">KES - Kenyan Shilling</SelectItem>
                                                      <SelectItem value="ZAR">ZAR - South African Rand</SelectItem>
                                                      <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                                                      <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                                                      <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                                                    </SelectContent>
                                                  </Select>
                                                ) : /* Currency Symbol - Dropdown */
                                                  setting.key === 'currency_symbol' ? (
                                                    <Select
                                                      value={getRowValue(setting) || '$'}
                                                      onValueChange={(val) => handleRowChange(setting, { value: val })}
                                                      disabled={!canManage}
                                                    >
                                                      <SelectTrigger className="w-full h-8 text-xs bg-white">
                                                        <SelectValue />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                        <SelectItem value="$">$ - Dollar</SelectItem>
                                                        <SelectItem value="€">€ - Euro</SelectItem>
                                                        <SelectItem value="£">£ - Pound</SelectItem>
                                                        <SelectItem value="₵">₵ - Cedi</SelectItem>
                                                        <SelectItem value="₦">₦ - Naira</SelectItem>
                                                        <SelectItem value="KSh">KSh - Shilling</SelectItem>
                                                        <SelectItem value="R">R - Rand</SelectItem>
                                                        <SelectItem value="CA$">CA$ - Canadian Dollar</SelectItem>
                                                        <SelectItem value="A$">A$ - Australian Dollar</SelectItem>
                                                        <SelectItem value="¥">¥ - Yen/Yuan</SelectItem>
                                                      </SelectContent>
                                                    </Select>
                                                  ) : /* Log Level - Dropdown */
                                                    setting.key === 'log_level' ? (
                                                      <Select
                                                        value={getRowValue(setting) || 'INFO'}
                                                        onValueChange={(val) => handleRowChange(setting, { value: val })}
                                                        disabled={!canManage}
                                                      >
                                                        <SelectTrigger className="w-full h-8 text-xs bg-white">
                                                          <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                          <SelectItem value="DEBUG">DEBUG</SelectItem>
                                                          <SelectItem value="INFO">INFO</SelectItem>
                                                          <SelectItem value="WARNING">WARNING</SelectItem>
                                                          <SelectItem value="ERROR">ERROR</SelectItem>
                                                          <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                                                        </SelectContent>
                                                      </Select>
                                                    ) : /* Backup Frequency - Dropdown */
                                                      setting.key === 'backup_frequency' ? (
                                                        <Select
                                                          value={getRowValue(setting) || 'daily'}
                                                          onValueChange={(val) => handleRowChange(setting, { value: val })}
                                                          disabled={!canManage}
                                                        >
                                                          <SelectTrigger className="w-full h-8 text-xs bg-white">
                                                            <SelectValue />
                                                          </SelectTrigger>
                                                          <SelectContent>
                                                            <SelectItem value="daily">Daily</SelectItem>
                                                            <SelectItem value="weekly">Weekly</SelectItem>
                                                            <SelectItem value="monthly">Monthly</SelectItem>
                                                          </SelectContent>
                                                        </Select>
                                                      ) : /* Color inputs */
                                                        setting.key.match(/(primary_color|secondary_color|success_color|danger_color|warning_color|info_color)/i) ? (
                                                          <div className="flex items-center gap-2">
                                                            <Input
                                                              type="color"
                                                              value={getRowValue(setting) || '#000000'}
                                                              onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                                              className="h-8 w-12 p-0.5 cursor-pointer"
                                                              disabled={!canManage}
                                                            />
                                                            <Input
                                                              type="text"
                                                              value={getRowValue(setting) || ''}
                                                              onChange={(e) => handleRowChange(setting, { value: e.target.value.toUpperCase() })}
                                                              placeholder="#000000"
                                                              className="flex-1 font-mono h-8 text-xs"
                                                              pattern="^#[0-9A-Fa-f]{6}$"
                                                              maxLength={7}
                                                              disabled={!canManage}
                                                            />
                                                          </div>
                                                        ) : /* Image path inputs */
                                                          setting.key.match(/(logo_path|logo_dark_path|favicon_path|.*_background)/i) ? (
                                                            <div className="space-y-2">
                                                              <div className="flex items-center gap-2">
                                                                <Input
                                                                  data-setting-id={setting.id}
                                                                  type="text"
                                                                  value={getRowValue(setting)}
                                                                  onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                                                  placeholder="Path to image file"
                                                                  className="flex-1 h-8 text-xs bg-gray-50/50"
                                                                  disabled={!canManage}
                                                                />
                                                                <Button
                                                                  type="button"
                                                                  variant="secondary"
                                                                  size="sm"
                                                                  onClick={() => {
                                                                    const input = document.createElement('input');
                                                                    input.type = 'file';
                                                                    input.accept = setting.key.includes('favicon') ? '.ico,.png,.svg' : 'image/*';
                                                                    input.onchange = (e) => {
                                                                      const file = (e.target as HTMLInputElement).files?.[0];
                                                                      if (file) {
                                                                        uploadFileMutation.mutate({ settingId: setting.id, file });
                                                                      }
                                                                    };
                                                                    input.click();
                                                                  }}
                                                                  disabled={uploadFileMutation.isPending || !canManage}
                                                                  className="flex-shrink-0 h-8 px-2"
                                                                >
                                                                  <Upload className="w-3.5 h-3.5 mr-1" />
                                                                  {uploadFileMutation.isPending ? "..." : "Upload"}
                                                                </Button>
                                                              </div>
                                                              {getRowValue(setting) && (
                                                                <div className="space-y-1">
                                                                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                    <ImageIcon className="w-3 h-3" />
                                                                    Current: {getRowValue(setting)}
                                                                  </div>
                                                                  {getRowValue(setting).startsWith('branding/') && (
                                                                    <img
                                                                      src={`/media/${getRowValue(setting)}?t=${Date.now()}`}
                                                                      alt={setting.key}
                                                                      key={getRowValue(setting)}
                                                                      className="h-10 w-auto object-contain border rounded p-1"
                                                                      onError={(e) => {
                                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                                      }}
                                                                    />
                                                                  )}
                                                                </div>
                                                              )}
                                                            </div>
                                                          ) : /* Overlay opacity - Range slider */
                                                            setting.key === 'login_background_overlay' ? (
                                                              <div className="space-y-1">
                                                                <Input
                                                                  type="range"
                                                                  min="0"
                                                                  max="1"
                                                                  step="0.05"
                                                                  value={getRowValue(setting) || '0.85'}
                                                                  onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                                                  className="w-full h-6"
                                                                  disabled={!canManage}
                                                                />
                                                                <div className="flex items-center justify-between text-[10px] text-gray-400">
                                                                  <span>0</span>
                                                                  <span className="font-medium text-gray-600">{getRowValue(setting) || '0.85'}</span>
                                                                  <span>1</span>
                                                                </div>
                                                              </div>
                                                            ) : /* Time inputs */
                                                              setting.key.match(/(quiet_hours|business_hours)/i) ? (
                                                                <Input
                                                                  data-setting-id={setting.id}
                                                                  type="text"
                                                                  value={getRowValue(setting)}
                                                                  onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                                                  placeholder={setting.key.includes('hours') ? "HH:MM-HH:MM or 'Closed'" : "HH:MM"}
                                                                  className="font-mono h-8 text-xs"
                                                                  pattern={setting.key.includes('hours') ? "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]-([0-1]?[0-9]|2[0-3]):[0-5][0-9]$|^Closed$" : "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"}
                                                                  disabled={!canManage}
                                                                />
                                                              ) : /* Phone number */
                                                                setting.key.match(/(phone|sms_test_number|whatsapp)/i) ? (
                                                                  <Input
                                                                    data-setting-id={setting.id}
                                                                    type="tel"
                                                                    value={getRowValue(setting)}
                                                                    onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                                                    placeholder="+1234567890"
                                                                    className="h-8 text-xs"
                                                                    disabled={!canManage}
                                                                  />
                                                                ) : /* Percentage fields */
                                                                  setting.key.match(/(rate|percentage|deposit_percentage|late_fee_percentage|tax_.*_rate)/i) ? (
                                                                    <div className="relative">
                                                                      <Input
                                                                        data-setting-id={setting.id}
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        max={setting.key.match(/(deposit_percentage|percentage)/i) ? "100" : undefined}
                                                                        value={getRowValue(setting)}
                                                                        onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                                                        className="pr-6 h-8 text-xs"
                                                                        disabled={!canManage}
                                                                      />
                                                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
                                                                    </div>
                                                                  ) : /* Default input */
                                                                    (
                                                                      <div className="relative">
                                                                        <Input
                                                                          data-setting-id={setting.id}
                                                                          type={
                                                                            setting.is_secret && !showSecret[setting.id]
                                                                              ? "password"
                                                                              : setting.key.includes("email")
                                                                                ? "email"
                                                                                : setting.key.includes("url") || setting.key.includes("website")
                                                                                  ? "url"
                                                                                  : setting.key.match(/(rate|amount|price|port|timeout|duration|max_|min_|length|attempts|days|hours|minutes|mb|size|retention|buffer|count)/i)
                                                                                    ? "number"
                                                                                    : "text"
                                                                          }
                                                                          value={getRowValue(setting)}
                                                                          onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                                                          min={setting.key.match(/(length|attempts|timeout|retention|buffer|count)/i) ? "0" : undefined}
                                                                          step={setting.key.match(/(rate|percentage|amount|price)/i) ? "0.01" : setting.key.match(/(duration|buffer|timeout)/i) ? "1" : undefined}
                                                                          className={`h-8 text-xs bg-white ${setting.is_secret ? "pr-8" : ""} ${rowEdits[setting.id]?.value !== undefined &&
                                                                            validateSetting(setting, rowEdits[setting.id]!.value || "")
                                                                            ? "border-red-500 focus-visible:ring-red-500"
                                                                            : ""
                                                                            }`}
                                                                          placeholder={setting.is_secret ? "Enter secret" : "Value"}
                                                                          disabled={!canManage}
                                                                        />
                                                                        {setting.is_secret && (
                                                                          <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="absolute top-1/2 right-0.5 -translate-y-1/2 h-7 w-7"
                                                                            onClick={() => toggleSecretVisibility(setting.id)}
                                                                          >
                                                                            {showSecret[setting.id] ? (
                                                                              <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                                                                            ) : (
                                                                              <Eye className="w-3.5 h-3.5 text-gray-400" />
                                                                            )}
                                                                          </Button>
                                                                        )}
                                                                      </div>
                                                                    )}
                                    {rowEdits[setting.id]?.value !== undefined &&
                                      (() => {
                                        const error = validateSetting(setting, rowEdits[setting.id]!.value || "");
                                        return error ? (
                                          <p className="text-[10px] text-red-600 mt-1">{error}</p>
                                        ) : null;
                                      })()}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-center align-top pt-3">
                                  <Checkbox
                                    checked={setting.is_active}
                                    onCheckedChange={(checked) =>
                                      handleActiveToggle(setting, Boolean(checked))
                                    }
                                    disabled={updateMutation.isPending || !canManage}
                                    className="h-4 w-4 mx-auto"
                                  />
                                </td>
                                <td className="px-4 py-2 text-right align-top">
                                  <div className="flex items-center justify-end gap-1 mt-0.5">
                                    {pendingChanges ? (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setRowEdits((prev) => {
                                              const { [setting.id]: _, ...rest } = prev;
                                              return rest;
                                            });
                                          }}
                                          disabled={updateMutation.isPending}
                                          className="h-7 w-7 p-0 text-gray-500"
                                        >
                                          <span className="sr-only">Cancel</span>
                                          <span className="text-[10px]">✕</span>
                                        </Button>
                                        <Button
                                          size="sm"
                                          disabled={updateMutation.isPending}
                                          onClick={() => handleSaveRow(setting.id)}
                                          className="h-7 w-7 p-0 bg-success hover:bg-green-700 text-white"
                                        >
                                          <Save className="w-3.5 h-3.5" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => {
                                            // Focus the input to enable editing
                                            const input = document.querySelector(`input[data-setting-id="${setting.id}"]`) as HTMLInputElement;
                                            if (input) {
                                              input.focus();
                                              input.select();
                                            }
                                          }}
                                          disabled={!canManage}
                                          className="h-7 px-2 text-[10px] text-gray-700 bg-gray-100 hover:bg-gray-200"
                                        >
                                          Edit
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDelete(setting)}
                                          disabled={deleteMutation.isPending || !canManage}
                                          className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">
                  No settings found for this category
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  function TaxInfoBanner() {
    const { data, isLoading } = useQuery({
      queryKey: ["admin", "tax-config"],
      queryFn: () => billingApi.taxes.config(),
    });

    if (isLoading) {
      return null;
    }

    return (
      <Card className="mb-4 border-orange-200 bg-primary/5 shadow-none">
        <CardContent className="p-3">
          <p className="text-xs text-orange-800">
            Tax configuration is managed in the Tax & Compliance section. Configure VAT rates, tax exemptions, and compliance settings here.
          </p>
        </CardContent>
      </Card>
    );
  }
}
