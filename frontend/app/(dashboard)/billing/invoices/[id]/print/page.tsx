"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
import { format } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePrint } from "@/lib/hooks/usePrint";
import { PrintLayout } from "@/components/print/PrintLayout";
import { PrintControls } from "@/components/print/PrintControls";

export default function InvoicePrintPage() {
  const { formatCurrency } = useCurrency();
  const params = useParams();
  const invoiceId = parseInt(params.id as string);
  const { downloadPDF, isDownloading } = usePrint();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => billingApi.invoices.get(invoiceId),
  });

  const { data: payments } = useQuery({
    queryKey: ["payments", invoiceId],
    queryFn: () => billingApi.payments.list({ invoice: invoiceId }),
    enabled: !!invoice,
  });

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    await downloadPDF({
      documentType: 'invoice',
      documentId: invoiceId,
      documentNumber: invoice.invoice_number
    });
  };

  if (isLoading || !invoice) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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

  // Determine watermark based on status
  const getWatermark = () => {
    if (invoice.status === 'paid') return 'PAID';
    if (invoice.status === 'void' || invoice.status === 'cancelled') return 'VOID';
    if (invoice.status === 'draft') return 'DRAFT';
    if (amountDue > 0) return 'UNPAID';
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PrintControls
        onDownloadPDF={handleDownloadPDF}
        isLoading={isDownloading}
      />

      <PrintLayout
        watermark={getWatermark()}
        documentType="INVOICE"
        documentNumber={invoice.invoice_number}
        metaInfo={
          <div className="text-right">
            {invoice.invoice_date && (
              <div className="mb-1"><span className="font-bold text-gray-700">Date:</span> {format(new Date(invoice.invoice_date), 'MMM dd, yyyy')}</div>
            )}
            {invoice.due_date && (
              <div className="mb-1"><span className="font-bold text-gray-700">Due:</span> {format(new Date(invoice.due_date), 'MMM dd, yyyy')}</div>
            )}
            <div className="mb-1">
              <span className="font-bold text-gray-700">Status:</span> <span className={`uppercase font-semibold ${invoice.status === 'overdue' ? 'text-red-600' :
                  invoice.status === 'paid' ? 'text-green-600' : ''
                }`}>{invoice.status}</span>
            </div>
          </div>
        }
      >

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
                        {item.item_type === 'labor' && item.labor_rate ? `${formatCurrency(unitPrice)}/hr` : `${formatCurrency(unitPrice)}`}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency(lineTotal)}</td>
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
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(subtotal)}</td>
              </tr>
              {discountAmount > 0 && (
                <>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '5px' }}>
                      Discount ({invoice.discount_percentage ? parseFloat(invoice.discount_percentage).toFixed(1) : 0}%)
                      {invoice.discount_reason && <><br /><small>{invoice.discount_reason}</small></>}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>-{formatCurrency(discountAmount)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '5px' }}>Subtotal after Discount</td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency((subtotal - discountAmount))}</td>
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
                      <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency(parseFloat(invoice.tax_nhil_amount))}</td>
                    </tr>
                  )}
                  {invoice.tax_getfund_amount && parseFloat(invoice.tax_getfund_amount) > 0 && (
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '5px' }}>GETFund (2.5%)</td>
                      <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency(parseFloat(invoice.tax_getfund_amount))}</td>
                    </tr>
                  )}
                  {invoice.tax_hrl_amount && parseFloat(invoice.tax_hrl_amount) > 0 && (
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '5px' }}>COVID-19 HRL (1%)</td>
                      <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency(parseFloat(invoice.tax_hrl_amount))}</td>
                    </tr>
                  )}
                  {invoice.tax_vat_amount && parseFloat(invoice.tax_vat_amount) > 0 && (
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '5px' }}>VAT (15%)</td>
                      <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency(parseFloat(invoice.tax_vat_amount))}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Total Tax</td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(taxAmount)}</td>
                  </tr>
                </>
              ) : taxAmount > 0 && (
                <tr>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>Tax</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency(taxAmount)}</td>
                </tr>
              )}
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold', fontSize: '14px' }}>TOTAL AMOUNT</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>{formatCurrency(total)}</td>
              </tr>
              {amountPaid > 0 && (
                <tr>
                  <td style={{ border: '1px solid #000', padding: '5px' }}>Amount Paid</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency(amountPaid)}</td>
                </tr>
              )}
              {amountDue > 0 && (
                <tr style={{ backgroundColor: '#fffacd' }}>
                  <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>BALANCE DUE</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(amountDue)}</td>
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
                      {formatCurrency(parseFloat(payment.amount || '0'))}
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

      </PrintLayout>
    </div>
  );
}
