"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { useCurrentUser, getCustomerId } from "@/lib/hooks/useCurrentUser";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalList } from "../components/PortalList";
import { PortalCard } from "../components/PortalCard";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { PremiumIcons } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";
import { Invoice } from "@/lib/api/billing";

export default function MyInvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { formatCurrency } = useCurrency();
  const { data: user } = useCurrentUser();
  const customerId = getCustomerId(user);

  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ["portal", "invoices", statusFilter],
    queryFn: () => {
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });

      const params: Record<string, string | number | boolean> = {
        customer: customerId,
        ordering: "-invoice_date",
      };
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }
      return billingApi.invoices.list(params);
    },
    enabled: !!user && !!customerId,
  });

  const invoices = (invoicesData?.results || invoicesData || []) as Invoice[];

  const pendingInvoices = invoices.filter((inv) => ["sent", "viewed", "proforma", "partial", "overdue"].includes(inv.status));
  const totalPending = pendingInvoices.reduce(
    (sum: number, inv) => sum + parseFloat(inv.total ? String(inv.total) : "0"),
    0
  );

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "paid": return { variant: "success" as const, className: "bg-success/10 text-success border-success/20" };
      case "pending":
      case "sent":
      case "viewed":
      case "proforma":
      case "partial": return { variant: "warning" as const, className: "bg-warning/15 text-warning border-warning/20" };
      case "overdue": return { variant: "danger" as const, className: "bg-destructive/10 text-destructive border-destructive/20" };
      default: return { variant: "secondary" as const, className: "" };
    }
  };

  return (
    <div className="space-y-6 w-full">
      <PortalPageHeader
        title="Billing & Invoices"
      />

      {/* Summary row */}
      {pendingInvoices.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-warning/30 bg-warning/5 text-sm">
          <PremiumIcons.Clock className="w-4 h-4 text-warning shrink-0" />
          <span className="text-foreground font-medium">
            {formatCurrency(totalPending)} outstanding across {pendingInvoices.length} unpaid invoice{pendingInvoices.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unpaid">Pending</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-0 outline-none">
          <PortalList
            data={invoices}
            isLoading={isLoading}
            emptyMessage="No invoices found for this selection."
            columns={[
              {
                header: "Invoice",
                cell: (inv) => (
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <PremiumIcons.FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">#{inv.invoice_number}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(inv.invoice_date), "MMM d, yyyy")}
                      </div>
                    </div>
                  </div>
                )
              },
              {
                header: "Amount",
                cell: (inv) => (
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(inv.total || 0)}
                  </span>
                )
              },
              {
                header: "Status",
                cell: (inv) => {
                  const config = getStatusConfig(inv.status);
                  return (
                    <Badge
                      variant={config.variant}
                      className={cn("capitalize text-[10px] font-semibold border", config.className)}
                    >
                      {inv.status}
                    </Badge>
                  );
                }
              },
              {
                header: "Work Order",
                className: "hidden md:table-cell",
                cell: (inv) => inv.work_order_number ? (
                  <span className="text-xs text-muted-foreground">WO-{inv.work_order_number}</span>
                ) : <span className="text-muted-foreground/40">—</span>
              },
              {
                header: "Actions",
                className: "text-right",
                cell: (inv) => (
                  <div className="flex justify-end gap-2">
                    {["pending", "sent", "overdue"].includes(inv.status) && (
                      <Link href={`/portal/payment/${inv.id}`}>
                        <Button size="sm">Pay Now</Button>
                      </Link>
                    )}
                    <Link href={`/portal/invoices/${inv.id}`}>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                        <PremiumIcons.Download className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                )
              }
            ]}
            renderMobileItem={(inv) => {
              const config = getStatusConfig(inv.status);
              return (
                <PortalCard
                  key={inv.id}
                  href={`/portal/invoices/${inv.id}`}
                  icon={<PremiumIcons.FileText className="w-4 h-4" />}
                  title={`Invoice #${inv.invoice_number}`}
                  subtitle={
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">{format(new Date(inv.invoice_date), "MMM d, yyyy")}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={config.variant} className={cn("capitalize text-[10px] font-semibold border", config.className)}>
                          {inv.status}
                        </Badge>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(inv.total || 0)}</span>
                      </div>
                    </div>
                  }
                />
              );
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
