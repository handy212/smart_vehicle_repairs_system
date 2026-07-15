"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isPast, startOfDay } from "date-fns";
import { CheckCircle2, ChevronRight, Loader2, Search, Wallet } from "lucide-react";
import { billingApi, type Invoice } from "@/lib/api/billing";
import { customersApi } from "@/lib/api/customers";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import RecordPaymentDialog from "@/app/(dashboard)/billing/invoices/[id]/components/RecordPaymentDialog";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { getCustomerDisplayName } from "@/lib/utils/customer-display";

type SelectedCustomer = {
  id: number;
  full_name?: string;
  company_name?: string;
};

const resolveCustomerId = (customer: Invoice["customer"]): number | null => {
  if (typeof customer === "number") {
    return customer;
  }
  return customer?.id ?? null;
};

const parseAmount = (value?: string | number | null) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const num = typeof value === "number" ? value : parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
};

const getBalanceDue = (invoice: Invoice) => {
  const explicitBalance = parseAmount(invoice.balance_due);
  if (explicitBalance > 0) {
    return explicitBalance;
  }

  const amountDue = parseAmount(invoice.amount_due);
  if (amountDue > 0) {
    return amountDue;
  }

  return Math.max(parseAmount(invoice.total) - parseAmount(invoice.amount_paid), 0);
};

const isInvoiceOverdue = (invoice: Invoice) => {
  if (!invoice.due_date || getBalanceDue(invoice) <= 0) {
    return false;
  }

  return isPast(startOfDay(new Date(invoice.due_date)));
};

interface ReceivePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialCustomerId?: number | null;
  initialInvoiceId?: number | null;
}

export function ReceivePaymentDialog({
  open,
  onOpenChange,
  onSuccess,
  initialCustomerId = null,
  initialInvoiceId = null,
}: ReceivePaymentDialogProps) {
  const { formatCurrency } = useCurrency();
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [prefillApplied, setPrefillApplied] = useState(false);

  const { data: initialInvoice } = useQuery({
    queryKey: ["receive-payment-invoice", initialInvoiceId],
    queryFn: () => billingApi.invoices.get(initialInvoiceId!),
    enabled: open && !!initialInvoiceId,
  });

  const { data: initialCustomer } = useQuery({
    queryKey: ["receive-payment-customer", initialCustomerId],
    queryFn: () => customersApi.get(initialCustomerId!),
    enabled: open && !!initialCustomerId && !initialInvoiceId,
  });

  useEffect(() => {
    if (!open) {
      setPrefillApplied(false);
      return;
    }
    if (prefillApplied) return;

    if (initialInvoiceId && initialInvoice) {
      const customerId = resolveCustomerId(initialInvoice.customer);
      if (customerId) {
        setSelectedCustomer({
          id: customerId,
          full_name: initialInvoice.customer_name,
        });
      }
      setSelectedInvoice(initialInvoice);
      setRecordPaymentOpen(true);
      onOpenChange(false);
      setPrefillApplied(true);
      return;
    }

    if (initialCustomerId && initialCustomer && !initialInvoiceId) {
      setSelectedCustomer({
        id: initialCustomer.id,
        full_name: initialCustomer.full_name,
        company_name: initialCustomer.company_name,
      });
      setPrefillApplied(true);
    }
  }, [
    open,
    prefillApplied,
    initialInvoiceId,
    initialInvoice,
    initialCustomerId,
    initialCustomer,
    onOpenChange,
  ]);

  const { data: invoiceResponse, isLoading } = useQuery({
    queryKey: ["receive-payment-invoices", selectedCustomer?.id],
    queryFn: () =>
      billingApi.invoices.list({
        customer: selectedCustomer?.id,
        page_size: 50,
        ordering: "-invoice_date",
      }),
    enabled: open && !!selectedCustomer?.id,
  });

  const unpaidInvoices = useMemo(() => {
    const allInvoices = invoiceResponse?.results ?? [];
    const filteredOutstanding = allInvoices.filter((invoice) => {
      const status = invoice.status?.toLowerCase();
      const balanceDue = getBalanceDue(invoice);
      return balanceDue > 0 && !["paid", "void", "cancelled"].includes(status);
    });

    if (!invoiceSearch.trim()) {
      return filteredOutstanding;
    }

    const search = invoiceSearch.toLowerCase();
    return filteredOutstanding.filter((invoice) => {
      return (
        invoice.invoice_number?.toLowerCase().includes(search) ||
        invoice.reference_number?.toLowerCase().includes(search) ||
        invoice.vehicle_display?.toLowerCase().includes(search) ||
        invoice.work_order_number?.toLowerCase().includes(search)
      );
    });
  }, [invoiceResponse?.results, invoiceSearch]);

  const resetFlow = () => {
    setSelectedCustomer(null);
    setInvoiceSearch("");
    setSelectedInvoice(null);
    setRecordPaymentOpen(false);
  };

  const handleDialogChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetFlow();
    }
  };

  const handleSelectInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setRecordPaymentOpen(true);
    onOpenChange(false);
  };

  const handleRecordPaymentClose = () => {
    setRecordPaymentOpen(false);
    setSelectedInvoice(null);
    onOpenChange(true);
  };

  const handleRecordPaymentSuccess = () => {
    setRecordPaymentOpen(false);
    setSelectedInvoice(null);
    resetFlow();
    onSuccess();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-2xl overflow-hidden border-border/70 p-0">
          <DialogHeader className="border-b border-border/70 px-6 py-5">
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge variant={selectedCustomer ? "default" : "secondary"} className="rounded-full px-3 py-1">
                <span className="mr-1">1.</span>
                Customer
              </Badge>
              <Badge variant={selectedCustomer ? "default" : "secondary"} className="rounded-full px-3 py-1">
                <span className="mr-1">2.</span>
                Invoice
              </Badge>
            </div>
            <DialogTitle className="text-xl">Receive Payment</DialogTitle>
            <DialogDescription>
              Pick a customer, choose an unpaid invoice, and continue to the payment form.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <section className="rounded-xl border border-border/70 bg-muted/15 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Customer / Company</div>
                  <div className="text-xs text-muted-foreground">
                    Search by customer name, company, phone, or customer number.
                  </div>
                </div>
                {selectedCustomer ? (
                  <div className="hidden items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success sm:inline-flex">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Selected
                  </div>
                ) : null}
              </div>
              <CustomerSelector
                selectedCustomerId={selectedCustomer?.id}
                onSelect={(customer) => setSelectedCustomer(customer)}
                placeholder="Search and select a customer or company..."
              />
            </section>

            {selectedCustomer ? (
              <section className="rounded-xl border border-border/70 bg-background/40 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      Outstanding invoices for {getCustomerDisplayName(selectedCustomer)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Only invoices with a balance due are shown below.
                    </div>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={invoiceSearch}
                      onChange={(event) => setInvoiceSearch(event.target.value)}
                      placeholder="Search invoice or vehicle..."
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-4 py-12 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Loading unpaid invoices
                    </div>
                  ) : unpaidInvoices.length === 0 ? (
                    <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-12 text-center">
                      <div className="text-sm font-medium text-foreground">No unpaid invoices found</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Try another customer or clear the invoice search.
                      </div>
                    </div>
                  ) : (
                    unpaidInvoices.map((invoice) => {
                      const balanceDue = getBalanceDue(invoice);
                      const overdue = isInvoiceOverdue(invoice);
                      return (
                        <button
                          key={invoice.id}
                          type="button"
                          onClick={() => handleSelectInvoice(invoice)}
                          className="flex w-full items-center justify-between gap-4 rounded-xl border border-border/70 bg-card px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {invoice.invoice_number}
                              </span>
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {invoice.status}
                              </Badge>
                              {overdue ? (
                                <Badge variant="danger" className="text-[10px] uppercase">
                                  Overdue
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Invoice date {format(new Date(invoice.invoice_date), "MMM dd, yyyy")}
                              {invoice.due_date ? ` • Due ${format(new Date(invoice.due_date), "MMM dd, yyyy")}` : ""}
                            </div>
                            {(invoice.vehicle_display || invoice.work_order_number) ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {[invoice.vehicle_display, invoice.work_order_number].filter(Boolean).join(" • ")}
                              </div>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Balance due
                            </div>
                            <div className="text-base font-semibold text-foreground">
                              {formatCurrency(balanceDue)}
                            </div>
                            <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                              <Wallet className="h-3.5 w-3.5" />
                              Continue
                              <ChevronRight className="h-3.5 w-3.5" />
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>
            ) : (
              <section className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-12 text-center">
                <div className="text-sm font-medium text-foreground">Select a customer to continue</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Unpaid invoices will appear here once a customer or company is selected.
                </div>
              </section>
            )}

            <div className="flex justify-end border-t border-border/70 pt-1">
              <Button variant="outline" onClick={() => handleDialogChange(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedInvoice ? (
        <RecordPaymentDialog
          invoice={selectedInvoice}
          open={recordPaymentOpen}
          onClose={handleRecordPaymentClose}
          onSuccess={handleRecordPaymentSuccess}
        />
      ) : null}
    </>
  );
}
