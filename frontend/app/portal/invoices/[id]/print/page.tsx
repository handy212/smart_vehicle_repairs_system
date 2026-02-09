"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { PrintLayout } from "@/components/print/PrintLayout";
import { PrintControls } from "@/components/print/PrintControls";

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
  const amountPaid = parseFloat(invoiceData.amount_paid || "0");
  const balanceDue = parseFloat(invoiceData.balance_due || invoice.total || "0");

  // Determine watermark based on status
  const getWatermark = () => {
    if (invoice.status === 'paid') return 'PAID';
    if (invoice.status === 'void' || invoice.status === 'cancelled') return 'VOID';
    if (balanceDue > 0) return 'UNPAID';
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PrintControls
        onPrint={() => window.print()}
      />

      <PrintLayout
        watermark={getWatermark()}
        documentType="INVOICE"
        documentNumber={invoice.invoice_number}
        metaInfo={
          <div className="text-right">
            <div className="mb-1">
              <span className="font-bold text-foreground">Date:</span> {format(new Date(invoice.invoice_date), "MMMM d, yyyy")}
            </div>
            {invoice.due_date && (
              <div className="mb-1">
                <span className="font-bold text-foreground">Due:</span> {format(new Date(invoice.due_date), "MMMM d, yyyy")}
              </div>
            )}
            <div className="mb-1">
              <span className="font-bold text-foreground">Status:</span> <span className={`uppercase font-semibold ${invoice.status === 'paid' ? 'text-success' :
                  invoice.status === 'overdue' ? 'text-red-600' : ''
                }`}>{invoice.status}</span>
            </div>
          </div>
        }
      >
        {/* Company & Customer Info */}
        <div className="mb-8">
          <h2 className="text-base font-semibold border-b border-gray-300 mb-1 pb-1">BILL TO</h2>
          {invoiceData.customer && (
            <div className="text-xs">
              <p className="font-semibold my-0.5">
                {typeof invoiceData.customer === "object"
                  ? `${(invoiceData.customer as any).first_name || ""} ${(invoiceData.customer as any).last_name || ""}`.trim()
                  : invoiceData.customer}
              </p>
              {typeof invoiceData.customer === "object" && (invoiceData.customer as any).email && (
                <p className="my-0.5">{(invoiceData.customer as any).email}</p>
              )}
              {typeof invoiceData.customer === "object" && (invoiceData.customer as any).phone && (
                <p className="my-0.5">{(invoiceData.customer as any).phone}</p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          {invoiceData.work_order && (
            <div>
              <h2 className="text-base font-semibold border-b border-gray-300 mb-1 pb-1">WORK ORDER</h2>
              <p className="text-xs">
                #{typeof invoiceData.work_order === "object" ? (invoiceData.work_order as any).work_order_number : invoiceData.work_order}
              </p>
            </div>
          )}
          {invoiceData.vehicle && (
            <div>
              <h2 className="text-base font-semibold border-b border-gray-300 mb-1 pb-1">VEHICLE</h2>
              <p className="text-xs">
                {typeof invoiceData.vehicle === "object"
                  ? `${(invoiceData.vehicle as any).year || ""} ${(invoiceData.vehicle as any).make || ""} ${(invoiceData.vehicle as any).model || ""}`.trim()
                  : invoiceData.vehicle}
              </p>
            </div>
          )}
        </div>

        {/* Line Items */}
        <div className="mb-8">
          <h2 className="text-base font-semibold border-b border-gray-300 mb-1 pb-1">SERVICES & PARTS</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black p-1 text-left font-bold">Description</th>
                <th className="border border-black p-1 text-right font-bold">Qty</th>
                <th className="border border-black p-1 text-right font-bold">Unit Price</th>
                <th className="border border-black p-1 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item: any, index: number) => (
                <tr key={index}>
                  <td className="border border-black p-1">
                    <div>
                      <p>{item.description || item.name || "Item"}</p>
                      {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                    </div>
                  </td>
                  <td className="border border-black p-1 text-right">{item.quantity || 1}</td>
                  <td className="border border-black p-1 text-right">
                    {formatCurrency(parseFloat(item.unit_price || item.price || "0"))}
                  </td>
                  <td className="border border-black p-1 text-right font-medium">
                    {formatCurrency(parseFloat(item.total || item.line_total || "0"))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mb-8">
          <h2 className="text-base font-semibold border-b border-gray-300 mb-1 pb-1">FINANCIAL SUMMARY</h2>
          <table className="w-full border-collapse text-xs">
            <tbody>
              <tr>
                <td className="border border-black p-1 font-bold">Subtotal</td>
                <td className="border border-black p-1 text-right font-bold">{formatCurrency(subtotal)}</td>
              </tr>
              {tax > 0 && (
                <tr>
                  <td className="border border-black p-1">Tax</td>
                  <td className="border border-black p-1 text-right">{formatCurrency(tax)}</td>
                </tr>
              )}
              {amountPaid > 0 && (
                <tr>
                  <td className="border border-black p-1">Amount Paid</td>
                  <td className="border border-black p-1 text-right font-medium text-success">{formatCurrency(amountPaid)}</td>
                </tr>
              )}
              <tr className="bg-gray-100">
                <td className="border border-black p-1 font-bold">{balanceDue > 0 ? "BALANCE DUE" : "TOTAL"}</td>
                <td className="border border-black p-1 text-right font-bold">{formatCurrency(balanceDue)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold mb-1">Notes:</h3>
            <p className="text-xs whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-gray-300 text-center text-xs text-muted-foreground">
          <p>Thank you for your business!</p>
        </div>
      </PrintLayout>
    </div>
  );
}
