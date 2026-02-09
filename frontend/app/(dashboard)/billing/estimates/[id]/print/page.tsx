"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
import { format } from "date-fns";
import { useEffect } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePrint } from "@/lib/hooks/usePrint";
import { PrintLayout } from "@/components/print/PrintLayout";
import { PrintControls } from "@/components/print/PrintControls";

export default function EstimatePrintPage() {
  const { formatCurrency } = useCurrency();
  const params = useParams();
  const estimateId = parseInt(params.id as string);
  const { downloadPDF, isDownloading } = usePrint();

  // Validate estimateId to prevent NaN API calls
  const isValidId = !isNaN(estimateId) && estimateId > 0;

  const { data: estimate, isLoading } = useQuery({
    queryKey: ["estimate", estimateId],
    queryFn: () => billingApi.estimates.get(estimateId),
    enabled: isValidId,
  });

  const handleDownloadPDF = async () => {
    if (!estimate) return;
    await downloadPDF({
      documentType: 'estimate',
      documentId: estimateId,
      documentNumber: estimate.estimate_number
    });
  };

  if (!isValidId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-8">
        <div className="text-red-600 text-lg font-semibold">Invalid Estimate ID</div>
        <p className="text-muted-foreground mt-2">The estimate ID in the URL is invalid.</p>
      </div>
    );
  }

  if (isLoading || !estimate) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const customerName = estimate.customer_name || 'Customer';
  const subtotal = parseFloat(estimate.subtotal || '0');
  const taxAmount = parseFloat(estimate.tax_amount || '0');
  const discountAmount = parseFloat(estimate.discount_amount || '0');
  const total = parseFloat(estimate.total || '0');

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
        onDownloadPDF={handleDownloadPDF}
        isLoading={isDownloading}
      />

      <PrintLayout
        watermark={getWatermark()}
        documentType="ESTIMATE"
        documentNumber={estimate.estimate_number}
        metaInfo={
          <div className="text-right">
            {estimate.estimate_date && (
              <div className="mb-1"><span className="font-bold text-foreground">Date:</span> {format(new Date(estimate.estimate_date), 'MMM dd, yyyy')}</div>
            )}
            {estimate.valid_until && (
              <div className="mb-1"><span className="font-bold text-foreground">Valid Until:</span> {format(new Date(estimate.valid_until), 'MMM dd, yyyy')}</div>
            )}
            <div className="mb-1">
              <span className="font-bold text-foreground">Status:</span> <span className={`uppercase font-semibold ${estimate.status === 'approved' ? 'text-success' :
                  estimate.status === 'declined' ? 'text-red-600' : ''
                }`}>{estimate.status}</span>
            </div>
          </div>
        }
      >

        {/* Customer Info */}
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>BILL TO</h2>
          <div style={{ fontSize: '12px' }}>
            <p style={{ fontWeight: '600', margin: '2px 0' }}>{customerName}</p>
            {estimate.customer_email && <p style={{ margin: '2px 0' }}>Email: {estimate.customer_email}</p>}
            {estimate.customer_phone && <p style={{ margin: '2px 0' }}>Phone: {estimate.customer_phone}</p>}
            {estimate.customer_address && <p style={{ margin: '2px 0' }}>{estimate.customer_address}</p>}
          </div>
        </div>

        {/* Vehicle Info */}
        {estimate.vehicle && (
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>VEHICLE</h2>
            <div style={{ fontSize: '12px' }}>
              {estimate.vehicle_display && <p style={{ margin: '2px 0', fontWeight: '600' }}>{estimate.vehicle_display}</p>}
              {estimate.vehicle_vin && <p style={{ margin: '2px 0' }}>VIN: {estimate.vehicle_vin}</p>}
            </div>
          </div>
        )}

        {/* Description */}
        {estimate.description && (
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px' }}>SERVICE DESCRIPTION</h2>
            <p style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{estimate.description}</p>
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
              {estimate.line_items && estimate.line_items.length > 0 ? (
                estimate.line_items.map((item, index) => {
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
                      Discount ({estimate.discount_percentage ? parseFloat(estimate.discount_percentage).toFixed(1) : 0}%)
                      {estimate.discount_reason && <><br /><small>{estimate.discount_reason}</small></>}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>-{formatCurrency(discountAmount)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '5px' }}>Subtotal after Discount</td>
                    <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency((subtotal - discountAmount))}</td>
                  </tr>
                </>
              )}
              {(estimate.tax_nhil_amount || estimate.tax_getfund_amount || estimate.tax_hrl_amount || estimate.tax_vat_amount) ? (
                <>
                  <tr>
                    <td colSpan={2} style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>Tax Breakdown:</td>
                  </tr>
                  {estimate.tax_nhil_amount && parseFloat(estimate.tax_nhil_amount) > 0 && (
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '5px' }}>NHIL (2.5%)</td>
                      <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency(parseFloat(estimate.tax_nhil_amount))}</td>
                    </tr>
                  )}
                  {estimate.tax_getfund_amount && parseFloat(estimate.tax_getfund_amount) > 0 && (
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '5px' }}>GETFund (2.5%)</td>
                      <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency(parseFloat(estimate.tax_getfund_amount))}</td>
                    </tr>
                  )}
                  {estimate.tax_hrl_amount && parseFloat(estimate.tax_hrl_amount) > 0 && (
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '5px' }}>COVID-19 HRL (1%)</td>
                      <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency(parseFloat(estimate.tax_hrl_amount))}</td>
                    </tr>
                  )}
                  {estimate.tax_vat_amount && parseFloat(estimate.tax_vat_amount) > 0 && (
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '5px' }}>VAT (15%)</td>
                      <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{formatCurrency(parseFloat(estimate.tax_vat_amount))}</td>
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
                <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold', fontSize: '14px' }}>ESTIMATED TOTAL</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>{formatCurrency(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes */}
        {estimate.customer_notes && (
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Notes:</p>
            <p style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{estimate.customer_notes}</p>
          </div>
        )}

        <div style={{ marginTop: '30px', paddingTop: '10px', borderTop: '1px solid #ccc', fontSize: '10px', textAlign: 'center', color: '#666' }}>
          <p style={{ margin: '5px 0', fontWeight: '600' }}>This is an estimate, not a final invoice.</p>
          <p style={{ margin: '5px 0' }}>Prices and availability are subject to change. This estimate is valid until {estimate.valid_until ? format(new Date(estimate.valid_until), 'MMMM dd, yyyy') : 'further notice'}.</p>
          <p style={{ margin: '5px 0' }}>Please retain this estimate for your records.</p>
        </div>
      </PrintLayout>
    </div>
  );
}
