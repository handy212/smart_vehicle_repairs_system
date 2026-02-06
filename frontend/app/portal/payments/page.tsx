"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Calendar, DollarSign, FileText, Filter, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrency } from "@/lib/hooks/useCurrency";

export default function PaymentHistoryPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const { formatCurrency } = useCurrency();
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ["portal", "payments", statusFilter, methodFilter],
    queryFn: () => {
      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) return Promise.resolve([]);
      const params: any = {
        customer: customerId,
        ordering: "-payment_date",
      };
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }
      if (methodFilter !== "all") {
        params.payment_method = methodFilter;
      }
      return billingApi.payments.list(params);
    },
    enabled: !!user && !!(user?.customer_profile?.id || (user as any)?.customer?.id),
  });

  const payments = (paymentsData || []) as any[];

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
      case "completed":
        return "success";
      case "pending":
        return "warning";
      case "failed":
        return "danger";
      case "refunded":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const getMethodDisplay = (method: string) => {
    const methods: Record<string, string> = {
      cash: "Cash",
      credit_card: "Credit Card",
      debit_card: "Debit Card",
      check: "Check",
      bank_transfer: "Bank Transfer",
      online: "Online",
      paystack: "Paystack",
      stripe: "Stripe",
      square: "Square",
      hubtel: "Hubtel",
    };
    return methods[method] || method;
  };

  const totalPaid = payments
    .filter((p: any) => p.status === "completed")
    .reduce((sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Payment History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View all your payment transactions
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Payments
            </CardTitle>
            <CreditCard className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {payments.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Paid
            </CardTitle>
            <DollarSign className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(totalPaid)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completed
            </CardTitle>
            <FileText className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {payments.filter((p: any) => p.status === "completed").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-4">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="all">All Methods</option>
              <option value="cash">Cash</option>
              <option value="credit_card">Credit Card</option>
              <option value="debit_card">Debit Card</option>
              <option value="check">Check</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="online">Online</option>
              <option value="paystack">Paystack</option>
              <option value="stripe">Stripe</option>
              <option value="square">Square</option>
              <option value="hubtel">Hubtel</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      {payments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">
                        {payment.payment_number || `PAY-${payment.id}`}
                      </TableCell>
                      <TableCell>
                        {format(new Date(payment.payment_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {payment.invoice_number ? (
                          <Link
                            href={`/portal/invoices/${payment.invoice}`}
                            className="text-primary hover:underline"
                          >
                            {payment.invoice_number}
                          </Link>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(payment.amount || 0)}
                      </TableCell>
                      <TableCell>{getMethodDisplay(payment.payment_method)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(payment.status)}>
                          {payment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {payment.transaction_id || payment.reference_number || "N/A"}
                      </TableCell>
                      <TableCell>
                        {payment.invoice && (
                          <Link href={`/portal/invoices/${payment.invoice}`}>
                            <Button variant="secondary" size="sm">
                              View Invoice
                            </Button>
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No payments found</p>
            <p className="text-sm text-muted-foreground">
              Your payment history will appear here once you make a payment
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

