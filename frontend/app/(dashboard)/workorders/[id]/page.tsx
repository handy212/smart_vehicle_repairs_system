"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { workordersApi } from "@/lib/api/workorders";
import { gatepassApi } from "@/lib/api/gatepass";
import { useRecentItems } from "@/lib/hooks/useRecentItems";
import { useEffect } from "react";
import { workOrderTasksApi } from "@/lib/api/workorder-tasks";
import { workOrderPartsApi } from "@/lib/api/workorder-parts";
import { workOrderNotesApi } from "@/lib/api/workorder-notes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowLeft, Edit, FileText, Wrench, Package, MessageSquare, Image, Search, Printer, ChevronDown, Clock, FileText as FileTextIcon, Plus, ExternalLink, AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { PremiumIcons } from "@/components/ui/icons";
import Link from "next/link";
import WorkOrderOverviewTab from "./components/OverviewTab";
import WorkOrderTasksTab from "./components/TasksTab";
import WorkOrderPartsTab from "./components/PartsTab";
import WorkOrderNotesTab from "./components/NotesTab";
import PhotosTab from "./components/PhotosTab";
import DocumentsTab from "./components/DocumentsTab";
import DiagnosisTab from "./components/DiagnosisTab";
import WorkflowActions from "./components/WorkflowActions";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { usePrint } from "@/lib/hooks/usePrint";
import { getStatusVariant } from "@/lib/utils/workorder-status";
import WorkOrderTimeline from "./components/WorkOrderTimeline";
import WorkOrderDetailSkeleton from "./components/WorkOrderDetailSkeleton";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { diagnosisApi } from "@/lib/api/diagnosis";
import { useCurrency } from "@/lib/hooks/useCurrency";

// Gate Pass Section Component
function GatePassSection({ workOrderId }: { workOrderId: number }) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const queryClient = useQueryClient();

  const { data: gatePass, isLoading } = useQuery({
    queryKey: ["gatepass", "workorder", workOrderId],
    queryFn: () => gatepassApi.getByWorkOrder(workOrderId),
    enabled: !!workOrderId,
  });

  if (isLoading) {
    return null;
  }

  return (
    <Card className="border-none shadow-sm bg-card/60 backdrop-blur-md ring-1 ring-gray-900/5">
      <CardContent className="py-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileTextIcon className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold text-sm">Gate Pass</h3>
              {gatePass ? (
                <p className="text-xs text-muted-foreground">
                  Gate Pass {gatePass.gate_pass_number} - {gatePass.status?.replace("_", " ")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No gate pass created yet</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {gatePass ? (
              <Link href={`/gatepass/${gatePass.id}`}>
                <Button size="sm" variant="outline" className="h-8 text-xs">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  View Gate Pass
                </Button>
              </Link>
            ) : (
              <PermissionGuard permission="create_gatepass">
                <Link href={`/gatepass/new?work_order=${workOrderId}`}>
                  <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Create Gate Pass
                  </Button>
                </Link>
              </PermissionGuard>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Workflow Progress Indicator Component
function WorkflowProgressIndicator({ status, workOrderId, workOrder, onStatusChange, onStartRepairs }: {
  status: string;
  workOrderId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workOrder: any;
  onStatusChange?: () => void;
  onStartRepairs?: () => void;
}) {
  const workflowSteps = [
    { key: 'draft', label: 'Draft', icon: '📝' },
    { key: 'inspection', label: 'Inspection', icon: '🔍' },
    { key: 'intake', label: 'Intake', icon: '📋' },
    { key: 'assigned', label: 'Assigned', icon: '👤' },
    { key: 'diagnosis', label: 'Diagnosis', icon: '🔧' },
    { key: 'awaiting_approval', label: 'Awaiting Approval', icon: '⏳' },
    { key: 'approved', label: 'Approved', icon: '✅' },
    { key: 'in_progress', label: 'In Progress', icon: '⚙️' },
    { key: 'quality_check', label: 'Quality Check', icon: '✓' },
    { key: 'completed', label: 'Completed', icon: '🎉' },
    { key: 'invoiced', label: 'Invoiced', icon: '💰' },
    { key: 'closed', label: 'Closed', icon: '🔒' },
  ];

  const statusOrder: Record<string, number> = {
    'draft': 0,
    'inspection': 1,
    'intake': 2,
    'assigned': 3,
    'diagnosis': 4,
    'awaiting_approval': 5,
    'approved': 6,
    'in_progress': 7,
    'additional_work_found': 7,
    'paused': 7,
    'quality_check': 8,
    'completed': 9,
    'invoiced': 10,
    'closed': 11,
  };

  const currentStepIndex = statusOrder[status] ?? 0;

  const getStepStatus = (index: number) => {
    if (index < currentStepIndex) return 'completed';
    if (index === currentStepIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Status: <span className="font-semibold capitalize text-foreground">{status.replace('_', ' ')}</span>
        </span>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Badge variant={getStatusVariant(status) as any} className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
          {status?.replace("_", " ") || status}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 flex-1 min-w-0">
          {workflowSteps.map((step, index) => {
            const stepStatus = getStepStatus(index);
            const isLast = index === workflowSteps.length - 1;

            return (
              <div key={step.key} className="flex items-center flex-shrink-0">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${stepStatus === 'completed'
                      ? 'bg-success/100 text-white'
                      : stepStatus === 'current'
                        ? 'bg-primary text-white ring-2 ring-orange-200 dark:ring-orange-900'
                        : 'bg-border text-muted-foreground'
                      }`}
                  >
                    {stepStatus === 'completed' ? '✓' : step.icon}
                  </div>
                  <span
                    className={`text-xs mt-1 text-center whitespace-nowrap max-w-[70px] truncate ${stepStatus === 'current'
                      ? 'font-semibold text-primary'
                      : stepStatus === 'completed'
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground'
                      }`}
                  >
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <div
                    className={`h-0.5 w-6 mx-1 ${stepStatus === 'completed' ? 'bg-success/100' : 'bg-border'
                      }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex-shrink-0">
          <WorkflowActions
            workOrderId={workOrderId}
            status={status}
            workOrder={workOrder}
            onStatusChange={onStatusChange}
            onStartRepairs={onStartRepairs}
            inline={true}
          />
        </div>
      </div>
    </div>
  );
}

export default function WorkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workOrderId = parseInt(params.id as string);
  const [activeTab, setActiveTab] = useState("overview");
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [showUnapprovedRecommendationsDialog, setShowUnapprovedRecommendationsDialog] = useState(false);
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hasPermission } = usePermissions();
  const { downloadPDF, openPrintWindow, isDownloading, isOpeningPrint } = usePrint();
  const { addRecentItem } = useRecentItems();
  const { toast } = useToast();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { formatCurrency } = useCurrency();

  const { data: workOrder, isLoading, error } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId),
  });

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

  // Fetch diagnosis to get unapproved count
  const { data: diagnosis } = useQuery({
    queryKey: ["diagnosis", "workorder", workOrderId],
    queryFn: () => diagnosisApi.getByWorkOrder(workOrderId),
    enabled: !!workOrderId,
  });

  const unapprovedRecommendations = diagnosis?.repair_recommendations?.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => !r.customer_approved
  ) || [];

  const { data: notes = [] } = useQuery({
    queryKey: ["workorder-notes", workOrderId],
    queryFn: () => workOrderNotesApi.list({ work_order: workOrderId }),
    enabled: !!workOrderId,
  });

  if (isLoading) {
    return <WorkOrderDetailSkeleton />;
  }

  if (error || !workOrder) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">Error loading work order. Please try again.</p>
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

  const handlePrintRecommendations = async (format: "html" | "pdf" = "pdf") => {
    try {
      if (format === "pdf") {
        // Download PDF
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
      } else {
        // Open HTML print page on Django backend
        // Use the API URL and construct the Django frontend URL
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
        const baseUrl = apiUrl.replace("/api", "");
        const token = localStorage.getItem("access_token");
        // Pass token as query param for authentication
        const printUrl = `${baseUrl}/workorders/${workOrderId}/print-recommendations/${token ? `?token=${token}` : ''}`;
        window.open(printUrl, "_blank");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to print recommendations",
        variant: "destructive",
      });
    }
  };

  // Check if work order is in a status that allows printing recommendations and has items to print
  const canPrintRecommendations =
    workOrder &&
    ["completed", "invoiced", "closed"].includes(workOrder.status) &&
    unapprovedRecommendations.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            {/* Back Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="mb-1 -ml-2 h-8 text-muted-foreground hover:text-foreground text-muted-foreground "
            >
              <PremiumIcons.ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            {/* Premium Header - Removed manual breadcrumbs and WO number for cleaner look */}
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              {workOrder.customer_name || "Customer"} - {workOrder.vehicle_info || "Vehicle"}
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            {/* Work Order Number Badge */}
            <div className="px-3 py-1.5 rounded-full bg-primary/10 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700/50 text-primary dark:text-orange-300 font-mono text-sm font-bold shadow-sm mr-2">
              #{workOrder.work_order_number}
            </div>

            {/* Print Dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPrintMenu(!showPrintMenu)}
                className="flex items-center h-9 bg-muted text-foreground border-border backdrop-blur-sm"
              >
                <PremiumIcons.Receipt className="w-3.5 h-3.5 mr-2" />
                Print
                <ChevronDown className="w-3.5 h-3.5 ml-2" />
              </Button>
              {/* Unapproved Recommendations Button - Header */}
              {workOrder.status === "closed" && unapprovedRecommendations.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUnapprovedRecommendationsDialog(true)}
                  className="absolute right-full mr-2 min-w-max h-9 border-orange-200 text-primary bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-900/30"
                >
                  <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                  Unapproved Items
                </Button>
              )}
              {showPrintMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowPrintMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-card/90 backdrop-blur-xl bg-muted/90 rounded-xl shadow-xl border border-border/50 border-border/50 z-20 overflow-hidden ring-1 ring-black/5">
                    <div
                      className="block px-4 py-2 text-sm text-card-foreground hover:bg-muted  cursor-pointer"
                      onClick={() => {
                        setShowPrintMenu(false);
                        openPrintWindow({ documentType: 'work_order', documentId: workOrderId });
                      }}
                    >
                      <Printer className="w-4 h-4 inline mr-2" />
                      {isOpeningPrint ? 'Opening...' : 'Print Work Order'}
                    </div>
                    <div
                      className="block px-4 py-2 text-sm text-card-foreground hover:bg-muted  cursor-pointer"
                      onClick={() => {
                        setShowPrintMenu(false);
                        downloadPDF({
                          documentType: 'work_order',
                          documentId: workOrderId,
                          documentNumber: workOrder.work_order_number
                        });
                      }}
                    >
                      <FileText className="w-4 h-4 inline mr-2" />
                      {isDownloading ? 'Downloading...' : 'Download PDF'}
                    </div>
                    {canPrintRecommendations && (
                      <>
                        <div className="border-t border-border my-1" />
                        <div
                          className="block px-4 py-2 text-sm text-card-foreground hover:bg-muted  cursor-pointer"
                          onClick={() => {
                            setShowPrintMenu(false);
                            handlePrintRecommendations("pdf");
                          }}
                        >
                          <AlertCircle className="w-4 h-4 inline mr-2" />
                          Print Recommendations (PDF)
                        </div>
                        <div
                          className="block px-4 py-2 text-sm text-card-foreground hover:bg-muted  cursor-pointer"
                          onClick={() => {
                            setShowPrintMenu(false);
                            handlePrintRecommendations("html");
                          }}
                        >
                          <AlertCircle className="w-4 h-4 inline mr-2" />
                          Print Recommendations (HTML)
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <PermissionGuard permission="edit_workorders">
              <Link href={`/workorders/${workOrderId}/edit`}>
                <Button size="sm" className="h-9">
                  <Edit className="w-3.5 h-3.5 mr-2" />
                  Edit Order
                </Button>
              </Link>
            </PermissionGuard>
          </div>
        </div>
      </div>

      {/* Workflow Progress Indicator with Glass Effect */}
      <Card className="border-none shadow-sm bg-card/60 backdrop-blur-md ring-1 ring-gray-900/5">
        <CardContent className="py-4 px-4">
          <WorkflowProgressIndicator
            status={workOrder.status}
            workOrderId={workOrderId}
            workOrder={workOrder}
            onStatusChange={refreshData}
            onStartRepairs={() => setActiveTab("tasks")}
          />
        </CardContent>
      </Card>

      {/* Gate Pass Section */}
      {workOrder.status === "closed" && <GatePassSection workOrderId={workOrderId} />}



      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="data-[state=active]:bg-card/80 data-[state=active]:backdrop-blur-sm data-[state=active]:shadow-sm">
            <PremiumIcons.FileText className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="tasks" className="data-[state=active]:bg-card/80 data-[state=active]:backdrop-blur-sm data-[state=active]:shadow-sm">
            <PremiumIcons.Wrench className="w-4 h-4 mr-2" />
            Tasks ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="parts" className="data-[state=active]:bg-card/80 data-[state=active]:backdrop-blur-sm data-[state=active]:shadow-sm">
            <PremiumIcons.Package className="w-4 h-4 mr-2" />
            Parts ({parts.length})
          </TabsTrigger>
          <TabsTrigger value="notes">
            <MessageSquare className="w-4 h-4 mr-2" />
            Notes ({notes.length})
          </TabsTrigger>
          <TabsTrigger value="photos">
            <Image className="w-4 h-4 mr-2" />
            Photos
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="w-4 h-4 mr-2" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="diagnosis">
            <Search className="w-4 h-4 mr-2" />
            Diagnosis
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Clock className="w-4 h-4 mr-2" />
            Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <WorkOrderOverviewTab workOrder={workOrder} onStatusChange={refreshData} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <WorkOrderTasksTab
            workOrderId={workOrderId}
            tasks={tasks}
            onRefresh={refreshData}
            workOrder={workOrder}
          />
        </TabsContent>

        <TabsContent value="parts" className="mt-6">
          <WorkOrderPartsTab
            workOrderId={workOrderId}
            parts={parts}
            onRefresh={refreshData}
          />
        </TabsContent>

        <TabsContent value="notes" className="mt-6">
          <WorkOrderNotesTab
            workOrderId={workOrderId}
            notes={notes}
            onRefresh={refreshData}
          />
        </TabsContent>

        <TabsContent value="photos" className="mt-6">
          <PhotosTab workOrderId={workOrderId} />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <DocumentsTab workOrderId={workOrderId} />
        </TabsContent>

        <TabsContent value="diagnosis" className="mt-6">
          <DiagnosisTab
            workOrderId={workOrderId}
            workOrder={workOrder}
            onRefresh={refreshData}
          />
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <WorkOrderTimeline workOrder={workOrder} notes={notes} />
        </TabsContent>
      </Tabs>

      {/* Unapproved Recommendations Dialog */}
      <UnapprovedRecommendationsDialog
        open={showUnapprovedRecommendationsDialog}
        onOpenChange={setShowUnapprovedRecommendationsDialog}
        workOrderId={workOrderId}
        workOrder={workOrder}
        onPrintRecommendations={handlePrintRecommendations}
      />
    </div >
  );
}

// Unapproved Recommendations Dialog Component
function UnapprovedRecommendationsDialog({
  open,
  onOpenChange,
  workOrderId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  workOrder,
  onPrintRecommendations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workOrder: any;
  onPrintRecommendations: (format: "html" | "pdf") => void;
}) {
  const { formatCurrency } = useCurrency();

  // Fetch diagnosis to get recommendations
  const { data: diagnosis, isLoading } = useQuery({
    queryKey: ["diagnosis", "workorder", workOrderId],
    queryFn: () => diagnosisApi.getByWorkOrder(workOrderId),
    enabled: open && !!workOrderId,
  });

  const unapprovedRecommendations = diagnosis?.repair_recommendations?.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => !r.customer_approved
  ) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="w-5 h-5 text-primary" />
            Unapproved Recommendations
          </DialogTitle>
          {/* <DialogDescription className="text-xs">
            Review recommendations not approved by the customer.
          </DialogDescription> */}
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : unapprovedRecommendations.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle className="w-10 h-10 mx-auto text-green-500 mb-2" />
              <p className="font-medium text-foreground">
                All Approved
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {unapprovedRecommendations.map((rec: any) => (
                <div key={rec.id} className="border border-orange-200 dark:border-orange-800 rounded-md bg-orange-50/50 dark:bg-orange-900/10 p-3">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm text-foreground">
                        {rec.description}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-5 border-orange-300 text-primary"
                        >
                          {rec.priority_display || rec.priority}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                          {rec.recommendation_type_display || rec.recommendation_type}
                        </Badge>
                      </div>
                    </div>
                    {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                      <span className="text-sm font-bold text-foreground font-mono">
                        {formatCurrency(Number(rec.estimated_total_cost))}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {unapprovedRecommendations.length > 0 && (
          <DialogFooter className="gap-2 sm:justify-between pt-2">
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onPrintRecommendations("pdf");
                  onOpenChange(false);
                }}
                className="flex-1"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onPrintRecommendations("html");
                  onOpenChange(false);
                }}
                className="flex-1"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                HTML
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
