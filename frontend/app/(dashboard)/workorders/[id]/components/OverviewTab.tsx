"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Car, DollarSign, Calendar, Wrench } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
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
          <CardContent className="space-y-4">
            <div className="flex items-start space-x-3">
              <User className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-500">Customer</p>
                {workOrder.customer ? (
                  <Link
                    href={`/customers/${typeof workOrder.customer === 'object' && workOrder.customer !== null ? workOrder.customer.id : workOrder.customer}`}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {workOrder.customer_name || "View Customer"}
                  </Link>
                ) : (
                  <p className="text-gray-900">{workOrder.customer_name || "-"}</p>
                )}
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Car className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-500">Vehicle</p>
                {workOrder.vehicle ? (
                  <Link
                    href={`/vehicles/${typeof workOrder.vehicle === 'object' && workOrder.vehicle !== null ? workOrder.vehicle.id : workOrder.vehicle}`}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {workOrder.vehicle_info || "View Vehicle"}
                  </Link>
                ) : (
                  <p className="text-gray-900">{workOrder.vehicle_info || "-"}</p>
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

