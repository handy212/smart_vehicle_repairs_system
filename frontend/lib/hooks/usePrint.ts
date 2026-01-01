import { useState } from 'react';
import apiClient from '@/lib/api/client';
import { useBranchStore } from '@/store/branchStore';

interface PrintOptions {
    documentType: 'invoice' | 'estimate' | 'work_order' | 'inspection' | 'purchase_order' | 'receipt';
    documentId: number;
    documentNumber: string;
}

export function usePrint() {
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const printWindow = () => {
        window.print();
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

    return { printWindow, downloadPDF, isDownloading, error };
}
