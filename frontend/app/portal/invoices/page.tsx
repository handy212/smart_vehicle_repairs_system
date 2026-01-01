"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, DollarSign, Download, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalList } from "../components/PortalList";
import { PortalCard } from "../components/PortalCard";

export default function MyInvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ["portal", "invoices", statusFilter],
    queryFn: () => {
      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      const params: any = {
        customer: customerId,
        ordering: "-invoice_date",
      };
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }
      return billingApi.invoices.list(params);
    },
    enabled: !!user && !!(user?.customer_profile?.id || (user as any)?.customer?.id),
  });

  const invoices = (invoicesData?.results || invoicesData || []) as any[];

  // Calculate stats from all invoices (in a real app, this should come from a separate stats API or aggregated query)
  const pendingInvoices = invoices.filter((inv: any) => ["sent", "viewed", "proforma", "partial", "overdue"].includes(inv.status));
  const totalPending = pendingInvoices.reduce(
    (sum: number, inv: any) => sum + parseFloat(inv.total || 0),
    0
  );

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "paid": return "success";
      case "pending":
      case "sent":
      case "viewed":
      case "proforma":
      case "partial": return "warning";
      case "overdue": return "danger";
      default: return "secondary";
    }
  };

  return (
    <div>
      <PortalPageHeader
        title="My Invoices"
      />

      {/* Compact Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <Card className="col-span-2 md:col-span-1 border-none shadow-sm bg-yellow-50 dark:bg-yellow-900/10">
          <CardContent className="p-4 flex flex-col justify-center h-full">
            <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">Pending Amount</p>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              ${totalPending.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1 border-none shadow-sm bg-blue-50 dark:bg-blue-900/10">
          <CardContent className="p-4 flex flex-col justify-center h-full">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Total Invoices</p>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              {invoices.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unpaid">Pending</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
          </TabsList>

          <TabsContent value={statusFilter} className="mt-0">
            <PortalList
              data={invoices}
              isLoading={isLoading}
              emptyMessage="No invoices found."
              columns={[
                {
                  header: "Invoice #",
                  cell: (inv) => (
                    <div className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                      #{inv.invoice_number}
                    </div>
                  )
                },
                {
                  header: "Date",
                  cell: (inv) => (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {format(new Date(inv.invoice_date), "MMM d, yyyy")}
                    </div>
                  )
                },
                {
                  header: "Amount",
                  cell: (inv) => (
                    <div className="font-bold text-gray-900 dark:text-gray-100">
                      ${parseFloat(inv.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  )
                },
                {
                  header: "Status",
                  cell: (inv) => (
                    <Badge variant={getStatusVariant(inv.status)} className="capitalize">
                      {inv.status}
                    </Badge>
                  )
                },
                {
                  header: "Work Order",
                  className: "hidden md:table-cell",
                  cell: (inv) => inv.work_order ? (
                    <span className="text-xs text-gray-500">
                      #{typeof inv.work_order === "object" ? inv.work_order.work_order_number : inv.work_order}
                    </span>
                  ) : <span className="text-gray-400">-</span>
                },
                {
                  header: "Action",
                  className: "text-right",
                  cell: (inv) => (
                    <div className="flex justify-end gap-2">
                      {["pending", "sent", "overdue"].includes(inv.status) && (
                        <Link href={`/portal/payment/${inv.id}`}>
                          <Button size="sm" className="h-8 text-xs">Pay</Button>
                        </Link>
                      )}
                      <Link href={`/portal/invoices/${inv.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Download className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  )
                }
              ]}
              renderMobileItem={(inv) => (
                <PortalCard
                  key={inv.id}
                  href={`/portal/invoices/${inv.id}`}
                  icon={<FileText className="w-5 h-5 text-blue-500" />}
                  title={`Invoice #${inv.invoice_number}`}
                  subtitle={format(new Date(inv.invoice_date), "MMM d, yyyy")}
                  status={
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-bold text-gray-900 dark:text-gray-100">
                        ${parseFloat(inv.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      <Badge variant={getStatusVariant(inv.status)} className="capitalize text-[10px] h-5 px-1.5">
                        {inv.status}
                      </Badge>
                    </div>
                  }
                >
                  {["pending", "sent", "overdue"].includes(inv.status) && (
                    <div className="mt-3 flex justify-end">
                      <Link href={`/portal/payment/${inv.id}`} className="w-full">
                        <Button size="sm" className="w-full">Pay Now</Button>
                      </Link>
                    </div>
                  )}
                </PortalCard>
              )}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

