"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

import { useCurrency } from "@/lib/hooks/useCurrency";
export default function InvoicePrintPage() {
    const { formatCurrency } = useCurrency();
  const params = useParams();
  const invoiceId = parseInt(params.id as string);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["portal", "invoice", invoiceId],
    queryFn: () => billingApi.invoices.get(invoiceId),
    enabled: !!invoiceId,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8 text-center">
        <p>Invoice not found</p>
      </div>
    );
  }

  const invoiceData = invoice as any;
  const lineItems = invoiceData.line_items || [];
  const subtotal = parseFloat(invoiceData.subtotal || "0");
  const tax = parseFloat(invoiceData.tax || "0");
  const total = parseFloat(invoice.total || "0");
  const amountPaid = parseFloat(invoiceData.amount_paid || "0");
  const balanceDue = parseFloat(invoiceData.balance_due || invoice.total || "0");

  return (
    <div className="min-h-screen bg-card p-8 print:p-4">
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 1cm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="mb-8 border-b-2 border-border pb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">INVOICE</h1>
            <p className="text-muted-foreground">Invoice #{invoice.invoice_number}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Date: {format(new Date(invoice.invoice_date), "MMMM d, yyyy")}</p>
            {invoice.due_date && (
              <p className="text-sm text-muted-foreground">Due: {format(new Date(invoice.due_date), "MMMM d, yyyy")}</p>
            )}
            <p className="text-sm font-semibold text-foreground mt-2">
              Status: <span className="uppercase">{invoice.status}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Company & Customer Info */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h2 className="font-semibold text-foreground mb-2">Bill To:</h2>
          {invoiceData.customer && (
            <div className="text-foreground">
              <p className="font-medium">
                {typeof invoiceData.customer === "object"
                  ? `${(invoiceData.customer as any).first_name || ""} ${(invoiceData.customer as any).last_name || ""}`.trim()
                  : invoiceData.customer}
              </p>
              {typeof invoiceData.customer === "object" && (invoiceData.customer as any).email && (
                <p className="text-sm">{(invoiceData.customer as any).email}</p>
              )}
              {typeof invoiceData.customer === "object" && (invoiceData.customer as any).phone && (
                <p className="text-sm">{(invoiceData.customer as any).phone}</p>
              )}
            </div>
          )}
        </div>
        <div>
          {invoiceData.work_order && (
            <>
              <h2 className="font-semibold text-foreground mb-2">Work Order:</h2>
              <p className="text-foreground">
                #{typeof invoiceData.work_order === "object" ? (invoiceData.work_order as any).work_order_number : invoiceData.work_order}
              </p>
            </>
          )}
          {invoiceData.vehicle && (
            <>
              <h2 className="font-semibold text-foreground mb-2 mt-4">Vehicle:</h2>
              <p className="text-foreground">
                {typeof invoiceData.vehicle === "object"
                  ? `${(invoiceData.vehicle as any).year || ""} ${(invoiceData.vehicle as any).make || ""} ${(invoiceData.vehicle as any).model || ""}`.trim()
                  : invoiceData.vehicle}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Line Items */}
      <div className="mb-8">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-border">
              <th className="text-left p-3 font-semibold text-foreground">Description</th>
              <th className="text-right p-3 font-semibold text-foreground">Quantity</th>
              <th className="text-right p-3 font-semibold text-foreground">Unit Price</th>
              <th className="text-right p-3 font-semibold text-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item: any, index: number) => (
              <tr key={index} className="border-b border-border">
                <td className="p-3 text-foreground">
                  <div>
                    <p className="font-medium">{item.description || item.name || "Item"}</p>
                    {item.notes && <p className="text-sm text-muted-foreground">{item.notes}</p>}
                  </div>
                </td>
                <td className="p-3 text-right text-foreground">{item.quantity || 1}</td>
                <td className="p-3 text-right text-foreground">
                  {formatCurrency(parseFloat(item.unit_price || item.price || "0"))}
                </td>
                <td className="p-3 text-right font-medium text-foreground">
                  {formatCurrency(parseFloat(item.total || item.line_total || "0"))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-64">
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-foreground">Subtotal:</span>
            <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
          </div>
          {tax > 0 && (
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-foreground">Tax:</span>
              <span className="font-medium text-foreground">{formatCurrency(tax)}</span>
            </div>
          )}
          {amountPaid > 0 && (
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-foreground">Amount Paid:</span>
              <span className="font-medium text-success">{formatCurrency(amountPaid)}</span>
            </div>
          )}
          <div className="flex justify-between py-3 border-t-2 border-border mt-2">
            <span className="font-bold text-lg text-foreground">
              {balanceDue > 0 ? "Balance Due:" : "Total:"}
            </span>
            <span className="font-bold text-lg text-foreground">{formatCurrency(balanceDue)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="mb-8">
          <h3 className="font-semibold text-foreground mb-2">Notes:</h3>
          <p className="text-foreground whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-border text-center text-sm text-muted-foreground">
        <p>Thank you for your business!</p>
      </div>

      {/* Print Button (hidden when printing) */}
      <div className="no-print mt-8 text-center">
        <button
          onClick={() => window.print()}
          className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
        >
          Print Invoice
        </button>
      </div>
    </div>
  );
}

