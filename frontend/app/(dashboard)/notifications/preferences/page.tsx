"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, NotificationPreference } from "@/lib/api/notifications";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";

export default function NotificationPreferencesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => notificationsApi.getPreferences(),
  });

  const [formData, setFormData] = useState<Partial<NotificationPreference>>({});

  const updateMutation = useMutation({
    mutationFn: (data: Partial<NotificationPreference>) =>
      notificationsApi.updatePreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast({
        title: "Success",
        description: "Preferences updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update preferences",
        variant: "destructive",
      });
    },
  });

  const handleChange = (field: keyof NotificationPreference, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToUpdate = preferences
      ? { ...preferences, ...formData }
      : formData;
    updateMutation.mutate(dataToUpdate);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const currentPreferences = preferences || ({} as NotificationPreference);
  const mergedData = { ...currentPreferences, ...formData };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/notifications">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notification Preferences</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage how and when you receive notifications
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Channel Preferences */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Delivery Channels</CardTitle>
            <CardDescription>
              Choose how you want to receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <p className="text-xs text-gray-500">Receive notifications via email</p>
              </div>
              <input
                type="checkbox"
                checked={mergedData.email_enabled ?? true}
                onChange={(e) => handleChange("email_enabled", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">SMS</label>
                <p className="text-xs text-gray-500">Receive notifications via text message</p>
              </div>
              <input
                type="checkbox"
                checked={mergedData.sms_enabled ?? false}
                onChange={(e) => handleChange("sms_enabled", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            {mergedData.sms_enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <Input
                  type="tel"
                  value={mergedData.phone_number || ""}
                  onChange={(e) => handleChange("phone_number", e.target.value)}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Push Notifications</label>
                <p className="text-xs text-gray-500">Receive push notifications on your device</p>
              </div>
              <input
                type="checkbox"
                checked={mergedData.push_enabled ?? true}
                onChange={(e) => handleChange("push_enabled", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">In-App</label>
                <p className="text-xs text-gray-500">Show notifications in the application</p>
              </div>
              <input
                type="checkbox"
                checked={mergedData.in_app_enabled ?? true}
                onChange={(e) => handleChange("in_app_enabled", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Types */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Notification Types</CardTitle>
            <CardDescription>
              Choose which types of notifications you want to receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Appointments</label>
              <input
                type="checkbox"
                checked={mergedData.appointment_notifications ?? true}
                onChange={(e) => handleChange("appointment_notifications", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Work Orders</label>
              <input
                type="checkbox"
                checked={mergedData.work_order_notifications ?? true}
                onChange={(e) => handleChange("work_order_notifications", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Invoices</label>
              <input
                type="checkbox"
                checked={mergedData.invoice_notifications ?? true}
                onChange={(e) => handleChange("invoice_notifications", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Payments</label>
              <input
                type="checkbox"
                checked={mergedData.payment_notifications ?? true}
                onChange={(e) => handleChange("payment_notifications", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Inspections</label>
              <input
                type="checkbox"
                checked={mergedData.inspection_notifications ?? true}
                onChange={(e) => handleChange("inspection_notifications", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Inventory</label>
              <input
                type="checkbox"
                checked={mergedData.inventory_notifications ?? true}
                onChange={(e) => handleChange("inventory_notifications", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Vehicles</label>
              <input
                type="checkbox"
                checked={mergedData.vehicle_notifications ?? true}
                onChange={(e) => handleChange("vehicle_notifications", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">System</label>
              <input
                type="checkbox"
                checked={mergedData.system_notifications ?? true}
                onChange={(e) => handleChange("system_notifications", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Quiet Hours */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Quiet Hours</CardTitle>
            <CardDescription>
              Set times when you don't want to receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Enable Quiet Hours</label>
              <input
                type="checkbox"
                checked={mergedData.quiet_hours_enabled ?? false}
                onChange={(e) => handleChange("quiet_hours_enabled", e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            {mergedData.quiet_hours_enabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time
                  </label>
                  <Input
                    type="time"
                    value={mergedData.quiet_hours_start || "22:00"}
                    onChange={(e) => handleChange("quiet_hours_start", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Time
                  </label>
                  <Input
                    type="time"
                    value={mergedData.quiet_hours_end || "08:00"}
                    onChange={(e) => handleChange("quiet_hours_end", e.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </form>
    </div>
  );
}

