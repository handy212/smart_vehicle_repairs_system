import { describe, it, expect } from 'vitest';
import {
  canCreateWorkOrderInvoice,
  mustInvoiceViaLinkedEstimate,
} from '@/lib/workorders/invoiceSummaryDisplay';

describe('invoiceSummaryDisplay billing gates', () => {
  it('requires invoice via linked estimate when estimate is approved', () => {
    const workOrder = {
      status: 'completed',
      estimate_summary: { id: 12, status: 'approved' },
      invoice_summary: null,
    };

    expect(mustInvoiceViaLinkedEstimate(workOrder)).toBe(true);
    expect(canCreateWorkOrderInvoice(workOrder)).toBe(false);
  });

  it('allows direct invoice when no billable estimate is linked', () => {
    const workOrder = {
      status: 'completed',
      estimate_summary: null,
      invoice_summary: null,
    };

    expect(mustInvoiceViaLinkedEstimate(workOrder)).toBe(false);
    expect(canCreateWorkOrderInvoice(workOrder)).toBe(true);
  });

  it('allows new invoice after void when estimate was declined', () => {
    const workOrder = {
      status: 'completed',
      estimate_summary: { id: 5, status: 'declined' },
      invoice_summary: { id: 9, status: 'void' },
    };

    expect(mustInvoiceViaLinkedEstimate(workOrder)).toBe(false);
    expect(canCreateWorkOrderInvoice(workOrder)).toBe(true);
  });
});
