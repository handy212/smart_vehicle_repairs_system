/** Shared Accounts Payable flow helpers. */

export const PO_BILL_CONVERT_STATUSES = ["partially_received", "received"] as const;

export type PoBillConvertStatus = (typeof PO_BILL_CONVERT_STATUSES)[number];

export function canConvertPoToBill(status: string): boolean {
  return (PO_BILL_CONVERT_STATUSES as readonly string[]).includes(status);
}

export function payBillsHref(vendorId: number, billId?: number): string {
  const params = new URLSearchParams({ vendor: String(vendorId) });
  if (billId != null) {
    params.set("bill", String(billId));
  }
  return `/billing/pay-bills?${params.toString()}`;
}
