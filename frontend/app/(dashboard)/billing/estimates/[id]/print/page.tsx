"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
import { format } from "date-fns";
import { useEffect } from "react";

export default function EstimatePrintPage() {
  const params = useParams();
  const estimateId = parseInt(params.id as string);

  const { data: estimate, isLoading } = useQuery({
    queryKey: ["estimate", estimateId],
    queryFn: () => billingApi.estimates.get(estimateId),
  });

  useEffect(() => {
    if (!isLoading && estimate) {
      window.print();
    }
  }, [isLoading, estimate]);

  if (isLoading || !estimate) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Use customer_name and other fields from estimate directly
  const customerName = estimate.customer_name || 'Customer';
  const customerEmail = estimate.customer_email;
  const customerPhone = estimate.customer_phone;

  const subtotal = parseFloat(estimate.subtotal || '0');
  const taxAmount = parseFloat(estimate.tax_amount || '0');
  const discountAmount = parseFloat(estimate.discount_amount || '0');
  const total = parseFloat(estimate.total || '0');

  return (
    <div className="print-container p-8 max-w-4xl mx-auto bg-white">
      <style jsx global>{`
        @media print {
          @page {
            margin: 1cm;
          }
          body {
            background: white;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            box-shadow: none;
          }
          /* Hide dashboard layout elements */
          nav,
          aside,
          header,
          [class*="Navbar"],
          [class*="Sidebar"],
          [class*="SubNav"],
          nav[class*="fixed"],
          aside[class*="fixed"] {
            display: none !important;
            visibility: hidden !important;
          }
          /* Reset main content margin for print */
          main {
            margin-left: 0 !important;
            padding-top: 0 !important;
            padding: 0 !important;
          }
          /* Hide any other dashboard elements */
          [class*="dashboard-layout"],
          [class*="dashboardLayout"],
          div[class*="min-h-screen"] > nav,
          div[class*="min-h-screen"] > aside {
            display: none !important;
            visibility: hidden !important;
          }
          /* Ensure print container is full width */
          .print-container {
            max-width: 100% !important;
            margin: 0 auto !important;
          }
        }
        @media screen {
          .print-container {
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
        }
      `}</style>

      {/* Header */}
      <div className="mb-8 border-b-2 border-gray-800 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">ESTIMATE</h1>
            <p className="text-lg text-gray-600 mt-1">#{estimate.estimate_number}</p>
          </div>
          <div className="text-right">
            {estimate.created_at && (
              <p className="text-sm text-gray-600">Date: {format(new Date(estimate.created_at), 'MMM dd, yyyy')}</p>
            )}
            {estimate.valid_until && (
              <p className="text-sm text-gray-600">Expires: {format(new Date(estimate.valid_until), 'MMM dd, yyyy')}</p>
            )}
            <p className="text-sm text-gray-600 mt-1">
              Status: <span className="font-semibold uppercase">{estimate.status}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Customer & Vehicle Info */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">CUSTOMER INFORMATION</h2>
          <div className="text-sm space-y-1">
            <p className="font-semibold">{customerName}</p>
            {customerEmail && <p>{customerEmail}</p>}
            {customerPhone && <p>{customerPhone}</p>}
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">VEHICLE INFORMATION</h2>
          <div className="text-sm space-y-1">
            {estimate.vehicle_display && (
              <p className="font-semibold">{estimate.vehicle_display}</p>
            )}
            {estimate.vehicle_vin && <p>VIN: {estimate.vehicle_vin}</p>}
          </div>
        </div>
      </div>

      {/* Description */}
      {estimate.description && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">DESCRIPTION</h2>
          <p className="text-sm whitespace-pre-wrap">{estimate.description}</p>
        </div>
      )}

      {/* Line Items */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">ESTIMATED ITEMS</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">Description</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Quantity</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Unit Price</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {estimate.line_items && estimate.line_items.length > 0 ? (
              estimate.line_items.map((item, index) => {
                const quantity = parseFloat(String(item.quantity || '1'));
                const unitPrice = parseFloat(String(item.unit_price || '0'));
                const lineTotal = quantity * unitPrice;
                return (
                  <tr key={index}>
                    <td className="border border-gray-300 px-3 py-2">
                      {item.description}
                      {item.part_number && <span className="text-gray-500 text-xs block">Part #: {item.part_number}</span>}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{quantity}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">${unitPrice.toFixed(2)}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">${lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="border border-gray-300 px-3 py-2 text-center text-gray-500">
                  No line items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="mb-8">
        <div className="flex justify-end">
          <div className="w-64">
            <table className="w-full text-sm border-collapse">
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-3 py-2 text-right font-semibold">Subtotal:</td>
                  <td className="border border-gray-300 px-3 py-2 text-right">${subtotal.toFixed(2)}</td>
                </tr>
                {discountAmount > 0 && (
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 text-right font-semibold">Discount:</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">-${discountAmount.toFixed(2)}</td>
                  </tr>
                )}
                {taxAmount > 0 && (
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 text-right font-semibold">Tax:</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">${taxAmount.toFixed(2)}</td>
                  </tr>
                )}
                <tr className="bg-gray-100">
                  <td className="border border-gray-300 px-3 py-2 text-right font-bold text-lg">ESTIMATED TOTAL:</td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-bold text-lg">${total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Notes */}
      {estimate.customer_notes && (
        <div className="mb-8">
          <p className="font-semibold mb-1">Notes:</p>
          <p className="text-sm whitespace-pre-wrap">{estimate.customer_notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-4 border-t border-gray-300 text-xs text-gray-600 text-center">
        <p className="font-semibold mb-2">This is an estimate, not a final invoice.</p>
        <p>Prices and availability are subject to change. This estimate is valid until {estimate.valid_until ? format(new Date(estimate.valid_until), 'MMM dd, yyyy') : 'further notice'}.</p>
        <p className="mt-2">Please retain this estimate for your records.</p>
      </div>
    </div>
  );
}

