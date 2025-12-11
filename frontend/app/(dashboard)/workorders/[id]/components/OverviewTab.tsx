"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Car, DollarSign, Calendar, Wrench, AlertCircle, Link as LinkIcon, FileText, Edit2, Save, X } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { workordersApi } from "@/lib/api/workorders";
import { adminApi } from "@/lib/api/admin";
import { useToast } from "@/lib/hooks/useToast";

interface OverviewTabProps {
  workOrder: any;
  onStatusChange?: () => void;
}

export default function WorkOrderOverviewTab({ workOrder, onStatusChange }: OverviewTabProps) {
  const [isEditingServiceCoordinator, setIsEditingServiceCoordinator] = useState(false);
  const [selectedServiceCoordinator, setSelectedServiceCoordinator] = useState<string>(() => {
    const sc = workOrder?.service_coordinator;
    if (!sc || sc === null) return "";
    if (typeof sc === "object" && "id" in sc) {
      return String(sc.id);
    }
    if (typeof sc === "number") {
      return String(sc);
    }
    return "";
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const workOrderId = workOrder?.id;
  
  // Fetch service coordinators
  const { data: serviceCoordinators } = useQuery({
    queryKey: ["service-coordinators"],
    queryFn: () => adminApi.users.serviceCoordinators(),
  });
  
  const serviceCoordinatorsList = serviceCoordinators || [];
  
  // Update service coordinator mutation
  const updateServiceCoordinatorMutation = useMutation({
    mutationFn: async (serviceCoordinatorId: number | null) => {
      if (!workOrderId) throw new Error("Work order ID is required");
      return workordersApi.update(workOrderId, { 
        service_coordinator: serviceCoordinatorId || undefined 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
      setIsEditingServiceCoordinator(false);
      toast({
        title: "Success",
        description: "Service Coordinator assigned successfully",
        variant: "success",
      });
      onStatusChange?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.detail || "Failed to assign Service Coordinator",
        variant: "destructive",
      });
    },
  });
  
  const handleSaveServiceCoordinator = () => {
    const scId = selectedServiceCoordinator ? Number(selectedServiceCoordinator) : null;
    updateServiceCoordinatorMutation.mutate(scId);
  };
  
  const handleCancelEdit = () => {
    setSelectedServiceCoordinator(() => {
      const sc = workOrder?.service_coordinator;
      if (!sc || sc === null) return "";
      if (typeof sc === "object" && "id" in sc) {
        return String(sc.id);
      }
      if (typeof sc === "number") {
        return String(sc);
      }
      return "";
    });
    setIsEditingServiceCoordinator(false);
  };
  
  const getServiceCoordinatorName = () => {
    const sc = workOrder?.service_coordinator;
    if (!sc) return "Not assigned";
    if (typeof sc === "object" && sc !== null) {
      // Try full_name first, then fallback to first_name + last_name
      if (sc.full_name) return sc.full_name;
      if (sc.first_name || sc.last_name) {
        return `${sc.first_name || ''} ${sc.last_name || ''}`.trim() || "Not assigned";
      }
      return "Not assigned";
    }
    // If it's just an ID, try to find in the list
    const coordinator = serviceCoordinatorsList.find((c: any) => c.id === sc);
    if (coordinator) {
      // Try full_name first, then fallback to first_name + last_name
      if (coordinator.full_name) return coordinator.full_name;
      if (coordinator.first_name || coordinator.last_name) {
        return `${coordinator.first_name || ''} ${coordinator.last_name || ''}`.trim() || "Not assigned";
      }
    }
    return "Not assigned";
  };
  
  const canEditServiceCoordinator = workOrder?.status === "intake" || workOrder?.status === "draft" || workOrder?.status === "inspection";
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Work Order Info */}
      <div className="lg:col-span-2 space-y-6">
        {/* Customer & Vehicle */}
        <Card>
  <CardHeader>
    <CardTitle>Customer & Vehicle</CardTitle>
  </CardHeader>
          <CardContent className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Customer */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <User className="w-5 h-5 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Customer</h3>
                </div>
                {workOrder.customer ? (
                  <>
        <div>
                      {typeof workOrder.customer === "object" && workOrder.customer !== null ? (
                        <Link
                          href={`/customers/${workOrder.customer.id}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-base"
                        >
                          {workOrder.customer.full_name || workOrder.customer_name || "View Customer"}
                        </Link>
                      ) : (
            <Link
                          href={`/customers/${workOrder.customer}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-base"
            >
              {workOrder.customer_name || "View Customer"}
            </Link>
                      )}
                    </div>
                    {typeof workOrder.customer === "object" && workOrder.customer !== null && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 space-y-2">
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                          Customer Information
                        </div>
                        <div className="space-y-2 text-sm">
                          {workOrder.customer.phone && (
                            <div className="flex items-start">
                              <span className="font-medium text-gray-700 dark:text-gray-300 w-20 flex-shrink-0">Phone:</span>
                              <span className="text-gray-900 dark:text-gray-100">{workOrder.customer.phone}</span>
                            </div>
                          )}
                          {workOrder.customer.email && (
                            <div className="flex items-start">
                              <span className="font-medium text-gray-700 dark:text-gray-300 w-20 flex-shrink-0">Email:</span>
                              <span className="text-gray-900 dark:text-gray-100 break-words">{workOrder.customer.email}</span>
                            </div>
                          )}
                          {workOrder.customer.customer_type && (
                            <div className="flex items-start">
                              <span className="font-medium text-gray-700 dark:text-gray-300 w-20 flex-shrink-0">Type:</span>
                              <span className="text-gray-900 dark:text-gray-100 capitalize">
                                {workOrder.customer.customer_type.replace('_', ' ')}
                              </span>
                            </div>
          )}
        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-900 dark:text-gray-100">{workOrder.customer_name || "-"}</p>
                )}
      </div>

      {/* Vehicle */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Car className="w-5 h-5 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Vehicle</h3>
                </div>
                {workOrder.vehicle ? (
                  <>
        <div>
                      {typeof workOrder.vehicle === "object" && workOrder.vehicle !== null ? (
                        <Link
                          href={`/vehicles/${workOrder.vehicle.id}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-base"
                        >
                          {workOrder.vehicle.year} {workOrder.vehicle.make} {workOrder.vehicle.model}
                        </Link>
                      ) : (
            <Link
                          href={`/vehicles/${workOrder.vehicle}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-base"
            >
              {workOrder.vehicle_info || "View Vehicle"}
            </Link>
                      )}
                    </div>
                    {typeof workOrder.vehicle === "object" && workOrder.vehicle !== null && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 space-y-2">
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                          Vehicle Information
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start">
                            <span className="font-medium text-gray-700 dark:text-gray-300 w-24 flex-shrink-0">Make/Model:</span>
                            <span className="text-gray-900 dark:text-gray-100">
                              {workOrder.vehicle.make} {workOrder.vehicle.model} {workOrder.vehicle.year}
                            </span>
                          </div>
                          {workOrder.vehicle.license_plate && (
                            <div className="flex items-start">
                              <span className="font-medium text-gray-700 dark:text-gray-300 w-24 flex-shrink-0">License:</span>
                              <span className="text-gray-900 dark:text-gray-100">{workOrder.vehicle.license_plate}</span>
                            </div>
                          )}
                          {workOrder.vehicle.vin && (
                            <div className="flex items-start">
                              <span className="font-medium text-gray-700 dark:text-gray-300 w-24 flex-shrink-0">VIN:</span>
                              <span className="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">{workOrder.vehicle.vin}</span>
                            </div>
          )}
        </div>
      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-900 dark:text-gray-100">{workOrder.vehicle_info || "-"}</p>
                )}
              </div>
    </div>
  </CardContent>
</Card>


        {/* Customer Concerns */}
        {workOrder.customer_concerns && (
          <Card>
            <CardHeader>
              <CardTitle>Customer Concerns</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {workOrder.customer_concerns}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Diagnosis Notes */}
        {(workOrder as any).diagnosis_notes && (
          <Card>
            <CardHeader>
              <CardTitle>Diagnosis Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {(workOrder as any).diagnosis_notes}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Special Instructions */}
        {(workOrder as any).special_instructions && (
          <Card>
            <CardHeader>
              <CardTitle>Special Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {(workOrder as any).special_instructions}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Related Work Orders / Warranty Rework */}
        {((workOrder as any).is_warranty_rework || (workOrder as any).related_work_order_detail || ((workOrder as any).rework_work_orders && (workOrder as any).rework_work_orders.length > 0)) && (
          <Card className="border-orange-200 dark:border-orange-800">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                <span>Related Work Orders</span>
                {(workOrder as any).is_warranty_rework && (
                  <Badge variant="warning" className="ml-2">Warranty Rework</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Original Work Order (if this is a rework) */}
              {(workOrder as any).related_work_order_detail && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-md border border-orange-200 dark:border-orange-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <LinkIcon className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Original Work Order
                      </span>
                    </div>
                    <Link href={`/workorders/${(workOrder as any).related_work_order_detail.id}`}>
                      <Badge variant="secondary" className="cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/40 border border-orange-300 dark:border-orange-700">
                        View
                      </Badge>
                    </Link>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p className="font-mono text-gray-900 dark:text-gray-100">
                      {(workOrder as any).related_work_order_detail.work_order_number}
                    </p>
                    {(workOrder as any).related_work_order_detail.completed_at && (
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Completed: {format(new Date((workOrder as any).related_work_order_detail.completed_at), "MMM dd, yyyy")}
                      </p>
                    )}
                    <p className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                      Status: {(workOrder as any).related_work_order_detail.status.replace("_", " ")}
                    </p>
                  </div>
                  {(workOrder as any).warranty_reason && (
                    <div className="mt-2 pt-2 border-t border-orange-200 dark:border-orange-800">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Warranty Reason:</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {(workOrder as any).warranty_reason}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Rework Work Orders (if this work order has been reworked) */}
              {(workOrder as any).rework_work_orders && (workOrder as any).rework_work_orders.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Subsequent Rework(s) ({((workOrder as any).rework_work_orders as any[]).length}):
                  </p>
                  <div className="space-y-2">
                    {((workOrder as any).rework_work_orders as any[]).map((rework: any) => (
                      <div key={rework.id} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                          <div>
                            <Link 
                              href={`/workorders/${rework.id}`}
                              className="font-mono text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {rework.work_order_number}
                            </Link>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              Created: {format(new Date(rework.created_at), "MMM dd, yyyy")}
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {rework.status.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right Column - Summary & Actions */}
      <div className="space-y-6">
        {/* Financial Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Financial Summary</CardTitle>
              {(workOrder as any).estimate && (
                <Link href={`/billing/estimates/${(workOrder as any).estimate}`}>
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    <FileText className="w-3 h-3 mr-1" />
                    View Estimate
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Estimated Labor</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                ${parseFloat((workOrder as any).estimated_labor_cost || "0").toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Estimated Parts</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                ${parseFloat((workOrder as any).estimated_parts_cost || "0").toFixed(2)}
              </span>
            </div>
            <div className="border-t dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Total</span>
                <span className={`text-lg font-bold ${
                  parseFloat((workOrder as any).estimated_total || "0") > 0 
                    ? "text-gray-900 dark:text-gray-100" 
                    : "text-gray-400"
                }`}>
                  ${parseFloat((workOrder as any).estimated_total || workOrder.total_cost || "0").toFixed(2)}
                </span>
              </div>
            </div>
            {(workOrder as any).actual_total && parseFloat((workOrder as any).actual_total) > 0 && (
              <>
                <div className="border-t dark:border-gray-700 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Actual Labor</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      ${parseFloat((workOrder as any).actual_labor_cost || "0").toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Actual Parts</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      ${parseFloat((workOrder as any).actual_parts_cost || "0").toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Actual Total</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      ${parseFloat((workOrder as any).actual_total).toFixed(2)}
                    </span>
                  </div>
                </div>
                {parseFloat((workOrder as any).estimated_total || "0") > 0 && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Variance</span>
                      <span className={`font-medium ${
                        parseFloat((workOrder as any).actual_total) > parseFloat((workOrder as any).estimated_total || "0")
                          ? "text-red-600 dark:text-red-400"
                          : "text-green-600 dark:text-green-400"
                      }`}>
                        {parseFloat((workOrder as any).actual_total) > parseFloat((workOrder as any).estimated_total || "0") ? "+" : ""}
                        ${(parseFloat((workOrder as any).actual_total) - parseFloat((workOrder as any).estimated_total || "0")).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Work Order Info */}
        <Card>
          <CardHeader>
            <CardTitle>Work Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-gray-500">Work Order Number</p>
              <p className="text-sm font-mono">{workOrder.work_order_number}</p>
            </div>
            {workOrder.created_at && (
              <div>
                <p className="text-xs text-gray-500">Created</p>
                <p className="text-sm">
                  {format(new Date(workOrder.created_at), "MMM dd, yyyy 'at' h:mm a")}
                </p>
              </div>
            )}
            {(workOrder as any).estimated_completion && (
              <div>
                <p className="text-xs text-gray-500">Estimated Completion</p>
                <p className="text-sm">
                  {format(new Date((workOrder as any).estimated_completion), "MMM dd, yyyy 'at' h:mm a")}
                </p>
              </div>
            )}
            {(workOrder as any).primary_technician_name && (
              <div>
                <p className="text-xs text-gray-500">Primary Technician</p>
                <p className="text-sm">{(workOrder as any).primary_technician_name}</p>
              </div>
            )}
            
            {/* Service Coordinator */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">
                  Service Coordinator {!workOrder?.service_coordinator && <span className="text-red-500">*</span>}
                </p>
                {canEditServiceCoordinator && !isEditingServiceCoordinator && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingServiceCoordinator(true)}
                    className="h-6 px-2 text-xs"
                  >
                    <Edit2 className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
              
              {isEditingServiceCoordinator ? (
                <div className="space-y-2">
                  <select
                    value={selectedServiceCoordinator}
                    onChange={(e) => setSelectedServiceCoordinator(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  >
                    <option value="">Select Service Coordinator</option>
                    {serviceCoordinatorsList.map((coord: any) => (
                      <option key={coord.id} value={String(coord.id)}>
                        {coord.full_name || `${coord.first_name || ''} ${coord.last_name || ''}`.trim() || `User ${coord.id}`}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSaveServiceCoordinator}
                      disabled={updateServiceCoordinatorMutation.isPending}
                      className="h-7 px-2 text-xs"
                    >
                      <Save className="w-3 h-3 mr-1" />
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                      disabled={updateServiceCoordinatorMutation.isPending}
                      className="h-7 px-2 text-xs"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className={`text-sm ${!workOrder?.service_coordinator ? "text-red-600 font-medium" : ""}`}>
                  {getServiceCoordinatorName()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

