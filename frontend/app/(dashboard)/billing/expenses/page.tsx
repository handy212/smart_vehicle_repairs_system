"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { format } from "date-fns";
import { Plus, Receipt, Search } from "lucide-react";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { QboListCell } from "@/components/integrations/QboListCell";
import { billingApi } from "@/lib/api/billing";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

function getStatusVariant(status: string) {
  switch (status) {
    case "posted":
      return "success";
    case "draft":
      return "default";
    case "void":
      return "danger";
    default:
      return "secondary";
  }
}

function formatPaymentMethod(method: string) {
  return method.replace(/_/g, " ");
}

function VendorExpensesContent() {
  const { formatCurrency } = useCurrency();
  const { isLinked: isQboConnected, isOperational: isQboCanSync, connectionIssue: qboConnectionIssue } = useQuickBooksConnection();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({
    field: "expense_date",
    direction: "desc",
  });
  const debouncedSearch = useDebounce(search, 500);

  const handleSort = (field: string) => {
    setSortConfig((current) => toggleSortConfig(current, field));
    setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["vendor-expenses", page, debouncedSearch, statusFilter, sortConfig],
    queryFn: () =>
      billingApi.vendorExpenses.list({
        page,
        search: debouncedSearch || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        ordering: sortOrderingParam(sortConfig) || "-expense_date",
      }),
  });

  const expenses = data?.results ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full space-y-4">
        <PageHeader
          title="Vendor Expenses"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Billing", href: "/billing" },
            { label: "Vendor Expenses" },
          ]}
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href="/billing/expenses/new">
                <Button size="sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Expense
                </Button>
              </Link>
              <Link href="/billing/bills">
                <Button size="sm" variant="outline">
                  Open Bills
                </Button>
              </Link>
            </div>
          }
        >
          <p className="text-sm text-muted-foreground">
            Immediate vendor payments (QBO Expense / Purchase) — paid at entry, not tracked as AP bills.
          </p>
        </PageHeader>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total Expenses
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{data?.count ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Posted (this page)
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {expenses.filter((expense) => expense.status === "posted").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total (this page)
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {formatCurrency(
                  expenses.reduce((sum, expense) => sum + Number.parseFloat(expense.total || "0"), 0)
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search expenses..."
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="posted">Posted</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader field="expense_number" sortConfig={sortConfig} onSort={handleSort}>
                    Expense #
                  </SortableHeader>
                  <SortableHeader field="expense_date" sortConfig={sortConfig} onSort={handleSort}>
                    Date
                  </SortableHeader>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>QBO</TableHead>
                  <SortableHeader field="total" sortConfig={sortConfig} onSort={handleSort} className="text-right">
                    Total
                  </SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      Loading vendor expenses...
                    </TableCell>
                  </TableRow>
                ) : expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No vendor expenses found.
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((expense) => (
                    <TableRow key={expense.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <Link
                          href={`/billing/expenses/${expense.id}`}
                          className="flex items-center gap-2 text-primary hover:underline"
                        >
                          <Receipt className="h-4 w-4 text-muted-foreground" />
                          {expense.expense_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {expense.expense_date
                          ? format(new Date(expense.expense_date), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell>{expense.vendor_name ?? `Vendor #${expense.vendor}`}</TableCell>
                      <TableCell className="capitalize">{formatPaymentMethod(expense.payment_method)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(expense.status)}>{expense.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <QboListCell
                          connected={isQboConnected}
              connectionIssue={!isQboCanSync ? qboConnectionIssue : undefined}
                          status={expense.qbo_sync_status}
                          error={expense.qbo_sync_error}
                        />
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(expense.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {data && (data.next || data.previous) ? (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!data.previous}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.next}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function VendorExpensesPage() {
  return (
    <PermissionPageGuard permission="view_billing">
      <VendorExpensesContent />
    </PermissionPageGuard>
  );
}
