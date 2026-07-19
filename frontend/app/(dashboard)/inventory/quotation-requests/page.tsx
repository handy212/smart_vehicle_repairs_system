"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, ExternalLink, Grid2X2, List, Package, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { diagnosisApi, QuotationQueueRecommendation } from "@/lib/api/diagnosis";
import { workordersApi, WorkOrderPart } from "@/lib/api/workorders";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import {
  PARTS_REQUESTS_VIEW_PERMISSIONS,
  STORES_QUOTATION_COMPLETE_PERMISSIONS,
  STORES_QUOTATION_VIEW_PERMISSIONS,
} from "@/lib/utils/permissions";
import { PartRequestDetailDialog } from "../parts-requests/components/PartRequestDetailDialog";
import { getUserFacingError } from "@/lib/api/errors";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortClientRecords, sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

interface PartsRequestStats {
  draft_requests?: number;
  pending_requests?: number;
  po_created_requests?: number;
  awaiting_stock_requests?: number;
  received_requests?: number;
  ready_requests?: number;
}

interface PaginatedPartsResponse {
  next?: string | null;
  results?: WorkOrderPart[];
}

const fulfillmentStatusOptions = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "po_created", label: "PO Created" },
  { value: "awaiting_stock", label: "Awaiting Stock" },
  { value: "received", label: "Received" },
  { value: "ready", label: "Ready" },
] as const;

type FulfillmentView = "list" | "grid";
type WorkbenchTab = "quotes" | "fulfillment";

function fulfillmentStageLabel(parts: WorkOrderPart[]): string {
  const first = parts[0];
  if (!first) return "—";
  if (first.work_order_is_approved === false) {
    if (first.work_order_quote_stage === "waiting_for_stores_quotation") return "Waiting Quote";
    if (
      first.work_order_quote_stage === "waiting_for_customer_approval" ||
      first.work_order_quote_stage === "quotation_ready"
    ) {
      return "Quote Ready";
    }
    return first.work_order_quote_stage_display || "Awaiting Approval";
  }
  const statusCounts = parts.reduce((acc: Record<string, number>, part) => {
    acc[part.status] = (acc[part.status] || 0) + 1;
    return acc;
  }, {});
  const keys = Object.keys(statusCounts);
  if (keys.length > 1) return `${keys.length} statuses`;
  return (keys[0] || "pending").replace(/_/g, " ");
}

export default function QuotationRequestsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const workOrderParam = searchParams.get("work_order");
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState("all");
  const [fulfillmentView, setFulfillmentView] = useState<FulfillmentView>("list");
  const [selectedWoId, setSelectedWoId] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(
    tabParam === "fulfillment" ? "fulfillment" : "quotes"
  );
  const { hasAnyPermission } = usePermissions();

  const canViewQuotationQueue = hasAnyPermission([...STORES_QUOTATION_VIEW_PERMISSIONS]);
  const canViewFulfillment = hasAnyPermission([
    ...STORES_QUOTATION_VIEW_PERMISSIONS,
    ...PARTS_REQUESTS_VIEW_PERMISSIONS,
  ]);
  const canCompleteQuotes = hasAnyPermission([...STORES_QUOTATION_COMPLETE_PERMISSIONS]);

  useEffect(() => {
    if (tabParam === "fulfillment" || tabParam === "quotes") {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    if (workOrderParam) {
      const id = Number(workOrderParam);
      if (Number.isFinite(id)) {
        setSelectedWoId(id);
        setActiveTab("fulfillment");
      }
    }
  }, [workOrderParam]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["diagnosis", "quotation-queue", search],
    queryFn: () => diagnosisApi.quotationQueue(search ? { search } : undefined),
    enabled: canViewQuotationQueue,
  });

  const { data: partsStats, isLoading: partsStatsLoading } = useQuery<PartsRequestStats>({
    queryKey: ["parts-requests-stats"],
    queryFn: () => workordersApi.parts.dashboardStats(),
    enabled: canViewFulfillment,
  });

  const handleSort = (field: string) => {
    setSortConfig((current) => toggleSortConfig(current, field));
  };

  const { data: parts = [], isLoading: partsLoading, refetch: refetchParts } = useQuery({
    queryKey: ["stores-workbench", "parts-requests", sortConfig],
    queryFn: async () => {
      const collectedParts: WorkOrderPart[] = [];
      let page = 1;
      const ordering = sortOrderingParam(sortConfig) || "-work_order__work_order_number";

      while (true) {
        const response = await workordersApi.parts.list({
          page,
          ordering,
        } as { page?: number; ordering?: string });

        if (Array.isArray(response)) {
          return response;
        }

        const paginatedResponse = response as unknown as PaginatedPartsResponse;
        collectedParts.push(...(paginatedResponse.results || []));

        if (!paginatedResponse.next) {
          return collectedParts;
        }

        page += 1;
      }
    },
    enabled: canViewFulfillment,
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
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const recommendations: QuotationQueueRecommendation[] = data?.results || [];
  const totalParts = recommendations.reduce((sum, recommendation) => {
    return sum + (recommendation.parts_needed?.reduce((partSum, part) => partSum + Number(part.quantity || 0), 0) || 0);
  }, 0);
  const partRows = useMemo(() => parts as WorkOrderPart[], [parts]);
  const statusFilteredParts = useMemo(
    () => partRows.filter((part) => activeStatus === "all" || part.status === activeStatus),
    [activeStatus, partRows]
  );
  const groupedParts = useMemo(
    () => statusFilteredParts.reduce((acc: Record<number, WorkOrderPart[]>, part) => {
      if (!acc[part.work_order]) {
        acc[part.work_order] = [];
      }
      acc[part.work_order].push(part);
      return acc;
    }, {}),
    [statusFilteredParts]
  );
  const allGroupedParts = useMemo(
    () => partRows.reduce((acc: Record<number, WorkOrderPart[]>, part) => {
      if (!acc[part.work_order]) {
        acc[part.work_order] = [];
      }
      acc[part.work_order].push(part);
      return acc;
    }, {}),
    [partRows]
  );
  const filteredWorkOrderIds = useMemo(
    () => Object.keys(groupedParts)
      .map(Number)
      .filter((workOrderId) => {
        const workOrderParts = groupedParts[workOrderId] || [];
        const firstPart = workOrderParts[0];
        if (!firstPart) return false;
        const query = search.trim().toLowerCase();
        if (!query) return true;
        return [
          firstPart.work_order_number,
          firstPart.customer_name,
          firstPart.vehicle_info,
          ...workOrderParts.map((part) => `${part.part_name} ${part.part_number || ""}`),
        ].some((value) => value?.toLowerCase().includes(query));
      }),
    [groupedParts, search]
  );
  const sortedWorkOrderIds = useMemo(() => {
    const rows = filteredWorkOrderIds.map((woId) => ({
      woId,
      part: groupedParts[woId][0],
    }));
    return sortClientRecords(rows, sortConfig, {
      work_order__work_order_number: (row) => row.part.work_order_number ?? "",
      work_order__customer__user__last_name: (row) => row.part.customer_name ?? "",
      work_order__vehicle__license_plate: (row) => row.part.vehicle_info ?? "",
      status: (row) => row.part.status ?? "",
    }).map((row) => row.woId);
  }, [filteredWorkOrderIds, groupedParts, sortConfig]);
  const pendingFulfillmentCount = Number(partsStats?.pending_requests || 0)
    + Number(partsStats?.po_created_requests || 0)
    + Number(partsStats?.awaiting_stock_requests || 0)
    + Number(partsStats?.received_requests || 0);

  const refreshStoresWorkbench = () => {
    refetch();
    refetchParts();
    queryClient.invalidateQueries({ queryKey: ["parts-requests-stats"] });
  };

  return (
    <PermissionPageGuard
      permissions={[...STORES_QUOTATION_VIEW_PERMISSIONS, ...PARTS_REQUESTS_VIEW_PERMISSIONS]}
      deniedTitle="Stores workbench access required"
      deniedDescription="This workspace is for stores and inventory staff handling quotation and parts fulfillment."
    >
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/inventory" className="hover:text-primary transition-colors">Parts & Stock</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Parts Requests</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Parts Requests</h1>
          <p className="text-xs text-muted-foreground">
            Quotes: price diagnosis recommendations. Fulfillment: order, receive, and allocate parts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refreshStoresWorkbench} className="h-8">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="rounded-md border shadow-none">
          <CardContent className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium uppercase text-muted-foreground">Pending Quotes</p>
              <p className="text-[11px] text-muted-foreground">Need pricing</p>
            </div>
            <p className="text-xl font-semibold tabular-nums text-foreground">{recommendations.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-md border shadow-none">
          <CardContent className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium uppercase text-muted-foreground">Parts Requested</p>
              <p className="text-[11px] text-muted-foreground">In quote queue</p>
            </div>
            <p className="text-xl font-semibold tabular-nums text-foreground">{totalParts}</p>
          </CardContent>
        </Card>
        <Card className="rounded-md border shadow-none">
          <CardContent className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium uppercase text-muted-foreground">Open Fulfillment</p>
              <p className="text-[11px] text-muted-foreground">Not allocated</p>
            </div>
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {partsStatsLoading ? "-" : pendingFulfillmentCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 rounded-md border bg-card p-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search work order, vehicle, part, quote..."
            className="h-8 pl-8 text-xs"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">Stores quote and fulfillment queue</p>
      </div>

      <Tabs
        value={canViewQuotationQueue ? activeTab : "fulfillment"}
        onValueChange={(value) => setActiveTab(value as WorkbenchTab)}
        className="space-y-3"
      >
        <TabsList className="h-8 w-full justify-start rounded-md border bg-muted/30 p-0.5 sm:w-auto">
          {canViewQuotationQueue && (
            <TabsTrigger value="quotes" className="h-7 px-3 text-xs">
              Quotes
              {recommendations.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">
                  {recommendations.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="fulfillment" className="h-7 px-3 text-xs">
            Fulfillment
            {pendingFulfillmentCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">
                {pendingFulfillmentCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {canViewQuotationQueue && (
        <TabsContent value="quotes" className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : isError ? (
            <Card className="border-destructive/20">
              <CardContent className="py-12 text-center">
                <h2 className="text-sm font-medium text-destructive">Unable to load quotation queue</h2>
                <p className="mt-2 text-xs text-muted-foreground">{getUserFacingError(error)}</p>
                <Button variant="outline" className="mt-4" onClick={() => refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : recommendations.length > 0 ? (
            <div className="overflow-hidden rounded-md border bg-card">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Work Order</TableHead>
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Customer / Vehicle</TableHead>
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Recommendation</TableHead>
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Parts</TableHead>
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Requested</TableHead>
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Status</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recommendations.map((recommendation) => {
                      const partsNeeded = Array.isArray(recommendation.parts_needed)
                        ? recommendation.parts_needed
                        : [];
                      const partsSummary = partsNeeded.length
                        ? `${partsNeeded[0].part_name}${partsNeeded.length > 1 ? ` +${partsNeeded.length - 1}` : ""}`
                        : "No parts listed";
                      return (
                        <TableRow key={recommendation.id}>
                          <TableCell className="px-3 py-2 align-top">
                            <p className="font-mono text-xs font-medium text-primary">
                              {recommendation.work_order_number}
                            </p>
                            {recommendation.quotation_estimate_number && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                Quote {recommendation.quotation_estimate_number}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <Badge
                                variant={
                                  recommendation.priority === "critical"
                                    ? "danger"
                                    : recommendation.priority === "necessary"
                                      ? "default"
                                      : "secondary"
                                }
                                className="h-5 rounded-sm px-1.5 text-[10px] capitalize"
                              >
                                {recommendation.priority_display || recommendation.priority}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2 align-top">
                            <p className="max-w-[200px] truncate text-xs font-medium text-foreground">
                              {recommendation.customer_name || "Unknown customer"}
                            </p>
                            <p className="max-w-[200px] truncate text-[11px] text-muted-foreground">
                              {recommendation.vehicle_display || "—"}
                            </p>
                            {recommendation.branch_name && (
                              <p className="text-[11px] text-muted-foreground">{recommendation.branch_name}</p>
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-2 align-top">
                            <p className="max-w-[280px] text-xs leading-5 text-foreground line-clamp-2">
                              {recommendation.description}
                            </p>
                            <p className="mt-1 text-[11px] capitalize text-muted-foreground">
                              {recommendation.recommendation_type_display || recommendation.recommendation_type}
                            </p>
                          </TableCell>
                          <TableCell className="px-3 py-2 align-top">
                            <p className="max-w-[180px] truncate text-xs text-foreground">{partsSummary}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {partsNeeded.length} line{partsNeeded.length === 1 ? "" : "s"}
                            </p>
                          </TableCell>
                          <TableCell className="px-3 py-2 align-top text-xs text-muted-foreground">
                            <p>
                              {recommendation.quotation_requested_at
                                ? new Date(recommendation.quotation_requested_at).toLocaleString()
                                : "—"}
                            </p>
                            <p className="mt-0.5">{recommendation.quotation_requested_by_name || "—"}</p>
                          </TableCell>
                          <TableCell className="px-3 py-2 align-top">
                            <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px] capitalize">
                              {recommendation.quotation_status_display || "Requested"}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 py-2 align-top text-right">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Button
                                className="h-7 px-2 text-xs"
                                size="sm"
                                onClick={() => markQuotedMutation.mutate(recommendation.id)}
                                disabled={!canCompleteQuotes || markQuotedMutation.isPending}
                                title={
                                  !canCompleteQuotes
                                    ? "You do not have permission to complete stores quotations."
                                    : undefined
                                }
                              >
                                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                Mark Quoted
                              </Button>
                              {recommendation.quotation_estimate_id && (
                                <Link
                                  href={`/billing/estimates/${recommendation.quotation_estimate_id}`}
                                  className="inline-flex"
                                >
                                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                    Quote
                                  </Button>
                                </Link>
                              )}
                              <Link
                                href={`/workorders/${recommendation.work_order_id}/diagnosis`}
                                className="inline-flex"
                              >
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                  <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                                  Diagnosis
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-20 text-center">
                <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                <h2 className="text-sm font-medium text-foreground">No quotation requests</h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  Diagnosis recommendations sent to stores will appear here. Once priced, mark them quoted so the coordinator can seek customer approval.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        )}

        <TabsContent value="fulfillment" className="space-y-3">
          <div className="flex flex-col gap-2 rounded-md border bg-card p-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {fulfillmentStatusOptions.map((statusOption) => (
                <Button
                  key={statusOption.value}
                  variant={activeStatus === statusOption.value ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setActiveStatus(statusOption.value)}
                >
                  {statusOption.label}
                </Button>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-md border bg-muted/30 p-0.5">
              <Button
                type="button"
                variant={fulfillmentView === "list" ? "default" : "ghost"}
                size="sm"
                className="h-7 w-7 px-0"
                aria-label="List view"
                title="List view"
                onClick={() => setFulfillmentView("list")}
              >
                <List className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant={fulfillmentView === "grid" ? "default" : "ghost"}
                size="sm"
                className="h-7 w-7 px-0"
                aria-label="Grid view"
                title="Grid view"
                onClick={() => setFulfillmentView("grid")}
              >
                <Grid2X2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {partsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : sortedWorkOrderIds.length > 0 && fulfillmentView === "list" ? (
            <div className="overflow-hidden rounded-md border bg-card">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                      <SortableHeader field="work_order__work_order_number" sortConfig={sortConfig} onSort={handleSort} className="h-9 px-3 text-[10px] font-semibold uppercase text-muted-foreground">
                        Work Order
                      </SortableHeader>
                      <SortableHeader field="work_order__customer__user__last_name" sortConfig={sortConfig} onSort={handleSort} className="h-9 px-3 text-[10px] font-semibold uppercase text-muted-foreground">
                        Customer
                      </SortableHeader>
                      <SortableHeader field="work_order__vehicle__license_plate" sortConfig={sortConfig} onSort={handleSort} className="h-9 px-3 text-[10px] font-semibold uppercase text-muted-foreground">
                        Vehicle
                      </SortableHeader>
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Parts</TableHead>
                      <SortableHeader field="status" sortConfig={sortConfig} onSort={handleSort} className="h-9 px-3 text-[10px] font-semibold uppercase text-muted-foreground">
                        Status
                      </SortableHeader>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedWorkOrderIds.map((workOrderId) => {
                      const workOrderParts = groupedParts[workOrderId] || [];
                      const firstPart = workOrderParts[0];
                      const stageLabel = fulfillmentStageLabel(workOrderParts);
                      const waitingQuote = firstPart?.work_order_quote_stage === "waiting_for_stores_quotation";

                      return (
                        <TableRow key={workOrderId} className="cursor-pointer" onClick={() => setSelectedWoId(workOrderId)}>
                          <TableCell className="px-3 py-2">
                            <p className="font-mono text-xs font-medium text-primary">
                              {firstPart?.work_order_number || `WO #${workOrderId}`}
                            </p>
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <p className="max-w-[220px] truncate text-xs font-medium text-foreground">
                              {firstPart?.customer_name || "Unknown customer"}
                            </p>
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <p className="max-w-[240px] truncate text-xs text-muted-foreground">
                              {firstPart?.vehicle_info || "Unknown vehicle"}
                            </p>
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <div className="max-w-[320px] space-y-1">
                              <p className="truncate text-xs font-medium text-foreground">
                                {workOrderParts[0]?.part_name || "No part name"}
                                {workOrderParts.length > 1 ? ` +${workOrderParts.length - 1} more` : ""}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Total qty {workOrderParts.reduce((sum, part) => sum + Number(part.quantity || 0), 0)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <Badge
                              variant={
                                waitingQuote
                                  ? "warning"
                                  : stageLabel.toLowerCase().includes("ready")
                                    ? "success"
                                    : "secondary"
                              }
                              className="h-5 rounded-sm px-1.5 text-[10px] capitalize"
                            >
                              {stageLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedWoId(workOrderId);
                                }}
                              >
                                <Package className="mr-1.5 h-3.5 w-3.5" />
                                Manage
                              </Button>
                              <Link href={`/workorders/${workOrderId}`} className="inline-flex" onClick={(event) => event.stopPropagation()}>
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : sortedWorkOrderIds.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {sortedWorkOrderIds.map((workOrderId) => {
                const workOrderParts = groupedParts[workOrderId] || [];
                const firstPart = workOrderParts[0];
                const statusCounts = workOrderParts.reduce((acc: Record<string, number>, part) => {
                  acc[part.status] = (acc[part.status] || 0) + 1;
                  return acc;
                }, {});

                return (
                  <Card key={workOrderId} className="rounded-md border shadow-none">
                    <CardContent className="space-y-3 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold leading-5 text-foreground">
                            {firstPart?.work_order_number || `WO #${workOrderId}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {firstPart?.customer_name || "Unknown customer"}
                            {firstPart?.vehicle_info ? ` • ${firstPart.vehicle_info}` : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                          {workOrderParts.length} part{workOrderParts.length === 1 ? "" : "s"}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(statusCounts).map(([partStatus, count]) => (
                          <Badge key={partStatus} variant={partStatus === "ready" ? "success" : "secondary"} className="h-5 rounded-sm px-1.5 text-[10px] capitalize">
                            {partStatus.replace("_", " ")}: {count}
                          </Badge>
                        ))}
                      </div>

                      <div className="rounded-md border bg-muted/20">
                        {workOrderParts.slice(0, 4).map((part) => (
                          <div key={part.id} className="flex items-center justify-between gap-3 border-b px-2.5 py-1.5 last:border-b-0">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-foreground">{part.part_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Qty {part.quantity}
                                {part.part_number ? ` • ${part.part_number}` : ""}
                              </p>
                            </div>
                            <Badge variant="outline" className="h-5 shrink-0 rounded-sm px-1.5 text-[10px] capitalize">
                              {part.status.replace("_", " ")}
                            </Badge>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2 border-t pt-3">
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedWoId(workOrderId)}>
                          <Package className="mr-1.5 h-3.5 w-3.5" />
                          Manage Parts
                        </Button>
                        <Link href={`/workorders/${workOrderId}`} className="inline-flex">
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Open Work Order
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-20 text-center">
                <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                <h2 className="text-sm font-medium text-foreground">No parts requests</h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  Parts created from diagnosis recommendations appear here for ordering, receiving, and allocation.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <PartRequestDetailDialog
        open={!!selectedWoId}
        onOpenChange={(open) => !open && setSelectedWoId(null)}
        workOrderId={selectedWoId}
        parts={selectedWoId ? (allGroupedParts[selectedWoId] || []) : []}
        onRefresh={refreshStoresWorkbench}
      />
    </div>
    </PermissionPageGuard>
  );
}
