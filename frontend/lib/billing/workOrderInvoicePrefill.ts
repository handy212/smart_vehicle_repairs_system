import type { WorkOrder } from "@/lib/api/workorders";
import type { ServiceTask } from "@/lib/api/workorder-tasks";
import type { WorkOrderPart } from "@/lib/api/workorder-parts";

/** Mirrors `WorkOrder.CUSTOMER_DISCONTINUATION_REASON_CHOICES` (apps/workorders/models.py). */
export const CUSTOMER_DISCONTINUATION_REASON_LABELS: Record<string, string> = {
  declined_estimate_or_work: "Customer declined estimate / further work",
  stopped_mid_repair: "Customer stopped work mid-repair",
};

function formatDiscontinuationReason(code: string): string {
  const trimmed = code.trim();
  return CUSTOMER_DISCONTINUATION_REASON_LABELS[trimmed] ?? trimmed.replace(/_/g, " ");
}

/** Safe positive id from work order nested FK or raw id (avoids NaN / bad API shapes). */
export function resolveWorkOrderCustomerId(wo: WorkOrder): number | undefined {
  const c = wo.customer;
  if (c == null) return undefined;
  const raw = typeof c === "object" && c !== null && "id" in c ? (c as { id: unknown }).id : c;
  const num = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : undefined;
}

export function resolveWorkOrderVehicleId(wo: WorkOrder): number | undefined {
  const v = wo.vehicle;
  if (v == null) return undefined;
  const raw = typeof v === "object" && v !== null && "id" in v ? (v as { id: unknown }).id : v;
  const num = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : undefined;
}

/** Radix Select value: never "NaN" or invalid — use "" for empty. */
export function selectNumericFieldString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(Math.trunc(value));
  return "";
}

/** Matches invoice new page line item shape (before is_taxable default). */
export type DraftInvoiceLineItem = {
  item_type: "labor" | "part" | "fee" | "discount" | "sublet" | "other";
  description: string;
  quantity?: number;
  unit_price?: number;
  discount_percentage?: number;
  labor_hours?: number;
  labor_rate?: number;
  is_taxable: boolean;
  part?: number;
  part_number?: string;
  notes?: string;
};

function parseMoney(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Notes shown on the create-invoice form (editable by staff). */
export function buildInvoiceNotesFromWorkOrder(wo: WorkOrder): string {
  const lines: string[] = [`Work order ${wo.work_order_number}`];
  const vd = wo.vehicle_display || wo.vehicle_info;
  if (vd) lines.push(`Vehicle: ${vd}`);
  if (wo.customer_concerns) lines.push(`Customer concern: ${wo.customer_concerns}`);
  if (wo.status === "discontinued_pending_bill") {
    if (wo.customer_discontinuation_reason) {
      lines.push(`Customer discontinued: ${formatDiscontinuationReason(wo.customer_discontinuation_reason)}`);
    }
    if (wo.customer_discontinuation_notes) {
      lines.push(`Discontinuation notes: ${wo.customer_discontinuation_notes}`);
    }
  }
  return lines.join("\n");
}

/**
 * Line items for the form UI; mirrors backend `populate_line_items_from_work_order`
 * so staff see the same billable tasks/parts the API will persist.
 */
export function buildLineItemsFromWorkOrder(
  wo: WorkOrder,
  tasks: ServiceTask[],
  parts: WorkOrderPart[],
): DraftInvoiceLineItem[] {
  const lines: DraftInvoiceLineItem[] = [];
  const woNum = wo.work_order_number;

  if (wo.status === "discontinued_pending_bill") {
    const mechanical = tasks.filter(
      (t) => !t.is_workflow_task && ["completed", "skipped"].includes(t.status),
    );
    for (const t of mechanical) {
      const cost = parseMoney(t.labor_cost as string | number | undefined);
      if (cost <= 0) continue;
      const hoursRaw = t.actual_hours ?? t.calculated_hours ?? t.estimated_hours;
      const hours = typeof hoursRaw === "number" && hoursRaw > 0 ? hoursRaw : undefined;
      const rateFromTask = parseMoney(t.labor_rate as string | number | undefined);
      const desc = `${t.description || "Labor"} — ${woNum} (customer discontinued; billable)`;
      if (hours != null) {
        const product = roundMoney(hours * rateFromTask);
        const effRate =
          rateFromTask > 0 && Math.abs(product - cost) < 0.02 ? rateFromTask : cost / hours;
        lines.push({
          item_type: "labor",
          description: desc,
          labor_hours: hours,
          labor_rate: roundMoney(effRate),
          quantity: 1,
          unit_price: 0,
          discount_percentage: 0,
          is_taxable: true,
        });
      } else {
        lines.push({
          item_type: "labor",
          description: desc,
          quantity: 1,
          unit_price: roundMoney(cost),
          discount_percentage: 0,
          is_taxable: true,
        });
      }
    }
    const installed = parts.filter((p) => p.status === "installed");
    for (const p of installed) {
      const sp = parseMoney(p.selling_price || p.total_cost);
      if (sp <= 0) continue;
      const qty =
        (typeof p.quantity === "number" ? p.quantity : parseMoney(p.quantity as unknown as string)) || 1;
      const unit = qty > 0 ? roundMoney(sp / qty) : roundMoney(sp);
      lines.push({
        item_type: "part",
        description: `${p.part_name} — ${woNum} (installed)`,
        quantity: qty,
        unit_price: unit,
        part: typeof p.inventory_part === "number" ? p.inventory_part : undefined,
        part_number: p.part_number,
        discount_percentage: 0,
        is_taxable: true,
      });
    }
  } else {
    for (const t of tasks) {
      const cost = parseMoney(t.labor_cost as string | number | undefined);
      if (cost <= 0) continue;
      const hoursRaw = t.actual_hours ?? t.calculated_hours ?? t.estimated_hours;
      const hours = typeof hoursRaw === "number" && hoursRaw > 0 ? hoursRaw : undefined;
      const rateFromTask = parseMoney(t.labor_rate as string | number | undefined);
      const desc = `${t.description || "Labor"} — ${woNum}`;
      if (hours != null) {
        const product = roundMoney(hours * rateFromTask);
        const effRate =
          rateFromTask > 0 && Math.abs(product - cost) < 0.02 ? rateFromTask : cost / hours;
        lines.push({
          item_type: "labor",
          description: desc,
          labor_hours: hours,
          labor_rate: roundMoney(effRate),
          quantity: 1,
          unit_price: 0,
          discount_percentage: 0,
          is_taxable: true,
        });
      } else {
        lines.push({
          item_type: "labor",
          description: desc,
          quantity: 1,
          unit_price: roundMoney(cost),
          discount_percentage: 0,
          is_taxable: true,
        });
      }
    }
    const partsTotal = parseMoney(wo.actual_parts_cost);
    if (partsTotal > 0) {
      lines.push({
        item_type: "part",
        description: `Parts & materials — ${woNum}`,
        quantity: 1,
        unit_price: roundMoney(partsTotal),
        discount_percentage: 0,
        is_taxable: true,
      });
    }
  }

  if (lines.length === 0) {
    lines.push({
      item_type: "labor",
      description:
        wo.status === "discontinued_pending_bill"
          ? `Labor / services — ${woNum} (add lines to match completed work)`
          : `Labor / services — ${woNum}`,
      quantity: 1,
      unit_price: 0,
      discount_percentage: 0,
      is_taxable: true,
    });
  }
  return lines;
}
