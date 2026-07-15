"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { inventoryApi } from "@/lib/api/inventory";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { useBranchStore } from "@/store/branchStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, startOfMonth } from "date-fns";
import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ReportExportMenu } from "@/components/reports/ReportExportMenu";
import type { TableExportPayload } from "@/lib/utils/report-export";
import { AxiosError } from "axios";
import { getUserFacingError } from "@/lib/api/errors";

function ReportTable({
  headers,
  rows,
  emptyMessage = "No records",
}: {
  headers: string[];
  rows: (string | number | ReactNode)[][];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {row.map((cell, j) => (
              <TableCell key={j}>{cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatPartLabel(partNumber?: string, partName?: string, fallback?: string) {
  const parts = [partNumber, partName].filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : fallback ?? "—";
}

function queryErrorMessage(error: unknown): string {
  return getUserFacingError(error, "Failed to load report");
}

/** Tabs that filter by start_date / end_date query params */
const DATE_SCOPED_TABS = new Set(["control", "shrinkage", "p2p", "orphan", "unbilled"]);

type TabKey =
  | "control"
  | "accuracy"
  | "availability"
  | "shrinkage"
  | "obsolescence"
  | "p2p"
  | "orphan"
  | "unbilled";

const TAB_TITLES: Record<TabKey, string> = {
  control: "Inventory Control",
  accuracy: "Inventory Accuracy",
  availability: "Top SKU Availability",
  shrinkage: "Shrinkage",
  obsolescence: "Obsolescence",
  p2p: "P2P Compliance",
  orphan: "Orphan Supply",
  unbilled: "Unbilled / Delivered",
};

export default function InventoryComplianceReportsPage() {
  const { activeBranchId, activeBranch } = useBranchStore();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activeTab, setActiveTab] = useState<TabKey>("control");
  const range = { start_date: startDate, end_date: endDate };

  const branchKey = activeBranchId ?? "all";

  const controlQuery = useQuery({
    queryKey: ["inv", "control", startDate, endDate, branchKey],
    queryFn: () => inventoryApi.getInventoryControl(range),
    enabled: activeTab === "control",
  });
  const accuracyQuery = useQuery({
    queryKey: ["inv", "accuracy", branchKey],
    queryFn: () => inventoryApi.getInventoryAccuracy(),
    enabled: activeTab === "accuracy",
  });
  const shrinkageQuery = useQuery({
    queryKey: ["inv", "shrinkage", startDate, endDate, branchKey],
    queryFn: () => inventoryApi.getShrinkageReport(range),
    enabled: activeTab === "shrinkage",
  });
  const obsolescenceQuery = useQuery({
    queryKey: ["inv", "obsolete", branchKey],
    queryFn: () => inventoryApi.getObsolescenceReport({ days_unused: 180 }),
    enabled: activeTab === "obsolescence",
  });
  const p2pQuery = useQuery({
    queryKey: ["inv", "p2p", startDate, endDate, branchKey],
    queryFn: () => inventoryApi.getP2PCompliance(range),
    enabled: activeTab === "p2p",
  });
  const orphanQuery = useQuery({
    queryKey: ["inv", "orphan", startDate, endDate, branchKey],
    queryFn: () => inventoryApi.getOrphanSupply(range),
    enabled: activeTab === "orphan",
  });
  const unbilledQuery = useQuery({
    queryKey: ["inv", "unbilled", startDate, endDate, branchKey],
    queryFn: () => inventoryApi.getUnbilledDelivered(range),
    enabled: activeTab === "unbilled",
  });
  const availabilityQuery = useQuery({
    queryKey: ["inv", "avail", branchKey],
    queryFn: () => inventoryApi.getAvailabilityTop100({ limit: 100 }),
    enabled: activeTab === "availability",
  });

  const controlData = controlQuery.data as {
    compliance_rate_percent?: number;
    non_compliant_count?: number;
    exceptions?: Array<{ transaction_id: number; issue: string; part?: string; work_order_id?: number; status?: string }>;
    meta?: { description?: string };
  } | undefined;
  const accuracyData = accuracyQuery.data as {
    accuracy_percent?: number;
    items_counted?: number;
    lines?: Array<{ session_number: string; part_number: string; system_qty: number; counted_qty: number; variance: number }>;
    meta?: { description?: string };
  } | undefined;
  const shrinkItems =
    (shrinkageQuery.data as { items?: Array<{ part_number: string; part_name?: string; branch: string; quantity: number; type: string; date: string; reason: string; work_order_id?: number }> })
      ?.items ?? [];
  const obsItems =
    (obsolescenceQuery.data as { items?: Array<{ item: string; item_name?: string; branch: string; qty_in_stock: number; last_used: string | null; recommendation: string }> })
      ?.items ?? [];
  const p2pData = p2pQuery.data as {
    compliance_rate_percent?: number;
    violations?: Array<{ po_number: string; supplier: string; status: string; issues: string[] }>;
  } | undefined;
  const orphanItems =
    (orphanQuery.data as { items?: Array<{ part_number: string; part_name?: string; branch: string; quantity: number; date: string }> })
      ?.items ?? [];
  const unbilledItems =
    (unbilledQuery.data as { items?: Array<{ work_order_id: number; work_order_number: string; customer: string; status: string; branch: string }> })
      ?.items ?? [];
  const availabilityRows =
    (availabilityQuery.data as { rows?: Array<{ item: string; item_name?: string; branch: string; qty_available: number }> })
      ?.rows ?? [];

  const dateFilters = (
    <div className="flex gap-4 mb-4 flex-wrap items-center">
      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
    </div>
  );

  const buildExportPayload = (): TableExportPayload | null => {
    const stamp = `${startDate}_${endDate}`;
    const branchLabel = activeBranch?.name ? `Branch: ${activeBranch.name}` : undefined;
    const periodLabel = DATE_SCOPED_TABS.has(activeTab)
      ? `Period: ${startDate} to ${endDate}`
      : "Current branch context";
    const dateInfo = [branchLabel, periodLabel].filter(Boolean).join(" · ");

    const base = (slug: string): TableExportPayload => ({
      headers: [],
      rows: [],
      filename: `${slug}_${stamp}`,
      reportTitle: TAB_TITLES[activeTab],
      dateInfo,
    });

    if (activeTab === "control") {
      const rows = (controlData?.exceptions ?? []).map((e) => [
        e.transaction_id,
        e.issue,
        e.part ?? "",
        e.work_order_id ?? "",
        e.status ?? "",
      ]);
      if (rows.length === 0) return null;
      return {
        ...base("inventory-control"),
        headers: ["Txn ID", "Issue", "Part", "WO", "Status"],
        rows,
        reportTitle: `${TAB_TITLES.control} (${controlData?.compliance_rate_percent ?? 0}% compliant)`,
      };
    }
    if (activeTab === "shrinkage" && shrinkItems.length > 0) {
      return {
        ...base("shrinkage"),
        headers: ["Part", "Branch", "Qty", "Type", "Date", "WO", "Reason"],
        rows: shrinkItems.map((s) => [
          formatPartLabel(s.part_number, s.part_name),
          s.branch,
          s.quantity,
          s.type,
          s.date,
          s.work_order_id ?? "",
          s.reason || "",
        ]),
      };
    }
    if (activeTab === "accuracy") {
      const rows = (accuracyData?.lines ?? []).map((l) => [
        l.session_number,
        l.part_number,
        l.system_qty,
        l.counted_qty,
        l.variance,
      ]);
      if (rows.length === 0) return null;
      return {
        ...base("inventory-accuracy"),
        headers: ["Session", "Part", "System", "Counted", "Variance"],
        rows,
        reportTitle: `${TAB_TITLES.accuracy} (${accuracyData?.accuracy_percent ?? 0}% accurate)`,
      };
    }
    if (activeTab === "availability" && availabilityRows.length > 0) {
      return {
        ...base("availability-top-100"),
        headers: ["Part", "Branch", "Qty available"],
        rows: availabilityRows.map((r) => [
          formatPartLabel(r.item, r.item_name),
          r.branch,
          r.qty_available,
        ]),
      };
    }
    if (activeTab === "obsolescence" && obsItems.length > 0) {
      return {
        ...base("obsolescence"),
        headers: ["Part", "Branch", "In stock", "Last used", "Recommendation"],
        rows: obsItems.map((o) => [
          formatPartLabel(o.item, o.item_name),
          o.branch,
          o.qty_in_stock,
          o.last_used ?? "Never",
          o.recommendation,
        ]),
      };
    }
    if (activeTab === "p2p") {
      const rows = (p2pData?.violations ?? []).map((v) => [
        v.po_number,
        v.supplier,
        v.status,
        v.issues.join("; "),
      ]);
      if (rows.length === 0) return null;
      return {
        ...base("p2p-compliance"),
        headers: ["PO", "Supplier", "Status", "Issues"],
        rows,
        reportTitle: `${TAB_TITLES.p2p} (${p2pData?.compliance_rate_percent ?? 0}% compliant)`,
      };
    }
    if (activeTab === "orphan" && orphanItems.length > 0) {
      return {
        ...base("orphan-supply"),
        headers: ["Part", "Branch", "Qty", "Date"],
        rows: orphanItems.map((o) => [
          formatPartLabel(o.part_number, o.part_name),
          o.branch,
          o.quantity,
          o.date,
        ]),
      };
    }
    if (activeTab === "unbilled" && unbilledItems.length > 0) {
      return {
        ...base("unbilled-delivered"),
        headers: ["Work order", "Customer", "Status", "Branch"],
        rows: unbilledItems.map((u) => [u.work_order_number, u.customer, u.status, u.branch]),
      };
    }
    return null;
  };

  const tabState = (q: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => void }) => {
    if (q.isLoading) return <Loader2 className="animate-spin h-6 w-6" />;
    if (q.isError) {
      return (
        <QueryErrorState
          error={q.error instanceof Error ? q.error : new Error(queryErrorMessage(q.error))}
          title="Could not load report"
          onRetry={() => q.refetch()}
        />
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Inventory Compliance Reports</h1>
        <div className="flex items-center gap-3">
          <ReportExportMenu getPayload={buildExportPayload} />
          <BranchReportChip />
        </div>
      </div>
      {DATE_SCOPED_TABS.has(activeTab) ? (
        <>
          <p className="text-xs text-muted-foreground">Date range applies to this tab.</p>
          {dateFilters}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          This tab uses current branch context; date filters do not apply.
        </p>
      )}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="control">Inventory Control</TabsTrigger>
          <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
          <TabsTrigger value="availability">Top SKU Availability</TabsTrigger>
          <TabsTrigger value="shrinkage">Shrinkage</TabsTrigger>
          <TabsTrigger value="obsolescence">Obsolescence</TabsTrigger>
          <TabsTrigger value="p2p">P2P Compliance</TabsTrigger>
          <TabsTrigger value="orphan">Orphan Supply</TabsTrigger>
          <TabsTrigger value="unbilled">Unbilled / Delivered</TabsTrigger>
        </TabsList>

        <TabsContent value="control">
          <Card>
            <CardHeader><CardTitle>Issued only vs approved jobs</CardTitle></CardHeader>
            <CardContent className="max-h-[480px] overflow-auto">
              {tabState(controlQuery) ?? (
                <>
                  <p className="text-sm mb-2">
                    Compliance: {controlData?.compliance_rate_percent ?? 0}% —{" "}
                    {controlData?.non_compliant_count ?? 0} exceptions
                  </p>
                  {controlData?.meta?.description && (
                    <p className="text-xs text-muted-foreground mb-4">{controlData.meta.description}</p>
                  )}
                  <ReportTable
                    headers={["Txn ID", "Issue", "Part", "WO", "Status"]}
                    rows={(controlData?.exceptions ?? []).map((e) => [
                      e.transaction_id,
                      e.issue,
                      e.part ?? "—",
                      e.work_order_id ? (
                        <Link href={`/workorders/${e.work_order_id}`} className="text-primary hover:underline">
                          {e.work_order_id}
                        </Link>
                      ) : "—",
                      e.status ?? "—",
                    ])}
                    emptyMessage="No compliance exceptions in this period."
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accuracy">
          <Card>
            <CardHeader><CardTitle>Inventory accuracy (physical counts)</CardTitle></CardHeader>
            <CardContent className="max-h-[480px] overflow-auto">
              {tabState(accuracyQuery) ?? (
                <>
                  <p className="text-sm mb-2">
                    Accuracy: {accuracyData?.accuracy_percent ?? 0}% —{" "}
                    {accuracyData?.items_counted ?? 0} lines counted
                  </p>
                  {accuracyData?.meta?.description && (
                    <p className="text-xs text-muted-foreground mb-4">{accuracyData.meta.description}</p>
                  )}
                  <ReportTable
                    headers={["Session", "Part", "System", "Counted", "Variance"]}
                    rows={(accuracyData?.lines ?? []).map((l) => [
                      l.session_number,
                      l.part_number,
                      l.system_qty,
                      l.counted_qty,
                      l.variance,
                    ])}
                    emptyMessage="No completed physical count lines for this branch."
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="availability">
          <Card>
            <CardHeader><CardTitle>Top 100 SKUs × branch</CardTitle></CardHeader>
            <CardContent className="max-h-[480px] overflow-auto">
              {tabState(availabilityQuery) ?? (
                <ReportTable
                  headers={["Part", "Branch", "Qty available"]}
                  rows={availabilityRows.map((r) => [
                    formatPartLabel(r.item, r.item_name),
                    r.branch,
                    r.qty_available,
                  ])}
                  emptyMessage="No availability data for this branch."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shrinkage">
          <Card>
            <CardHeader><CardTitle>Shrinkage — damage / loss</CardTitle></CardHeader>
            <CardContent className="max-h-[480px] overflow-auto">
              {tabState(shrinkageQuery) ?? (
                <ReportTable
                  headers={["Part", "Branch", "Qty", "Type", "Date", "WO", "Reason"]}
                  rows={shrinkItems.map((s) => [
                    formatPartLabel(s.part_number, s.part_name),
                    s.branch,
                    s.quantity,
                    s.type,
                    s.date,
                    s.work_order_id ? (
                      <Link href={`/workorders/${s.work_order_id}`} className="text-primary hover:underline">
                        {s.work_order_id}
                      </Link>
                    ) : "—",
                    s.reason || "—",
                  ])}
                  emptyMessage="No shrinkage transactions in this period."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="obsolescence">
          <Card>
            <CardHeader><CardTitle>Obsolescence risk (180+ days unused)</CardTitle></CardHeader>
            <CardContent className="max-h-[480px] overflow-auto">
              {tabState(obsolescenceQuery) ?? (
                <ReportTable
                  headers={["Part", "Branch", "In stock", "Last used", "Recommendation"]}
                  rows={obsItems.map((o) => [
                    formatPartLabel(o.item, o.item_name),
                    o.branch,
                    o.qty_in_stock,
                    o.last_used ?? "Never",
                    o.recommendation,
                  ])}
                  emptyMessage="No obsolescence candidates for this branch."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="p2p">
          <Card>
            <CardHeader><CardTitle>P2P compliance</CardTitle></CardHeader>
            <CardContent className="max-h-[480px] overflow-auto">
              {tabState(p2pQuery) ?? (
                <>
                  <p className="text-sm mb-4">Rate: {p2pData?.compliance_rate_percent ?? 0}%</p>
                  <ReportTable
                    headers={["PO", "Supplier", "Status", "Issues"]}
                    rows={(p2pData?.violations ?? []).map((v) => [
                      v.po_number,
                      v.supplier,
                      v.status,
                      v.issues.join(", "),
                    ])}
                    emptyMessage="No P2P violations in this period."
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orphan">
          <Card>
            <CardHeader><CardTitle>Supplied — not linked to job card</CardTitle></CardHeader>
            <CardContent className="max-h-[480px] overflow-auto">
              {tabState(orphanQuery) ?? (
                <ReportTable
                  headers={["Part", "Branch", "Qty", "Date"]}
                  rows={orphanItems.map((o) => [
                    formatPartLabel(o.part_number, o.part_name),
                    o.branch,
                    o.quantity,
                    o.date,
                  ])}
                  emptyMessage="No orphan supply transactions in this period."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unbilled">
          <Card>
            <CardHeader><CardTitle>Supplied not billed — vehicle delivered</CardTitle></CardHeader>
            <CardContent className="max-h-[480px] overflow-auto">
              {tabState(unbilledQuery) ?? (
                <ReportTable
                  headers={["Work order", "Customer", "Status", "Branch"]}
                  rows={unbilledItems.map((u) => [
                    <Link key={u.work_order_id} href={`/workorders/${u.work_order_id}`} className="text-primary hover:underline">
                      {u.work_order_number}
                    </Link>,
                    u.customer,
                    u.status,
                    u.branch,
                  ])}
                  emptyMessage="No unbilled delivered work orders in this period."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
