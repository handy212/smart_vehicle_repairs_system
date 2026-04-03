"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link2, RefreshCcw, Unplug, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { useToast } from "@/lib/hooks/useToast";

export function QuickBooksOnlineCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to disconnect",
        variant: "destructive",
      });
    },
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      await quickbooksApi.syncInbound();
      toast({
        title: "Sync Started",
        description: "Pulling data from QuickBooks in the background.",
      });
      // Refresh status after a short delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["qbo", "status"] });
      }, 5000);
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.response?.data?.message || "Could not trigger sync",
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
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs flex-1 font-semibold group"
                onClick={handleSync}
                disabled={syncing}
              >
                <RefreshCcw className={`w-3.5 h-3.5 mr-2 transition-transform duration-500 ${syncing ? "animate-spin" : "group-hover:rotate-180"}`} />
                Sync Now
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
