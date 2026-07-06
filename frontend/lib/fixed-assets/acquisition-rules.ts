/** Pure helpers for asset acquisition UI / tests */

export type AcquisitionDoc = {
    acquisition_document_kind?: string | null;
};

export function hasInvoiceOrReceiptAttachment(docs: AcquisitionDoc[]): boolean {
    return docs.some(
        (d) =>
            d.acquisition_document_kind === "invoice" ||
            d.acquisition_document_kind === "receipt",
    );
}

export function canSubmitAcquisitionDraft(status: string): boolean {
    return status === "draft";
}

export function canApproveOrRejectAcquisition(status: string): boolean {
    return status === "pending_approval";
}

export function canReceiveAcquisition(status: string, docs: AcquisitionDoc[]): boolean {
    return status === "approved" && hasInvoiceOrReceiptAttachment(docs);
}

/** Invoice/receipt uploads live only on the acquisition workflow (not on legacy fixed-asset screens). */
export function canUploadAcquisitionInvoiceReceipt(status: string): boolean {
    return status === "approved" || status === "received";
}
