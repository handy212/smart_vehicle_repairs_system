"use client";

import { useQuery } from "@tanstack/react-query";
import { gatepassApi } from "@/lib/api/gatepass";
import { Button } from "@/components/ui/button";
import { FileText, Plus, ExternalLink } from "lucide-react";
import Link from "next/link";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { usePermissions } from "@/lib/hooks/usePermissions";

export function GatePassBanner({ workOrderId }: { workOrderId: number }) {
  const { hasPermission } = usePermissions();
  const canViewGatePass = hasPermission("view_gatepass");

  const { data: gatePass, isLoading } = useQuery({
    queryKey: ["gatepass", "workorder", workOrderId],
    queryFn: () => gatepassApi.getByWorkOrder(workOrderId),
    enabled: !!workOrderId && canViewGatePass,
  });

  if (!canViewGatePass || isLoading) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Gate pass</p>
          <p className="truncate text-xs text-muted-foreground">
            {gatePass
              ? `${gatePass.gate_pass_number} · ${gatePass.status?.replace(/_/g, " ")}`
              : "No gate pass created yet"}
          </p>
        </div>
      </div>
      <div className="shrink-0">
        {gatePass ? (
          <Link href={`/gatepass/${gatePass.id}`}>
            <Button size="sm" variant="outline" className="h-8 text-xs">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              View
            </Button>
          </Link>
        ) : (
          <PermissionGuard permission="create_gatepass">
            <Link href={`/gatepass/new?work_order=${workOrderId}`}>
              <Button size="sm" className="h-8 text-xs">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create
              </Button>
            </Link>
          </PermissionGuard>
        )}
      </div>
    </div>
  );
}
