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
import { ArrowLeft, Edit, FileText, User, Car, DollarSign, Calendar, Wrench, Package, MessageSquare, Image, Clock, Plus, Printer } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import WorkOrderOverviewTab from "./components/OverviewTab";
import WorkOrderTasksTab from "./components/TasksTab";
import WorkOrderPartsTab from "./components/PartsTab";
import WorkOrderNotesTab from "./components/NotesTab";
import PhotosTab from "./components/PhotosTab";

export default function WorkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workOrderId = parseInt(params.id as string);
  const [activeTab, setActiveTab] = useState("overview");
  const queryClient = useQueryClient();

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
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Error loading work order. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
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
  };

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
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Work Order #{workOrder.work_order_number}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {workOrder.customer_name || "Customer"}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Link href={`/workorders/${workOrderId}/print`} target="_blank">
            <Button variant="outline">
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </Link>
          <Link href={`/workorders/${workOrderId}/edit`}>
            <Button>
              <Edit className="w-4 h-4 mr-2" />
              Edit Work Order
            </Button>
          </Link>
        </div>
      </div>

      {/* Status and Priority Badges */}
      <div className="flex items-center space-x-2">
        <Badge variant={getStatusVariant(workOrder.status) as any} className="text-sm px-3 py-1">
          {workOrder.status?.replace("_", " ") || workOrder.status}
        </Badge>
        <Badge variant={getPriorityVariant(workOrder.priority) as any} className="text-sm px-3 py-1">
          {workOrder.priority} Priority
        </Badge>
      </div>

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

        <TabsContent value="timeline" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Work Order Created */}
                {workOrder.created_at && (
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Work Order Created</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(workOrder.created_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Diagnosis Completed */}
                {(workOrder as any).diagnosis_completed_at && (
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 rounded-full bg-purple-500 mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Diagnosis Completed</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date((workOrder as any).diagnosis_completed_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Approval Requested */}
                {(workOrder as any).approval_requested_at && (
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Approval Requested</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date((workOrder as any).approval_requested_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Approved */}
                {(workOrder as any).approved_at && (
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Work Order Approved</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date((workOrder as any).approved_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Work Started */}
                {(workOrder as any).started_at && (
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Work Started</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date((workOrder as any).started_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Quality Check */}
                {(workOrder as any).quality_check_at && (
                  <div className="flex items-start space-x-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${(workOrder as any).quality_check_passed ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Quality Check {(workOrder as any).quality_check_passed ? 'Passed' : 'Failed'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(new Date((workOrder as any).quality_check_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Work Order Completed */}
                {workOrder.completed_at && (
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 rounded-full bg-green-600 mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Work Order Completed</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(workOrder.completed_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Notes Timeline */}
                {notes.length > 0 && (
                  <>
                    <div className="border-t pt-4 mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-3">Notes & Activity</p>
                    </div>
                    {notes
                      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((note: any) => (
                        <div key={note.id} className="flex items-start space-x-3">
                          <div className={`w-2 h-2 rounded-full mt-2 ${
                            note.note_type === 'customer' ? 'bg-blue-400' :
                            note.is_important ? 'bg-red-500' : 'bg-gray-400'
                          }`}></div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {note.note_type === 'customer' ? 'Customer Note' : 
                               note.is_important ? 'Important Note' : 'Internal Note'}
                            </p>
                            <p className="text-sm text-gray-700 mt-1">{note.note}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {format(new Date(note.created_at), "MMM dd, yyyy 'at' h:mm a")}
                              {note.created_by_name && ` by ${note.created_by_name}`}
                            </p>
                          </div>
                        </div>
                      ))}
                  </>
                )}

                {!workOrder.created_at && notes.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No timeline events yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
