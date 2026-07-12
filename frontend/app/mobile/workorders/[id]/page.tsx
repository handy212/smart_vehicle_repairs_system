"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { workordersApi, WorkOrder } from "@/lib/api/workorders";
import { workOrderTasksApi, ServiceTask } from "@/lib/api/workorder-tasks";
import { workOrderPartsApi, WorkOrderPart } from "@/lib/api/workorder-parts";
import { workOrderNotesApi } from "@/lib/api/workorder-notes";
import { useOfflineStore } from "@/store/offlineStore";
import { workOrdersDB } from "@/lib/offline/db";
import { queueRequest } from "@/lib/offline/queue";
import { useToast } from "@/lib/hooks/useToast";
import apiClient from "@/lib/api/client";
import { getUserFacingError } from "@/lib/api/apiErrors";
import { timeLogsApi } from "@/lib/api/timeLogs";
import {
  ArrowLeft,
  Clock,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CheckCircle,
  CheckCircle2,
  Circle,
  AlertCircle,
  Play,
  Pause,
  CheckCheck,
  User,
  Car,
  FileText,
  Package,
  AlertTriangle,
  X,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { adminApi } from "@/lib/api/admin";
import {
  getWorkOrderListBillingDisplay,
  parseWorkOrderMoney,
  resolveWorkOrderInvoiceAmount,
} from "@/lib/workorders/workOrderBillingDisplay";
import { MobileWorkOrderSections } from "@/components/mobile/workorder/MobileWorkOrderSections";
import { getWorkOrderCustomerDisplayName } from "@/lib/utils/customer-display";
import { isDiagnosisPausedWorkOrder } from "@/lib/utils/workorder-inspection-stage";

export default function MobileWorkOrderDetailPage() {
  const { formatCurrency } = useCurrency();
  const { hasPermission } = usePermissions();
  const canPerformQualityCheck = hasPermission("perform_quality_check");
  const params = useParams();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();
  const workOrderId = parseInt(params.id as string);
  const { isOnline } = useOfflineStore();
  const { toast } = useToast();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [tasks, setTasks] = useState<ServiceTask[]>([]);
  const [parts, setParts] = useState<WorkOrderPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdditionalWorkDialog, setShowAdditionalWorkDialog] = useState(false);
  const [additionalWorkNotes, setAdditionalWorkNotes] = useState("");
  // * eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const [activeLog, setActiveLog] = useState<any | null>(null);
  const [showPartRequestDialog, setShowPartRequestDialog] = useState(false);
  const [showRequestQcDialog, setShowRequestQcDialog] = useState(false);
  const [qcInspectorId, setQcInspectorId] = useState("");
  const [qualityInspectors, setQualityInspectors] = useState<
    { id: number; first_name?: string; last_name?: string; username?: string }[]
  >([]);
  const [newPart, setNewPart] = useState({
    part_name: "",
    quantity: 1,
    description: "",
  });

  useEffect(() => {
    loadWorkOrder();
    checkActiveLog();
  }, [workOrderId]);

  useEffect(() => {
    if (!showRequestQcDialog || !isOnline) return;
    const branchId =
      typeof workOrder?.branch === "object" ? workOrder?.branch?.id : workOrder?.branch;
    adminApi.users
      .qualityInspectors(branchId ? { branch: Number(branchId) } : undefined)
      .then(setQualityInspectors)
      .catch(() => setQualityInspectors([]));
  }, [showRequestQcDialog, isOnline, workOrder?.branch]);

  const checkActiveLog = async () => {
    try {
      if (isOnline) {
        const response = await apiClient.get("/workorders/time-logs/active/");
        setActiveLog(response.data);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      setActiveLog(null);
    }
  };

  const loadWorkOrder = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const [wo, tasksData, partsData] = await Promise.all([
          workordersApi.get(workOrderId),
          workOrderTasksApi.list({ work_order: workOrderId }),
          workOrderPartsApi.list({ work_order: workOrderId }),
        ]);
        setWorkOrder(wo);
        setTasks(tasksData);
        setParts(partsData);

        // Cache work order
        await workOrdersDB.set(wo.id, wo, true);
      } else {
        // Load from cache
        const cached = await workOrdersDB.get(workOrderId);
        if (cached) {
          setWorkOrder(cached);
        }
      }
    } catch (error) {
      console.error("Failed to load work order:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChangeAction = async (
    action: "startWork" | "pause" | "resume" | "requestQualityCheck" | "complete",
    options?: { assigned_to?: number }
  ) => {
    if (!workOrder) return;

    const diagnosisPaused = isDiagnosisPausedWorkOrder(workOrder);

    try {
      if (isOnline) {
        if (action === "startWork") await workordersApi.startWork(workOrder.id);
        else if (action === "pause") await workordersApi.pause(workOrder.id);
        else if (action === "resume") await workordersApi.resume(workOrder.id);
        else if (action === "requestQualityCheck") {
          if (!options?.assigned_to) {
            toast({
              title: "Inspector required",
              description: "Assign an authorized quality inspector first.",
              variant: "destructive",
            });
            return;
          }
          await workordersApi.requestQualityCheck(workOrder.id, {
            assigned_to: options.assigned_to,
          });
          setShowRequestQcDialog(false);
          setQcInspectorId("");
        } else if (action === "complete") await workordersApi.complete(workOrder.id);

        await loadWorkOrder();
        toast({
          title: "Success",
          description:
            action === "resume" && diagnosisPaused
              ? "Diagnosis resumed."
              : "Status updated successfully",
        });
      } else {
        if (action === "requestQualityCheck" && !options?.assigned_to) {
          toast({
            title: "Inspector required",
            description: "Assign an authorized quality inspector before queuing QC.",
            variant: "destructive",
          });
          return;
        }
        const pathMap: Record<string, string> = {
          startWork: "start_work",
          pause: "pause",
          resume: "resume",
          requestQualityCheck: "request_quality_check",
          complete: "complete",
        };

        const offlineStatusMap: Record<string, string> = {
          startWork: "in_progress",
          pause: "paused",
          resume: diagnosisPaused ? "diagnosis" : "in_progress",
          requestQualityCheck: "quality_check",
          complete: "completed",
        };

        const newStatus = offlineStatusMap[action] ?? workOrder.status;
        const updated = { ...workOrder, status: newStatus };
        await workOrdersDB.set(workOrder.id, updated, false);
        await queueRequest(
          "create",
          `/workorders/work-orders/${workOrder.id}/${pathMap[action]}/`,
          "POST",
          action === "requestQualityCheck" ? { assigned_to: options?.assigned_to } : {}
        );

        setWorkOrder(updated);
        setShowRequestQcDialog(false);
        setQcInspectorId("");
        toast({
          title: "Queued",
          description: "Status change will sync when online",
        });
      }
    } catch (error: any) {
      console.error(`Failed to update status via ${action}:`, error);
      const errorMessage = getUserFacingError(error, "Failed to update status");
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handlePartRequest = async () => {
    if (!workOrder) return;
    setLoading(true);
    try {
      const partData = {
        work_order: workOrder.id,
        ...newPart,

        status: 'pending' as any,
      };

      if (isOnline) {
        await workOrderPartsApi.create(partData);
        await loadWorkOrder();
        setShowPartRequestDialog(false);
        setNewPart({ part_name: "", quantity: 1, description: "" });
        toast({ title: "Success", description: "Part requested successfully" });
      } else {
        await queueRequest("create", "/workorders/parts/", "POST", partData);

        setParts([...parts, { id: Date.now(), ...partData } as any]);
        setShowPartRequestDialog(false);
        setNewPart({ part_name: "", quantity: 1, description: "" });
        toast({ title: "Queued", description: "Part request will sync when online" });
      }
    } catch (error) {
      console.error("Failed to request part:", error);
      toast({ title: "Error", description: "Failed to request part", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async () => {
    if (!workOrder) return;
    setLoading(true);
    try {
      if (isOnline) {
        const log = await timeLogsApi.clockIn(
          workOrder.id,
          "Started work via Mobile detail"
        );
        setActiveLog(log);
        toast({ title: "Clocked In", description: `Started time for WO #${workOrder.work_order_number}` });
      }
    } catch (error) {
      console.error("Failed to clock in:", error);
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to clock in"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeLog) return;
    setLoading(true);
    try {
      const clockOut = new Date().toISOString();
      if (isOnline && activeLog.id) {
        await timeLogsApi.clockOut(activeLog.id, clockOut);
      }
      setActiveLog(null);
      toast({ title: "Clocked Out", description: "Time log saved" });
    } catch (error) {
      console.error("Failed to clock out:", error);
      toast({ title: "Error", description: "Failed to clock out", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAdditionalWork = async () => {
    if (!workOrder) return;

    try {
      if (isOnline) {
        await workordersApi.flagAdditionalWork(workOrder.id, {
          reason: additionalWorkNotes.trim() || undefined,
        });
        await loadWorkOrder();
        setShowAdditionalWorkDialog(false);
        setAdditionalWorkNotes("");
        toast({
          title: "Success",
          description: "Additional work flagged - customer approval required",
        });
      } else {
        const updated = { ...workOrder, status: "additional_work_found" };
        await workOrdersDB.set(workOrder.id, updated, false);
        await queueRequest(
          "create",
          `/workorders/work-orders/${workOrder.id}/flag_additional_work/`,
          "POST",
          { reason: additionalWorkNotes.trim() || undefined }
        );
        setWorkOrder(updated);
        setShowAdditionalWorkDialog(false);
        setAdditionalWorkNotes("");
        toast({
          title: "Queued",
          description: "Additional work will be flagged when online",
        });
      }

    } catch (error: any) {
      console.error("Failed to flag additional work:", error);
      const errorMessage = getUserFacingError(error, "Failed to flag additional work");
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleTaskAction = async (task: ServiceTask) => {
    if (task.status === "completed") return;

    try {
      if (isOnline) {
        if (task.status === "in_progress") {
          await workOrderTasksApi.complete(task.id);
          toast({ title: "Task completed", description: task.description });
        } else {
          await workOrderTasksApi.start(task.id);
          toast({ title: "Task started", description: task.description });
        }
        await loadWorkOrder();
      } else {
        const newStatus = task.status === "in_progress" ? "completed" : "in_progress";
        const updatedTasks = tasks.map((t) =>
          t.id === task.id ? { ...t, status: newStatus } : t
        );
        setTasks(updatedTasks);
        const endpoint =
          newStatus === "in_progress"
            ? `/workorders/tasks/${task.id}/start/`
            : `/workorders/tasks/${task.id}/complete/`;
        await queueRequest("update", endpoint, "POST", {});
      }
    } catch (error: unknown) {
      console.error("Failed to update task:", error);
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to update task"),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="p-4 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Work order not found</p>
        <Link href="/mobile/workorders">
          <Button className="mt-4">Back to Work Orders</Button>
        </Link>
      </div>
    );
  }

  const canStart = workOrder.status === "approved";
  const canPause = workOrder.status === "in_progress";
  const canRequestQC = workOrder.status === "in_progress";
  const canComplete =
    workOrder.status === "quality_check" &&
    canPerformQualityCheck &&
    !workOrder.quality_check_required;
  const canResume = workOrder.status === "paused";
  const isDiagnosisPaused = isDiagnosisPausedWorkOrder(workOrder);
  const canOpenDiagnosis =
    workOrder.status === "diagnosis" || isDiagnosisPaused;
  const canFlagAdditionalWork = workOrder.status === "in_progress" && !isDiagnosisPaused;

  const getPartStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-muted text-foreground",
      pending: "bg-yellow-100 text-yellow-700",
      ordered: "bg-orange-100 text-primary",
      ready: "bg-green-100 text-green-700",
      received: "bg-green-100 text-green-700",
      installed: "bg-green-100 text-green-700",
      returned: "bg-red-100 text-red-700",
    };
    return colors[status] || "bg-muted text-foreground";
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/mobile/workorders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        {!isOnline && (
          <Badge variant="outline" className="bg-orange-50 text-primary border-orange-200">
            Offline
          </Badge>
        )}
      </div>

      {/* Work Order Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {workOrder.work_order_number || `WO #${workOrder.id}`}
            </CardTitle>
            <Badge
              className={cn(
                "text-xs",
                workOrder.status === "in_progress" &&
                "bg-orange-100 text-primary dark:bg-orange-900 dark:text-orange-300",
                workOrder.status === "assigned" &&
                "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
                workOrder.status === "approved" &&
                "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                workOrder.status === "completed" &&
                "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                workOrder.status === "paused" &&
                "bg-orange-100 text-primary dark:bg-orange-900 dark:text-orange-300"
              )}
            >
              {workOrder.status?.replace("_", " ").toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <User className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">
                {getWorkOrderCustomerDisplayName(workOrder)}
              </div>
              {workOrder.primary_technician_name && (
                <div className="text-xs text-muted-foreground">
                  Tech: {workOrder.primary_technician_name}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Car className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="text-sm text-card-foreground">
              {workOrder.vehicle_display || workOrder.vehicle_info || "Vehicle"}
            </div>
          </div>

          {workOrder.customer_concerns && (
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-sm text-card-foreground">
                {workOrder.customer_concerns}
              </div>
            </div>
          )}

          {(() => {
            const billing = getWorkOrderListBillingDisplay(workOrder, {
              audience: "staff",
              formatDue: formatCurrency,
            });
            const invoiceAmount = resolveWorkOrderInvoiceAmount(workOrder);
            const estimated = parseWorkOrderMoney(workOrder.estimated_total);
            if (!billing && estimated <= 0) return null;
            return (
              <div className="pt-2 border-t border-border space-y-2">
                {billing && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Invoice Total</span>
                    <div className="text-right">
                      <span className="font-semibold text-foreground">
                        {formatCurrency(billing.amount)}
                      </span>
                      {billing.statusLine && (
                        <span className="block text-[10px] text-muted-foreground capitalize">
                          {billing.statusLine}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {!invoiceAmount && estimated > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Estimated (shop)</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(estimated)}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Quick Link to Photos */}
          <div className="pt-3 border-t border-border">
            <Link href={`/mobile/workorders/${workOrderId}/photos`}>
              <Button variant="outline" size="sm" className="w-full">
                <Package className="h-4 w-4 mr-2" />
                View/Add Photos
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Time Tracking */}
          {activeLog && activeLog.work_order === workOrderId ? (
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleClockOut}
              disabled={loading}
            >
              <Clock className="h-4 w-4 mr-2" />
              Clock Out
            </Button>
          ) : activeLog ? (
            <Button
              variant="outline"
              className="w-full border-primary text-primary"
              onClick={async () => {
                await handleClockOut();
                await handleClockIn();
              }}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Switch to this Work Order
            </Button>
          ) : (
            <Button
              className="w-full bg-primary"
              onClick={handleClockIn}
              disabled={loading}
            >
              <Clock className="h-4 w-4 mr-2" />
              Clock In
            </Button>
          )}

          {canOpenDiagnosis && (
            <Button className="w-full" variant="outline" asChild>
              <Link href={`/mobile/workorders/${workOrderId}/diagnosis`}>
                <FileText className="h-4 w-4 mr-2" />
                {isDiagnosisPaused ? "Resume in Diagnosis" : "Open Diagnosis"}
              </Link>
            </Button>
          )}

          {canStart && (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => handleStatusChangeAction("startWork")}
            >
              <Play className="h-4 w-4 mr-2" />
              Start Repairs
            </Button>
          )}

          {canResume && (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => handleStatusChangeAction("resume")}
            >
              <Play className="h-4 w-4 mr-2" />
              {isDiagnosisPaused ? "Resume Diagnosis" : "Resume Work"}
            </Button>
          )}

          {canPause && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleStatusChangeAction("pause")}
            >
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}

          {canRequestQC && (
            <Button
              className="w-full"
              onClick={() => setShowRequestQcDialog(true)}
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Request Quality Check
            </Button>
          )}

          {canComplete && (
            <Button
              className="w-full bg-success hover:bg-green-700"
              onClick={() => handleStatusChangeAction("complete")}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark Complete
            </Button>
          )}

          {canFlagAdditionalWork && (
            <Button
              variant="outline"
              className="w-full border-orange-300 text-primary hover:bg-orange-50"
              onClick={() => setShowAdditionalWorkDialog(true)}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Flag Additional Work
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Parts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Parts Required ({parts.length})</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs font-normal"
              onClick={() => setShowPartRequestDialog(true)}
            >
              <Package className="h-4 w-4 mr-1" />
              Request Part
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {parts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No parts requested</p>
          ) : (
            parts.map((part) => (
              <div
                key={part.id}
                className="p-3 rounded-lg border border-border bg-card"
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {part.part_name}
                    </div>
                    {part.part_number && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        #{part.part_number}
                      </div>
                    )}
                  </div>
                  <Badge className={cn("text-xs ml-2", getPartStatusColor(part.status))}>
                    {part.status?.replace("_", " ").toUpperCase() || 'UNKNOWN'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-muted-foreground">Qty: {part.quantity}</span>
                  {part.total_cost && (
                    <span className="font-medium text-foreground">
                      ${part.total_cost}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Tasks ({tasks.length})</span>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No tasks assigned yet
            </p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "p-3 rounded-lg border transition-colors",
                  task.status === "completed"
                    ? "bg-success/10 border-green-200 dark:bg-green-950 dark:border-green-800"
                    : "bg-card border-border bg-background border-border",
                  task.status !== "completed" && "cursor-pointer hover:bg-muted"
                )}
                onClick={() => task.status !== "completed" && handleTaskAction(task)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {task.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : task.status === "in_progress" ? (
                      <Play className="h-5 w-5 text-primary" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-sm font-medium",
                        task.status === "completed"
                          ? "line-through text-muted-foreground"
                          : "text-foreground"
                      )}
                    >
                      {task.description}
                    </div>
                    {task.detailed_notes && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {task.detailed_notes}
                      </div>
                    )}
                    {task.estimated_hours && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Est. {task.estimated_hours}h
                      </div>
                    )}
                    {task.status !== "completed" && (
                      <p className="text-xs text-primary mt-1">
                        Tap to {task.status === "in_progress" ? "complete" : "start"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Offline Warning */}
      {!isOnline && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
          <CardContent className="pt-4 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-orange-900 dark:text-orange-200">
                Offline Mode
              </div>
              <div className="text-xs text-primary dark:text-orange-300 mt-1">
                Changes will sync automatically when you're back online.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Additional Work Dialog */}
      <Dialog
        open={showRequestQcDialog}
        onOpenChange={(open) => {
          setShowRequestQcDialog(open);
          if (!open) setQcInspectorId("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign quality inspector</DialogTitle>
            <DialogDescription>
              QC must be done by authorized personnel, not the repairing technician.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="mobile-qc-inspector">Quality inspector</Label>
            <Select value={qcInspectorId} onValueChange={setQcInspectorId}>
              <SelectTrigger id="mobile-qc-inspector">
                <SelectValue placeholder="Select inspector…" />
              </SelectTrigger>
              <SelectContent>
                {qualityInspectors.map((inspector) => {
                  const name =
                    [inspector.first_name, inspector.last_name].filter(Boolean).join(" ") ||
                    inspector.username ||
                    `User #${inspector.id}`;
                  return (
                    <SelectItem key={inspector.id} value={String(inspector.id)}>
                      {name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestQcDialog(false)}>
              Cancel
            </Button>
            <Button
              disabled={!qcInspectorId}
              onClick={() =>
                handleStatusChangeAction("requestQualityCheck", {
                  assigned_to: Number(qcInspectorId),
                })
              }
            >
              Request QC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdditionalWorkDialog} onOpenChange={setShowAdditionalWorkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag Additional Work</DialogTitle>
            <DialogDescription>
              Document additional issues found during repairs. This will require customer approval before proceeding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="additional-work-notes">What additional work is needed?</Label>
              <Textarea
                id="additional-work-notes"
                placeholder="Describe the additional issues discovered..."
                value={additionalWorkNotes}
                onChange={(e) => setAdditionalWorkNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAdditionalWorkDialog(false);
                setAdditionalWorkNotes("");
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleAdditionalWork}
              className="bg-primary hover:bg-orange-700"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Flag for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Part Request Dialog */}
      <Dialog open={showPartRequestDialog} onOpenChange={setShowPartRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request New Part</DialogTitle>
            <DialogDescription>
              Submit a request for a part that is not currently listed for this work order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="part-name">Part Name</Label>
              <input
                id="part-name"
                className="w-full p-2 border rounded-md"
                placeholder="e.g. Oil Filter"
                value={newPart.part_name}
                onChange={(e) => setNewPart({ ...newPart, part_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="part-qty">Quantity</Label>
              <input
                id="part-qty"
                type="number"
                className="w-full p-2 border rounded-md"
                value={newPart.quantity}
                onChange={(e) => setNewPart({ ...newPart, quantity: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="part-desc">Description/Notes</Label>
              <Textarea
                id="part-desc"
                placeholder="Specific brand, model or other details..."
                value={newPart.description}
                onChange={(e) => setNewPart({ ...newPart, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPartRequestDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handlePartRequest} disabled={!newPart.part_name}>
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {workOrder && (
        <MobileWorkOrderSections workOrder={workOrder} workOrderId={workOrderId} />
      )}
    </div>
  );
}
