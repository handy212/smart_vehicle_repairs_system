"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { inventoryApi } from "@/lib/api/inventory";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";

interface StockAlert {
  id: number;
  part_name: string;
  part_number: string;
  branch_name: string;
  alert_type: string;
  severity: string;
  status: string;
  current_quantity: string;
  reorder_point: string;
  message: string;
}

export default function StockAlertsPage() {
  return (
    <PermissionPageGuard permissions={["view_low_stock_alerts", "view_inventory"]}>
      <DynamicPageTitle title="Stock Alerts" />
      <StockAlertsContent />
    </PermissionPageGuard>
  );
}

function StockAlertsContent() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const { data: stats } = useQuery({
    queryKey: ["inventory", "stock-alerts", "stats"],
    queryFn: async () => (await inventoryApi.stockAlerts.stats()).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["inventory", "stock-alerts", statusFilter],
    queryFn: async () => {
      const res = statusFilter === "active"
        ? await inventoryApi.stockAlerts.active()
        : await inventoryApi.stockAlerts.list({ status: statusFilter === "all" ? undefined : statusFilter });
      return res.data;
    },
  });

  const alerts: StockAlert[] = Array.isArray(data) ? data : data?.results ?? [];

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "acknowledge" | "resolve" | "dismiss" }) => {
      if (action === "acknowledge") return inventoryApi.stockAlerts.acknowledge(id);
      if (action === "resolve") return inventoryApi.stockAlerts.resolve(id);
      return inventoryApi.stockAlerts.dismiss(id);
    },
    onSuccess: () => {
      toast.success("Alert updated");
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-alerts"] });
    },
    onError: () => toast.error("Failed to update alert"),
  });

  return (
    <div className="space-y-4">
      <StaffPageHeader
        title="Stock Alerts"
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Stock Alerts" },
        ]}
        actions={
          <Button variant="outline" asChild>
            <Link href="/inventory/reorder-reports">Reorder Reports</Link>
          </Button>
        }
      />

      {stats && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground uppercase">Active</p><p className="text-xl font-bold">{stats.active}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground uppercase">Critical</p><p className="text-xl font-bold text-destructive">{stats.critical}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground uppercase">Low Stock</p><p className="text-xl font-bold">{stats.low_stock}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground uppercase">Out of Stock</p><p className="text-xl font-bold">{stats.out_of_stock}</p></CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Alerts</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty / Reorder</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : alerts.length > 0 ? alerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell>
                    <div className="font-medium">{alert.part_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{alert.part_number}</div>
                  </TableCell>
                  <TableCell>{alert.branch_name}</TableCell>
                  <TableCell className="capitalize">{alert.alert_type.replace(/_/g, " ")}</TableCell>
                  <TableCell className="font-mono text-sm">{alert.current_quantity} / {alert.reorder_point}</TableCell>
                  <TableCell><Badge variant={alert.severity === "critical" ? "danger" : "warning"} className="capitalize">{alert.severity}</Badge></TableCell>
                  <TableCell className="text-right">
                    <PermissionGuard permission="manage_inventory">
                      <div className="flex justify-end gap-1">
                        {alert.status === "active" && (
                          <Button size="sm" variant="outline" onClick={() => mutation.mutate({ id: alert.id, action: "acknowledge" })}>Ack</Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => mutation.mutate({ id: alert.id, action: "resolve" })}>Resolve</Button>
                        <Button size="sm" variant="ghost" onClick={() => mutation.mutate({ id: alert.id, action: "dismiss" })}>Dismiss</Button>
                      </div>
                    </PermissionGuard>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No alerts found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
