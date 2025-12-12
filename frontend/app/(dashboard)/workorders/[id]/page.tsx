"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { workordersApi } from "@/lib/api/workorders";
import { workOrderTasksApi } from "@/lib/api/workorder-tasks";
import { workOrderPartsApi } from "@/lib/api/workorder-parts";
import { workOrderNotesApi } from "@/lib/api/workorder-notes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Edit, FileText, User, Car, DollarSign, Calendar, Wrench, Package, MessageSquare, Image, Clock, Plus, Printer, Search, ChevronDown } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import WorkOrderOverviewTab from "./components/OverviewTab";
import WorkOrderTasksTab from "./components/TasksTab";
import WorkOrderPartsTab from "./components/PartsTab";
import WorkOrderNotesTab from "./components/NotesTab";
import PhotosTab from "./components/PhotosTab";
import DiagnosisTab from "./components/DiagnosisTab";
import WorkflowActions from "./components/WorkflowActions";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

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
  const activeSteps = workflowSteps.filter((step, index) => {
    // For invoiced and closed, show all steps up to and including current
    return index <= currentStepIndex;
  });

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
        <Badge variant={getStatusVariantForProgress(status) as any} className="text-xs px-2 py-0.5">
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
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      stepStatus === 'completed'
                        ? 'bg-green-500 text-white'
                        : stepStatus === 'current'
                        ? 'bg-blue-600 text-white ring-2 ring-blue-200 dark:ring-blue-900'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {stepStatus === 'completed' ? '✓' : step.icon}
                  </div>
                  <span
                    className={`text-xs mt-1 text-center whitespace-nowrap max-w-[70px] truncate ${
                      stepStatus === 'current'
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
                    className={`h-0.5 w-6 mx-1 ${
                      stepStatus === 'completed' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
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

function getStatusVariantForProgress(status: string) {
  switch (status) {
    case "completed":
    case "closed":
      return "success";
    case "in_progress":
    case "approved":
      return "info";
    case "pending":
    case "draft":
    case "awaiting_approval":
      return "warning";
    case "cancelled":
      return "danger";
    default:
      return "default";
  }
}

export default function WorkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workOrderId = parseInt(params.id as string);
  const [activeTab, setActiveTab] = useState("overview");
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();

  const { data: workOrder, isLoading, error } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId),
  });

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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
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


  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "danger";
      case "high":
        return "warning";
      case "normal":
        return "default";
      case "low":
        return "secondary";
      default:
        return "default";
    }
  };

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
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="secondary" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Work Order #{workOrder.work_order_number}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {workOrder.customer_name || "Customer"}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* Print Dropdown */}
          <div className="relative">
            <Button 
             variant="secondary" 
              onClick={() => setShowPrintMenu(!showPrintMenu)}
              className="flex items-center"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
            {showPrintMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowPrintMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-20">
                  <Link 
                    href={`/workorders/${workOrderId}/print`} 
                    target="_blank"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => setShowPrintMenu(false)}
                  >
                    <FileText className="w-4 h-4 inline mr-2" />
                    Print Work Order
                  </Link>
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
          <PermissionGuard permission="edit_workorders">
            <Link href={`/workorders/${workOrderId}/edit`}>
              <Button>
                <Edit className="w-4 h-4 mr-2" />
                Edit Work Order
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* Workflow Progress Indicator & Next Action - Combined */}
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
          <Card>
            <CardHeader>
              <CardTitle>Activity Timeline</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Chronological view of work order events and activities
              </p>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
                
                <div className="space-y-6 pl-8">
                  {/* Work Order Created */}
                  {workOrder.created_at && (
                    <div className="relative flex items-start">
                      <div className="absolute -left-10 w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-gray-800 shadow-sm"></div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Work Order Created</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {format(new Date(workOrder.created_at), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                        {workOrder.created_by && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Created by: {typeof workOrder.created_by === 'object' ? 
                              (workOrder.created_by.first_name + ' ' + workOrder.created_by.last_name) : 
                              'System'}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Status Changes */}
                  {(workOrder as any).diagnosis_completed_at && (
                    <div className="relative flex items-start">
                      <div className="absolute -left-10 w-3 h-3 rounded-full bg-purple-500 border-2 border-white dark:border-gray-800 shadow-sm"></div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Diagnosis Completed</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {format(new Date((workOrder as any).diagnosis_completed_at), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </div>
                  )}

                  {(workOrder as any).approval_requested_at && (
                    <div className="relative flex items-start">
                      <div className="absolute -left-10 w-3 h-3 rounded-full bg-yellow-500 border-2 border-white dark:border-gray-800 shadow-sm"></div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Approval Requested</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {format(new Date((workOrder as any).approval_requested_at), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </div>
                  )}

                  {(workOrder as any).approved_at && (
                    <div className="relative flex items-start">
                      <div className="absolute -left-10 w-3 h-3 rounded-full bg-green-500 border-2 border-white dark:border-gray-800 shadow-sm"></div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Work Order Approved</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {format(new Date((workOrder as any).approved_at), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                        {(workOrder as any).approval_method && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Via: {(workOrder as any).approval_method.replace('_', ' ')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {(workOrder as any).started_at && (
                    <div className="relative flex items-start">
                      <div className="absolute -left-10 w-3 h-3 rounded-full bg-green-500 border-2 border-white dark:border-gray-800 shadow-sm"></div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Work Started</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {format(new Date((workOrder as any).started_at), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                        {(workOrder as any).primary_technician_name && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Technician: {(workOrder as any).primary_technician_name}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {(workOrder as any).quality_check_at && (
                    <div className="relative flex items-start">
                      <div className={`absolute -left-10 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 shadow-sm ${
                        (workOrder as any).quality_check_passed ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Quality Check {(workOrder as any).quality_check_passed ? 'Passed' : 'Failed'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {format(new Date((workOrder as any).quality_check_at), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </div>
                  )}

                  {workOrder.completed_at && (
                    <div className="relative flex items-start">
                      <div className="absolute -left-10 w-3 h-3 rounded-full bg-green-600 border-2 border-white dark:border-gray-800 shadow-sm"></div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Work Order Completed</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {format(new Date(workOrder.completed_at), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Notes Timeline */}
                  {notes.length > 0 && (
                    <>
                      <div className="border-t dark:border-gray-700 pt-6 mt-4">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Notes & Activity</p>
                      </div>
                      {notes
                        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((note: any) => (
                          <div key={note.id} className="relative flex items-start">
                            <div className={`absolute -left-10 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 shadow-sm ${
                              note.note_type === 'customer' ? 'bg-blue-400' :
                              note.is_important ? 'bg-red-500' : 'bg-gray-400'
                            }`}></div>
                            <div className="flex-1 pt-0.5">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {note.note_type === 'customer' ? 'Customer Note' : 
                                   note.is_important ? 'Important Note' : 'Internal Note'}
                                </p>
                              </div>
                              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{note.note}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {format(new Date(note.created_at), "MMM dd, yyyy 'at' h:mm a")}
                                {note.created_by_name && ` • ${note.created_by_name}`}
                              </p>
                            </div>
                          </div>
                        ))}
                    </>
                  )}

                  {!workOrder.created_at && notes.length === 0 && (
                    <div className="text-center py-8">
                      <Clock className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">No timeline events yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
