"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, NotificationPreference } from "@/lib/api/notifications";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Save, Mail, MessageSquare, Bell, Smartphone, Volume2, Calendar, Wrench, Receipt, CreditCard, FileText, Package, Car } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useToast } from "@/lib/hooks/useToast";

export default function NotificationPreferencesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => notificationsApi.getPreferences(),
  });

  const [formData, setFormData] = useState<Partial<NotificationPreference>>({});

  // Initialize form data when preferences load
  useEffect(() => {
    if (preferences) {
      setFormData(preferences);
    }
  }, [preferences]);

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const currentPreferences = preferences || ({} as NotificationPreference);
  const mergedData = { ...currentPreferences, ...formData };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/notifications">
          <Button size="sm" className="h-9" variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Notification Preferences</h1>
          <p className="text-sm text-muted-foreground mt-1">
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
            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="flex items-center space-x-3">
                <Mail className="w-5 h-5 text-gray-400" />
                <div>
                  <Label htmlFor="email_enabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                    Email
                  </Label>
                  <p className="text-xs text-gray-500">Receive notifications via email</p>
                </div>
              </div>
              <Checkbox
                id="email_enabled"
                checked={mergedData.email_enabled ?? true}
                onCheckedChange={(checked) => handleChange("email_enabled", checked === true)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="flex items-center space-x-3">
                <MessageSquare className="w-5 h-5 text-gray-400" />
                <div>
                  <Label htmlFor="sms_enabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                    SMS
                  </Label>
                  <p className="text-xs text-gray-500">Receive notifications via text message</p>
                </div>
              </div>
              <Checkbox
                id="sms_enabled"
                checked={mergedData.sms_enabled ?? false}
                onCheckedChange={(checked) => handleChange("sms_enabled", checked === true)}
              />
            </div>
            {mergedData.sms_enabled && (
              <div className="ml-8 p-3 rounded-lg bg-gray-50 border border-gray-200">
                <Label htmlFor="phone_number" className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </Label>
                <Input
                  id="phone_number"
                  type="tel"
                  value={mergedData.phone_number || ""}
                  onChange={(e) => handleChange("phone_number", e.target.value)}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            )}
            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="flex items-center space-x-3">
                <Smartphone className="w-5 h-5 text-gray-400" />
                <div>
                  <Label htmlFor="push_enabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                    Push Notifications
                  </Label>
                  <p className="text-xs text-gray-500">Receive push notifications on your device</p>
                </div>
              </div>
              <Checkbox
                id="push_enabled"
                checked={mergedData.push_enabled ?? true}
                onCheckedChange={(checked) => handleChange("push_enabled", checked === true)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="flex items-center space-x-3">
                <Bell className="w-5 h-5 text-gray-400" />
                <div>
                  <Label htmlFor="in_app_enabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                    In-App
                  </Label>
                  <p className="text-xs text-gray-500">Show notifications in the application</p>
                </div>
              </div>
              <Checkbox
                id="in_app_enabled"
                checked={mergedData.in_app_enabled ?? true}
                onCheckedChange={(checked) => handleChange("in_app_enabled", checked === true)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="flex items-center space-x-3">
                <Volume2 className="w-5 h-5 text-gray-400" />
                <div>
                  <Label htmlFor="sound_enabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                    Notification Sounds
                  </Label>
                  <p className="text-xs text-gray-500">Play sound when new notifications arrive</p>
                </div>
              </div>
              <Checkbox
                id="sound_enabled"
                checked={mergedData.sound_enabled ?? true}
                onCheckedChange={(checked) => handleChange("sound_enabled", checked === true)}
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
          <CardContent className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: "appointment_notifications", label: "Appointments", icon: Calendar },
                { key: "work_order_notifications", label: "Work Orders", icon: Wrench },
                { key: "invoice_notifications", label: "Invoices", icon: Receipt },
                { key: "payment_notifications", label: "Payments", icon: CreditCard },
                { key: "inspection_notifications", label: "Inspections", icon: FileText },
                { key: "inventory_notifications", label: "Inventory", icon: Package },
                { key: "vehicle_notifications", label: "Vehicles", icon: Car },
                { key: "system_notifications", label: "System", icon: Bell },
              ].map(({ key, label, icon: Icon }) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="w-4 h-4 text-gray-400" />
                    <Label
                      htmlFor={key}
                      className="text-sm font-medium text-gray-900 cursor-pointer"
                    >
                      {label}
                    </Label>
                  </div>
                  <Checkbox
                    id={key}
                    checked={!!(mergedData[key as keyof NotificationPreference] ?? true)}
                    onCheckedChange={(checked) => {
                      const value = checked === true;
                      handleChange(key as keyof NotificationPreference, value);
                    }}
                  />
                </div>
              ))}
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
            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              <Label htmlFor="quiet_hours_enabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                Enable Quiet Hours
              </Label>
              <Checkbox
                id="quiet_hours_enabled"
                checked={mergedData.quiet_hours_enabled ?? false}
                onCheckedChange={(checked) => handleChange("quiet_hours_enabled", checked === true)}
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
          <Button type="submit" size="sm" className="h-9" disabled={updateMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </form>
    </div>
  );
}

