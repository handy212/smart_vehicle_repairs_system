"use client";

import { Badge } from "@/components/ui/badge";

type Props = {
  name?: string | null;
  ownerAccountCode?: string | null;
  code?: string | null;
  className?: string;
};

export function RevenueProductBadge({ name, ownerAccountCode, code, className }: Props) {
  if (!name && !ownerAccountCode && !code) {
    return (
      <Badge variant="secondary" className={`text-[10px] h-5 ${className ?? ""}`}>
        Unclassified
      </Badge>
    );
  }

  const label = name || code || "Income category";
  const acct = ownerAccountCode ? ` · ${ownerAccountCode}` : "";

  return (
    <Badge variant="outline" className={`text-[10px] h-5 font-normal ${className ?? ""}`} title={code ?? undefined}>
      {label}
      {acct}
    </Badge>
  );
}
