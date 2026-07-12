"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export type ApprovalTermsPayload = {
  document_type?: string;
  terms_key?: string;
  terms_text?: string;
  requires_acceptance?: boolean;
};

type TermsAcceptanceBlockProps = {
  terms?: ApprovalTermsPayload | null;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  /** Staff recording verbal/phone acceptance on behalf of customer */
  staffMode?: boolean;
  id?: string;
};

export function TermsAcceptanceBlock({
  terms,
  accepted,
  onAcceptedChange,
  staffMode = false,
  id = "accepted_terms",
}: TermsAcceptanceBlockProps) {
  const text = (terms?.terms_text || "").trim();

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
      <div>
        <Label className="text-sm font-medium text-foreground">Terms &amp; Conditions</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          {staffMode
            ? "Customer must acknowledge these terms before approval is recorded."
            : "Please read and accept these terms to continue."}
        </p>
      </div>
      <div className="max-h-40 overflow-y-auto rounded border border-border bg-background p-3 text-xs whitespace-pre-wrap text-foreground">
        {text || "No terms text is configured yet. Ask an admin to set Business → Terms & Conditions."}
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id={id}
          checked={accepted}
          onCheckedChange={(value) => onAcceptedChange(value === true)}
        />
        <Label htmlFor={id} className="text-sm font-normal leading-snug cursor-pointer">
          {staffMode
            ? "I confirm the customer has been informed of and accepts these Terms & Conditions."
            : "I have read and agree to the Terms & Conditions."}
        </Label>
      </div>
    </div>
  );
}
