"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Loader2,
  Play,
  Printer,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

type TabKey =
  | "valuation_detail"
  | "valuation_summary"
  | "open_po_list"
  | "open_po_detail"
  | "stock_take";

const TAB_TITLES: Record<TabKey, string> = {
  valuation_detail: "Inventory Valuation Detail",
  valuation_summary: "Inventory Valuation Summary",
  open_po_list: "Open Purchase Order List by Supplier",
  open_po_detail: "Open Purchase Order Detail",
  stock_take: "Stocktake Worksheet",
};

function fmtNum(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : String(value);
}

function ReportTable({
  headers,
  rows,
  emptyMessage = "Your selection doesn’t have any info. Change your selection or start a new search.",
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
          <TableRow className="bg-muted/40 hover:bg-muted/40">
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

type TreeGroup = {
  id: string;
  label: string;
  childCount: number;
  /** Cells for the group header after the label column (optional summary when collapsed). */
  headerCells?: (string | number | ReactNode)[];
  children: (string | number | ReactNode)[][];
  /** Subtotal row shown while expanded (full width cells). */
  subtotal?: (string | number | ReactNode)[];
};

function TreeReportTable({
  headers,
  groups,
  footer,
  defaultExpanded = true,
  emptyMessage = "Your selection doesn’t have any info. Change your selection or start a new search.",
}: {
  headers: string[];
  groups: TreeGroup[];
  footer?: (string | number | ReactNode)[];
  defaultExpanded?: boolean;
  emptyMessage?: string;
}) {
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpanded((prev) => {
      const next: Record<string, boolean> = {};
      for (const id of groupIds) {
        next[id] = prev[id] ?? defaultExpanded;
      }
      return next;
    });
  }, [groupIds, defaultExpanded]);

  const allExpanded = groupIds.length > 0 && groupIds.every((id) => expanded[id]);
  const noneExpanded = groupIds.every((id) => !expanded[id]);

  const expandAll = useCallback(() => {
    setExpanded(Object.fromEntries(groupIds.map((id) => [id, true])));
  }, [groupIds]);

  const collapseAll = useCallback(() => {
    setExpanded(Object.fromEntries(groupIds.map((id) => [id, false])));
  }, [groupIds]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>;
  }

  const colCount = headers.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={expandAll}
          disabled={allExpanded}
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
          Expand all
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={collapseAll}
          disabled={noneExpanded}
        >
          <ChevronsDownUp className="h-3.5 w-3.5" />
          Collapse all
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {headers.map((header) => (
                <TableHead key={header} className="whitespace-nowrap">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const isOpen = expanded[group.id] ?? defaultExpanded;
              const pad = Array.from({ length: Math.max(0, colCount - 1 - (group.headerCells?.length ?? 0)) }, () => "");
              return (
                <Fragment key={group.id}>
                  <TableRow
                    className="bg-muted/20 hover:bg-muted/30 cursor-pointer select-none"
                    onClick={() => toggle(group.id)}
                  >
                    <TableCell className="font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span>
                          {group.label}
                          <span className="ml-1 font-normal text-muted-foreground">
                            ({group.childCount})
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    {(group.headerCells ?? []).map((cell, i) => (
                      <TableCell key={i}>{cell}</TableCell>
                    ))}
                    {pad.map((_, i) => (
                      <TableCell key={`pad-${i}`} />
                    ))}
                  </TableRow>
                  {isOpen &&
                    group.children.map((child, childIndex) => (
                      <TableRow key={`${group.id}-child-${childIndex}`} className="hover:bg-muted/10">
                        {child.map((cell, cellIndex) => (
                          <TableCell
                            key={cellIndex}
                            className={cn(cellIndex === 0 && "pl-9 text-muted-foreground")}
                          >
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  {isOpen && group.subtotal && (
                    <TableRow className="border-y border-border/80 bg-background">
                      {group.subtotal.map((cell, cellIndex) => (
                        <TableCell
                          key={cellIndex}
                          className={cn(cellIndex === 0 && "pl-9 font-medium")}
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {footer && (
              <TableRow className="border-t-2 border-border font-semibold bg-muted/10">
                {footer.map((cell, i) => (
                  <TableCell key={i}>{cell}</TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
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

  const valuationTreeGroups = useMemo((): TreeGroup[] => {
    return (valuationDetailQuery.data?.groups ?? []).map((group: any) => ({
      id: String(group.part_id),
      label: group.product_service,
      childCount: group.lines?.length ?? 0,
      children: (group.lines ?? []).map((line: any) => [
        line.product_service,
        line.transaction_date || "—",
        line.transaction_type,
        line.number || "—",
        line.name || "",
        fmtNum(line.qty),
        fmtNum(line.rate),
        fmtNum(line.inventory_cost),
        fmtNum(line.qty_on_hand),
        fmtNum(line.asset_value),
      ]),
      subtotal: [
        `Total for ${group.product_service}`,
        "",
        "",
        "",
        "",
        fmtNum(group.subtotal?.qty),
        "",
        formatCurrency(group.subtotal?.inventory_cost ?? 0),
        fmtNum(group.subtotal?.qty_on_hand),
        formatCurrency(group.subtotal?.asset_value ?? 0),
      ],
    }));
  }, [valuationDetailQuery.data, formatCurrency]);

  const openPoTreeGroups = useMemo((): TreeGroup[] => {
    return (openPoListQuery.data?.groups ?? []).map((group: any) => ({
      id: group.supplier_display_name || "no-supplier",
      label: group.supplier_display_name || "No supplier",
      childCount: group.rows?.length ?? 0,
      children: (group.rows ?? []).map((row: any) => [
        row.date || "—",
        <Link
          key={row.po_id}
          href={`/inventory/purchase-orders/${row.po_id}`}
          className="text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.number}
        </Link>,
        row.memo || "",
        row.ship_via || "",
        formatCurrency(row.amount),
        formatCurrency(row.open_balance),
      ]),
      subtotal: [
        `Total for ${group.supplier_display_name}`,
        "",
        "",
        "",
        formatCurrency(group.subtotal_amount ?? 0),
        formatCurrency(group.subtotal_open_balance ?? 0),
      ],
    }));
  }, [openPoListQuery.data, formatCurrency]);

  const exportPayload = useMemo((): TableExportPayload | null => {
    const branchLabel = activeBranch?.name || "All branches";
    if (activeTab === "valuation_detail" && valuationDetailQuery.data?.groups) {
      const rows: (string | number)[][] = [];
      for (const group of valuationDetailQuery.data.groups) {
        for (const line of group.lines ?? []) {
          rows.push([
            line.product_service,
            line.transaction_date || "",
            line.transaction_type,
            line.number,
            line.name,
            line.qty,
            line.rate,
            line.inventory_cost,
            line.qty_on_hand,
            line.asset_value,
          ]);
        }
        rows.push([
          `Total for ${group.product_service}`,
          "",
          "",
          "",
          "",
          group.subtotal?.qty ?? "",
          "",
          group.subtotal?.inventory_cost ?? "",
          group.subtotal?.qty_on_hand ?? "",
          group.subtotal?.asset_value ?? "",
        ]);
      }
      return {
        filename: "inventory-valuation-detail",
        reportTitle: "Inventory Valuation Detail",
        dateInfo: branchLabel,
        headers: [
          "Product/Service",
          "Transaction date",
          "Transaction type",
          "Number",
          "Name",
          "Qty",
          "Rate",
          "Inventory cost",
          "Qty on hand",
          "Asset value",
        ],
        rows,
        currencyColumnIndexes: [6, 7, 9],
      };
    }
    if (activeTab === "valuation_summary" && valuationSummaryQuery.data?.rows) {
      return {
        filename: "inventory-valuation-summary",
        reportTitle: "Inventory Valuation Summary",
        dateInfo: branchLabel,
        headers: ["Product/Service", "SKU", "Qty", "Asset Value", "Calc. Avg"],
        rows: valuationSummaryQuery.data.rows.map((row: any) => [
          row.product_service,
          row.sku,
          row.qty,
          row.asset_value,
          row.calc_avg,
        ]),
        currencyColumnIndexes: [3, 4],
      };
    }
    if (activeTab === "open_po_list" && openPoListQuery.data?.groups) {
      const rows: (string | number)[][] = [];
      for (const group of openPoListQuery.data.groups) {
        rows.push([group.supplier_display_name, "", "", "", "", ""]);
        for (const row of group.rows ?? []) {
          rows.push([
            row.date || "",
            row.number,
            row.memo || "",
            row.ship_via || "",
            row.amount,
            row.open_balance,
          ]);
        }
      }
      return {
        filename: "open-purchase-order-list",
        reportTitle: "Open Purchase Order List by Supplier",
        dateInfo: branchLabel,
        headers: ["Date", "Number", "Memo", "Ship via", "Amount", "Open Balance"],
        rows,
        currencyColumnIndexes: [4, 5],
      };
    }
    if (activeTab === "open_po_detail" && openPoDetailQuery.data?.lines) {
      return {
        filename: "open-purchase-order-detail",
        reportTitle: "Open Purchase Order Detail",
        dateInfo: branchLabel,
        headers: [
          "Transaction date",
          "Number",
          "Supplier display name",
          "Product/Service full name",
          "Account Name",
          "Quantity",
          "Billed quantity",
          "Backordered quantity",
          "Total amount",
          "Received amount",
          "PO open balance",
        ],
        rows: openPoDetailQuery.data.lines.map((line: any) => [
          line.transaction_date || "",
          line.number,
          line.supplier_display_name,
          line.product_service_full_name,
          line.account_name,
          line.quantity,
          line.billed_quantity,
          line.backordered_quantity,
          line.total_amount,
          line.received_amount,
          line.po_open_balance,
        ]),
        currencyColumnIndexes: [8, 9, 10],
      };
    }
    if (activeTab === "stock_take" && stockTakeQuery.data?.lines) {
      return {
        filename: "stocktake-worksheet",
        reportTitle: "Stocktake Worksheet",
        dateInfo: branchLabel,
        headers: [
          "Product/Service",
          "Memo/Description",
          "Category",
          "Preferred supplier name",
          "Quantity on hand",
          "Physical Count",
        ],
        rows: stockTakeQuery.data.lines.map((line: any) => [
          line.product_service,
          line.memo_description || "",
          line.category || "",
          line.preferred_supplier_name || "",
          line.quantity_on_hand,
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Inventory Reports</h1>
          <p className="text-sm text-muted-foreground">
            QuickBooks Online–aligned valuation, open purchase orders, and stocktake worksheet.
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
                disabled={
                  !activeBranchId ||
                  startCountMutation.isPending ||
                  !(stockTakeQuery.data?.lines?.length)
                }
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
                    label: "Products",
                    value: String(valuationDetailQuery.data.summary?.group_count ?? 0),
                  },
                  {
                    label: "Qty on hand",
                    value: fmtNum(valuationDetailQuery.data.summary?.total_qty_on_hand),
                  },
                  {
                    label: "Asset value",
                    value: formatCurrency(
                      valuationDetailQuery.data.summary?.total_asset_value ?? 0
                    ),
                  },
                ]}
              />
              <Card className="border-border shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Inventory Valuation Detail</CardTitle>
                </CardHeader>
                <CardContent>
                  <TreeReportTable
                    headers={[
                      "Product/Service",
                      "Transaction date",
                      "Transaction type",
                      "Number",
                      "Name",
                      "Qty",
                      "Rate",
                      "Inventory cost",
                      "Qty on hand",
                      "Asset value",
                    ]}
                    groups={valuationTreeGroups}
                    footer={
                      valuationTreeGroups.length
                        ? [
                            "TOTAL",
                            "",
                            "",
                            "",
                            "",
                            fmtNum(valuationDetailQuery.data.summary?.total_qty),
                            "",
                            formatCurrency(
                              valuationDetailQuery.data.summary?.total_inventory_cost ?? 0
                            ),
                            fmtNum(valuationDetailQuery.data.summary?.total_qty_on_hand),
                            formatCurrency(
                              valuationDetailQuery.data.summary?.total_asset_value ?? 0
                            ),
                          ]
                        : undefined
                    }
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
                    label: "SKUs",
                    value: String(valuationSummaryQuery.data.summary?.sku_count ?? 0),
                  },
                  {
                    label: "Qty",
                    value: fmtNum(valuationSummaryQuery.data.summary?.total_qty),
                  },
                  {
                    label: "Asset value",
                    value: formatCurrency(
                      valuationSummaryQuery.data.summary?.total_asset_value ?? 0
                    ),
                  },
                  {
                    label: "Calc. Avg",
                    value: formatCurrency(valuationSummaryQuery.data.summary?.calc_avg ?? 0),
                  },
                ]}
              />
              <Card className="border-border shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Inventory Valuation Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReportTable
                    headers={["Product/Service", "SKU", "Qty", "Asset Value", "Calc. Avg"]}
                    rows={[
                      ...(valuationSummaryQuery.data.rows ?? []).map((row: any) => [
                        row.product_service,
                        row.sku,
                        fmtNum(row.qty),
                        fmtNum(row.asset_value),
                        fmtNum(row.calc_avg),
                      ]),
                      ...(valuationSummaryQuery.data.rows?.length
                        ? [
                            [
                              <span key="vs-total" className="font-semibold">
                                TOTAL
                              </span>,
                              "",
                              fmtNum(valuationSummaryQuery.data.summary?.total_qty),
                              formatCurrency(
                                valuationSummaryQuery.data.summary?.total_asset_value ?? 0
                              ),
                              formatCurrency(valuationSummaryQuery.data.summary?.calc_avg ?? 0),
                            ],
                          ]
                        : []),
                    ]}
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
                    label: "Amount",
                    value: formatCurrency(openPoListQuery.data.summary?.total_amount ?? 0),
                  },
                  {
                    label: "Open balance",
                    value: formatCurrency(openPoListQuery.data.summary?.total_open_balance ?? 0),
                  },
                ]}
              />
              <Card className="border-border shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Open Purchase Order List by Supplier</CardTitle>
                </CardHeader>
                <CardContent>
                  <TreeReportTable
                    headers={["Date", "Number", "Memo", "Ship via", "Amount", "Open Balance"]}
                    groups={openPoTreeGroups}
                    footer={
                      openPoTreeGroups.length
                        ? [
                            "TOTAL",
                            "",
                            "",
                            "",
                            formatCurrency(openPoListQuery.data.summary?.total_amount ?? 0),
                            formatCurrency(
                              openPoListQuery.data.summary?.total_open_balance ?? 0
                            ),
                          ]
                        : undefined
                    }
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
                    label: "PO open balance",
                    value: formatCurrency(
                      openPoDetailQuery.data.summary?.total_open_balance ?? 0
                    ),
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
                      "Transaction date",
                      "Number",
                      "Supplier display name",
                      "Product/Service full name",
                      "Account Name",
                      "Quantity",
                      "Billed quantity",
                      "Backordered quantity",
                      "Total amount",
                      "Received amount",
                      "PO open balance",
                    ]}
                    rows={(openPoDetailQuery.data.lines ?? []).map((line: any) => [
                      line.transaction_date || "—",
                      <Link
                        key={`${line.po_id}-${line.product_service_full_name}`}
                        href={`/inventory/purchase-orders/${line.po_id}`}
                        className="text-primary hover:underline"
                      >
                        {line.number}
                      </Link>,
                      line.supplier_display_name,
                      line.product_service_full_name,
                      line.account_name,
                      fmtNum(line.quantity),
                      fmtNum(line.billed_quantity),
                      fmtNum(line.backordered_quantity),
                      formatCurrency(line.total_amount),
                      formatCurrency(line.received_amount),
                      formatCurrency(line.po_open_balance),
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
                <CardTitle className="text-base">Stocktake Worksheet</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Physical Count is blank for manual entry. Click{" "}
                  <span className="font-medium text-foreground">Start count from worksheet</span> to
                  open a live Physical Count session. You can also{" "}
                  <Link href="/inventory/physical-counts" className="text-primary hover:underline">
                    manage sessions
                  </Link>{" "}
                  separately.
                </p>
              </CardHeader>
              <CardContent>
                <ReportTable
                  headers={[
                    "Product/Service",
                    "Memo/Description",
                    "Category",
                    "Preferred supplier name",
                    "Quantity on hand",
                    "Physical Count",
                  ]}
                  rows={(stockTakeQuery.data.lines ?? []).map((line: any) => [
                    line.product_service,
                    line.memo_description || "",
                    line.category || "",
                    line.preferred_supplier_name || "",
                    fmtNum(line.quantity_on_hand),
                    "______",
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
