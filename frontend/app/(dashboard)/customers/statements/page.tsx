"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { customersApi } from "@/lib/api/customers";
import { useCurrency } from "@/lib/hooks/useCurrency";

export default function CustomerStatementsPage() {
  return (
    <PermissionPageGuard permission="view_customers">
      <CustomerStatementsContent />
    </PermissionPageGuard>
  );
}

function CustomerStatementsContent() {
  const [search, setSearch] = useState("");
  const { formatCurrency } = useCurrency();

  const { data, isLoading } = useQuery({
    queryKey: ["customer-statements", search],
    queryFn: () => customersApi.list({ search: search || undefined, ordering: "company_name", page_size: 50 }),
  });

  const rows = (data?.results ?? []).map((customer) => ({
    ...customer,
    displayName:
      customer.company_name ||
      customer.full_name ||
      `${customer.user?.first_name ?? ""} ${customer.user?.last_name ?? ""}`.trim() ||
      customer.customer_number,
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <PageHeader
          title="Customer Statements"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Customers", href: "/customers" },
            { label: "Statements" },
          ]}
          actions={
            <Link href="/customers">
              <Button variant="outline" size="sm">
                Customer Centre
              </Button>
            </Link>
          }
        >
          <Card className="border-dashed">
            <CardContent className="flex flex-col gap-3 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <div>
                Open any customer directly in the existing statement view. This page is a faster accounting entry point, not a separate statement engine.
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search customers..."
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>
        </PageHeader>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Customer #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Current Balance</TableHead>
                  <TableHead className="w-[160px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Loading customers...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No customers found for this search.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{customer.displayName}</div>
                        <div className="text-xs text-muted-foreground">{customer.email || customer.user?.email || "No email"}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{customer.customer_number}</TableCell>
                      <TableCell className="capitalize">{customer.customer_type.replace("_", " ")}</TableCell>
                      <TableCell>{customer.phone || customer.user?.phone || customer.company_phone || "-"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number.parseFloat(customer.current_balance || "0"))}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/customers/${customer.id}`}>
                            <Button variant="outline" size="sm">
                              Open
                            </Button>
                          </Link>
                          <Link href={`/customers/${customer.id}?view=statement`}>
                            <Button size="sm">
                              <FileText className="mr-1.5 h-4 w-4" />
                              Statement
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
