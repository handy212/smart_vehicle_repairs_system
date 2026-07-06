"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/lib/hooks/useToast";

const QBO_STATUS_MESSAGES: Record<
  string,
  { title: string; description: string; variant?: "default" | "destructive" }
> = {
  connected: {
    title: "QuickBooks connected",
    description: "Your QuickBooks Online company is now linked. Outbound sync will run automatically.",
  },
  disconnected: {
    title: "Disconnected",
    description: "QuickBooks Online has been disconnected.",
  },
  refreshed: {
    title: "Token refreshed",
    description: "The QuickBooks OAuth token was refreshed successfully.",
  },
  sync_started: {
    title: "Inbound sync started",
    description: "Pulling payment status and vendor updates from QuickBooks in the background.",
  },
  missing_config: {
    title: "QuickBooks not configured",
    description: "Add your Client ID and Secret below before connecting.",
    variant: "destructive",
  },
  sdk_missing: {
    title: "QuickBooks SDK unavailable",
    description: "Install intuit-oauth and python-quickbooks on the server.",
    variant: "destructive",
  },
  invalid_state: {
    title: "Connection failed",
    description:
      "OAuth state was invalid or expired. Click Connect QuickBooks again without refreshing during the Intuit login.",
    variant: "destructive",
  },
  invalid_callback: {
    title: "Connection failed",
    description: "QuickBooks returned incomplete authorization data. Try connecting again.",
    variant: "destructive",
  },
  forbidden: {
    title: "Permission denied",
    description: "Only a superuser can connect or disconnect QuickBooks Online.",
    variant: "destructive",
  },
  error: {
    title: "Connection error",
    description: "QuickBooks authorization failed. Check server logs and try again.",
    variant: "destructive",
  },
  refresh_error: {
    title: "Token refresh failed",
    description: "Could not refresh the QuickBooks token. Reconnect under Admin → Integrations.",
    variant: "destructive",
  },
  not_connected: {
    title: "Not connected",
    description: "QuickBooks is not linked to this workspace.",
    variant: "destructive",
  },
};

export function useQboStatusNotifications() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const status = searchParams.get("qbo_status");
    if (!status || handled.current === status) return;
    handled.current = status;

    const message = QBO_STATUS_MESSAGES[status];
    if (message) {
      toast({
        title: message.title,
        description: message.description,
        variant: message.variant,
      });
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("qbo_status");
    const query = params.toString();
    router.replace(query ? `?${query}` : "?category=accounting", { scroll: false });
  }, [searchParams, router, toast]);
}
