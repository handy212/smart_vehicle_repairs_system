"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Car, DollarSign, Calendar, Wrench, AlertCircle, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import WorkflowActions from "./WorkflowActions";

interface OverviewTabProps {
  workOrder: any;
  onStatusChange?: () => void;
}

export default function WorkOrderOverviewTab({ workOrder, onStatusChange }: OverviewTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Work Order Info */}
      <div className="lg:col-span-2 space-y-6">
        {/* Customer & Vehicle */}
        <Card>
  <CardHeader>
    <CardTitle>Customer & Vehicle</CardTitle>
  </CardHeader>

  <CardContent>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

      {/* Customer */}
      <div className="flex items-start space-x-3">
        <User className="w-5 h-5 text-gray-400 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-gray-500">Customer</p>

          {workOrder.customer ? (
            <Link
              href={`/customers/${
                typeof workOrder.customer === "object" && workOrder.customer !== null
                  ? workOrder.customer.id
                  : workOrder.customer
              }`}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {workOrder.customer_name || "View Customer"}
            </Link>
          ) : (
            <p className="text-gray-900">{workOrder.customer_name || "-"}</p>
          )}
        </div>
      </div>

      {/* Vehicle */}
      <div className="flex items-start space-x-3">
        <Car className="w-5 h-5 text-gray-400 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-gray-500">Vehicle</p>

          {workOrder.vehicle ? (
            <Link
              href={`/vehicles/${
                typeof workOrder.vehicle === "object" && workOrder.vehicle !== null
                  ? workOrder.vehicle.id
                  : workOrder.vehicle
              }`}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {workOrder.vehicle_info || "View Vehicle"}
            </Link>
          ) : (
            <p className="text-gray-900">{workOrder.vehicle_info || "-"}</p>
          )}
        </div>
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
        {/* Workflow Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Workflow Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkflowActions
              workOrderId={workOrder.id}
              status={workOrder.status}
              onStatusChange={onStatusChange}
            />
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(workOrder as any).estimated_labor_cost && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Estimated Labor</span>
                <span className="text-sm font-medium text-gray-900">
                  ${parseFloat((workOrder as any).estimated_labor_cost || "0").toFixed(2)}
                </span>
              </div>
            )}
            {(workOrder as any).estimated_parts_cost && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Estimated Parts</span>
                <span className="text-sm font-medium text-gray-900">
                  ${parseFloat((workOrder as any).estimated_parts_cost || "0").toFixed(2)}
                </span>
              </div>
            )}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Estimated Total</span>
                <span className="text-lg font-bold text-gray-900">
                  ${parseFloat((workOrder as any).estimated_total || workOrder.total_cost || "0").toFixed(2)}
                </span>
              </div>
            </div>
            {(workOrder as any).actual_total && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Actual Total</span>
                <span className="text-lg font-bold text-gray-900">
                  ${parseFloat((workOrder as any).actual_total).toFixed(2)}
                </span>
              </div>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

