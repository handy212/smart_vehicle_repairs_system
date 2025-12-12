"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Trash2, Eye, EyeOff, Info, Upload, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";
import { billingApi } from "@/lib/api/billing";

const CATEGORIES: Array<{ value: string; label: string; link?: string }> = [
  { value: "company", label: "Company Info" },
  { value: "branding", label: "Branding & Theme" },
  { value: "email", label: "Email Settings" },
  { value: "sms", label: "SMS Settings" },
  { value: "payment", label: "Payment & Billing" },
  { value: "notification", label: "Notifications" },
  { value: "security", label: "Security" },
  { value: "business", label: "Business Settings" },
  { value: "tax", label: "Tax & Compliance" },
  { value: "integration", label: "Integrations" },
  { value: "maintenance", label: "Maintenance" },
];

export default function SystemSettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialCategory = searchParams?.get("category") || "company";
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [showSecret, setShowSecret] = useState<Record<number, boolean>>({});
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
    if (setting.key.includes('email') && value && !value.includes('@')) {
      return 'Invalid email format';
    }
    
    // URL validation
    if ((setting.key.includes('url') || setting.key.includes('website')) && value) {
      try {
        new URL(value);
      } catch {
        return 'Invalid URL format (must start with http:// or https://)';
      }
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">System Settings</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Configure system-wide settings and preferences
            </p>
          </div>
        </div>
        {settingsData && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {settings.length} of {settingsData.count} settings
          </div>
        )}
      </div>

      {/* Category Filter */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => {
              if (cat.link) {
                return (
                  <Link key={cat.value} href={cat.link}>
                    <button
                      className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                    >
                      {cat.label}
                    </button>
                  </Link>
                );
              }
              return (
                <button
                  key={cat.value}
                  onClick={() => handleCategorySelect(cat.value)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedCategory === cat.value
                      ? "bg-blue-600 text-white dark:bg-blue-500"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedCategory === "tax" && <TaxInfoBanner />}

      {/* Info Banner for Company Settings */}
      {selectedCategory === "company" && (
        <Card className="mb-4 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Company Information:</strong> These settings are used throughout the application, including in emails, invoices, and notifications. 
                Make sure to keep this information up to date. Changes take effect immediately.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Banner for Email Settings */}
      {selectedCategory === "email" && (
        <Card className="mb-4 border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-orange-800 dark:text-orange-200">
                <strong>Email Configuration:</strong> Changes to email settings may require restarting the application server to take effect. 
                Test your email configuration after making changes. Use the "Test Email" feature if available.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Settings List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl dark:text-gray-100">
              {CATEGORIES.find((c) => c.value === selectedCategory)?.label} Settings
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {settings.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-64">Setting</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="text-center w-28">Active</TableHead>
                    <TableHead className="text-right w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.map((setting) => {
                    const pendingChanges = !!rowEdits[setting.id];
                    return (
                      <TableRow key={setting.id} className="align-top">
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-semibold text-gray-900 dark:text-gray-100">
                              {setting.display_name || setting.key}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-widest font-mono">
                              {setting.key}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {/* Boolean/Toggle Settings - Use Checkbox */}
                            {setting.key.match(/(enabled|require|is_|_enabled)$/i) || 
                             ['maintenance_mode', 'online_booking_enabled', 'allow_online_booking', 
                              'deposit_required', 'require_deposit', 'two_factor_enabled', 'require_2fa',
                              'debug_mode', 'backup_enabled', 'notification_email_enabled', 
                              'notification_sms_enabled', 'notification_push_enabled'].includes(setting.key) ? (
                              <div className="flex items-center gap-2">
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
                                />
                                <span className="text-sm text-gray-600 dark:text-gray-400">
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
                                onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                className="w-full"
                              >
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                                <option value="auto">Auto (System Preference)</option>
                              </Select>
                            ) : /* SMS Provider - Dropdown */
                            setting.key === 'sms_provider' ? (
                              <Select
                                value={getRowValue(setting) || 'hubtel'}
                                onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                className="w-full"
                              >
                                <option value="hubtel">Hubtel</option>
                                <option value="twilio">Twilio</option>
                                <option value="africastalking">Africastalking</option>
                                <option value="other">Other</option>
                              </Select>
                            ) : /* Email Backend - Dropdown */
                            setting.key === 'email_backend' || setting.key.match(/email_backend/i) ? (
                              <Select
                                value={getRowValue(setting) || 'smtp'}
                                onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                className="w-full"
                              >
                                <option value="smtp">SMTP</option>
                                <option value="sendgrid">SendGrid</option>
                                <option value="mailgun">Mailgun</option>
                                <option value="ses">Amazon SES</option>
                                <option value="django.core.mail.backends.smtp.EmailBackend">Django SMTP Backend</option>
                              </Select>
                            ) : /* Payment Gateway - Dropdown */
                            setting.key === 'payment_gateway' ? (
                              <Select
                                value={getRowValue(setting) || ''}
                                onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                className="w-full"
                              >
                                <option value="">None</option>
                                <option value="stripe">Stripe</option>
                                <option value="paypal">PayPal</option>
                                <option value="square">Square</option>
                                <option value="other">Other</option>
                              </Select>
                            ) : /* Late Fee Type - Dropdown */
                            setting.key === 'late_fee_type' ? (
                              <Select
                                value={getRowValue(setting) || 'percentage'}
                                onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                className="w-full"
                              >
                                <option value="fixed">Fixed Amount</option>
                                <option value="percentage">Percentage</option>
                              </Select>
                            ) : /* Currency - Dropdown */
                            setting.key === 'currency' ? (
                              <Select
                                value={getRowValue(setting) || 'USD'}
                                onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                className="w-full"
                              >
                                <option value="USD">USD - US Dollar</option>
                                <option value="EUR">EUR - Euro</option>
                                <option value="GBP">GBP - British Pound</option>
                                <option value="GHS">GHS - Ghanaian Cedi</option>
                                <option value="NGN">NGN - Nigerian Naira</option>
                                <option value="KES">KES - Kenyan Shilling</option>
                                <option value="ZAR">ZAR - South African Rand</option>
                                <option value="CAD">CAD - Canadian Dollar</option>
                                <option value="AUD">AUD - Australian Dollar</option>
                                <option value="JPY">JPY - Japanese Yen</option>
                              </Select>
                            ) : /* Log Level - Dropdown */
                            setting.key === 'log_level' ? (
                              <Select
                                value={getRowValue(setting) || 'INFO'}
                                onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                className="w-full"
                              >
                                <option value="DEBUG">DEBUG</option>
                                <option value="INFO">INFO</option>
                                <option value="WARNING">WARNING</option>
                                <option value="ERROR">ERROR</option>
                                <option value="CRITICAL">CRITICAL</option>
                              </Select>
                            ) : /* Backup Frequency - Dropdown */
                            setting.key === 'backup_frequency' ? (
                              <Select
                                value={getRowValue(setting) || 'daily'}
                                onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                className="w-full"
                              >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                              </Select>
                            ) : /* Color inputs */
                            setting.key.match(/(primary_color|secondary_color|success_color|danger_color|warning_color|info_color)/i) ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="color"
                                  value={getRowValue(setting) || '#000000'}
                                  onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                  className="h-10 w-20 p-1 cursor-pointer"
                                />
                                <Input
                                  type="text"
                                  value={getRowValue(setting) || ''}
                                  onChange={(e) => handleRowChange(setting, { value: e.target.value.toUpperCase() })}
                                  placeholder="#000000"
                                  className="flex-1 font-mono"
                                  pattern="^#[0-9A-Fa-f]{6}$"
                                  maxLength={7}
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
                                    placeholder="Path to image file (e.g., branding/logo.png)"
                                    className="flex-1"
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
                                          // Upload file to server
                                          uploadFileMutation.mutate({ settingId: setting.id, file });
                                        }
                                      };
                                      input.click();
                                    }}
                                    disabled={uploadFileMutation.isPending}
                                    className="flex-shrink-0"
                                  >
                                    <Upload className="w-4 h-4 mr-1" />
                                    {uploadFileMutation.isPending ? "Uploading..." : "Upload"}
                                  </Button>
                                </div>
                                {getRowValue(setting) && (
                                  <div className="space-y-1">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                      <ImageIcon className="w-3 h-3" />
                                      Current: {getRowValue(setting)}
                                    </div>
                                    {getRowValue(setting).startsWith('branding/') && (
                                      <img
                                        src={`/media/${getRowValue(setting)}?t=${Date.now()}`}
                                        alt={setting.key}
                                        key={getRowValue(setting)} // Force re-render when path changes
                                        className="h-16 w-16 object-contain border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800 p-1"
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
                              <div className="space-y-2">
                                <Input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={getRowValue(setting) || '0.85'}
                                  onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                  className="w-full"
                                />
                                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                  <span>0 (Transparent)</span>
                                  <span className="font-medium">{getRowValue(setting) || '0.85'} ({(parseFloat(getRowValue(setting) || '0.85') * 100).toFixed(0)}%)</span>
                                  <span>1 (Opaque)</span>
                                </div>
                              </div>
                            ) : /* Time inputs (hours, quiet hours) */
                            setting.key.match(/(quiet_hours|business_hours)/i) ? (
                              <Input
                                data-setting-id={setting.id}
                                type="text"
                                value={getRowValue(setting)}
                                onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                placeholder={setting.key.includes('hours') ? "HH:MM-HH:MM or 'Closed'" : "HH:MM"}
                                className="font-mono"
                                pattern={setting.key.includes('hours') ? "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]-([0-1]?[0-9]|2[0-3]):[0-5][0-9]$|^Closed$" : "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"}
                              />
                            ) : /* Phone number */
                            setting.key.match(/(phone|sms_test_number|whatsapp)/i) ? (
                              <Input
                                data-setting-id={setting.id}
                                type="tel"
                                value={getRowValue(setting)}
                                onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                                placeholder="+1234567890"
                                pattern="^\+?[1-9]\d{1,14}$"
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
                                  className="pr-8"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">%</span>
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
                                  className={`pr-9 ${
                                    rowEdits[setting.id]?.value !== undefined &&
                                    validateSetting(setting, rowEdits[setting.id]!.value || "")
                                      ? "border-red-500 focus-visible:ring-red-500"
                                      : ""
                                  }`}
                                  placeholder={
                                    setting.description
                                      ? setting.description
                                      : setting.key.includes("email")
                                      ? "Enter email address (e.g., email@example.com)"
                                      : setting.key.includes("url") || setting.key.includes("website")
                                      ? "Enter URL (e.g., https://example.com)"
                                      : setting.key.match(/(rate|amount|price|port|timeout|duration|max_|min_|length|attempts|days|hours|minutes)/i)
                                      ? "Enter numeric value"
                                      : setting.is_secret
                                      ? "Enter secret value"
                                      : "Enter value"
                                  }
                                />
                                {setting.is_secret && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-1/2 right-1 -translate-y-1/2 h-7 w-7"
                                    onClick={() => toggleSecretVisibility(setting.id)}
                                  >
                                    {showSecret[setting.id] ? (
                                      <EyeOff className="w-4 h-4" />
                                    ) : (
                                      <Eye className="w-4 h-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            )}
                            {rowEdits[setting.id]?.value !== undefined &&
                              (() => {
                                const error = validateSetting(setting, rowEdits[setting.id]!.value || "");
                                return error ? (
                                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                                ) : null;
                              })()}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={setting.is_active}
                            onCheckedChange={(checked) =>
                              handleActiveToggle(setting, Boolean(checked))
                            }
                            disabled={updateMutation.isPending}
                            className="mx-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
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
                                  className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={
                                    updateMutation.isPending ||
                                    (() => {
                                      const error = rowEdits[setting.id]?.value !== undefined
                                        ? validateSetting(setting, rowEdits[setting.id]!.value || '')
                                        : null;
                                      return !!error;
                                    })()
                                  }
                                  onClick={() => handleSaveRow(setting.id)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                  <Save className="w-4 h-4 mr-1.5" />
                                  Save
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
                                  className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(setting)}
                                  disabled={deleteMutation.isPending}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/20"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="space-y-2">
                <p className="text-gray-500 dark:text-gray-400 font-medium">
                  No settings found for this category
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Settings will appear here once they are created.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
  function handleCategorySelect(category: string) {
    setSelectedCategory(category);
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (category === "company") {
      params.delete("category");
    } else {
      params.set("category", category);
    }
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, { scroll: false });
  }

  function TaxInfoBanner() {
    const { data, isLoading } = useQuery({
      queryKey: ["admin", "tax-config"],
      queryFn: () => billingApi.taxes.config(),
    });

    if (isLoading) {
      return null;
    }

    return (
      <Card className="mb-4 border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <p className="text-sm text-blue-800">
            Tax configuration is managed in the Tax & Compliance section. Configure VAT rates, tax exemptions, and compliance settings here.
          </p>
        </CardContent>
      </Card>
    );
  }
}
