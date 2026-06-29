"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";

export function VendorBalancesTab() {
  const { formatCurrency } = useCurrency();

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", "vendor-balances"],
    queryFn: () => inventoryApi.listSuppliers({ is_active: true, ordering: "-open_balance" }),
  });

  const suppliers = useMemo(() => {
    const rows = Array.isArray(data) ? data : data?.results ?? [];
    return [...rows].sort(
      (a, b) => Number.parseFloat(b.open_balance || "0") - Number.parseFloat(a.open_balance || "0")
    );
  }, [data]);

  const totalOpen = suppliers.reduce(
    (sum, supplier) => sum + Number.parseFloat(supplier.open_balance || "0"),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/billing/pay-bills">
          <Button size="sm">
            <Wallet className="mr-2 h-4 w-4" />
            Pay Bills
          </Button>
        </Link>
      </div>

      <Card className="max-w-sm">
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">Total Open Balance</p>
          <p className="text-3xl font-semibold">{formatCurrency(totalOpen)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Suppliers by open balance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton columns={6} rows={10} />
          ) : suppliers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No supplier balances found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Open Balance</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => {
                  const openBalance = Number.parseFloat(supplier.open_balance || "0");
                  const overdue = Number.parseFloat(supplier.overdue_payment || "0");
                  return (
                    <TableRow key={supplier.id}>
                      <TableCell>
                        <Link href={`/inventory/suppliers/${supplier.id}`} className="font-medium hover:text-primary">
                          {supplier.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{supplier.supplier_code}</TableCell>
                      <TableCell className="text-right font-mono font-medium">{formatCurrency(openBalance)}</TableCell>
                      <TableCell className="text-right font-mono text-destructive">
                        {overdue > 0 ? formatCurrency(overdue) : "—"}
                      </TableCell>
                      <TableCell>
                        {supplier.is_preferred ? (
                          <Badge variant="outline">Preferred</Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {openBalance > 0 ? (
                          <div className="flex justify-end gap-2">
                            <Link href={`/billing/pay-bills?vendor=${supplier.id}`}>
                              <Button variant="outline" size="sm">Pay</Button>
                            </Link>
                            <Link href={`/billing/bills?vendor=${supplier.id}`}>
                              <Button variant="ghost" size="sm">Bills</Button>
                            </Link>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
