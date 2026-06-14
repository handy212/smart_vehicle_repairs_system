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
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export default function NotificationPreferencesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => notificationsApi.getPreferences(),
  });

  const [formData, setFormData] = useState<Partial<NotificationPreference>>({});
  const [pushStatus, setPushStatus] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  const updateMutation = useMutation({
    mutationFn: (data: Partial<NotificationPreference>) =>
      notificationsApi.updatePreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      setFormData({});
      toast({
        title: "Success",
        description: "Preferences updated successfully",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to update preferences"),
        variant: "destructive",
      });
    },
  });

  const pushSubscribeMutation = useMutation({
    mutationFn: async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error("Browser push is not supported on this device.");
      }

      const publicKey = await notificationsApi.pushSubscriptions.publicKey();
      if (!publicKey.configured || !publicKey.public_key) {
        throw new Error("Push notifications are not configured on the server.");
      }

      const permission = await Notification.requestPermission();
      setPushStatus(permission);
      if (permission !== "granted") {
        throw new Error("Push notification permission was not granted.");
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey.public_key),
      });
      const payload = subscription.toJSON();

      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
        throw new Error("Browser returned an incomplete push subscription.");
      }

      await notificationsApi.pushSubscriptions.subscribe({
        endpoint: payload.endpoint,
        keys: {
          p256dh: payload.keys.p256dh,
          auth: payload.keys.auth,
        },
        device_name: navigator.userAgent,
      });
      return payload.endpoint;
    },
    onSuccess: () => {
      handleChange("push_enabled", true);
      toast({ title: "Push enabled", description: "This browser is subscribed to push notifications." });
    },
    onError: (error: unknown) => {
      toast({
        title: "Push setup failed",
        description: error instanceof Error ? error.message : getUserFacingError(error, "Failed to enable push notifications."),
        variant: "destructive",
      });
    },
  });

  const pushUnsubscribeMutation = useMutation({
    mutationFn: async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        return;
      }
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await notificationsApi.pushSubscriptions.unsubscribe(endpoint);
    },
    onSuccess: () => {
      handleChange("push_enabled", false);
      toast({ title: "Push disabled", description: "This browser was unsubscribed from push notifications." });
    },
    onError: (error: unknown) => {
      toast({
        title: "Push setup failed",
        description: getUserFacingError(error, "Failed to disable push notifications."),
        variant: "destructive",
      });
    },
  });


  const handleChange = (
    field: keyof NotificationPreference,
    value: NotificationPreference[keyof NotificationPreference]
  ) => {
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
            <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors">
              <div className="flex items-center space-x-3">
                <Mail className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="email_enabled" className="text-sm font-medium text-foreground cursor-pointer">
                    Email
                  </Label>
                  <p className="text-xs text-muted-foreground">Receive notifications via email</p>
                </div>
              </div>
              <Checkbox
                id="email_enabled"
                checked={mergedData.email_enabled ?? true}
                onCheckedChange={(checked) => handleChange("email_enabled", checked === true)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors">
              <div className="flex items-center space-x-3">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="sms_enabled" className="text-sm font-medium text-foreground cursor-pointer">
                    SMS
                  </Label>
                  <p className="text-xs text-muted-foreground">Receive notifications via text message</p>
                </div>
              </div>
              <Checkbox
                id="sms_enabled"
                checked={mergedData.sms_enabled ?? false}
                onCheckedChange={(checked) => handleChange("sms_enabled", checked === true)}
              />
            </div>
            {mergedData.sms_enabled && (
              <div className="ml-8 p-3 rounded-lg bg-muted border border-border">
                <Label htmlFor="phone_number" className="block text-sm font-medium text-foreground mb-2">
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
            <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors">
              <div className="flex items-center space-x-3">
                <Smartphone className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="push_enabled" className="text-sm font-medium text-foreground cursor-pointer">
                    Push Notifications
                  </Label>
                  <p className="text-xs text-muted-foreground">Receive push notifications on your device</p>
                </div>
              </div>
              <Checkbox
                id="push_enabled"
                checked={mergedData.push_enabled ?? true}
                onCheckedChange={(checked) => handleChange("push_enabled", checked === true)}
              />
            </div>
            {mergedData.push_enabled && (
              <div className="ml-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Browser Push</p>
                  <p className="text-xs text-muted-foreground">
                    Permission: {pushStatus}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => pushSubscribeMutation.mutate()}
                    disabled={pushSubscribeMutation.isPending}
                  >
                    Enable Browser
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => pushUnsubscribeMutation.mutate()}
                    disabled={pushUnsubscribeMutation.isPending}
                  >
                    Disable
                  </Button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors">
              <div className="flex items-center space-x-3">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="whatsapp_enabled" className="text-sm font-medium text-foreground cursor-pointer">
                    WhatsApp API
                  </Label>
                  <p className="text-xs text-muted-foreground">Receive automated WhatsApp notifications</p>
                </div>
              </div>
              <Checkbox
                id="whatsapp_enabled"
                checked={mergedData.whatsapp_enabled ?? true}
                onCheckedChange={(checked) => handleChange("whatsapp_enabled", checked === true)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors">
              <div className="flex items-center space-x-3">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="whatsapp_manual_enabled" className="text-sm font-medium text-foreground cursor-pointer">
                    Manual WhatsApp
                  </Label>
                  <p className="text-xs text-muted-foreground">Allow staff-prepared WhatsApp messages</p>
                </div>
              </div>
              <Checkbox
                id="whatsapp_manual_enabled"
                checked={mergedData.whatsapp_manual_enabled ?? true}
                onCheckedChange={(checked) => handleChange("whatsapp_manual_enabled", checked === true)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors">
              <div className="flex items-center space-x-3">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="in_app_enabled" className="text-sm font-medium text-foreground cursor-pointer">
                    In-App
                  </Label>
                  <p className="text-xs text-muted-foreground">Show notifications in the application</p>
                </div>
              </div>
              <Checkbox
                id="in_app_enabled"
                checked={mergedData.in_app_enabled ?? true}
                onCheckedChange={(checked) => handleChange("in_app_enabled", checked === true)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors">
              <div className="flex items-center space-x-3">
                <Volume2 className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="sound_enabled" className="text-sm font-medium text-foreground cursor-pointer">
                    Notification Sounds
                  </Label>
                  <p className="text-xs text-muted-foreground">Play sound when new notifications arrive</p>
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

        {/* Digest */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Digest</CardTitle>
            <CardDescription>
              Receive a summary instead of checking every notification individually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors">
              <Label htmlFor="digest_enabled" className="text-sm font-medium text-foreground cursor-pointer">
                Enable Digest
              </Label>
              <Checkbox
                id="digest_enabled"
                checked={mergedData.digest_enabled ?? false}
                onCheckedChange={(checked) => handleChange("digest_enabled", checked === true)}
              />
            </div>
            {mergedData.digest_enabled && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleChange("digest_frequency", option.value)}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                      (mergedData.digest_frequency || "daily") === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
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
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <Label
                      htmlFor={key}
                      className="text-sm font-medium text-foreground cursor-pointer"
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
              Set times when you don&apos;t want to receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors">
              <Label htmlFor="quiet_hours_enabled" className="text-sm font-medium text-foreground cursor-pointer">
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
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Start Time
                  </label>
                  <Input
                    type="time"
                    value={mergedData.quiet_hours_start || "22:00"}
                    onChange={(e) => handleChange("quiet_hours_start", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
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
