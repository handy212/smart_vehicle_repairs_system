"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { PrintLayout } from "@/components/print/PrintLayout";
import { PrintControls } from "@/components/print/PrintControls";

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

  // Determine watermark based on status
  const getWatermark = () => {
    if (estimate.status === 'declined' || estimate.status === 'expired') return 'VOID';
    if (estimate.status === 'draft') return 'DRAFT';
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PrintControls
        onPrint={() => window.print()}
      />

      <PrintLayout
        watermark={getWatermark()}
        documentType="ESTIMATE"
        documentNumber={estimate.estimate_number}
        metaInfo={
          <div className="text-right">
            <div className="mb-1">
              <span className="font-bold text-foreground">Date:</span> {format(new Date(estimateData.estimate_date || estimate.created_at), "MMMM d, yyyy")}
            </div>
            {estimateData.expiration_date && (
              <div className="mb-1">
                <span className="font-bold text-foreground">Expires:</span> {format(new Date(estimateData.expiration_date), "MMMM d, yyyy")}
              </div>
            )}
            <div className="mb-1">
              <span className="font-bold text-foreground">Status:</span> <span className={`uppercase font-semibold ${estimate.status === 'approved' ? 'text-success' :
                  estimate.status === 'declined' ? 'text-red-600' : ''
                }`}>{estimate.status}</span>
            </div>
          </div>
        }
      >
        {/* Company & Customer Info */}
        <div className="mb-8">
          <h2 className="text-base font-semibold border-b border-gray-300 mb-1 pb-1">ESTIMATE FOR</h2>
          {estimateData.customer && (
            <div className="text-xs">
              <p className="font-semibold my-0.5">
                {typeof estimateData.customer === "object"
                  ? `${(estimateData.customer as any).first_name || ""} ${(estimateData.customer as any).last_name || ""}`.trim()
                  : estimateData.customer}
              </p>
              {typeof estimateData.customer === "object" && (estimateData.customer as any).email && (
                <p className="my-0.5">{(estimateData.customer as any).email}</p>
              )}
              {typeof estimateData.customer === "object" && (estimateData.customer as any).phone && (
                <p className="my-0.5">{(estimateData.customer as any).phone}</p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          {estimateData.work_order && (
            <div>
              <h2 className="text-base font-semibold border-b border-gray-300 mb-1 pb-1">WORK ORDER</h2>
              <p className="text-xs">
                #{typeof estimateData.work_order === "object" ? (estimateData.work_order as any).work_order_number : estimateData.work_order}
              </p>
            </div>
          )}
          {estimateData.vehicle && (
            <div>
              <h2 className="text-base font-semibold border-b border-gray-300 mb-1 pb-1">VEHICLE</h2>
              <p className="text-xs">
                {typeof estimateData.vehicle === "object"
                  ? `${(estimateData.vehicle as any).year || ""} ${(estimateData.vehicle as any).make || ""} ${(estimateData.vehicle as any).model || ""}`.trim()
                  : estimateData.vehicle}
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
              <tr className="bg-gray-100">
                <td className="border border-black p-1 font-bold">TOTAL</td>
                <td className="border border-black p-1 text-right font-bold">{formatCurrency(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes */}
        {estimate.notes && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold mb-1">Notes:</h3>
            <p className="text-xs whitespace-pre-wrap">{estimate.notes}</p>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-gray-300 text-center text-xs text-muted-foreground">
          <p className="mb-1 font-semibold">This is an estimate. Prices may vary based on actual work performed.</p>
          {estimateData.expiration_date && (
            <p>Valid until {format(new Date(estimateData.expiration_date), "MMMM d, yyyy")}</p>
          )}
        </div>
      </PrintLayout>
    </div>
  );
}
