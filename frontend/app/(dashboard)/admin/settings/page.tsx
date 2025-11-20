"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Save, Trash2, Eye, EyeOff, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";
import { billingApi } from "@/lib/api/billing";

const CATEGORIES = [
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
    Record<number, Partial<Pick<SystemSetting, "value" | "description">>>
  >({});
  const [searchTerm, setSearchTerm] = useState("");

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

  const getRowDescription = (setting: SystemSetting) =>
    rowEdits[setting.id]?.description ?? setting.description ?? "";

  const handleRowChange = (
    setting: SystemSetting,
    updates: Partial<Pick<SystemSetting, "value" | "description">>
  ) => {
    setRowEdits((prev) => {
      const prevEntry = prev[setting.id] || {};
      const mergedValue =
        updates.value !== undefined ? updates.value : prevEntry.value;
      const mergedDescription =
        updates.description !== undefined ? updates.description : prevEntry.description;

      const diff: Partial<Pick<SystemSetting, "value" | "description">> = {};
      if (mergedValue !== undefined && mergedValue !== (setting.value ?? "")) {
        diff.value = mergedValue;
      }
      if (
        mergedDescription !== undefined &&
        mergedDescription !== (setting.description ?? "")
      ) {
        diff.description = mergedDescription;
      }

      if (Object.keys(diff).length === 0) {
        const { [setting.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [setting.id]: diff };
    });
  };

  const handleSaveRow = async (id: number) => {
    const payload = rowEdits[id];
    if (!payload) return;
    try {
      await updateMutation.mutateAsync({ id, data: payload });
      setRowEdits((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    } catch (error) {
      // handled by mutation toast
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
  const filteredSettings = settings.filter((setting) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const haystack = `${setting.display_name || ""} ${setting.key} ${setting.description || ""}`.toLowerCase();
    return haystack.includes(term);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/admin">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure system-wide settings and preferences</p>
        </div>
      </div>

      {/* Category Filter */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => handleCategorySelect(cat.value)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedCategory === cat.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="w-full max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search settings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedCategory === "tax" && (
        <TaxInfoBanner />
      )}

      {/* Settings List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {CATEGORIES.find((c) => c.value === selectedCategory)?.label} Settings
            {settingsData && ` (${settingsData.count})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredSettings.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-64">Setting</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center w-28">Active</TableHead>
                    <TableHead className="text-center w-24">Secret</TableHead>
                    <TableHead className="w-48">Updated</TableHead>
                    <TableHead className="text-right w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSettings.map((setting) => {
                    const pendingChanges = !!rowEdits[setting.id];
                    return (
                      <TableRow key={setting.id} className="align-top">
                        <TableCell>
                          <div className="font-semibold text-gray-900">
                            {setting.display_name || setting.key}
                          </div>
                          <div className="text-xs text-gray-500 uppercase tracking-widest">
                            {setting.key}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="relative">
                            <Input
                              type={setting.is_secret && !showSecret[setting.id] ? "password" : "text"}
                              value={getRowValue(setting)}
                              onChange={(e) => handleRowChange(setting, { value: e.target.value })}
                              className="pr-9"
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
                        </TableCell>
                        <TableCell>
                          <Input
                            value={getRowDescription(setting)}
                            onChange={(e) => handleRowChange(setting, { description: e.target.value })}
                          />
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
                        <TableCell className="text-center">
                          {setting.is_secret ? (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-800">
                              Yes
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">No</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {setting.updated_by_name ? (
                            <div className="text-xs text-gray-500">
                              {setting.updated_by_name}
                              <br />
                              {format(new Date(setting.updated_at), "MMM dd, yyyy HH:mm")}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!pendingChanges || updateMutation.isPending}
                            onClick={() => handleSaveRow(setting.id)}
                          >
                            <Save className="w-4 h-4 mr-1" />
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(setting)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">
                {settings.length === 0
                  ? "No settings found for this category"
                  : "No settings match your search"}
              </p>
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

    return (
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Tax & Compliance Overview</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-900 space-y-2">
          <p>
            Configure Ghana Revenue Authority standard rates. These fields feed directly into invoice and estimate tax calculations.
          </p>
          {isLoading ? (
            <p>Loading current configuration…</p>
          ) : data ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>NHIL: {data.nhil_rate}%</div>
              <div>GETFund: {data.getfund_rate}%</div>
              <div>COVID-19: {data.covid_rate}%</div>
              <div>VAT: {data.vat_rate}%</div>
            </div>
          ) : null}
          <p className="text-xs text-blue-700">
            Tip: enable or disable tax, adjust rates, and change the regime directly from the settings list below.
          </p>
        </CardContent>
      </Card>
    );
  }
}
