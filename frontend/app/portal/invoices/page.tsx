"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, DollarSign, Filter, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
  const pendingInvoices = invoices.filter((inv: any) => ["pending", "sent"].includes(inv.status));
  const totalPending = pendingInvoices.reduce(
    (sum: number, inv: any) => sum + parseFloat(inv.total || 0),
    0
  );
  const totalPaid = invoices
    .filter((inv: any) => inv.status === "paid")
    .reduce((sum: number, inv: any) => sum + parseFloat(inv.total || 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "paid":
        return "success";
      case "pending":
      case "sent":
        return "warning";
      case "overdue":
        return "danger";
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">My Invoices</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          View and pay your invoices
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Pending Amount
            </CardTitle>
            <DollarSign className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              ${totalPending.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {pendingInvoices.length} invoice(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Paid
            </CardTitle>
            <DollarSign className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              ${totalPaid.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Invoices
            </CardTitle>
            <FileText className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {invoices.length}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-4">
            <Filter className="w-5 h-5 text-gray-400" />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-48"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invoices List */}
      {invoices.length > 0 ? (
        <div className="space-y-4">
          {invoices.map((invoice: any) => (
            <Card key={invoice.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <FileText className="w-5 h-5 text-blue-500" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Invoice #{invoice.invoice_number}
                      </h3>
                    </div>
                    <div className="ml-8 space-y-1">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Date: {format(new Date(invoice.invoice_date), "MMM d, yyyy")}
                      </p>
                      {invoice.due_date && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Due: {format(new Date(invoice.due_date), "MMM d, yyyy")}
                        </p>
                      )}
                      {invoice.work_order && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Work Order: #{typeof invoice.work_order === "object" ? invoice.work_order.work_order_number : invoice.work_order}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      ${parseFloat(invoice.total || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <Badge variant={getStatusVariant(invoice.status)}>{invoice.status}</Badge>
                    <div className="flex items-center space-x-2 mt-2">
                      {["pending", "sent", "overdue"].includes(invoice.status) && (
                        <Link href={`/portal/payment/${invoice.id}`}>
                          <Button size="sm">Pay Now</Button>
                        </Link>
                      )}
                      <Link href={`/portal/invoices/${invoice.id}`}>
                        <Buttonvariant="secondary" size="sm">
                          <Download className="w-4 h-4 mr-1" />
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No invoices found
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              {statusFilter !== "all"
                ? `No invoices with status "${statusFilter}" found.`
                : "You don't have any invoices yet. Invoices will appear here after services are completed."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

