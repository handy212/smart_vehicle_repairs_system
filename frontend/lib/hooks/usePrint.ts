import { useState } from 'react';
import { isAxiosError } from 'axios';
import apiClient from '@/lib/api/client';

interface PrintOptions {
    documentType: 'invoice' | 'estimate' | 'work_order' | 'inspection' | 'purchase_order' | 'receipt' | 'gate_pass' | 'credit_note' | 'bill';
    documentId: number;
    documentNumber: string;
}

export function usePrint() {
    const [isDownloading, setIsDownloading] = useState(false);
    const [isOpeningPrint, setIsOpeningPrint] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const printWindow = () => {
        window.print();
    };

    /**
     * Opens the unified print view (Django templates, same layout as PDF) in a new window.
     * Fetches HTML with auth token and writes to new window - user can print from there.
     */
    const openPrintWindow = async ({ documentType, documentId }: Omit<PrintOptions, 'documentNumber'>) => {
        const endpoints: Record<string, string> = {
            invoice: `/billing/invoices/${documentId}/print/`,
            estimate: `/billing/estimates/${documentId}/print/`,
            work_order: `/workorders/work-orders/${documentId}/print/`,
            inspection: `/inspections/inspections/${documentId}/print/`,
            receipt: `/billing/payments/${documentId}/print/`,
            gate_pass: `/gatepass/gate-passes/${documentId}/print/`,
            credit_note: `/billing/credit-notes/${documentId}/print/`,
            purchase_order: `/inventory/purchase-orders/${documentId}/print/`,
        };
        const endpoint = endpoints[documentType];
        if (!endpoint) {
            console.warn(`openPrintWindow: ${documentType} not supported, falling back to window.print`);
            window.print();
            return;
        }

        setIsOpeningPrint(true);
        setError(null);

        try {
            const response = await apiClient.get<string>(endpoint, {
                responseType: 'text',
                headers: { Accept: 'text/html' },
            });

            const html = response.data;
            const win = window.open('', '_blank');
            if (win) {
                win.document.write(html);
                win.document.close();
            } else {
                throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
            }
        } catch (err) {
            let msg = 'Failed to open print view';
            if (isAxiosError(err) && err.response) {
                const data = err.response.data;
                if (typeof data === 'string' && data.trim()) {
                    msg = data.trim();
                } else if (data && typeof data === 'object') {
                    const body = data as { error?: string; detail?: string };
                    msg = body.error || body.detail || msg;
                } else {
                    msg = err.message || msg;
                }
            } else if (err instanceof Error) {
                msg = err.message;
            }
            setError(msg);
            throw new Error(msg);
        } finally {
            setIsOpeningPrint(false);
        }
    };

    const downloadPDF = async ({ documentType, documentId, documentNumber }: PrintOptions) => {
        setIsDownloading(true);
        setError(null);

        try {
            let endpoint = '';

            switch (documentType) {
                case 'invoice':
                    endpoint = `/billing/invoices/${documentId}/pdf/`;
                    break;
                case 'estimate':
                    endpoint = `/billing/estimates/${documentId}/pdf/`;
                    break;
                case 'work_order':
                    endpoint = `/workorders/work-orders/${documentId}/pdf/`;
                    break;
                case 'inspection':
                    endpoint = `/inspections/inspections/${documentId}/pdf/`;
                    break;
                case 'purchase_order':
                    endpoint = `/inventory/purchase-orders/${documentId}/pdf/`;
                    break;
                case 'receipt':
                    endpoint = `/billing/payments/${documentId}/pdf/`;
                    break;
                case 'bill':
                    endpoint = `/billing/bills/${documentId}/pdf/`;
                    break;
                default:
                    // Fallback to billing for legacy/unknown types
                    endpoint = `/billing/${documentType}s/${documentId}/pdf/`;
            }

            const response = await apiClient.get<Blob>(endpoint, {
                responseType: 'blob',
            });

            const blob = response.data;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${documentType}_${documentNumber}.pdf`;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            let errorMessage = 'Failed to download PDF';
            if (isAxiosError(err) && err.response) {
                const data = err.response.data;
                if (data instanceof Blob) {
                    try {
                        const text = await data.text();
                        const parsed = JSON.parse(text) as { error?: string; detail?: string };
                        errorMessage = parsed.error || parsed.detail || errorMessage;
                    } catch {
                        errorMessage = err.message || errorMessage;
                    }
                } else if (data && typeof data === 'object') {
                    const body = data as { error?: string; detail?: string };
                    errorMessage = body.error || body.detail || err.message || errorMessage;
                } else {
                    errorMessage = err.message || errorMessage;
                }
            } else if (err instanceof Error) {
                errorMessage = err.message;
            }
            setError(errorMessage);
            throw new Error(errorMessage);
        } finally {
            setIsDownloading(false);
        }
    };

    return { printWindow, downloadPDF, openPrintWindow, isDownloading, isOpeningPrint, error };
}
