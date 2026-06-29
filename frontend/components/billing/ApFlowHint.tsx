"use client";

import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type ApFlowHintProps = {
  variant: "po-qbo" | "bill-from-po" | "bill-standalone" | "po-receive-first";
};

const COPY: Record<ApFlowHintProps["variant"], { title: string; body: string }> = {
  "po-qbo": {
    title: "QuickBooks sync",
    body: "Purchase orders sync to QuickBooks after the supplier is confirmed (not while in draft or approval).",
  },
  "bill-from-po": {
    title: "Bill from purchase order",
    body: "This bill is linked to a PO — it will be created as Open and skips bill approval. It syncs to QuickBooks as a Bill linked to the PO.",
  },
  "bill-standalone": {
    title: "Standalone vendor bill",
    body: "Saved as Draft. On the bill detail page, choose Submit for approval → an approver opens the bill → then Pay Bills once status is Open.",
  },
  "po-receive-first": {
    title: "Receive before billing",
    body: "Receive goods on this PO first, then use Convert to Bill. Partial receipts can be billed for quantities received so far.",
  },
};

export function ApFlowHint({ variant }: ApFlowHintProps) {
  const { title, body } = COPY[variant];

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex gap-3 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-muted-foreground">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}
