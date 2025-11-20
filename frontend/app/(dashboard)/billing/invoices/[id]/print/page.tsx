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
    <>
      <style jsx global>{`
        @media print {
          @page {
            margin: 1cm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            font-family: Arial, sans-serif !important;
            font-size: 12px !important;
          }
          .no-print {
            display: none !important;
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
          /* Print container styles */
          .print-container {
            max-width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            box-shadow: none !important;
            background: white !important;
          }
          /* Table styles */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin: 10px 0 !important;
            font-size: 12px !important;
          }
          th, td {
            border: 1px solid #000 !important;
            padding: 5px !important;
            text-align: left !important;
          }
          th {
            background-color: #f0f0f0 !important;
            font-weight: bold !important;
          }
          .text-right {
            text-align: right !important;
          }
          .text-center {
            text-align: center !important;
          }
          .font-bold {
            font-weight: bold !important;
          }
          .font-semibold {
            font-weight: 600 !important;
          }
        }
        @media screen {
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            font-size: 12px;
          }
          .print-container {
            max-width: 4xl;
            margin: 0 auto;
            padding: 2rem;
            background: white;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
          }
          th, td {
            border: 1px solid #000;
            padding: 5px;
            text-align: left;
          }
          th {
            background-color: #f0f0f0;
            font-weight: bold;
          }
          .text-right {
            text-align: right;
          }
          .text-center {
            text-align: center;
          }
        }
      `}</style>
      <div className="print-container">

      {/* Header */}
      <div style={{ marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>INVOICE</h1>
            <p style={{ fontSize: '14px', marginTop: '5px', margin: 0 }}>#{invoice.invoice_number}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            {invoice.invoice_date && (
              <p style={{ fontSize: '12px', margin: '2px 0' }}>Date: {format(new Date(invoice.invoice_date), 'MMM dd, yyyy')}</p>
            )}
            {invoice.due_date && (
              <p style={{ fontSize: '12px', margin: '2px 0' }}>Due: {format(new Date(invoice.due_date), 'MMM dd, yyyy')}</p>
            )}
            <p style={{ fontSize: '12px', margin: '2px 0' }}>
              Status: <span style={{ fontWeight: '600', textTransform: 'uppercase' }}>{invoice.status}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Customer Info */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>BILL TO</h2>
        <div style={{ fontSize: '12px' }}>
          <p style={{ fontWeight: '600', margin: '2px 0' }}>{customerName}</p>
          {invoice.customer_email && <p style={{ margin: '2px 0' }}>Email: {invoice.customer_email}</p>}
          {invoice.customer_phone && <p style={{ margin: '2px 0' }}>Phone: {invoice.customer_phone}</p>}
          {invoice.customer_address && <p style={{ margin: '2px 0' }}>{invoice.customer_address}</p>}
        </div>
      </div>

      {/* Vehicle Info */}
      {invoice.vehicle && (
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>VEHICLE</h2>
          <div style={{ fontSize: '12px' }}>
            {invoice.vehicle_display && <p style={{ margin: '2px 0', fontWeight: '600' }}>{invoice.vehicle_display}</p>}
            {invoice.vehicle_vin && <p style={{ margin: '2px 0' }}>VIN: {invoice.vehicle_vin}</p>}
          </div>
        </div>
      )}

      {/* Work Order Reference */}
      {invoice.work_order && (
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '12px' }}>
            <span style={{ fontWeight: '600' }}>Work Order:</span> #{typeof invoice.work_order === 'object' ? invoice.work_order.id : invoice.work_order}
          </p>
        </div>
      )}

      {/* Description */}
      {invoice.description && (
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px' }}>SERVICE DESCRIPTION</h2>
          <p style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{invoice.description}</p>
        </div>
      )}

      {/* Line Items */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>SERVICES & PARTS</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0', fontSize: '12px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left', fontWeight: 'bold' }}>Description</th>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'center', fontWeight: 'bold' }}>Qty</th>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>Unit Price</th>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items && invoice.line_items.length > 0 ? (
              invoice.line_items.map((item, index) => {
                const quantity = item.item_type === 'labor' && item.labor_hours 
                  ? parseFloat(String(item.labor_hours || '1'))
                  : parseFloat(String(item.quantity || '1'));
                const unitPrice = item.item_type === 'labor' && item.labor_rate
                  ? parseFloat(String(item.labor_rate || '0'))
                  : parseFloat(String(item.unit_price || '0'));
                const lineTotal = quantity * unitPrice;
                return (
                  <tr key={index}>
                    <td style={{ border: '1px solid #000', padding: '5px' }}>
                      {item.description}
                      {item.part_number && <><br />Part #: {item.part_number}</>}
                      {item.notes && <><br />{item.notes}</>}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>
                      {item.item_type === 'labor' && item.labor_hours ? `${quantity.toFixed(1)} hrs` : quantity}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>
                      {item.item_type === 'labor' && item.labor_rate ? `$${unitPrice.toFixed(2)}/hr` : `$${unitPrice.toFixed(2)}`}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>${lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>
                  No line items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Financial Summary */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>FINANCIAL SUMMARY</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0', fontSize: '12px' }}>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Subtotal</td>
              <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>${subtotal.toFixed(2)}</td>
            </tr>
            {discountAmount > 0 && (
              <>
                <tr>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>
                    Discount ({invoice.discount_percentage ? parseFloat(invoice.discount_percentage).toFixed(1) : 0}%)
                    {invoice.discount_reason && <><br /><small>{invoice.discount_reason}</small></>}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>-${discountAmount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>Subtotal after Discount</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>${(subtotal - discountAmount).toFixed(2)}</td>
                </tr>
              </>
            )}
            {(invoice.tax_nhil_amount || invoice.tax_getfund_amount || invoice.tax_hrl_amount || invoice.tax_vat_amount) ? (
              <>
                <tr>
                  <td colSpan={2} style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Tax Breakdown:</td>
                </tr>
                {invoice.tax_nhil_amount && parseFloat(invoice.tax_nhil_amount) > 0 && (
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '5px' }}>NHIL (2.5%)</td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>${parseFloat(invoice.tax_nhil_amount).toFixed(2)}</td>
                  </tr>
                )}
                {invoice.tax_getfund_amount && parseFloat(invoice.tax_getfund_amount) > 0 && (
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '5px' }}>GETFund (2.5%)</td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>${parseFloat(invoice.tax_getfund_amount).toFixed(2)}</td>
                  </tr>
                )}
                {invoice.tax_hrl_amount && parseFloat(invoice.tax_hrl_amount) > 0 && (
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '5px' }}>COVID-19 HRL (1%)</td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>${parseFloat(invoice.tax_hrl_amount).toFixed(2)}</td>
                  </tr>
                )}
                {invoice.tax_vat_amount && parseFloat(invoice.tax_vat_amount) > 0 && (
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '5px' }}>VAT (15%)</td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>${parseFloat(invoice.tax_vat_amount).toFixed(2)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Total Tax</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>${taxAmount.toFixed(2)}</td>
                </tr>
              </>
            ) : taxAmount > 0 && (
              <tr>
                <td style={{ border: '1px solid #000', padding: '5px' }}>Tax</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>${taxAmount.toFixed(2)}</td>
              </tr>
            )}
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold', fontSize: '14px' }}>TOTAL AMOUNT</td>
              <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>${total.toFixed(2)}</td>
            </tr>
            {amountPaid > 0 && (
              <tr>
                <td style={{ border: '1px solid #000', padding: '5px' }}>Amount Paid</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>${amountPaid.toFixed(2)}</td>
              </tr>
            )}
            {amountDue > 0 && (
              <tr style={{ backgroundColor: '#fffacd' }}>
                <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>BALANCE DUE</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>${amountDue.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Payment History */}
      {payments && payments.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>PAYMENT HISTORY</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left', fontWeight: 'bold' }}>Date</th>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left', fontWeight: 'bold' }}>Method</th>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>
                    {format(new Date(payment.payment_date), 'MMM dd, yyyy')}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '5px', textTransform: 'capitalize' }}>
                    {payment.payment_method.replace('_', ' ')}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>
                    ${parseFloat(payment.amount || '0').toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {(invoice.notes || invoice.customer_notes || invoice.payment_terms) && (
        <div style={{ marginBottom: '20px' }}>
          {invoice.customer_notes && (
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Notes:</p>
              <p style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{invoice.customer_notes}</p>
            </div>
          )}
          {invoice.payment_terms && (
            <div>
              <p style={{ fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Payment Terms:</p>
              <p style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{invoice.payment_terms}</p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '30px', paddingTop: '10px', borderTop: '1px solid #ccc', fontSize: '10px', textAlign: 'center', color: '#666' }}>
        <p style={{ margin: '5px 0' }}>Thank you for your business!</p>
        <p style={{ margin: '5px 0' }}>This is a computer-generated invoice. Please retain for your records.</p>
        <p style={{ margin: '5px 0' }}>Generated on {format(new Date(), 'MMMM dd, yyyy \'at\' h:mm a')}</p>
      </div>
      </div>
    </>
  );
}

