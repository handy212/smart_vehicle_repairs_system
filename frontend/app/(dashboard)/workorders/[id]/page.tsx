"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { workordersApi } from "@/lib/api/workorders";
import { workOrderTasksApi } from "@/lib/api/workorder-tasks";
import { workOrderPartsApi } from "@/lib/api/workorder-parts";
import { workOrderNotesApi } from "@/lib/api/workorder-notes";
import { diagnosisApi } from "@/lib/api/diagnosis";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Star } from "lucide-react";

const WorkOrderOverviewTab = dynamic(() => import("./components/OverviewTab"));
const WorkOrderTasksTab = dynamic(() => import("./components/TasksTab"));
const WorkOrderPartsTab = dynamic(() => import("./components/PartsTab"));
const WorkOrderNotesTab = dynamic(() => import("./components/NotesTab"));
const PhotosTab = dynamic(() => import("./components/PhotosTab"));
const DocumentsTab = dynamic(() => import("./components/DocumentsTab"));
const DiagnosisTab = dynamic(() => import("./components/DiagnosisTab"));
const WorkOrderTimeline = dynamic(() => import("./components/WorkOrderTimeline"));
import WorkOrderDetailSkeleton from "./components/WorkOrderDetailSkeleton";
import { useRecentItems } from "@/lib/hooks/useRecentItems";
import { usePrint } from "@/lib/hooks/usePrint";
import { useToast } from "@/lib/hooks/useToast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { WorkOrderCommandBar } from "./components/WorkOrderCommandBar";
import { WorkOrderProgress } from "./components/WorkOrderProgress";
import { GatePassBanner } from "./components/GatePassBanner";
import { CheckInInspectionBanner } from "./components/CheckInInspectionBanner";
import { WorkOrderTabsNav } from "./components/WorkOrderTabsNav";
import { UnapprovedRecommendationsDialog } from "./components/UnapprovedRecommendationsDialog";
import { inspectionsApi } from "@/lib/api/inspections";
import { getWorkOrderStagePresentation } from "@/lib/utils/workorder-inspection-stage";
import { getUserFacingError } from "@/lib/api/errors";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";

const VALID_TABS = new Set([
  "overview",
  "tasks",
  "parts",
  "notes",
  "photos",
  "documents",
  "diagnosis",
  "timeline",
]);

export default function WorkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workOrderId = parseInt(params.id as string);
  const requestedTab = searchParams.get("tab");
  const initialTab =
    requestedTab && VALID_TABS.has(requestedTab) ? requestedTab : "overview";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [showUnapprovedRecommendationsDialog, setShowUnapprovedRecommendationsDialog] =
    useState(false);
  const queryClient = useQueryClient();
  const { downloadPDF, openPrintWindow, isDownloading, isOpeningPrint } = usePrint();
  const { addRecentItem } = useRecentItems();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const { data: workOrder, isLoading, error, refetch } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId),
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && workOrderId) {
        queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [workOrderId, queryClient]);

  useEffect(() => {
    if (workOrder) {
      addRecentItem({
        id: workOrder.id,
        name: `WO #${workOrder.work_order_number} - ${workOrder.vehicle_info}`,
        type: "workorder",
        href: `/workorders/${workOrder.id}`,
      });
    }
  }, [workOrder, addRecentItem]);

  useEffect(() => {
    if (requestedTab && VALID_TABS.has(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["workorder-tasks", workOrderId],
    queryFn: () => workOrderTasksApi.list({ work_order: workOrderId }),
    enabled: !!workOrderId,
  });

  const { data: parts = [], isLoading: partsLoading } = useQuery({
    queryKey: ["workorder-parts", workOrderId],
    queryFn: () => workOrderPartsApi.list({ work_order: workOrderId }),
    enabled: !!workOrderId,
  });

  const { data: diagnosis } = useQuery({
    queryKey: ["diagnosis", "workorder", workOrderId],
    queryFn: () => diagnosisApi.getByWorkOrder(workOrderId),
    enabled: !!workOrderId,
  });

  const { data: inspectionsData } = useQuery({
    queryKey: ["inspections", "workorder", workOrderId],
    queryFn: () => inspectionsApi.list({ work_order: workOrderId }),
    enabled: !!workOrderId,
  });

  const unapprovedRecommendations =
    diagnosis?.repair_recommendations?.filter(
      (r) =>
        r.approval_status &&
        ["pending_approval", "deferred"].includes(r.approval_status) &&
        !r.converted_to_task_id
    ) || [];

  const { data: notes = [] } = useQuery({
    queryKey: ["workorder-notes", workOrderId],
    queryFn: () => workOrderNotesApi.list({ work_order: workOrderId }),
    enabled: !!workOrderId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => workordersApi.delete(workOrderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      toast({
        title: "Work Order Deleted",
        description: "The work order was deleted successfully.",
      });
      router.push("/workorders");
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: getUserFacingError(error, "Failed to delete work order"),
        variant: "destructive",
      });
    },
  });

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      params.delete("panel");
      const qs = params.toString();
      router.replace(`/workorders/${workOrderId}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, workOrderId, searchParams]
  );

  if (isLoading) {
    return <WorkOrderDetailSkeleton />;
  }

  if (error || !workOrder) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-destructive">
              {getUserFacingError(error, "Error loading work order. Please try again.")}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
    queryClient.invalidateQueries({ queryKey: ["inspections", "workorder", workOrderId] });
    queryClient.invalidateQueries({ queryKey: ["workorder-tasks", workOrderId] });
    queryClient.invalidateQueries({ queryKey: ["workorder-parts", workOrderId] });
    queryClient.invalidateQueries({ queryKey: ["workorder-notes", workOrderId] });
    queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
  };

  const handlePrintRecommendations = async () => {
    try {
      const blob = await workordersApi.downloadRecommendationsPDF(workOrderId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recommendations_${workOrder.work_order_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Success",
        description: "Recommendations PDF downloaded successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to print recommendations"),
        variant: "destructive",
      });
    }
  };

  const canPrintRecommendations =
    ["completed", "invoiced", "closed"].includes(workOrder.status) &&
    unapprovedRecommendations.length > 0;

  const tabsLocked =
    !workOrder.has_completed_inspection &&
    ["draft", "inspection"].includes(workOrder.status);

  const showRecommendationsAction =
    workOrder.status === "closed" && unapprovedRecommendations.length > 0;
  const canDeleteWorkOrder = hasPermission("delete_workorders");

  const latestInspection = inspectionsData?.results?.[0];
  const stagePresentation = getWorkOrderStagePresentation(workOrder, latestInspection);
  const statusLabelOverride = stagePresentation.label || undefined;

  return (
    <div className="space-y-4">
      <WorkOrderCommandBar
        workOrder={workOrder}
        workOrderId={workOrderId}
        statusLabelOverride={statusLabelOverride}
        statusForVariant={stagePresentation.workflowStatus}
        onStatusChange={refreshData}
        onStartRepairs={() => handleTabChange("tasks")}
        onShowRecommendations={() => setShowUnapprovedRecommendationsDialog(true)}
        showRecommendationsAction={showRecommendationsAction}
        canPrintRecommendations={canPrintRecommendations}
        onPrintWorkOrder={() =>
          openPrintWindow({ documentType: "work_order", documentId: workOrderId })
        }
        onDownloadPdf={() =>
          downloadPDF({
            documentType: "work_order",
            documentId: workOrderId,
            documentNumber: workOrder.work_order_number,
          })
        }
        onDelete={async () => {
          const ok = await confirm({
            title: "Delete work order?",
            description: `Delete "${workOrder.work_order_number}"? This cannot be undone.`,
            confirmLabel: "Delete",
            variant: "destructive",
          });
          if (ok) deleteMutation.mutate();
        }}
        canDelete={canDeleteWorkOrder}
        isDeleting={deleteMutation.isPending}
        onPrintRecommendations={handlePrintRecommendations}
        isOpeningPrint={isOpeningPrint}
        isDownloading={isDownloading}
      />

      <WorkOrderProgress
        status={stagePresentation.workflowStatus}
        labelOverride={statusLabelOverride}
        diagnosisStatus={workOrder.diagnosis_status}
      />

      {(workOrder.customer_rating || workOrder.customer_feedback) && (
        <Card>
          <CardContent className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium">Customer Experience</div>
            <div className="flex items-center gap-2">
              {workOrder.customer_rating && (
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-4 w-4 ${star <= (workOrder.customer_rating || 0) ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`}
                    />
                  ))}
                </div>
              )}
              {workOrder.customer_feedback && (
                <span className="text-sm text-muted-foreground italic">"{workOrder.customer_feedback}"</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <CheckInInspectionBanner
        workOrder={workOrder}
        workOrderId={workOrderId}
        onStatusChange={refreshData}
      />

      {workOrder.status === "closed" && <GatePassBanner workOrderId={workOrderId} />}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <WorkOrderTabsNav
          tasksCount={tasks.length}
          partsCount={parts.length}
          notesCount={notes.length}
          tabsLocked={tabsLocked}
        />

        <TabsContent value="overview" className="mt-4">
          <WorkOrderOverviewTab workOrder={workOrder} onStatusChange={refreshData} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <WorkOrderTasksTab
            workOrderId={workOrderId}
            tasks={tasks}
            onRefresh={refreshData}
            workOrder={workOrder}
            isLoading={tasksLoading}
          />
        </TabsContent>

        <TabsContent value="parts" className="mt-4">
          <WorkOrderPartsTab
            workOrderId={workOrderId}
            parts={parts}
            onRefresh={refreshData}
            workOrder={workOrder}
            isLoading={partsLoading}
          />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <WorkOrderNotesTab workOrderId={workOrderId} notes={notes} onRefresh={refreshData} />
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          <PhotosTab workOrderId={workOrderId} />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsTab workOrderId={workOrderId} />
        </TabsContent>

        <TabsContent value="diagnosis" className="mt-4">
          <DiagnosisTab workOrderId={workOrderId} workOrderStatus={workOrder.status} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <WorkOrderTimeline workOrder={workOrder} notes={notes} />
        </TabsContent>
      </Tabs>

      <UnapprovedRecommendationsDialog
        open={showUnapprovedRecommendationsDialog}
        onOpenChange={setShowUnapprovedRecommendationsDialog}
        workOrderId={workOrderId}
        onPrintRecommendations={handlePrintRecommendations}
      />
      <ConfirmDialog />
    </div>
  );
}
