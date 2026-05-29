"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import WorkOrderOverviewTab from "./components/OverviewTab";
import WorkOrderTasksTab from "./components/TasksTab";
import WorkOrderPartsTab from "./components/PartsTab";
import WorkOrderNotesTab from "./components/NotesTab";
import PhotosTab from "./components/PhotosTab";
import DocumentsTab from "./components/DocumentsTab";
import DiagnosisTab from "./components/DiagnosisTab";
import WorkOrderTimeline from "./components/WorkOrderTimeline";
import WorkOrderDetailSkeleton from "./components/WorkOrderDetailSkeleton";
import { useRecentItems } from "@/lib/hooks/useRecentItems";
import { usePrint } from "@/lib/hooks/usePrint";
import { useToast } from "@/lib/hooks/useToast";
import { WorkOrderCommandBar } from "./components/WorkOrderCommandBar";
import { WorkOrderProgress } from "./components/WorkOrderProgress";
import { GatePassBanner } from "./components/GatePassBanner";
import { CheckInInspectionBanner } from "./components/CheckInInspectionBanner";
import { WorkOrderTabsNav } from "./components/WorkOrderTabsNav";
import { UnapprovedRecommendationsDialog } from "./components/UnapprovedRecommendationsDialog";

const DiagnosisWorkspace = dynamic(
  () => import("./diagnosis/DiagnosisWorkspace"),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    ),
  }
);

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
  const diagnosisPanel = searchParams.get("panel");
  const showFullDiagnosis = diagnosisPanel === "full";
  const initialTab =
    requestedTab && VALID_TABS.has(requestedTab) ? requestedTab : "overview";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [showUnapprovedRecommendationsDialog, setShowUnapprovedRecommendationsDialog] =
    useState(false);
  const queryClient = useQueryClient();
  const { downloadPDF, openPrintWindow, isDownloading, isOpeningPrint } = usePrint();
  const { addRecentItem } = useRecentItems();
  const { toast } = useToast();

  const { data: workOrder, isLoading, error } = useQuery({
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

  const { data: tasks = [] } = useQuery({
    queryKey: ["workorder-tasks", workOrderId],
    queryFn: () => workOrderTasksApi.list({ work_order: workOrderId }),
    enabled: !!workOrderId,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["workorder-parts", workOrderId],
    queryFn: () => workOrderPartsApi.list({ work_order: workOrderId }),
    enabled: !!workOrderId,
  });

  const { data: diagnosis } = useQuery({
    queryKey: ["diagnosis", "workorder", workOrderId],
    queryFn: () => diagnosisApi.getByWorkOrder(workOrderId),
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

  const handleTabChange = useCallback(
    (tab: string, options?: { panel?: "full" | null }) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      if (tab === "diagnosis" && options?.panel === "full") {
        params.set("panel", "full");
      } else {
        params.delete("panel");
      }
      const qs = params.toString();
      router.replace(`/workorders/${workOrderId}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, workOrderId, searchParams]
  );

  const showDiagnosisSummary = () => handleTabChange("diagnosis");
  const showDiagnosisFull = () => handleTabChange("diagnosis", { panel: "full" });

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
          <CardContent className="pt-6">
            <p className="text-destructive">Error loading work order. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
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
        description: error.response?.data?.error || "Failed to print recommendations",
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

  return (
    <div className="space-y-4">
      <WorkOrderCommandBar
        workOrder={workOrder}
        workOrderId={workOrderId}
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
        onPrintRecommendations={handlePrintRecommendations}
        isOpeningPrint={isOpeningPrint}
        isDownloading={isDownloading}
      />

      <WorkOrderProgress status={workOrder.status} />

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
          />
        </TabsContent>

        <TabsContent value="parts" className="mt-4">
          <WorkOrderPartsTab
            workOrderId={workOrderId}
            parts={parts}
            onRefresh={refreshData}
            workOrder={workOrder}
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
          {showFullDiagnosis ? (
            <div className="space-y-4">
              <Button variant="outline" size="sm" onClick={showDiagnosisSummary}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to summary
              </Button>
              <DiagnosisWorkspace />
            </div>
          ) : (
            <DiagnosisTab
              workOrderId={workOrderId}
              workOrder={workOrder}
              onRefresh={refreshData}
              onOpenFull={showDiagnosisFull}
            />
          )}
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
    </div>
  );
}
