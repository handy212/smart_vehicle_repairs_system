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
  onStatusChange?: () => void;
  onStartRepairs?: () => void;
  onShowRecommendations?: () => void;
  showRecommendationsAction?: boolean;
  canPrintRecommendations?: boolean;
  onPrintWorkOrder: () => void;
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
  onStatusChange,
  onStartRepairs,
  onShowRecommendations,
  showRecommendationsAction,
  canPrintRecommendations,
  onPrintWorkOrder,
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
    <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => router.back()}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">
                #{workOrder.work_order_number}
              </span>
              <Badge variant={getStatusVariant(workOrder.status) as "default"} className="text-[10px]">
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
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onPrintWorkOrder}>
                <Printer className="mr-2 h-4 w-4" />
                {isOpeningPrint ? "Opening…" : "Print work order"}
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
              {canEditWorkOrder && (
                <PermissionGuard permission="edit_workorders">
                  <DropdownMenuItem asChild>
                    <Link href={`/workorders/${workOrderId}/edit`}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit order
                    </Link>
                  </DropdownMenuItem>
                </PermissionGuard>
              )}
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
    </div>
  );
}
