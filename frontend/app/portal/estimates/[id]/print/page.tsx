"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

import { useCurrency } from "@/lib/hooks/useCurrency";
export default function EstimatePrintPage() {
    const { formatCurrency } = useCurrency();
  const params = useParams();
  const estimateId = parseInt(params.id as string);

  const { data: estimate, isLoading } = useQuery({
    queryKey: ["portal", "estimate", estimateId],
    queryFn: () => billingApi.estimates.get(estimateId),
    enabled: !!estimateId,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="p-8 text-center">
        <p>Estimate not found</p>
      </div>
    );
  }

  const estimateData = estimate as any;
  const lineItems = estimateData.line_items || [];
  const subtotal = parseFloat(estimateData.subtotal || "0");
  const tax = parseFloat(estimateData.tax || "0");
  const total = parseFloat(estimate.total || "0");

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
            <h1 className="text-3xl font-bold text-foreground mb-2">ESTIMATE</h1>
            <p className="text-muted-foreground">Estimate #{estimate.estimate_number}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">
              Date: {format(new Date(estimateData.estimate_date || estimate.created_at), "MMMM d, yyyy")}
            </p>
            {estimateData.expiration_date && (
              <p className="text-sm text-muted-foreground">
                Expires: {format(new Date(estimateData.expiration_date), "MMMM d, yyyy")}
              </p>
            )}
            <p className="text-sm font-semibold text-foreground mt-2">
              Status: <span className="uppercase">{estimate.status}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Company & Customer Info */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h2 className="font-semibold text-foreground mb-2">Estimate For:</h2>
          {estimateData.customer && (
            <div className="text-foreground">
              <p className="font-medium">
                {typeof estimateData.customer === "object"
                  ? `${(estimateData.customer as any).first_name || ""} ${(estimateData.customer as any).last_name || ""}`.trim()
                  : estimateData.customer}
              </p>
              {typeof estimateData.customer === "object" && (estimateData.customer as any).email && (
                <p className="text-sm">{(estimateData.customer as any).email}</p>
              )}
              {typeof estimateData.customer === "object" && (estimateData.customer as any).phone && (
                <p className="text-sm">{(estimateData.customer as any).phone}</p>
              )}
            </div>
          )}
        </div>
        <div>
          {estimateData.work_order && (
            <>
              <h2 className="font-semibold text-foreground mb-2">Work Order:</h2>
              <p className="text-foreground">
                #{typeof estimateData.work_order === "object" ? (estimateData.work_order as any).work_order_number : estimateData.work_order}
              </p>
            </>
          )}
          {estimateData.vehicle && (
            <>
              <h2 className="font-semibold text-foreground mb-2 mt-4">Vehicle:</h2>
              <p className="text-foreground">
                {typeof estimateData.vehicle === "object"
                  ? `${(estimateData.vehicle as any).year || ""} ${(estimateData.vehicle as any).make || ""} ${(estimateData.vehicle as any).model || ""}`.trim()
                  : estimateData.vehicle}
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
          <div className="flex justify-between py-3 border-t-2 border-border mt-2">
            <span className="font-bold text-lg text-foreground">Total:</span>
            <span className="font-bold text-lg text-foreground">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {estimate.notes && (
        <div className="mb-8">
          <h3 className="font-semibold text-foreground mb-2">Notes:</h3>
          <p className="text-foreground whitespace-pre-wrap">{estimate.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-border text-center text-sm text-muted-foreground">
        <p>This is an estimate. Prices may vary based on actual work performed.</p>
        {estimateData.expiration_date && (
          <p className="mt-2">Valid until {format(new Date(estimateData.expiration_date), "MMMM d, yyyy")}</p>
        )}
      </div>

      {/* Print Button (hidden when printing) */}
      <div className="no-print mt-8 text-center">
        <button
          onClick={() => window.print()}
          className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
        >
          Print Estimate
        </button>
      </div>
    </div>
  );
}

