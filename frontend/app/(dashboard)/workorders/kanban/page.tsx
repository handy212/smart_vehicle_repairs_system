"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workordersApi, WorkOrder } from "@/lib/api/workorders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Filter, RefreshCw, Eye, Edit } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { Select } from "@/components/ui/select";

const WORK_ORDER_STATUSES = [
  { value: "draft", label: "Draft", color: "gray" },
  { value: "inspection", label: "Initial Inspection", color: "blue" },
  { value: "intake", label: "Intake", color: "indigo" },
  { value: "diagnosis", label: "Diagnosis", color: "purple" },
  { value: "awaiting_approval", label: "Awaiting Approval", color: "yellow" },
  { value: "approved", label: "Approved", color: "green" },
  { value: "in_progress", label: "In Progress", color: "blue" },
  { value: "paused", label: "Paused", color: "orange" },
  { value: "quality_check", label: "Quality Check", color: "cyan" },
  { value: "completed", label: "Completed", color: "green" },
  { value: "invoiced", label: "Invoiced", color: "teal" },
  { value: "closed", label: "Closed", color: "gray" },
];

interface KanbanColumnProps {
  status: typeof WORK_ORDER_STATUSES[0];
  workOrders: WorkOrder[];
}

function KanbanColumn({ status, workOrders }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useSortable({
    id: status.value,
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[300px] max-w-[300px] bg-gray-50 rounded-lg p-4 border-2 ${
        isOver ? "border-blue-500" : "border-gray-200"
      } transition-colors`}
    >
      <div className="flex justify-between items-center mb-4 p-2 bg-white rounded border border-gray-200">
        <h6 className="text-sm font-semibold text-gray-900">{status.label}</h6>
        <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-semibold">
          {workOrders.length}
        </div>
      </div>

      <SortableContext
        items={workOrders.map((wo) => wo.id.toString())}
        strategy={verticalListSortingStrategy}
      >
        <div className="min-h-[500px] space-y-3">
          {workOrders.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
                <span className="text-2xl">📋</span>
              </div>
              <p className="text-xs">No work orders</p>
            </div>
          ) : (
            workOrders.map((workOrder) => (
              <WorkOrderCard key={workOrder.id} workOrder={workOrder} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

interface WorkOrderCardProps {
  workOrder: WorkOrder;
}

function WorkOrderCard({ workOrder }: WorkOrderCardProps) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: workOrder.id.toString(),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
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

  const customerName =
    typeof workOrder.customer === "object" && workOrder.customer !== null
      ? workOrder.customer_name || "Customer"
      : workOrder.customer_name || "Customer";

  const vehicleInfo = workOrder.vehicle_info || "-";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white rounded-lg p-4 border border-gray-200 cursor-move transition-all hover:shadow-lg hover:-translate-y-0.5"
    >
      {/* Work Order Header */}
      <div className="flex justify-between items-start mb-2">
        <Link
          href={`/workorders/${workOrder.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          {workOrder.work_order_number}
        </Link>
        <Badge variant={getPriorityVariant(workOrder.priority) as any} className="text-xs">
          {workOrder.priority}
        </Badge>
      </div>

      {/* Customer Info */}
      <div className="flex items-center my-2">
        <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center mr-2">
          {customerName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)}
        </div>
        <div className="text-sm font-medium text-gray-900 truncate">{customerName}</div>
      </div>

      {/* Vehicle Info */}
      <div className="text-sm text-gray-600 my-1">
        <div className="flex items-center gap-1">
          <span className="text-xs">🚗</span>
          <span className="truncate">{vehicleInfo}</span>
        </div>
      </div>

      {/* Card Footer */}
      <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-200">
        <span className="text-xs text-gray-500">
          {workOrder.created_at
            ? format(new Date(workOrder.created_at), "MMM d")
            : "-"}
        </span>
        <div className="flex items-center gap-1">
          <Link
            href={`/workorders/${workOrder.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center w-7 h-7 border border-blue-600 text-blue-600 rounded text-xs hover:bg-blue-50 transition-colors"
            title="View Details"
          >
            <Eye className="w-3 h-3" />
          </Link>
          <Link
            href={`/workorders/${workOrder.id}/edit`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center w-7 h-7 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50 transition-colors"
            title="Edit"
          >
            <Edit className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function WorkOrderKanbanPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [technicianFilter, setTechnicianFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { data: workOrdersData, isLoading } = useQuery({
    queryKey: ["workorders", "kanban", technicianFilter, priorityFilter],
    queryFn: () =>
      workordersApi.list({
        priority: priorityFilter || undefined,
        // Note: technician filter would need backend support
      }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      workordersApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      toast({
        title: "Success",
        description: "Work order status updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  // Group work orders by status
  const workOrdersByStatus = useMemo(() => {
    const grouped: Record<string, WorkOrder[]> = {};
    WORK_ORDER_STATUSES.forEach((status) => {
      grouped[status.value] = [];
    });

    workOrdersData?.results?.forEach((wo) => {
      if (grouped[wo.status]) {
        grouped[wo.status].push(wo);
      } else {
        // Handle unknown statuses
        if (!grouped["other"]) {
          grouped["other"] = [];
        }
        grouped["other"].push(wo);
      }
    });

    return grouped;
  }, [workOrdersData]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const workOrderId = parseInt(active.id as string);
    const newStatus = over.id as string;

    // Find the work order
    const workOrder = workOrdersData?.results?.find((wo) => wo.id === workOrderId);
    if (!workOrder) return;

    // Don't update if status hasn't changed
    if (workOrder.status === newStatus) return;

    // Confirm status change
    if (
      confirm(
        `Change work order ${workOrder.work_order_number} status from "${workOrder.status.replace("_", " ")}" to "${newStatus.replace("_", " ")}"?`
      )
    ) {
      updateStatusMutation.mutate({ id: workOrderId, status: newStatus });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/workorders">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to List
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Work Orders Kanban</h1>
            <p className="text-sm text-gray-500 mt-1">
              Drag and drop to update work order status
            </p>
          </div>
        </div>
        <Link href="/workorders/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Work Order
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Filter by Priority
              </label>
              <Select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
               variant="secondary"
                onClick={() => {
                  setTechnicianFilter("");
                  setPriorityFilter("");
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "70vh" }}>
          {WORK_ORDER_STATUSES.map((status) => (
            <KanbanColumn
              key={status.value}
              status={status}
              workOrders={workOrdersByStatus[status.value] || []}
            />
          ))}
        </div>
        <DragOverlay>
          {activeId ? (
            <div className="bg-white rounded-lg p-4 border-2 border-blue-500 shadow-xl opacity-90">
              <p className="text-sm font-semibold">Moving work order...</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

