"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link2, RefreshCcw, Unplug, ExternalLink, Copy, Check, Upload } from "lucide-react";
import { format } from "date-fns";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

export function QuickBooksOnlineCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [pushingPending, setPushingPending] = useState(false);
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["qbo", "status"],
    queryFn: () => quickbooksApi.getStatus(),
    refetchInterval: 30000, // Refresh every 30s
  });

  const disconnectMutation = useMutation({
    mutationFn: () => quickbooksApi.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbo", "status"] });
      toast({
        title: "Success",
        description: "Disconnected from QuickBooks Online",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to disconnect from QuickBooks"),
        variant: "destructive",
      });
    },
  });

  const handlePushPending = async () => {
    const pendingTotal = status?.outbound_pending?.eligible_total ?? 0;
    const message =
      pendingTotal > 0
        ? `Push ${pendingTotal} eligible record(s) to QuickBooks now?`
        : "Push all eligible failed/pending records to QuickBooks?";
    if (!confirm(message)) {
      return;
    }

    setPushingPending(true);
    try {
      const result = await quickbooksApi.syncOutboundBulk();
      toast({
        title: "Push Started",
        description: result.message,
      });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["qbo", "status"] });
      }, 5000);
    } catch (error: unknown) {
      toast({
        title: "Push Failed",
        description: getUserFacingError(error, "Could not queue outbound sync"),
        variant: "destructive",
      });
    } finally {
      setPushingPending(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await quickbooksApi.syncInbound();
      toast({
        title: "Pull Started",
        description: "Pulling data from QuickBooks in the background.",
      });
      // Refresh status after a short delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["qbo", "status"] });
      }, 5000);
    } catch (error: unknown) {
      toast({
        title: "Sync Failed",
        description: getUserFacingError(error, "Could not trigger sync"),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="border shadow-none animate-pulse">
        <div className="h-40 bg-muted/50 rounded-md" />
      </Card>
    );
  }

  return (
    <Card className="border shadow-none overflow-hidden hover:border-primary/30 transition-colors bg-card">
      <CardHeader className="py-3 px-4 bg-muted/30 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-bold text-foreground flex items-center gap-2 uppercase tracking-tight">
            <div className={`w-2 h-2 rounded-full ${status?.is_connected ? "bg-success/100" : "bg-muted-foreground/30"}`} />
            QuickBooks Online
          </CardTitle>
          {status?.is_connected && (
            <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded font-bold uppercase">
              Connected
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {status?.is_connected ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-[11px]">
              <div>
                <p className="text-muted-foreground uppercase font-bold tracking-widest text-[9px] mb-1">Company ID</p>
                <p className="font-mono text-foreground font-semibold bg-muted/50 px-2 py-1 rounded inline-block">{status.realm_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase font-bold tracking-widest text-[9px] mb-1">Environment</p>
                <p className="text-foreground font-semibold bg-muted/50 px-2 py-1 rounded inline-block">
                    {status.is_sandbox ? "Sandbox" : "Production"}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground uppercase font-bold tracking-widest text-[9px] mb-1">Last Sync</p>
                <p className="text-foreground font-semibold">
                  {status.last_sync ? format(new Date(status.last_sync), "MMM d, yyyy h:mm a") : "Never"}
                </p>
              </div>
              {status.outbound_pending && status.outbound_pending.eligible_total > 0 && (
                <div className="col-span-2">
                  <p className="text-muted-foreground uppercase font-bold tracking-widest text-[9px] mb-1">Pending Push</p>
                  <p className="text-foreground font-semibold">
                    {status.outbound_pending.eligible_total} eligible
                    {status.outbound_pending.failed_mappings > 0 && (
                      <span className="text-destructive ml-1">
                        ({status.outbound_pending.eligible_failed} failed)
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {status.is_connected && status.api_ready === false && (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                {status.connection_issue ||
                  "QuickBooks is linked but the live API session is unavailable. Disconnect and reconnect to restore chart mapping and sync."}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs w-full font-semibold group"
                onClick={handlePushPending}
                disabled={pushingPending || syncing}
              >
                <Upload className={`w-3.5 h-3.5 mr-2 ${pushingPending ? "animate-pulse" : ""}`} />
                {pushingPending ? "Queuing…" : "Push All Pending to QBO"}
              </Button>
              <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs flex-1 font-semibold group"
                onClick={handleSync}
                disabled={syncing || pushingPending}
              >
                <RefreshCcw className={`w-3.5 h-3.5 mr-2 transition-transform duration-500 ${syncing ? "animate-spin" : "group-hover:rotate-180"}`} />
                Pull from QBO
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                onClick={() => {
                  if (confirm("Are you sure you want to disconnect from QuickBooks Online?")) {
                    disconnectMutation.mutate();
                  }
                }}
              >
                <Unplug className="w-4 h-4" />
              </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-2 text-muted-foreground/40">
              <Link2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground">
                {!status?.has_keys ? "Keys Required" : "Account Not Linked"}
              </h3>
              <p className="text-[11px] text-muted-foreground max-w-[200px] mx-auto leading-relaxed">
                {!status?.has_keys 
                  ? "Configure your API Client ID and Secret in the section below to enable the QuickBooks integration."
                  : "Securely link your QuickBooks account to synchronize invoices, customers, and payments."}
              </p>
            </div>
            {status?.has_keys && status.oauth_redirect_uri && (
              <div className="text-left rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800 dark:text-amber-300">
                  Intuit redirect URI (register exactly)
                </p>
                <p className="text-[10px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                  In the Intuit Developer Portal, open your app&apos;s <strong>Keys</strong> tab and add this
                  URL under <strong>Redirect URIs</strong> for{" "}
                  {status.oauth_keys_environment === "production" ? "Production" : "Sandbox"} keys.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[10px] font-mono break-all bg-background/80 px-2 py-1.5 rounded border">
                    {status.oauth_redirect_uri}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(status.oauth_redirect_uri ?? "");
                      setCopiedRedirectUri(true);
                      setTimeout(() => setCopiedRedirectUri(false), 2000);
                    }}
                  >
                    {copiedRedirectUri ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            )}
            <Button
              size="sm"
              className="w-full h-9 text-xs bg-[#2ca01c] hover:bg-[#2ca01c]/90 text-white font-bold shadow-md transition-all active:scale-95"
              onClick={() => quickbooksApi.connect()}
              disabled={!status?.has_keys}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-2" />
              {status?.has_keys ? "Connect QuickBooks" : "Waiting for Keys"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
