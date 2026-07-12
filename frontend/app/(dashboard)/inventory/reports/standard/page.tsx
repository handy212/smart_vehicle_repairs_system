"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Play, Printer } from "lucide-react";
import { inventoryApi } from "@/lib/api/inventory";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { useBranchStore } from "@/store/branchStore";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportExportMenu } from "@/components/reports/ReportExportMenu";
import type { TableExportPayload } from "@/lib/utils/report-export";
import { getUserFacingError } from "@/lib/api/errors";
type TabKey =
  | "valuation_detail"
  | "valuation_summary"
  | "open_po_list"
  | "open_po_detail"
  | "stock_take";

const TAB_TITLES: Record<TabKey, string> = {
  valuation_detail: "Inventory Valuation Detail",
  valuation_summary: "Inventory Valuation Summary",
  open_po_list: "Open Purchase Order List",
  open_po_detail: "Open Purchase Order Detail",
  stock_take: "Stock Take Worksheet",
};

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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SummaryCards({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="border-border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{item.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-foreground">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function StandardInventoryReportsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const { activeBranchId, activeBranch } = useBranchStore();
  const [activeTab, setActiveTab] = useState<TabKey>("valuation_detail");
  const [includeZero, setIncludeZero] = useState(false);
  const branchKey = activeBranchId ?? "all";

  const startCountMutation = useMutation({
    mutationFn: () => {
      if (!activeBranchId) {
        throw new Error("Select a branch before starting a stock take count.");
      }
      return inventoryApi.createPhysicalCountFromStockTake({
        branch: activeBranchId,
        count_date: format(new Date(), "yyyy-MM-dd"),
        include_zero: includeZero,
        start: true,
      });
    },
    onSuccess: (session: { id?: number; session_number?: string; total_items_counted?: number }) => {
      toast({
        title: "Count session started",
        description: session.session_number
          ? `${session.session_number} seeded with ${session.total_items_counted ?? 0} line(s).`
          : "Stock take lines were loaded into a physical count session.",
      });
      if (session?.id != null) {
        router.push(`/inventory/physical-counts/${session.id}`);
      }
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not start count",
        description: getUserFacingError(error, "Failed to create count session from worksheet"),
        variant: "destructive",
      });
    },
  });

  const valuationDetailQuery = useQuery({
    queryKey: ["inv", "valuation-detail", branchKey, includeZero],
    queryFn: () => inventoryApi.getValuationDetail({ include_zero: includeZero }),
    enabled: activeTab === "valuation_detail",
  });

  const valuationSummaryQuery = useQuery({
    queryKey: ["inv", "valuation-summary", branchKey, includeZero],
    queryFn: () => inventoryApi.getValuationSummary({ include_zero: includeZero }),
    enabled: activeTab === "valuation_summary",
  });

  const openPoListQuery = useQuery({
    queryKey: ["inv", "open-po-list", branchKey],
    queryFn: () => inventoryApi.getOpenPurchaseOrders(),
    enabled: activeTab === "open_po_list",
  });

  const openPoDetailQuery = useQuery({
    queryKey: ["inv", "open-po-detail", branchKey],
    queryFn: () => inventoryApi.getOpenPurchaseOrderDetail(),
    enabled: activeTab === "open_po_detail",
  });

  const stockTakeQuery = useQuery({
    queryKey: ["inv", "stock-take", branchKey, includeZero],
    queryFn: () => inventoryApi.getStockTakeWorksheet({ include_zero: includeZero }),
    enabled: activeTab === "stock_take",
  });

  const activeQuery = {
    valuation_detail: valuationDetailQuery,
    valuation_summary: valuationSummaryQuery,
    open_po_list: openPoListQuery,
    open_po_detail: openPoDetailQuery,
    stock_take: stockTakeQuery,
  }[activeTab];

  const exportPayload = useMemo((): TableExportPayload | null => {
    const branchLabel = activeBranch?.name || "All branches";
    if (activeTab === "valuation_detail" && valuationDetailQuery.data?.lines) {
      return {
        filename: "inventory-valuation-detail",
        reportTitle: "Inventory Valuation Detail",
        dateInfo: branchLabel,
        headers: ["Part #", "Part name", "Category", "Branch", "Qty on hand", "Unit cost", "Asset value"],
        rows: valuationDetailQuery.data.lines.map((line: any) => [
          line.part_number,
          line.part_name,
          line.category,
          line.branch_name,
          line.quantity_on_hand,
          line.unit_cost,
          line.asset_value,
        ]),
        currencyColumnIndexes: [5, 6],
      };
    }
    if (activeTab === "valuation_summary" && valuationSummaryQuery.data?.by_category) {
      return {
        filename: "inventory-valuation-summary",
        reportTitle: "Inventory Valuation Summary",
        dateInfo: branchLabel,
        headers: ["Category", "SKUs", "Qty on hand", "Asset value"],
        rows: valuationSummaryQuery.data.by_category.map((row: any) => [
          row.category,
          row.sku_count,
          row.quantity_on_hand,
          row.asset_value,
        ]),
        currencyColumnIndexes: [3],
      };
    }
    if (activeTab === "open_po_list" && openPoListQuery.data?.purchase_orders) {
      return {
        filename: "open-purchase-order-list",
        reportTitle: "Open Purchase Order List",
        dateInfo: branchLabel,
        headers: ["PO #", "Supplier", "Status", "Order date", "Expected", "Open lines", "Open qty", "Open value"],
        rows: openPoListQuery.data.purchase_orders.map((po: any) => [
          po.po_number,
          po.supplier_name,
          po.status_display,
          po.order_date || "",
          po.expected_delivery_date || "",
          po.open_line_count,
          po.open_quantity,
          po.open_value,
        ]),
        currencyColumnIndexes: [7],
      };
    }
    if (activeTab === "open_po_detail" && openPoDetailQuery.data?.lines) {
      return {
        filename: "open-purchase-order-detail",
        reportTitle: "Open Purchase Order Detail",
        dateInfo: branchLabel,
        headers: [
          "PO #",
          "Supplier",
          "Part #",
          "Part name",
          "Ordered",
          "Received",
          "Open qty",
          "Unit cost",
          "Open value",
        ],
        rows: openPoDetailQuery.data.lines.map((line: any) => [
          line.po_number,
          line.supplier_name,
          line.part_number,
          line.part_name,
          line.ordered_quantity,
          line.received_quantity,
          line.open_quantity,
          line.unit_cost,
          line.open_value,
        ]),
        currencyColumnIndexes: [7, 8],
      };
    }
    if (activeTab === "stock_take" && stockTakeQuery.data?.lines) {
      return {
        filename: "stock-take-worksheet",
        reportTitle: "Stock Take Worksheet",
        dateInfo: branchLabel,
        headers: ["Part #", "Part name", "Category", "Bin", "System qty", "Physical qty", "Difference"],
        rows: stockTakeQuery.data.lines.map((line: any) => [
          line.part_number,
          line.part_name,
          line.category,
          line.bin_location || "",
          line.system_quantity,
          "",
          "",
        ]),
      };
    }
    return null;
  }, [
    activeTab,
    activeBranch?.name,
    valuationDetailQuery.data,
    valuationSummaryQuery.data,
    openPoListQuery.data,
    openPoDetailQuery.data,
    stockTakeQuery.data,
  ]);

  const showZeroToggle =
    activeTab === "valuation_detail" ||
    activeTab === "valuation_summary" ||
    activeTab === "stock_take";

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Inventory Reports</h1>
          <p className="text-sm text-muted-foreground">
            QuickBooks-style valuation, open purchase orders, and stock take worksheet.
          </p>
          <div className="mt-2">
            <BranchReportChip />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exportPayload && <ReportExportMenu getPayload={() => exportPayload} />}
          {activeTab === "stock_take" && (
            <>
              <Button
                type="button"
                size="sm"
                disabled={!activeBranchId || startCountMutation.isPending || !(stockTakeQuery.data?.lines?.length)}
                onClick={() => startCountMutation.mutate()}
                className="gap-1.5"
              >
                {startCountMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Start count from worksheet
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5"
              >
                <Printer className="h-4 w-4" />
                Print worksheet
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          {(Object.keys(TAB_TITLES) as TabKey[]).map((key) => (
            <TabsTrigger key={key} value={key} className="text-xs sm:text-sm">
              {TAB_TITLES[key]}
            </TabsTrigger>
          ))}
        </TabsList>

        {showZeroToggle && (
          <div className="mt-3 flex items-center gap-2">
            <Checkbox
              id="include-zero"
              checked={includeZero}
              onCheckedChange={(checked) => setIncludeZero(checked === true)}
            />
            <Label htmlFor="include-zero" className="text-sm text-muted-foreground">
              Include zero-quantity items
            </Label>
          </div>
        )}

        {activeQuery.isLoading && (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading {TAB_TITLES[activeTab]}…
          </div>
        )}

        {activeQuery.isError && (
          <QueryErrorState
            error={activeQuery.error}
            onRetry={() => void activeQuery.refetch()}
          />
        )}

        <TabsContent value="valuation_detail" className="space-y-4">
          {valuationDetailQuery.data && (
            <>
              <SummaryCards
                items={[
                  {
                    label: "Lines",
                    value: String(valuationDetailQuery.data.summary?.line_count ?? 0),
                  },
                  {
                    label: "Total quantity",
                    value: String(valuationDetailQuery.data.summary?.total_quantity ?? 0),
                  },
                  {
                    label: "Asset value",
                    value: formatCurrency(valuationDetailQuery.data.summary?.total_asset_value ?? 0),
                  },
                ]}
              />
              <Card className="border-border shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Inventory Valuation Detail</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReportTable
                    headers={["Part #", "Part name", "Category", "Branch", "Qty", "Unit cost", "Asset value"]}
                    rows={(valuationDetailQuery.data.lines ?? []).map((line: any) => [
                      line.part_number,
                      line.part_name,
                      line.category,
                      line.branch_name,
                      line.quantity_on_hand,
                      formatCurrency(line.unit_cost),
                      formatCurrency(line.asset_value),
                    ])}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="valuation_summary" className="space-y-4">
          {valuationSummaryQuery.data && (
            <>
              <SummaryCards
                items={[
                  {
                    label: "Categories",
                    value: String(valuationSummaryQuery.data.by_category?.length ?? 0),
                  },
                  {
                    label: "SKUs",
                    value: String(valuationSummaryQuery.data.summary?.line_count ?? 0),
                  },
                  {
                    label: "Asset value",
                    value: formatCurrency(valuationSummaryQuery.data.summary?.total_asset_value ?? 0),
                  },
                ]}
              />
              <Card className="border-border shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Inventory Valuation Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReportTable
                    headers={["Category", "SKUs", "Qty on hand", "Asset value"]}
                    rows={(valuationSummaryQuery.data.by_category ?? []).map((row: any) => [
                      row.category,
                      row.sku_count,
                      row.quantity_on_hand,
                      formatCurrency(row.asset_value),
                    ])}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="open_po_list" className="space-y-4">
          {openPoListQuery.data && (
            <>
              <SummaryCards
                items={[
                  {
                    label: "Open POs",
                    value: String(openPoListQuery.data.summary?.po_count ?? 0),
                  },
                  {
                    label: "Open quantity",
                    value: String(openPoListQuery.data.summary?.total_open_quantity ?? 0),
                  },
                  {
                    label: "Open value",
                    value: formatCurrency(openPoListQuery.data.summary?.total_open_value ?? 0),
                  },
                ]}
              />
              <Card className="border-border shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Open Purchase Order List</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReportTable
                    headers={["PO #", "Supplier", "Status", "Order date", "Expected", "Open lines", "Open qty", "Open value"]}
                    rows={(openPoListQuery.data.purchase_orders ?? []).map((po: any) => [
                      <Link
                        key={po.id}
                        href={`/inventory/purchase-orders/${po.id}`}
                        className="text-primary hover:underline"
                      >
                        {po.po_number}
                      </Link>,
                      po.supplier_name,
                      po.status_display,
                      po.order_date || "—",
                      po.expected_delivery_date || "—",
                      po.open_line_count,
                      po.open_quantity,
                      formatCurrency(po.open_value),
                    ])}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="open_po_detail" className="space-y-4">
          {openPoDetailQuery.data && (
            <>
              <SummaryCards
                items={[
                  {
                    label: "Open lines",
                    value: String(openPoDetailQuery.data.summary?.line_count ?? 0),
                  },
                  {
                    label: "Open quantity",
                    value: String(openPoDetailQuery.data.summary?.total_open_quantity ?? 0),
                  },
                  {
                    label: "Open value",
                    value: formatCurrency(openPoDetailQuery.data.summary?.total_open_value ?? 0),
                  },
                ]}
              />
              <Card className="border-border shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Open Purchase Order Detail</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReportTable
                    headers={[
                      "PO #",
                      "Supplier",
                      "Part #",
                      "Part name",
                      "Ordered",
                      "Received",
                      "Open qty",
                      "Unit cost",
                      "Open value",
                    ]}
                    rows={(openPoDetailQuery.data.lines ?? []).map((line: any) => [
                      <Link
                        key={`${line.po_id}-${line.part_id}-${line.part_number}`}
                        href={`/inventory/purchase-orders/${line.po_id}`}
                        className="text-primary hover:underline"
                      >
                        {line.po_number}
                      </Link>,
                      line.supplier_name,
                      line.part_number,
                      line.part_name,
                      line.ordered_quantity,
                      line.received_quantity,
                      line.open_quantity,
                      formatCurrency(line.unit_cost),
                      formatCurrency(line.open_value),
                    ])}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="stock_take" className="space-y-4 print:space-y-2">
          {stockTakeQuery.data && (
            <Card className="border-border shadow-none print:border-0 print:shadow-none">
              <CardHeader className="print:pb-2">
                <CardTitle className="text-base">Stock Take Worksheet</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Use system quantity as the expected count. Click{" "}
                  <span className="font-medium text-foreground">Start count from worksheet</span> to
                  open a live Physical Count session with these lines preloaded. You can also{" "}
                  <Link href="/inventory/physical-counts" className="text-primary hover:underline">
                    manage sessions
                  </Link>{" "}
                  separately.
                </p>
              </CardHeader>
              <CardContent>
                <ReportTable
                  headers={["Part #", "Part name", "Category", "Bin", "System qty", "Physical qty", "Difference"]}
                  rows={(stockTakeQuery.data.lines ?? []).map((line: any) => [
                    line.part_number,
                    line.part_name,
                    line.category,
                    line.bin_location || "—",
                    line.system_quantity,
                    "",
                    "",
                  ])}
                  emptyMessage="No stocked items for this branch"
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
