"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subscriptionsApi, SubscriptionUsage } from "@/lib/api/subscriptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalPageHeader } from "../../components/PortalPageHeader";
import {
  Package as PackageIcon,
  Calendar,
  Car,
  CreditCard,
  RefreshCw,
  Download,
  ArrowLeft,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { cn } from "@/lib/utils/cn";
import { getUserFacingError } from "@/lib/api/errors";

const USAGE_TYPE_LABELS: Record<string, string> = {
  kilometer: "Kilometer",
  call_out: "Call Out",
  towing: "Towing",
  inspection: "Inspection",
  roadside_assistance: "Roadside Assistance",
  other: "Other",
};

export default function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();

  const subId = parseInt(id);

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["portal", "subscription", subId],
    queryFn: () => subscriptionsApi.get(subId),
    enabled: !!subId,
  });

  const { data: usage = [], isLoading: isLoadingUsage } = useQuery({
    queryKey: ["portal", "subscription-usage", subId],
    queryFn: () => subscriptionsApi.usage(subId),
    enabled: !!subId,
  });

  const renewMutation = useMutation({
    mutationFn: () => subscriptionsApi.renew(subId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["portal", "subscription", subId] });
      queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
      toast({
        title: "Renewal Invoice Created",
        description: data.message || `Invoice ${data.invoice_number || data.invoice_id || ""} is pending payment.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getUserFacingError(error, "Failed to renew."), variant: "destructive" });
    },
  });

  const downloadMutation = useMutation({
    mutationFn: () => subscriptionsApi.downloadCard(subId, subscription?.subscription_number || String(subId)),
    onError: () => {
      toast({ title: "Error", description: "Could not download membership card.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Card><CardContent className="p-6 space-y-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent></Card>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-sm font-semibold mb-1">Subscription Not Found</h3>
            <p className="text-sm text-muted-foreground mb-4">This subscription does not exist or you do not have access.</p>
            <Button size="sm" variant="outline" onClick={() => router.push("/portal/subscriptions")}>
              <ArrowLeft className="mr-2 h-3.5 w-3.5" />
              Back to Subscriptions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusVariant = subscription.status === "active" && subscription.is_active_status !== false
    ? "default"
    : subscription.status === "expired" || subscription.status === "cancelled"
    ? "danger"
    : "secondary";

  const canRenew =
    subscription.status === "active" &&
    subscription.days_remaining !== undefined &&
    subscription.days_remaining <= 30;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PortalPageHeader
        title={`Subscription ${subscription.subscription_number}`}
        description={subscription.package_name || "Subscription details"}
        action={
          <Button variant="outline" size="sm" onClick={() => router.push("/portal/subscriptions")}>
            <ArrowLeft className="mr-2 h-3.5 w-3.5" />
            Back
          </Button>
        }
      />

      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PackageIcon className="h-4 w-4 text-muted-foreground" />
                {subscription.package_name}
                {subscription.package_code && (
                  <Badge variant="outline" className="text-[10px]">{subscription.package_code}</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{subscription.subscription_number}</p>
            </div>
            <Badge variant={statusVariant} className="capitalize text-[10px] shrink-0">
              {subscription.status === "active" && subscription.is_active_status === false ? "pending activation" : subscription.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-5">
          {/* Info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Start Date
              </p>
              <p className="text-sm font-medium">{format(new Date(subscription.start_date), "MMM dd, yyyy")}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> End Date
              </p>
              <p className="text-sm font-medium">{format(new Date(subscription.end_date), "MMM dd, yyyy")}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Days Remaining
              </p>
              <p className={cn("text-sm font-medium", (subscription.days_remaining ?? 0) <= 10 && subscription.status === "active" ? "text-destructive" : "")}>
                {subscription.days_remaining ?? 0} days
              </p>
            </div>
            {subscription.activation_date && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Benefits Start
                </p>
                <p className={cn("text-sm font-medium", subscription.is_active_status === false ? "text-warning" : "")}>
                  {format(new Date(subscription.activation_date), "MMM dd, yyyy")}
                </p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1 flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> Payment
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={subscription.payment_status === "paid" ? "default" : "secondary"}
                  className="capitalize text-[10px]"
                >
                  {subscription.payment_status}
                </Badge>
                {subscription.payment_status === "pending" && subscription.invoice_id && (
                  <Link href={`/portal/payment/${subscription.invoice_id}`}>
                    <Button variant="default" size="sm" className="h-6 text-xs px-2">
                      Pay Now
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Price row */}
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-0.5">Purchase Price</p>
              <p className="text-base font-semibold">{formatCurrency(subscription.purchase_price)}</p>
            </div>
            {subscription.vehicle && (
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-0.5 flex items-center justify-end gap-1">
                  <Car className="h-3 w-3" /> Vehicle
                </p>
                <p className="text-sm font-medium">#{subscription.vehicle}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {canRenew && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => renewMutation.mutate()}
                disabled={renewMutation.isPending}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {renewMutation.isPending ? "Renewing..." : "Renew Now"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              {downloadMutation.isPending ? "Downloading..." : "Download Card"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Remaining Allowances */}
      {subscription.remaining_allowances && Object.keys(subscription.remaining_allowances).length > 0 && (
        <Card>
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-sm font-semibold">Remaining Allowances</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(subscription.remaining_allowances).map(([key, value]) => {
                const numValue = typeof value === "number" ? value : parseFloat(String(value)) || 0;
                const isEmpty = numValue === 0;
                const isLow = numValue <= 1 && numValue > 0;
                return (
                  <div
                    key={key}
                    className={cn(
                      "px-3 py-2 rounded border text-xs",
                      isEmpty
                        ? "bg-destructive/5 border-destructive/20"
                        : isLow
                        ? "bg-amber-500/5 border-amber-500/20"
                        : "bg-muted border-border"
                    )}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                      <span className={cn("font-bold", isEmpty ? "text-destructive" : isLow ? "text-amber-500" : "")}>
                        {value}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage History */}
      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm font-semibold">Usage History</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoadingUsage ? (
            <div className="space-y-3 pt-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : usage.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No usage recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(usage as SubscriptionUsage[]).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium">{USAGE_TYPE_LABELS[entry.usage_type] || entry.usage_type}</p>
                    {entry.description && (
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="font-semibold">{entry.quantity_used}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(entry.service_date), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
