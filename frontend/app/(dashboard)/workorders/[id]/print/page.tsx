"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { workordersApi } from "@/lib/api/workorders";
import { workOrderTasksApi } from "@/lib/api/workorder-tasks";
import { workOrderPartsApi } from "@/lib/api/workorder-parts";
import { format } from "date-fns";
import { useEffect } from "react";

export default function WorkOrderPrintPage() {
  const params = useParams();
  const workOrderId = parseInt(params.id as string);

  const { data: workOrder, isLoading } = useQuery({
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

  useEffect(() => {
    if (!isLoading && workOrder) {
      // Auto-print when page loads
      window.print();
    }
  }, [isLoading, workOrder]);

  if (isLoading || !workOrder) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Use fields from workOrder directly
  const customerName = workOrder.customer_name || 'Customer';
  const vehicleInfo = workOrder.vehicle_info;

  const totalPartsCost = parts.reduce((sum, part) => {
    const cost = parseFloat(part.unit_cost || '0') * (part.quantity || 0);
    return sum + cost;
  }, 0);

  // Calculate labor cost from actual_hours if available
  const totalLaborCost = tasks.reduce((sum, task) => {
    // Labor cost would need to be calculated from hours and rate
    // For now, just return 0 or calculate if we have the data
    return sum;
  }, 0);

  const subtotal = totalPartsCost + totalLaborCost;
  const total = parseFloat(workOrder.total_cost || '0') || subtotal;

  return (
    <div className="print-container p-8 max-w-4xl mx-auto bg-white">
      <style jsx global>{`
        @media print {
          @page {
            margin: 1cm;
          }
          body {
            background: white;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            box-shadow: none;
          }
          /* Hide dashboard layout elements */
          nav,
          aside,
          header,
          [class*="Navbar"],
          [class*="Sidebar"],
          [class*="SubNav"],
          nav[class*="fixed"],
          aside[class*="fixed"] {
            display: none !important;
            visibility: hidden !important;
          }
          /* Reset main content margin for print */
          main {
            margin-left: 0 !important;
            padding-top: 0 !important;
            padding: 0 !important;
          }
          /* Hide any other dashboard elements */
          [class*="dashboard-layout"],
          [class*="dashboardLayout"],
          div[class*="min-h-screen"] > nav,
          div[class*="min-h-screen"] > aside {
            display: none !important;
            visibility: hidden !important;
          }
          /* Ensure print container is full width */
          .print-container {
            max-width: 100% !important;
            margin: 0 auto !important;
          }
        }
        @media screen {
          .print-container {
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
        }
      `}</style>

      {/* Header */}
      <div className="mb-8 border-b-2 border-gray-800 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">WORK ORDER</h1>
            <p className="text-lg text-gray-600 mt-1">#{workOrder.work_order_number}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Date: {format(new Date(workOrder.created_at), 'MMM dd, yyyy')}</p>
            <p className="text-sm text-gray-600">Status: <span className="font-semibold uppercase">{workOrder.status.replace('_', ' ')}</span></p>
          </div>
        </div>
      </div>

      {/* Customer & Vehicle Info */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">CUSTOMER INFORMATION</h2>
          <div className="text-sm space-y-1">
            <p className="font-semibold">{customerName}</p>
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">Vehicle Info</h2>
          {vehicleInfo && (
            <div className="text-sm space-y-1">
              <p className="font-semibold">{vehicleInfo}</p>
            </div>
          )}
        </div>
      </div>

      {/* Work Order Details */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">WORK ORDER DETAILS</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><span className="font-semibold">Priority:</span> {workOrder.priority}</p>
          </div>
          <div>
            {workOrder.completed_at && (
              <p><span className="font-semibold">Completed:</span> {format(new Date(workOrder.completed_at), 'MMM dd, yyyy')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Tasks */}
      {tasks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">SERVICE TASKS</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 text-left">Task</th>
                <th className="border border-gray-300 px-3 py-2 text-left">Status</th>
                <th className="border border-gray-300 px-3 py-2 text-right">Hours</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td className="border border-gray-300 px-3 py-2">{task.description}</td>
                  <td className="border border-gray-300 px-3 py-2 capitalize">{task.status.replace('_', ' ')}</td>
                  <td className="border border-gray-300 px-3 py-2 text-right">
                    {task.actual_hours ? `${task.actual_hours} hrs` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={2} className="border border-gray-300 px-3 py-2 text-right">Total Hours:</td>
                <td className="border border-gray-300 px-3 py-2 text-right">
                  {tasks.reduce((sum, task) => sum + (task.actual_hours || 0), 0).toFixed(1)} hrs
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Parts */}
      {parts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2 border-b border-gray-300 pb-1">PARTS USED</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 text-left">Part Number</th>
                <th className="border border-gray-300 px-3 py-2 text-left">Description</th>
                <th className="border border-gray-300 px-3 py-2 text-right">Qty</th>
                <th className="border border-gray-300 px-3 py-2 text-right">Unit Cost</th>
                <th className="border border-gray-300 px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => {
                const unitCost = parseFloat(part.unit_cost || '0');
                const quantity = part.quantity || 0;
                const lineTotal = parseFloat(part.total_cost || '0') || (unitCost * quantity);
                return (
                  <tr key={part.id}>
                    <td className="border border-gray-300 px-3 py-2">{part.part_number || 'N/A'}</td>
                    <td className="border border-gray-300 px-3 py-2">{part.part_name || part.description || 'N/A'}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{quantity}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">${unitCost.toFixed(2)}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">${lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={4} className="border border-gray-300 px-3 py-2 text-right">Total Parts:</td>
                <td className="border border-gray-300 px-3 py-2 text-right">${totalPartsCost.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Totals */}
      <div className="mb-8">
        <div className="flex justify-end">
          <div className="w-64">
            <table className="w-full text-sm border-collapse">
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-3 py-2 text-right font-semibold">Subtotal:</td>
                  <td className="border border-gray-300 px-3 py-2 text-right">${subtotal.toFixed(2)}</td>
                </tr>
                <tr className="bg-gray-100">
                  <td className="border border-gray-300 px-3 py-2 text-right font-bold text-lg">TOTAL:</td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-bold text-lg">${total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 pt-4 border-t border-gray-300 text-xs text-gray-600 text-center">
        <p>This is a computer-generated work order. Please retain for your records.</p>
        {workOrder.completed_at && (
          <p className="mt-2">Completed: {format(new Date(workOrder.completed_at), 'MMM dd, yyyy h:mm a')}</p>
        )}
      </div>
    </div>
  );
}

