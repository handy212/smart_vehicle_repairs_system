"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function EstimatePrintPage() {
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
    <div className="min-h-screen bg-white p-8 print:p-4">
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
      <div className="mb-8 border-b-2 border-gray-300 pb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">ESTIMATE</h1>
            <p className="text-gray-600">Estimate #{estimate.estimate_number}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">
              Date: {format(new Date(estimateData.estimate_date || estimate.created_at), "MMMM d, yyyy")}
            </p>
            {estimateData.expiration_date && (
              <p className="text-sm text-gray-600">
                Expires: {format(new Date(estimateData.expiration_date), "MMMM d, yyyy")}
              </p>
            )}
            <p className="text-sm font-semibold text-gray-900 mt-2">
              Status: <span className="uppercase">{estimate.status}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Company & Customer Info */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h2 className="font-semibold text-gray-900 mb-2">Estimate For:</h2>
          {estimateData.customer && (
            <div className="text-gray-700">
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
              <h2 className="font-semibold text-gray-900 mb-2">Work Order:</h2>
              <p className="text-gray-700">
                #{typeof estimateData.work_order === "object" ? (estimateData.work_order as any).work_order_number : estimateData.work_order}
              </p>
            </>
          )}
          {estimateData.vehicle && (
            <>
              <h2 className="font-semibold text-gray-900 mb-2 mt-4">Vehicle:</h2>
              <p className="text-gray-700">
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
            <tr className="bg-gray-100 border-b-2 border-gray-300">
              <th className="text-left p-3 font-semibold text-gray-900">Description</th>
              <th className="text-right p-3 font-semibold text-gray-900">Quantity</th>
              <th className="text-right p-3 font-semibold text-gray-900">Unit Price</th>
              <th className="text-right p-3 font-semibold text-gray-900">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item: any, index: number) => (
              <tr key={index} className="border-b border-gray-200">
                <td className="p-3 text-gray-700">
                  <div>
                    <p className="font-medium">{item.description || item.name || "Item"}</p>
                    {item.notes && <p className="text-sm text-gray-500">{item.notes}</p>}
                  </div>
                </td>
                <td className="p-3 text-right text-gray-700">{item.quantity || 1}</td>
                <td className="p-3 text-right text-gray-700">
                  ${parseFloat(item.unit_price || item.price || "0").toFixed(2)}
                </td>
                <td className="p-3 text-right font-medium text-gray-900">
                  ${parseFloat(item.total || item.line_total || "0").toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-64">
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="text-gray-700">Subtotal:</span>
            <span className="font-medium text-gray-900">${subtotal.toFixed(2)}</span>
          </div>
          {tax > 0 && (
            <div className="flex justify-between py-2 border-b border-gray-200">
              <span className="text-gray-700">Tax:</span>
              <span className="font-medium text-gray-900">${tax.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between py-3 border-t-2 border-gray-300 mt-2">
            <span className="font-bold text-lg text-gray-900">Total:</span>
            <span className="font-bold text-lg text-gray-900">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {estimate.notes && (
        <div className="mb-8">
          <h3 className="font-semibold text-gray-900 mb-2">Notes:</h3>
          <p className="text-gray-700 whitespace-pre-wrap">{estimate.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-gray-300 text-center text-sm text-gray-600">
        <p>This is an estimate. Prices may vary based on actual work performed.</p>
        {estimateData.expiration_date && (
          <p className="mt-2">Valid until {format(new Date(estimateData.expiration_date), "MMMM d, yyyy")}</p>
        )}
      </div>

      {/* Print Button (hidden when printing) */}
      <div className="no-print mt-8 text-center">
        <button
          onClick={() => window.print()}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Print Estimate
        </button>
      </div>
    </div>
  );
}

