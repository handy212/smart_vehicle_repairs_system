"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { format } from "date-fns";
import { FileMinus2, Plus, Search } from "lucide-react";
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
import { QboListCell } from "@/components/integrations/QboListCell";
import { billingApi } from "@/lib/api/billing";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

function getStatusVariant(status: string) {
  switch (status) {
    case "issued":
      return "success";
    case "applied":
      return "info";
    case "void":
      return "danger";
    default:
      return "default";
  }
}

function VendorCreditsContent() {
  const { formatCurrency } = useCurrency();
  const { isConnected: isQboConnected } = useQuickBooksConnection();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({
    field: "credit_date",
    direction: "desc",
  });
  const debouncedSearch = useDebounce(search, 500);

  const handleSort = (field: string) => {
    setSortConfig((current) => toggleSortConfig(current, field));
    setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["vendor-credits", page, debouncedSearch, statusFilter, sortConfig],
    queryFn: () =>
      billingApi.vendorCredits.list({
        page,
        search: debouncedSearch || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        ordering: sortOrderingParam(sortConfig) || "-credit_date",
      }),
  });

  const credits = data?.results ?? [];
  const tableColSpan = isQboConnected ? 8 : 7;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-4">
        <PageHeader
          title="Vendor Credits"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Billing", href: "/billing" },
            { label: "Vendor Credits" },
          ]}
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href="/billing/vendor-credits/new">
                <Button size="sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Vendor Credit
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
            Manage vendor credit memos. Credits post to the general ledger when applied against open bills.
          </p>
        </PageHeader>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total Credits
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{data?.count ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Issued (this page)
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {credits.filter((c) => c.status === "issued").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Unapplied Balance
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {formatCurrency(
                  credits.reduce((sum, credit) => sum + Number.parseFloat(credit.unused_amount || "0"), 0)
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
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search vendor credits..."
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="issued">Issued</SelectItem>
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader field="credit_number" sortConfig={sortConfig} onSort={handleSort}>
                    Credit #
                  </SortableHeader>
                  <SortableHeader field="credit_date" sortConfig={sortConfig} onSort={handleSort}>
                    Date
                  </SortableHeader>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead>Status</TableHead>
                  {isQboConnected ? <TableHead>QBO</TableHead> : null}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Unused</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={tableColSpan} className="py-10 text-center text-sm text-muted-foreground">
                      Loading vendor credits...
                    </TableCell>
                  </TableRow>
                ) : credits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={tableColSpan} className="py-10 text-center text-sm text-muted-foreground">
                      No vendor credits found.
                    </TableCell>
                  </TableRow>
                ) : (
                  credits.map((credit) => (
                    <TableRow key={credit.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <Link
                          href={`/billing/vendor-credits/${credit.id}`}
                          className="flex items-center gap-2 text-primary hover:underline"
                        >
                          <FileMinus2 className="h-4 w-4 text-muted-foreground" />
                          {credit.credit_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {credit.credit_date
                          ? format(new Date(credit.credit_date), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell>{credit.vendor_name ?? `Vendor #${credit.vendor}`}</TableCell>
                      <TableCell>
                        {credit.bill_number ? (
                          <Link href={`/billing/bills/${credit.bill}`} className="text-primary hover:underline">
                            {credit.bill_number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(credit.status)}>{credit.status}</Badge>
                      </TableCell>
                      {isQboConnected ? (
                        <TableCell>
                          <QboListCell
                            connected={isQboConnected}
                            status={credit.qbo_sync_status}
                            error={credit.qbo_sync_error}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right">{formatCurrency(credit.total)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(credit.unused_amount)}</TableCell>
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

export default function VendorCreditsPage() {
  return (
    <PermissionPageGuard permission="view_billing">
      <VendorCreditsContent />
    </PermissionPageGuard>
  );
}
