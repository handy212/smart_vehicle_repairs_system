"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Edit,
  FileText,
  Printer,
  AlertCircle,
  AlertTriangle,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { PremiumIcons } from "@/components/ui/icons";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import WorkflowActions from "./WorkflowActions";
import { getStatusVariant, getStatusLabel } from "@/lib/utils/workorder-status";

interface WorkOrderCommandBarProps {
  workOrder: {
    id: number;
    work_order_number: string;
    status: string;
    priority?: string;
    customer_name?: string;
    vehicle_info?: string;
    branch_name?: string;
  };
  workOrderId: number;
  statusLabelOverride?: string;
  statusForVariant?: string;
  onStatusChange?: () => void;
  onStartRepairs?: () => void;
  onShowRecommendations?: () => void;
  showRecommendationsAction?: boolean;
  canPrintRecommendations?: boolean;
  onPrintWorkOrder: () => void;
  onPrintJobCard?: () => void;
  onSendJobCardWhatsApp?: () => void;
  onDownloadPdf: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  isDeleting?: boolean;
  onPrintRecommendations?: () => void;
  isOpeningPrint?: boolean;
  isDownloading?: boolean;
}

export function WorkOrderCommandBar({
  workOrder,
  workOrderId,
  statusLabelOverride,
  statusForVariant,
  onStatusChange,
  onStartRepairs,
  onShowRecommendations,
  showRecommendationsAction,
  canPrintRecommendations,
  onPrintWorkOrder,
  onPrintJobCard,
  onSendJobCardWhatsApp,
  onDownloadPdf,
  onDelete,
  canDelete,
  isDeleting,
  onPrintRecommendations,
  isOpeningPrint,
  isDownloading,
}: WorkOrderCommandBarProps) {
  const router = useRouter();

  const subtitle = [
    workOrder.customer_name || "Customer / Business",
    workOrder.vehicle_info || "Vehicle",
    workOrder.branch_name,
  ]
    .filter(Boolean)
    .join(" · ");
  const canEditWorkOrder = workOrder.status !== "closed";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => router.push("/workorders")}
            aria-label="Back to work orders"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Work Orders</span>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-base font-bold tracking-tight text-foreground sm:text-lg">
                #{workOrder.work_order_number}
              </h1>
              <Badge variant={getStatusVariant(statusForVariant || workOrder.status) as "default"} className="text-[10px]">
                {statusLabelOverride || getStatusLabel(workOrder.status)}
              </Badge>
              {workOrder.priority && workOrder.priority !== "normal" && (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {workOrder.priority}
                </Badge>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {canEditWorkOrder && (
            <PermissionGuard permission="edit_workorders">
              <Button variant="outline" size="sm" className="h-8" asChild>
                <Link href={`/workorders/${workOrderId}/edit`}>
                  <Edit className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Link>
              </Button>
            </PermissionGuard>
          )}

          {showRecommendationsAction && onShowRecommendations && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
              onClick={onShowRecommendations}
            >
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
              Recommendations
            </Button>
          )}

          <WorkflowActions
            workOrderId={workOrderId}
            status={workOrder.status}
            workOrder={workOrder}
            onStatusChange={onStatusChange}
            onStartRepairs={onStartRepairs}
            inline
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {onPrintJobCard && (
                <DropdownMenuItem onClick={onPrintJobCard}>
                  <Printer className="mr-2 h-4 w-4" />
                  {isOpeningPrint ? "Opening…" : "Print Job Card"}
                </DropdownMenuItem>
              )}
              {onSendJobCardWhatsApp && (
                <DropdownMenuItem onClick={onSendJobCardWhatsApp}>
                  <PremiumIcons.MessageSquare className="mr-2 h-4 w-4" />
                  Via WhatsApp
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onPrintWorkOrder}>
                <Printer className="mr-2 h-4 w-4" />
                {isOpeningPrint ? "Opening…" : "Print Workorder"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDownloadPdf}>
                <FileText className="mr-2 h-4 w-4" />
                {isDownloading ? "Downloading…" : "Download PDF"}
              </DropdownMenuItem>
              {canPrintRecommendations && onPrintRecommendations && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onPrintRecommendations}>
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Print recommendations
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push(`/chat?work_order_id=${workOrderId}`)}>
                <PremiumIcons.MessageSquare className="mr-2 h-4 w-4" />
                Chat
              </DropdownMenuItem>
              {canDelete && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={onDelete}
                    disabled={isDeleting}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? "Deleting..." : "Delete order"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
    </div>
  );
}
