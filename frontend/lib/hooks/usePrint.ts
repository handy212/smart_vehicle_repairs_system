import { useState } from 'react';
import { useBranchStore } from '@/store/branchStore';
import { getAccessToken } from '@/lib/utils/token';

interface PrintOptions {
    documentType: 'invoice' | 'estimate' | 'work_order' | 'inspection' | 'purchase_order' | 'receipt' | 'gate_pass' | 'credit_note';
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

    const readErrorMessage = async (response: Response) => {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const errData = await response.json().catch(() => null);
            return errData?.error || errData?.detail || `Failed to load print view (${response.status})`;
        }

        const text = await response.text().catch(() => '');
        return text.trim() || `Failed to load print view (${response.status})`;
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
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
            const url = `${baseUrl}${endpoint}`;

            const token = getAccessToken();
            const branchId = useBranchStore.getState().activeBranchId;

            const response = await fetch(url, {
                headers: {
                    ...(token && { Authorization: `Bearer ${token}` }),
                    ...(branchId && { 'X-Branch-ID': branchId.toString() }),
                },
            });

            if (!response.ok) {
                throw new Error(await readErrorMessage(response));
            }

            const html = await response.text();
            const win = window.open('', '_blank');
            if (win) {
                win.document.write(html);
                win.document.close();
            } else {
                throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to open print view';
            setError(msg);
            throw err;
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
                default:
                    // Fallback to billing for legacy/unknown types
                    endpoint = `/billing/${documentType}s/${documentId}/pdf/`;
            }

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}${endpoint}`,
                {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                        'X-Branch-ID': useBranchStore.getState().activeBranchId?.toString() || '',
                    },
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || 'Failed to generate PDF');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${documentType}_${documentNumber}.pdf`;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to download PDF';
            setError(errorMessage);
            throw err;
        } finally {
            setIsDownloading(false);
        }
    };

    return { printWindow, downloadPDF, openPrintWindow, isDownloading, isOpeningPrint, error };
}
