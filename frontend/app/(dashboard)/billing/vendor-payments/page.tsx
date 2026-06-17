"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { billingApi } from "@/lib/api/billing";
import { inventoryApi } from "@/lib/api/inventory";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Badge } from "@/components/ui/badge";

export default function VendorPaymentsPage() {
  const { formatCurrency } = useCurrency();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [vendorId, setVendorId] = useState<string>("all");

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers", "vendor-payments-filter"],
    queryFn: () => inventoryApi.listSuppliers({ is_active: true }),
  });

  const suppliers = Array.isArray(suppliersData) ? suppliersData : suppliersData?.results ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["billing", "bill-payments", vendorId, dateFrom, dateTo],
    queryFn: () =>
      billingApi.billPayments.list({
        vendor: vendorId !== "all" ? Number(vendorId) : undefined,
        date_from: dateFrom,
        date_to: dateTo,
      }),
  });

  const payments = data?.results ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendor Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bill payment history across vendors.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vendors</SelectItem>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={String(supplier.id)}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="date_from" className="text-xs">From</Label>
            <Input id="date_from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label htmlFor="date_to" className="text-xs">To</Label>
            <Input id="date_to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b flex-row items-center justify-between">
          <CardTitle className="text-base">Payments</CardTitle>
          <Badge variant="outline">{data?.count ?? payments.length} records</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton columns={7} rows={8} />
          ) : payments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No payments found for the selected filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs">{payment.payment_number}</TableCell>
                    <TableCell>{payment.payment_date}</TableCell>
                    <TableCell>{payment.vendor_name ?? "—"}</TableCell>
                    <TableCell>
                      {payment.bill ? (
                        <Link href={`/billing/bills/${payment.bill}`} className="text-primary hover:underline">
                          {payment.bill_number ?? `#${payment.bill}`}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{payment.payment_method.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(payment.amount)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{payment.reference_number ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
