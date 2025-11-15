"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Save, Trash2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";

const CATEGORIES = [
  { value: "company", label: "Company Info" },
  { value: "branding", label: "Branding & Theme" },
  { value: "email", label: "Email Settings" },
  { value: "sms", label: "SMS Settings" },
  { value: "payment", label: "Payment & Billing" },
  { value: "notification", label: "Notifications" },
  { value: "security", label: "Security" },
  { value: "business", label: "Business Settings" },
  { value: "integration", label: "Integrations" },
  { value: "maintenance", label: "Maintenance" },
];

export default function SystemSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState("company");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showSecret, setShowSecret] = useState<Record<number, boolean>>({});
  const [formData, setFormData] = useState<Partial<SystemSetting>>({});

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
      setEditingId(null);
      setFormData({});
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

  const handleEdit = (setting: SystemSetting) => {
    setEditingId(setting.id);
    setFormData({
      value: setting.value,
      description: setting.description,
      is_active: setting.is_active,
    });
  };

  const handleSave = (id: number) => {
    updateMutation.mutate({ id, data: formData });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({});
  };

  const handleDelete = (setting: SystemSetting) => {
    if (confirm(`Are you sure you want to delete setting "${setting.key}"?`)) {
      deleteMutation.mutate(setting.id);
    }
  };

  const toggleSecretVisibility = (id: number) => {
    setShowSecret((prev) => ({ ...prev, [id]: !prev[id] }));
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
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
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
        </CardContent>
      </Card>

      {/* Settings List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {CATEGORIES.find((c) => c.value === selectedCategory)?.label} Settings
            {settingsData && ` (${settingsData.count})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settings.length > 0 ? (
            <div className="space-y-4">
              {settings.map((setting) => (
                <div
                  key={setting.id}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  {editingId === setting.id ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Key
                        </label>
                        <Input value={setting.key} disabled className="bg-gray-50" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Value {setting.is_secret && "(Secret)"}
                        </label>
                        <div className="relative">
                          <Input
                            type={setting.is_secret && !showSecret[setting.id] ? "password" : "text"}
                            value={formData.value || ""}
                            onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                            className="pr-10"
                          />
                          {setting.is_secret && (
                            <button
                              type="button"
                              onClick={() => toggleSecretVisibility(setting.id)}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                            >
                              {showSecret[setting.id] ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <Input
                          value={formData.description || ""}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.is_active ?? true}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label className="ml-2 text-sm text-gray-700">Active</label>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={handleCancel}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => handleSave(setting.id)}
                          disabled={updateMutation.isPending}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {setting.display_name || setting.key}
                          </h3>
                          {setting.description && (
                            <p className="text-sm text-gray-600 mt-1">{setting.description}</p>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {setting.is_active ? (
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                              Inactive
                            </span>
                          )}
                          {setting.is_secret && (
                            <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                              Secret
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className="text-xs font-medium text-gray-500">Value:</label>
                        <div className="mt-1 flex items-center space-x-2">
                          <p className="text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded flex-1">
                            {setting.is_secret && !showSecret[setting.id]
                              ? "•".repeat(20)
                              : setting.value || "(empty)"}
                          </p>
                          {setting.is_secret && (
                            <Button
                              variant="ghost"
                              size="sm"
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
                      </div>
                      {setting.updated_by_name && (
                        <p className="text-xs text-gray-500 mt-2">
                          Last updated by {setting.updated_by_name} on{" "}
                          {format(new Date(setting.updated_at), "MMM dd, yyyy HH:mm")}
                        </p>
                      )}
                      <div className="flex justify-end space-x-2 mt-4">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(setting)}>
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(setting)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No settings found for this category</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
