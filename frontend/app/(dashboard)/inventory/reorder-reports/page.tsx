"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { reportingApi } from "@/lib/api/reporting";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

type LowStockItem = {
  part: { id: number; part_number: string; name: string; category?: string | null };
  stock: { current: number; reorder_point: number; reorder_quantity: number };
  supplier?: { id?: number | null; name?: string | null };
  is_critical: boolean;
};

export default function ReorderReportsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["reporting", "low-stock"],
    queryFn: () => reportingApi.lowStock(),
  });

  const summary = (data as { summary?: { total_low_stock?: number; critical_stock?: number } })?.summary;
  const items = ((data as { items?: LowStockItem[] })?.items ?? []) as LowStockItem[];

  return (
    <PermissionPageGuard permission="view_inventory">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reorder Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Parts at or below reorder point that need replenishment.
            </p>
          </div>
          <BranchReportChip />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Low Stock Items</p>
              <p className="text-3xl font-semibold">{summary?.total_low_stock ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Critical Stock</p>
              <p className="text-3xl font-semibold text-destructive">{summary?.critical_stock ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Low Stock Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading…
              </div>
            ) : isError ? (
              <p className="p-6 text-sm text-destructive">
                Failed to load report.{" "}
                <button type="button" className="underline" onClick={() => refetch()}>
                  Retry
                </button>
              </p>
            ) : items.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">All parts are above reorder point.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Reorder Point</TableHead>
                    <TableHead className="text-right">Reorder Qty</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.part.id}>
                      <TableCell>
                        <Link href={`/inventory/${item.part.id}`} className="font-medium hover:text-primary">
                          {item.part.part_number} — {item.part.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.part.category ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{item.stock.current}</TableCell>
                      <TableCell className="text-right font-mono">{item.stock.reorder_point}</TableCell>
                      <TableCell className="text-right font-mono">{item.stock.reorder_quantity}</TableCell>
                      <TableCell>{item.supplier?.name ?? "—"}</TableCell>
                      <TableCell>
                        {item.is_critical ? (
                          <Badge variant="destructive">Critical</Badge>
                        ) : (
                          <Badge variant="outline">Low</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionPageGuard>
  );
}
