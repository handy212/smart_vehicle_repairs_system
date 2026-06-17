"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { getCustomerDisplayName } from "@/lib/utils/customer-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function CustomerBalancesPage() {
  return (
    <PermissionPageGuard permission="view_billing">
      <CustomerBalancesContent />
    </PermissionPageGuard>
  );
}

function CustomerBalancesContent() {
  const { formatCurrency } = useCurrency();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["customers", "balances", search],
    queryFn: () =>
      customersApi.list({
        search: search || undefined,
        ordering: "-current_balance",
        page_size: 200,
        status: "active",
      }),
  });

  const customers = useMemo(() => {
    const rows = data?.results ?? [];
    return rows.filter((customer) => Number.parseFloat(customer.current_balance || "0") > 0);
  }, [data?.results]);

  const totalOpen = customers.reduce(
    (sum, customer) => sum + Number.parseFloat(customer.current_balance || "0"),
    0
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customer Balances</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customers with open receivable balances, ranked by amount owed.
        </p>
      </div>

      <Card className="max-w-sm">
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">Total Open Balance</p>
          <p className="text-3xl font-semibold">{formatCurrency(totalOpen)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Customers</CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers..."
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton columns={5} rows={10} />
          ) : customers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No customers with open balances.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Customer #</TableHead>
                  <TableHead className="text-right">Open Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => {
                  const openBalance = Number.parseFloat(customer.current_balance || "0");
                  return (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <Link href={`/customers/${customer.id}`} className="font-medium hover:text-primary">
                          {getCustomerDisplayName(customer)}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{customer.customer_number}</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(openBalance)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {customer.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-3 text-xs">
                          <Link href={`/customers/${customer.id}?view=statement`} className="text-primary hover:underline">
                            Statement
                          </Link>
                          <Link href={`/billing/payments?customer=${customer.id}`} className="text-primary hover:underline">
                            Receive payment
                          </Link>
                        </div>
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
