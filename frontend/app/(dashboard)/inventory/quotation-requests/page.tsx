"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, ExternalLink, RefreshCw, Search } from "lucide-react";
import { useState } from "react";

import { diagnosisApi, QuotationQueueRecommendation } from "@/lib/api/diagnosis";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/lib/hooks/useToast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useAuthStore } from "@/store/authStore";


const getErrorMessage = (error: unknown) => {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) {
      return response.data.error;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
};

export default function QuotationRequestsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { hasAnyPermission } = usePermissions();
  const { user } = useAuthStore();

  const isAdminUser =
    user?.role === "admin" ||
    user?.role === "super-admin" ||
    Boolean((user as { is_superuser?: boolean } | null)?.is_superuser);
  const canViewQuotationQueue =
    isAdminUser || hasAnyPermission(["view_inventory", "edit_estimates", "manage_inventory", "view_billing"]);
  const canCompleteQuotes =
    isAdminUser || hasAnyPermission(["edit_estimates", "manage_inventory", "approve_estimates"]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["diagnosis", "quotation-queue", search],
    queryFn: () => diagnosisApi.quotationQueue(search ? { search } : undefined),
    enabled: canViewQuotationQueue,
  });

  const markQuotedMutation = useMutation({
    mutationFn: (recommendationId: number) => diagnosisApi.markRecommendationQuoted(recommendationId),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "quotation-queue"] });
      queryClient.invalidateQueries({ queryKey: ["diagnosis"] });
      toast({
        title: "Quotation ready",
        description: response.message,
        variant: "default",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Failed to update quotation",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const recommendations: QuotationQueueRecommendation[] = data?.results || [];
  const totalParts = recommendations.reduce((sum, recommendation) => {
    return sum + (recommendation.parts_needed?.reduce((partSum, part) => partSum + Number(part.quantity || 0), 0) || 0);
  }, 0);

  if (!canViewQuotationQueue) {
    return (
      <Card className="border-destructive/20">
        <CardContent className="py-12 text-center">
          <h2 className="text-sm font-medium text-foreground">Stores quotation access required</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            This workspace is for stores, inventory, or billing staff handling quotation handoff.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/inventory" className="hover:text-primary transition-colors">Inventory</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Quotation Requests</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Stores Quotation Queue</h1>
          <p className="text-sm text-muted-foreground">
            Approved diagnosis recommendations waiting for stores quotation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} className="h-9">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending Quotes</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{recommendations.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Approved recommendations waiting on stores pricing.</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parts Requested</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{totalParts}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total part quantity referenced across the current queue.</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workflow</p>
            <p className="mt-2 text-sm font-semibold text-foreground">Diagnosis approval to stores quote</p>
            <p className="mt-1 text-xs text-muted-foreground">Open the linked quote, complete pricing, then mark the recommendation quoted.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm bg-muted/50">
        <CardHeader className="border-b bg-muted/50 pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground">Queue</CardTitle>
          <CardDescription className="text-xs">
            Search by work order, vehicle, recommendation, finding title, or quote number.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search queue or quote number..."
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : isError ? (
        <Card className="border-destructive/20">
          <CardContent className="py-12 text-center">
            <h2 className="text-sm font-medium text-destructive">Unable to load quotation queue</h2>
            <p className="mt-2 text-xs text-muted-foreground">{getErrorMessage(error)}</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : recommendations.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {recommendations.map((recommendation) => (
            <Card key={recommendation.id} className="border shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={recommendation.priority === "critical" ? "danger" : recommendation.priority === "necessary" ? "default" : "secondary"} className="capitalize">
                        {recommendation.priority_display || recommendation.priority}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {recommendation.recommendation_type_display || recommendation.recommendation_type}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {recommendation.work_order_number}
                      {recommendation.vehicle_display ? ` • ${recommendation.vehicle_display}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {recommendation.customer_name || "Unknown customer"}
                      {recommendation.branch_name ? ` • ${recommendation.branch_name}` : ""}
                    </p>
                    {recommendation.quotation_estimate_number && (
                      <p className="text-xs text-muted-foreground">
                        Quote: <span className="font-medium text-foreground">{recommendation.quotation_estimate_number}</span>
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {recommendation.quotation_status_display || "Requested"}
                  </Badge>
                </div>

                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-sm leading-6 text-foreground">{recommendation.description}</p>
                </div>

                {Array.isArray(recommendation.parts_needed) && recommendation.parts_needed.length > 0 && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parts Needed</p>
                    <div className="mt-2 space-y-1 text-sm text-foreground">
                      {recommendation.parts_needed.map((part, index) => (
                        <p key={`${recommendation.id}-part-${index}`}>
                          {part.part_name} x{part.quantity}
                          {part.part_number ? ` (${part.part_number})` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(recommendation.linked_findings) && recommendation.linked_findings.length > 0 && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supporting Findings</p>
                    <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                      {recommendation.linked_findings.map((finding) => (
                        <div key={finding.id}>
                          <p className="font-medium text-foreground">{finding.finding_title}</p>
                          {Array.isArray(finding.diagnostic_codes) && finding.diagnostic_codes.length > 0 && (
                            <p>Codes: {finding.diagnostic_codes.map((code) => code.code_number).join(", ")}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <p className="font-medium uppercase tracking-wide">Requested</p>
                    <p className="mt-1">
                      {recommendation.quotation_requested_at
                        ? new Date(recommendation.quotation_requested_at).toLocaleString()
                        : "Not captured"}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium uppercase tracking-wide">Requested By</p>
                    <p className="mt-1">{recommendation.quotation_requested_by_name || "Not captured"}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    className="h-8"
                    size="sm"
                    onClick={() => markQuotedMutation.mutate(recommendation.id)}
                    disabled={!canCompleteQuotes || markQuotedMutation.isPending}
                    title={!canCompleteQuotes ? "You do not have permission to complete stores quotations." : undefined}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Mark Quoted
                  </Button>
                  {recommendation.quotation_estimate_id && (
                    <Link href={`/billing/estimates/${recommendation.quotation_estimate_id}`} className="inline-flex">
                      <Button variant="outline" size="sm" className="h-8">
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Open Quote
                      </Button>
                    </Link>
                  )}
                  <Link href={`/workorders/${recommendation.work_order_id}`} className="inline-flex">
                    <Button variant="outline" size="sm" className="h-8">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Open Work Order
                    </Button>
                  </Link>
                  <Link href={`/workorders/${recommendation.work_order_id}/diagnosis`} className="inline-flex">
                    <Button variant="ghost" size="sm" className="h-8">
                      <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                      View Diagnosis
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-20 text-center">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <h2 className="text-sm font-medium text-foreground">No quotation requests</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Approved recommendations sent to stores will appear here. Once priced, the linked quote stays available from the work order and billing screens.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
