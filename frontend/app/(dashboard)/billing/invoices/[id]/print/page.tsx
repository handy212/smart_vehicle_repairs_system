"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
import { format } from "date-fns";
import { useEffect } from "react";

export default function InvoicePrintPage() {
  const params = useParams();
  const invoiceId = parseInt(params.id as string);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => billingApi.invoices.get(invoiceId),
  });

  const { data: payments } = useQuery({
    queryKey: ["payments", invoiceId],
    queryFn: () => billingApi.payments.list({ invoice: invoiceId }),
    enabled: !!invoice,
  });

  useEffect(() => {
    if (!isLoading && invoice) {
      window.print();
    }
  }, [isLoading, invoice]);

  if (isLoading || !invoice) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Use customer_name from invoice directly
  const customerName = invoice.customer_name || 'Customer';
  const workOrder = typeof invoice.work_order === 'object' ? invoice.work_order : null;

  const subtotal = parseFloat(invoice.subtotal || '0');
  const taxAmount = parseFloat(invoice.tax_amount || '0');
  const discountAmount = parseFloat(invoice.discount_amount || '0');
  const total = parseFloat(invoice.total || '0');
  const amountPaid = parseFloat(invoice.amount_paid || '0');
  const amountDue = parseFloat(invoice.balance_due || '0');

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
            <h1 className="text-3xl font-bold text-gray-900">INVOICE</h1>
            <p className="text-lg text-gray-600 mt-1">#{invoice.invoice_number}</p>
          </div>
          <div className="text-right">
            {invoice.invoice_date && (
              <p className="text-sm text-gray-600">Date: {format(new Date(invoice.invoice_date), 'MMM dd, yyyy')}</p>
            )}
            {invoice.due_date && (
              <p className="text-sm text-gray-600">Due: {format(new Date(invoice.due_date), 'MMM dd, yyyy')}</p>
            )}
            <p className="text-sm text-gray-600 mt-1">
              Status: <span className="font-semibold uppercase">{invoice.status}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Customer Info */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">BILL TO</h2>
          <div className="text-sm space-y-1">
            <p className="font-semibold">{customerName}</p>
          </div>
      </div>

      {/* Work Order Reference */}
      {invoice.work_order && (
        <div className="mb-8">
          <p className="text-sm">
            <span className="font-semibold">Work Order:</span> #{typeof invoice.work_order === 'object' ? invoice.work_order.id : invoice.work_order}
          </p>
        </div>
      )}

      {/* Line Items */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">ITEMS</h2>
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
            {invoice.line_items && invoice.line_items.length > 0 ? (
              invoice.line_items.map((item, index) => {
                const quantity = parseFloat(String(item.quantity || '1'));
                const unitPrice = parseFloat(String(item.unit_price || '0'));
                const lineTotal = quantity * unitPrice;
                return (
                  <tr key={index}>
                    <td className="border border-gray-300 px-3 py-2">
                      {item.description}
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
                  <td className="border border-gray-300 px-3 py-2 text-right font-bold text-lg">TOTAL:</td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-bold text-lg">${total.toFixed(2)}</td>
                </tr>
                {amountPaid > 0 && (
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 text-right font-semibold">Amount Paid:</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">${amountPaid.toFixed(2)}</td>
                  </tr>
                )}
                {amountDue > 0 && (
                  <tr className="bg-yellow-50">
                    <td className="border border-gray-300 px-3 py-2 text-right font-bold">Amount Due:</td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-bold">${amountDue.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Payment History */}
      {payments && payments.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">PAYMENT HISTORY</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 text-left">Date</th>
                <th className="border border-gray-300 px-3 py-2 text-left">Method</th>
                <th className="border border-gray-300 px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="border border-gray-300 px-3 py-2">
                    {format(new Date(payment.payment_date), 'MMM dd, yyyy')}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 capitalize">{payment.payment_method.replace('_', ' ')}</td>
                  <td className="border border-gray-300 px-3 py-2 text-right">${parseFloat(payment.amount || '0').toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {(invoice.notes || invoice.payment_terms) && (
        <div className="mb-8">
          {invoice.notes && (
            <div className="mb-4">
              <p className="font-semibold mb-1">Notes:</p>
              <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
          {invoice.payment_terms && (
            <div>
              <p className="font-semibold mb-1">Payment Terms:</p>
              <p className="text-sm whitespace-pre-wrap">{invoice.payment_terms}</p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-4 border-t border-gray-300 text-xs text-gray-600 text-center">
        <p>Thank you for your business!</p>
        <p className="mt-2">This is a computer-generated invoice. Please retain for your records.</p>
      </div>
    </div>
  );
}

