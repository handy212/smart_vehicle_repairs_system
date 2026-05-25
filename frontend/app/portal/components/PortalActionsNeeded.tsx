"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar,
  ClipboardCheck,
  CreditCard,
  FileText,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { portalApi, type PortalActionNeeded } from "@/lib/api/portal";
import { toast } from "sonner";

const ACTION_ICONS: Record<PortalActionNeeded["type"], typeof FileText> = {
  approve_estimate: FileText,
  pay_invoice: CreditCard,
  confirm_appointment: Calendar,
  approve_work_order: Wrench,
  approve_inspection: ClipboardCheck,
};

interface PortalActionsNeededProps {
  actions: PortalActionNeeded[];
  className?: string;
}

export function PortalActionsNeeded({ actions, className }: PortalActionsNeededProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();

  const approveMutation = useMutation({
    mutationFn: (id: number) => portalApi.approveEstimate(id, { notes: "Approved from portal home" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "estimates"] });
      toast.success("Estimate approved");
    },
    onError: () => {
      toast.error("Could not approve estimate. Open the estimate to review details.");
    },
  });

  if (!actions.length) return null;

  const handlePrimary = (action: PortalActionNeeded) => {
    if (action.type === "approve_estimate") {
      approveMutation.mutate(action.id);
      return;
    }
    router.push(action.href);
  };

  return (
    <section className={cn("space-y-2", className)} aria-labelledby="portal-actions-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="portal-actions-heading" className="text-xs font-bold text-muted-foreground uppercase tracking-[0.1em]">
          Actions needed
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
          <AlertCircle className="h-3 w-3" aria-hidden />
          {actions.length}
        </span>
      </div>
      <div className="space-y-2">
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action.type];
          const isApproving =
            action.type === "approve_estimate" &&
            approveMutation.isPending &&
            approveMutation.variables === action.id;

          return (
            <Card key={`${action.type}-${action.id}`} className="border-warning/30 bg-warning/5">
              <CardContent className="p-3 sm:p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{action.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{action.subtitle}</p>
                    {action.amount != null && action.amount > 0 && (
                      <p className="text-xs font-medium text-foreground mt-1">{formatCurrency(action.amount)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    className="h-9 min-h-[44px] sm:min-h-0"
                    onClick={() => handlePrimary(action)}
                    disabled={isApproving}
                  >
                    {isApproving ? "Approving…" : action.action_label}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-9 min-h-[44px] sm:min-h-0" asChild>
                    <Link href={action.href}>Details</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
