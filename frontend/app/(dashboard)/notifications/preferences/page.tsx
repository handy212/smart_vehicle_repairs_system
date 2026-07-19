"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  Calendar,
  Car,
  CreditCard,
  FileText,
  Mail,
  MessageSquare,
  Moon,
  Package,
  Receipt,
  Save,
  Smartphone,
  Volume2,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useState, type ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getUserFacingError } from "@/lib/api/errors";
import {
  notificationsApi,
  type NotificationPreference,
} from "@/lib/api/notifications";
import { useToast } from "@/lib/hooks/useToast";
import { cn } from "@/lib/utils/cn";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

type ToggleRowProps = {
  id: string;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
};

function ToggleRow({
  id,
  label,
  description,
  icon: Icon,
  checked,
  onCheckedChange,
  className,
}: ToggleRowProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
        aria-label={label}
      />
    </label>
  );
}

const CHANNELS: Array<{
  key: keyof NotificationPreference;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  defaultValue: boolean;
}> = [
  {
    key: "email_enabled",
    label: "Email",
    description: "Inbox alerts and digests",
    icon: Mail,
    defaultValue: true,
  },
  {
    key: "sms_enabled",
    label: "SMS",
    description: "Text messages to your phone",
    icon: MessageSquare,
    defaultValue: false,
  },
  {
    key: "push_enabled",
    label: "Push",
    description: "Browser / device push",
    icon: Smartphone,
    defaultValue: true,
  },
  {
    key: "in_app_enabled",
    label: "In-app",
    description: "Bell alerts inside the app",
    icon: Bell,
    defaultValue: true,
  },
  {
    key: "whatsapp_enabled",
    label: "WhatsApp",
    description: "Automated WhatsApp messages",
    icon: MessageSquare,
    defaultValue: true,
  },
  {
    key: "whatsapp_manual_enabled",
    label: "Manual WhatsApp",
    description: "Staff-prepared WhatsApp messages",
    icon: MessageSquare,
    defaultValue: true,
  },
  {
    key: "sound_enabled",
    label: "Sounds",
    description: "Play a sound for new alerts",
    icon: Volume2,
    defaultValue: true,
  },
];

const NOTIFICATION_TYPES: Array<{
  key: keyof NotificationPreference;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { key: "appointment_notifications", label: "Appointments", icon: Calendar },
  { key: "work_order_notifications", label: "Work Orders", icon: Wrench },
  { key: "invoice_notifications", label: "Invoices", icon: Receipt },
  { key: "payment_notifications", label: "Payments", icon: CreditCard },
  { key: "inspection_notifications", label: "Inspections", icon: FileText },
  { key: "inventory_notifications", label: "Inventory", icon: Package },
  { key: "vehicle_notifications", label: "Vehicles", icon: Car },
  { key: "system_notifications", label: "System", icon: Bell },
];

export default function NotificationPreferencesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => notificationsApi.getPreferences(),
  });

  const [formData, setFormData] = useState<Partial<NotificationPreference>>({});
  const [pushStatus, setPushStatus] = useState(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported"
  );

  const updateMutation = useMutation({
    mutationFn: (data: Partial<NotificationPreference>) =>
      notificationsApi.updatePreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      setFormData({});
      toast({
        title: "Preferences saved",
        description: "Your notification settings were updated.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not save",
        description: getUserFacingError(error, "Failed to update preferences"),
        variant: "destructive",
      });
    },
  });

  const pushSubscribeMutation = useMutation({
    mutationFn: async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
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
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey.public_key),
        }));
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
      toast({
        title: "Push enabled",
        description: "This browser is subscribed to push notifications.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Push setup failed",
        description:
          error instanceof Error
            ? error.message
            : getUserFacingError(error, "Failed to enable push notifications."),
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
      toast({
        title: "Push disabled",
        description: "This browser was unsubscribed from push notifications.",
      });
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
    const dataToUpdate = preferences ? { ...preferences, ...formData } : formData;
    updateMutation.mutate(dataToUpdate);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const currentPreferences = preferences || ({} as NotificationPreference);
  const mergedData = { ...currentPreferences, ...formData };
  const hasChanges = Object.keys(formData).length > 0;
  const quietStart = (mergedData.quiet_hours_start || "22:00").slice(0, 5);
  const quietEnd = (mergedData.quiet_hours_end || "07:00").slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/notifications">
            <Button size="sm" className="h-9" variant="secondary">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Notification Preferences
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Control delivery channels and which alerts you receive
            </p>
          </div>
        </div>
        <Button
          type="submit"
          form="notification-preferences-form"
          size="sm"
          className="h-9 shrink-0"
          disabled={updateMutation.isPending || !hasChanges}
        >
          <Save className="mr-2 h-4 w-4" />
          {updateMutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <form id="notification-preferences-form" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          {/* Left column */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Delivery channels</CardTitle>
                <CardDescription>
                  Choose how notifications reach you
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {CHANNELS.map((channel) => (
                    <ToggleRow
                      key={channel.key}
                      id={channel.key}
                      label={channel.label}
                      description={channel.description}
                      icon={channel.icon}
                      checked={Boolean(
                        mergedData[channel.key] ?? channel.defaultValue
                      )}
                      onCheckedChange={(checked) =>
                        handleChange(channel.key, checked)
                      }
                    />
                  ))}
                </div>

                {mergedData.sms_enabled ? (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <Label htmlFor="phone_number" className="text-sm font-medium">
                      SMS phone number
                    </Label>
                    <Input
                      id="phone_number"
                      type="tel"
                      className="mt-2"
                      value={mergedData.phone_number || ""}
                      onChange={(e) => handleChange("phone_number", e.target.value)}
                      placeholder="+233 24 000 0000"
                    />
                  </div>
                ) : null}

                {mergedData.push_enabled ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Browser push</p>
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
                        Enable
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
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Digest & quiet hours</CardTitle>
                <CardDescription>
                  Summaries and times when alerts should wait
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow
                  id="digest_enabled"
                  label="Email digest"
                  description="Receive a summary instead of every alert"
                  icon={Mail}
                  checked={mergedData.digest_enabled ?? false}
                  onCheckedChange={(checked) => handleChange("digest_enabled", checked)}
                />

                {mergedData.digest_enabled ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: "daily", label: "Daily" },
                      { value: "weekly", label: "Weekly" },
                    ].map((option) => {
                      const selected =
                        (mergedData.digest_frequency || "daily") === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleChange("digest_frequency", option.value)}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                            selected
                              ? "border-primary bg-[var(--primary-soft)] text-primary"
                              : "border-border hover:bg-muted/40"
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <ToggleRow
                  id="quiet_hours_enabled"
                  label="Quiet hours"
                  description="Pause non-urgent notifications overnight"
                  icon={Moon}
                  checked={mergedData.quiet_hours_enabled ?? false}
                  onCheckedChange={(checked) =>
                    handleChange("quiet_hours_enabled", checked)
                  }
                />

                {mergedData.quiet_hours_enabled ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="quiet_hours_start" className="text-xs text-muted-foreground">
                        Starts
                      </Label>
                      <Input
                        id="quiet_hours_start"
                        type="time"
                        className="mt-1.5"
                        value={quietStart}
                        onChange={(e) =>
                          handleChange("quiet_hours_start", e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="quiet_hours_end" className="text-xs text-muted-foreground">
                        Ends
                      </Label>
                      <Input
                        id="quiet_hours_end"
                        type="time"
                        className="mt-1.5"
                        value={quietEnd}
                        onChange={(e) =>
                          handleChange("quiet_hours_end", e.target.value)
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Notification types</CardTitle>
                <CardDescription>
                  Pick which categories you want to hear about
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {NOTIFICATION_TYPES.map(({ key, label, icon }) => (
                    <ToggleRow
                      key={key}
                      id={key}
                      label={label}
                      icon={icon}
                      checked={Boolean(mergedData[key] ?? true)}
                      onCheckedChange={(checked) => handleChange(key, checked)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-6 flex justify-end lg:hidden">
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={updateMutation.isPending || !hasChanges}
          >
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
