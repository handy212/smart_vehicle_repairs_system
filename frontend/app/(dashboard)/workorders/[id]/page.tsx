"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { workordersApi } from "@/lib/api/workorders";
import { useRecentItems } from "@/lib/hooks/useRecentItems";
import { useEffect } from "react";
import { workOrderTasksApi } from "@/lib/api/workorder-tasks";
import { workOrderPartsApi } from "@/lib/api/workorder-parts";
import { workOrderNotesApi } from "@/lib/api/workorder-notes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Edit, FileText, Wrench, Package, MessageSquare, Image, Search, Printer, ChevronDown, Clock } from "lucide-react";
import Link from "next/link";
import WorkOrderOverviewTab from "./components/OverviewTab";
import WorkOrderTasksTab from "./components/TasksTab";
import WorkOrderPartsTab from "./components/PartsTab";
import WorkOrderNotesTab from "./components/NotesTab";
import PhotosTab from "./components/PhotosTab";
import DiagnosisTab from "./components/DiagnosisTab";
import WorkflowActions from "./components/WorkflowActions";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { usePrint } from "@/lib/hooks/usePrint";
import { getStatusVariant } from "@/lib/utils/workorder-status";
import WorkOrderTimeline from "./components/WorkOrderTimeline";
import WorkOrderDetailSkeleton from "./components/WorkOrderDetailSkeleton";

// Workflow Progress Indicator Component
function WorkflowProgressIndicator({ status, workOrderId, workOrder, onStatusChange, onStartRepairs }: {
  status: string;
  workOrderId: number;
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
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          Status: <span className="font-semibold capitalize text-gray-900 dark:text-gray-100">{status.replace('_', ' ')}</span>
        </span>
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
                      ? 'bg-green-500 text-white'
                      : stepStatus === 'current'
                        ? 'bg-blue-600 text-white ring-2 ring-blue-200 dark:ring-blue-900'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                  >
                    {stepStatus === 'completed' ? '✓' : step.icon}
                  </div>
                  <span
                    className={`text-xs mt-1 text-center whitespace-nowrap max-w-[70px] truncate ${stepStatus === 'current'
                      ? 'font-semibold text-blue-600 dark:text-blue-400'
                      : stepStatus === 'completed'
                        ? 'text-gray-600 dark:text-gray-400'
                        : 'text-gray-400 dark:text-gray-500'
                      }`}
                  >
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <div
                    className={`h-0.5 w-6 mx-1 ${stepStatus === 'completed' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
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
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const { downloadPDF, isDownloading } = usePrint();
  const { addRecentItem } = useRecentItems();

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
              <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
              <span>/</span>
              <Link href="/workorders" className="hover:text-blue-600 transition-colors">Work Orders</Link>
              <span>/</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">#{workOrder.work_order_number}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              {workOrder.customer_name || "Customer"} - {workOrder.vehicle_info || "Vehicle"}
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            {/* Print Dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPrintMenu(!showPrintMenu)}
                className="flex items-center h-9 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
              >
                <Printer className="w-3.5 h-3.5 mr-2" />
                Print
                <ChevronDown className="w-3.5 h-3.5 ml-2" />
              </Button>
              {showPrintMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowPrintMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-20">
                    <div
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
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
                      {isDownloading ? 'Generating PDF...' : 'Print Work Order (PDF)'}
                    </div>
                    <Link
                      href={`/workorders/${workOrderId}/jobcard`}
                      target="_blank"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setShowPrintMenu(false)}
                    >
                      <FileText className="w-4 h-4 inline mr-2" />
                      Print Job Card
                    </Link>
                  </div>
                </>
              )}
            </div>
            <Link href={`/tech/workorders/${workOrderId}`}>
              <Button variant="secondary" size="sm" className="h-9 hidden md:inline-flex">
                <Wrench className="w-3.5 h-3.5 mr-2" />
                Tech Mode
              </Button>
            </Link>
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

      {/* Workflow Progress Indicator */}
      <Card>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <FileText className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <Wrench className="w-4 h-4 mr-2" />
            Tasks ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="parts">
            <Package className="w-4 h-4 mr-2" />
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
    </div>
  );
}
