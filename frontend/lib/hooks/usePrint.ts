import { useState } from 'react';
import { isAxiosError } from 'axios';
import apiClient from '@/lib/api/client';

interface PrintOptions {
    documentType: 'invoice' | 'estimate' | 'work_order' | 'job_card' | 'inspection' | 'purchase_order' | 'receipt' | 'gate_pass' | 'credit_note' | 'bill';
    documentId: number;
    documentNumber: string;
}

type PrintableDocumentType = PrintOptions['documentType'];

/** HTML print preview — preferred layout for Print. */
const PRINT_HTML_ENDPOINTS: Partial<Record<PrintableDocumentType, (id: number) => string>> = {
    invoice: (id) => `/billing/invoices/${id}/print/`,
    estimate: (id) => `/billing/estimates/${id}/print/`,
    work_order: (id) => `/workorders/work-orders/${id}/print/`,
    job_card: (id) => `/workorders/work-orders/${id}/job-card/print/`,
    inspection: (id) => `/inspections/inspections/${id}/print/`,
    receipt: (id) => `/billing/payments/${id}/print/`,
    gate_pass: (id) => `/gatepass/gate-passes/${id}/print/`,
    credit_note: (id) => `/billing/credit-notes/${id}/print/`,
    purchase_order: (id) => `/inventory/purchase-orders/${id}/print/`,
};

/** PDF download endpoints. */
const PDF_ENDPOINTS: Record<PrintableDocumentType, (id: number) => string> = {
    invoice: (id) => `/billing/invoices/${id}/pdf/`,
    estimate: (id) => `/billing/estimates/${id}/pdf/`,
    work_order: (id) => `/workorders/work-orders/${id}/pdf/`,
    job_card: (id) => `/workorders/work-orders/${id}/job-card/pdf/`,
    inspection: (id) => `/inspections/inspections/${id}/pdf/`,
    purchase_order: (id) => `/inventory/purchase-orders/${id}/pdf/`,
    receipt: (id) => `/billing/payments/${id}/pdf/`,
    gate_pass: (id) => `/gatepass/gate-passes/${id}/pdf/`,
    credit_note: (id) => `/billing/credit-notes/${id}/pdf/`,
    bill: (id) => `/billing/bills/${id}/pdf/`,
};

function resolveError(err: unknown, fallback: string): string {
    if (isAxiosError(err) && err.response) {
        const data = err.response.data;
        if (data instanceof Blob) {
            return fallback;
        }
        if (typeof data === 'string' && data.trim()) {
            return data.trim();
        }
        if (data && typeof data === 'object') {
            const body = data as { error?: string; detail?: string };
            return body.error || body.detail || err.message || fallback;
        }
        return err.message || fallback;
    }
    if (err instanceof Error) {
        return err.message;
    }
    return fallback;
}

async function blobErrorMessage(data: Blob, fallback: string): Promise<string> {
    try {
        const text = await data.text();
        const parsed = JSON.parse(text) as { error?: string; detail?: string };
        return parsed.error || parsed.detail || fallback;
    } catch {
        return fallback;
    }
}

async function fetchDocumentPdf(documentType: PrintableDocumentType, documentId: number): Promise<Blob> {
    const endpoint = PDF_ENDPOINTS[documentType];
    if (!endpoint) {
        throw new Error(`PDF is not supported for ${documentType}`);
    }
    const response = await apiClient.get<Blob>(endpoint(documentId), {
        responseType: 'blob',
    });
    const blob = response.data;
    if (!(blob instanceof Blob)) {
        throw new Error('Invalid PDF response');
    }
    if (blob.type && blob.type.includes('json')) {
        throw new Error(await blobErrorMessage(blob, 'Failed to load PDF'));
    }
    return blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
}

export function usePrint() {
    const [isDownloading, setIsDownloading] = useState(false);
    const [isOpeningPrint, setIsOpeningPrint] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const printWindow = () => {
        window.print();
    };

    /**
     * Opens the HTML print preview (same templates as PDF, browser layout).
     * Prefer this over PDF-for-print — WeasyPrint can look denser / different.
     */
    const openPrintWindow = async ({ documentType, documentId }: Omit<PrintOptions, 'documentNumber'>) => {
        const endpoint = PRINT_HTML_ENDPOINTS[documentType];
        if (!endpoint) {
            console.warn(`openPrintWindow: ${documentType} has no HTML print route, falling back to PDF`);
            setIsOpeningPrint(true);
            setError(null);
            try {
                const blob = await fetchDocumentPdf(documentType, documentId);
                const url = URL.createObjectURL(blob);
                const win = window.open(url, '_blank');
                if (!win) {
                    URL.revokeObjectURL(url);
                    throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
                }
                window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            } catch (err) {
                const msg =
                    isAxiosError(err) && err.response?.data instanceof Blob
                        ? await blobErrorMessage(err.response.data, 'Failed to open print view')
                        : resolveError(err, 'Failed to open print view');
                setError(msg);
                throw new Error(msg);
            } finally {
                setIsOpeningPrint(false);
            }
            return;
        }

        setIsOpeningPrint(true);
        setError(null);

        try {
            const response = await apiClient.get<string>(endpoint(documentId), {
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
            const msg = resolveError(err, 'Failed to open print view');
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
            const blob = await fetchDocumentPdf(documentType, documentId);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${documentType}_${documentNumber}.pdf`;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            const msg =
                isAxiosError(err) && err.response?.data instanceof Blob
                    ? await blobErrorMessage(err.response.data, 'Failed to download PDF')
                    : resolveError(err, 'Failed to download PDF');
            setError(msg);
            throw new Error(msg);
        } finally {
            setIsDownloading(false);
        }
    };

    return { printWindow, downloadPDF, openPrintWindow, isDownloading, isOpeningPrint, error };
}
