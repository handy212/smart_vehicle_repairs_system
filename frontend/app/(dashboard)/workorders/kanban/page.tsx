"use client";

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workordersApi, WorkOrder } from "@/lib/api/workorders";
import { adminApi, User } from "@/lib/api/admin";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PremiumIcons } from "@/components/ui/icons";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
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
  restrictToWindowEdges,
  snapCenterToCursor,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useInView } from "react-intersection-observer";

import {
  WORK_ORDER_STATUS_GROUPS,
  getStatusGroupForStatus,
  groupWorkOrdersByStatusGroup,
  type WorkOrderStatusGroupId,
} from "@/lib/utils/workorder-status-groups";
import { getStatusLabel, getStatusVariant } from "@/lib/utils/workorder-status";
import { getWorkOrderCustomerDisplayName } from "@/lib/utils/customer-display";
import { getWorkOrderStagePresentation } from "@/lib/utils/workorder-inspection-stage";
import { resolveKanbanDropStatus } from "@/lib/utils/workorder-transitions";

type KanbanGroup = (typeof WORK_ORDER_STATUS_GROUPS)[number];

interface KanbanColumnProps {
  group: KanbanGroup;
  workOrders: WorkOrder[];
}

function KanbanColumn({ group, workOrders }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useSortable({
    id: group.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[300px] max-w-[300px] bg-muted/50 rounded-lg p-2.5 border ${isOver ? "border-primary bg-primary/5" : "border-border"
        } transition-all flex flex-col`}
    >
      <div className="flex justify-between items-center mb-1 p-2 bg-card rounded border border-border shadow-sm">
        <h6 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{group.label}</h6>
        <div className="px-2 h-5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center text-[10px] font-bold">
          {workOrders.length}
        </div>
      </div>
      {"description" in group && group.description && (
        <p className="text-[10px] text-muted-foreground px-2 mb-2 leading-snug">{group.description}</p>
      )}

      <SortableContext
        items={workOrders.map((wo) => wo.id.toString())}
        strategy={verticalListSortingStrategy}
      >
        <div className="min-h-[500px] space-y-2 flex-1">
          {workOrders.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                <PremiumIcons.ClipboardList className="w-8 h-8 text-muted-foreground" />
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
  isOverlay?: boolean;
}

function WorkOrderCardUI({ workOrder, isOverlay }: WorkOrderCardProps) {
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

  const customerName = getWorkOrderCustomerDisplayName(workOrder);
  const stagePresentation = getWorkOrderStagePresentation(workOrder);

  const vehicleInfo = workOrder.vehicle_info || "-";

  return (
    <div
      className={`bg-card rounded border border-border transition-all p-3 ${isOverlay ? "shadow-xl border-primary ring-2 ring-primary/20 cursor-grabbing w-[260px]" : "cursor-move hover:shadow-md hover:border-primary/30"
        }`}
    >
      {/* Work Order Header */}
      <div className="flex justify-between items-start mb-2 gap-2">
        <Link
          href={`/workorders/${workOrder.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-bold text-primary hover:underline truncate"
        >
          {workOrder.work_order_number}
        </Link>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={getStatusVariant(workOrder.status) as any} className="text-[9px] px-1.5 h-4 font-bold tracking-tight capitalize">
            {stagePresentation.label || getStatusLabel(workOrder.status)}
          </Badge>
          <Badge variant={getPriorityVariant(workOrder.priority) as any} className="text-[9px] px-1.5 h-4 uppercase font-bold tracking-tight">
            {workOrder.priority}
          </Badge>
          {workOrder.is_overdue && (
            <Badge variant="danger" className="text-[9px] px-1.5 h-4 uppercase font-bold tracking-tight">
              Overdue
            </Badge>
          )}
          {workOrder.days_in_shop !== undefined && workOrder.days_in_shop > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5 h-4 uppercase font-bold tracking-tight bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900 dark:text-orange-100 border-orange-200">
              {workOrder.days_in_shop} Day{workOrder.days_in_shop > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* Customer Info */}
      <div className="flex items-center mb-2">
        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[9px] font-black flex items-center justify-center mr-2 border border-primary/20">
          {(customerName || "C")
            .split(" ")
            .filter(Boolean)
            .map((n: string) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)}
        </div>
        <div className="text-[11px] font-bold text-foreground truncate">{customerName}</div>
      </div>

      {/* Vehicle Info */}
      <div className="text-[10px] text-muted-foreground mb-2 flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <PremiumIcons.Wrench className="w-2.5 h-2.5" />
          <span className="truncate font-medium">{vehicleInfo}</span>
        </div>
        {workOrder.primary_technician_name && (
          <div className="flex items-center gap-1.5 opacity-80">
            <PremiumIcons.User className="w-2.5 h-2.5" />
            <span className="truncate">{workOrder.primary_technician_name}</span>
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/50">
        <span className="text-[10px] font-medium text-muted-foreground">
          {workOrder.created_at
            ? format(new Date(workOrder.created_at), "MMM d")
            : "-"}
        </span>
        <div className="flex items-center gap-1">
          <Link
            href={`/workorders/${workOrder.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center w-6 h-6 border border-border text-muted-foreground rounded hover:border-primary hover:text-primary transition-all"
            title="View Details"
          >
            <PremiumIcons.Eye className="w-3 h-3" />
          </Link>
          {workOrder.status !== "closed" && (
            <Link
              href={`/workorders/${workOrder.id}/edit`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center w-6 h-6 border border-border text-muted-foreground rounded hover:border-primary hover:text-primary transition-all"
              title="Edit"
            >
              <PremiumIcons.Edit className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkOrderCard({ workOrder }: { workOrder: WorkOrder }) {
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
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <WorkOrderCardUI workOrder={workOrder} />
    </div>
  );
}

export default function WorkOrderKanbanPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();

  const [technicianFilter, setTechnicianFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [myTasksOnly, setMyTasksOnly] = useState<boolean>(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Fetch technicians
  const { data: technicians } = useQuery({
    queryKey: ["technicians"],
    queryFn: () => adminApi.users.technicians(),
  });

  const {
    data: workOrdersData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ["workorders", "kanban", technicianFilter, priorityFilter, myTasksOnly, user?.id],
    queryFn: ({ pageParam = 1 }) =>
      workordersApi.list({
        page: pageParam as number,
        priority: priorityFilter && priorityFilter !== "all" ? priorityFilter : undefined,
        primary_technician: myTasksOnly && user?.id ? user.id : (technicianFilter && technicianFilter !== "all" ? parseInt(technicianFilter) : undefined),
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.next) {
        return allPages.length + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const { ref: observerRef, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

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
      let errorMessage = "Failed to update status";
      const errorData = error.response?.data;

      if (errorData) {
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (Array.isArray(errorData)) {
          errorMessage = errorData[0];
        } else if (errorData.detail) {
          errorMessage = typeof errorData.detail === 'string' ? errorData.detail : (Array.isArray(errorData.detail) ? errorData.detail[0] : JSON.stringify(errorData.detail));
        } else if (errorData.non_field_errors) {
          errorMessage = Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors[0] : errorData.non_field_errors;
        } else {
          // Flatten any other object errors
          const firstKey = Object.keys(errorData)[0];
          if (firstKey) {
            const firstError = errorData[firstKey];
            errorMessage = Array.isArray(firstError) ? firstError[0] : firstError;
          }
        }
      }

      toast({
        title: "Transition Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Group work orders by status group
  const workOrdersByGroup = useMemo(() => {
    const allWorkOrders: WorkOrder[] = [];
    workOrdersData?.pages.forEach((page) => {
      page.results?.forEach((wo) => allWorkOrders.push(wo));
    });
    return groupWorkOrdersByStatusGroup(allWorkOrders);
  }, [workOrdersData]);

  // Find active work order for overlay
  const activeWorkOrder = useMemo(() => {
    if (!activeId) return null;
    const workOrderId = parseInt(activeId);
    for (const page of workOrdersData?.pages || []) {
      const found = page.results?.find((wo) => wo.id === workOrderId);
      if (found) return found;
    }
    return null;
  }, [activeId, workOrdersData]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const workOrderId = parseInt(active.id as string);
    const targetGroupId = over.id as WorkOrderStatusGroupId;

    // Find the work order
    let workOrder: WorkOrder | undefined;
    if (workOrdersData?.pages) {
      for (const page of workOrdersData.pages) {
        const found = page.results?.find((wo) => wo.id === workOrderId);
        if (found) {
          workOrder = found;
          break;
        }
      }
    }
    if (!workOrder) return;

    const currentGroup = getStatusGroupForStatus(workOrder.status);
    if (currentGroup === targetGroupId) return;

    const newStatus = resolveKanbanDropStatus(workOrder, targetGroupId);
    if (!newStatus || workOrder.status === newStatus) {
      if (newStatus === null) {
        toast({
          title: "Move blocked",
          description:
            "This work order cannot skip to that stage. Open the work order and use the workflow actions instead.",
          variant: "destructive",
        });
      }
      return;
    }

    updateStatusMutation.mutate({ id: workOrderId, status: newStatus });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 pb-12">
        <div className="flex flex-col space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center space-x-2 text-sm mb-1">
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-8 w-48" />
            </div>
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "70vh" }}>
          {WORK_ORDER_STATUS_GROUPS.map((group) => (
            <div key={group.id} className="min-w-[300px] max-w-[300px] bg-muted/50 rounded-lg p-2.5 border border-border flex flex-col">
              <div className="flex justify-between items-center mb-3 p-2 bg-card rounded border border-border shadow-sm">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-8 rounded-full" />
              </div>
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-28 w-full rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
              <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
              <span>/</span>
              <Link href="/workorders" className="hover:text-primary transition-colors">Work Orders</Link>
              <span>/</span>
              <span className="text-foreground font-medium">Kanban Board</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Work Order Flow
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/workorders">
              <Button variant="outline" size="sm" className="h-9 border-border text-xs font-semibold">
                <PremiumIcons.ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                List View
              </Button>
            </Link>
            <Link href="/workorders/new">
              <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-sm text-xs font-bold uppercase tracking-wider">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Work Order
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-none shadow-sm bg-card/60 backdrop-blur-md ring-1 ring-gray-900/5">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex items-center space-x-2 border-r border-border pr-6 mr-2">
              <Switch
                id="my-tasks"
                checked={myTasksOnly}
                onCheckedChange={setMyTasksOnly}
              />
              <Label htmlFor="my-tasks" className="font-medium">My Orders Only</Label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">
                  Technician
                </label>
                <Select
                  value={technicianFilter}
                  onValueChange={(val) => setTechnicianFilter(val)}
                  disabled={myTasksOnly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Technicians" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Technicians</SelectItem>
                    {technicians?.map((tech: User) => (
                      <SelectItem key={tech.id} value={tech.id.toString()}>
                        {tech.first_name} {tech.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">
                  Priority
                </label>
                <Select
                  value={priorityFilter}
                  onValueChange={(val) => setPriorityFilter(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Priorities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setTechnicianFilter("");
                    setPriorityFilter("");
                    setMyTasksOnly(false);
                  }}
                >
                  <PremiumIcons.RefreshCw className="w-4 h-4 mr-2" />
                  Clear Filters
                </Button>
              </div>
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
        modifiers={[restrictToWindowEdges, snapCenterToCursor]}
      >
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "70vh" }}>
          {WORK_ORDER_STATUS_GROUPS.map((group) => (
            <KanbanColumn
              key={group.id}
              group={group}
              workOrders={workOrdersByGroup[group.id] || []}
            />
          ))}
        </div>

        {hasNextPage && (
          <div ref={observerRef} className="h-10 w-full flex items-center justify-center mt-4">
            {isFetchingNextPage && <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>}
          </div>
        )}

        <DragOverlay>
          {activeWorkOrder ? (
            <div className="opacity-90 scale-105 rotate-3 transition-transform cursor-grabbing overflow-hidden">
              <WorkOrderCardUI workOrder={activeWorkOrder} isOverlay={true} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
