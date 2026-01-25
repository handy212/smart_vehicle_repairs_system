"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { workordersApi } from "@/lib/api/workorders";
import { workOrderTasksApi } from "@/lib/api/workorder-tasks";
import { workOrderPartsApi } from "@/lib/api/workorder-parts";
import { format } from "date-fns";
import { useEffect } from "react";

import { usePrint } from "@/lib/hooks/usePrint";
import { PrintLayout } from "@/components/print/PrintLayout";
import { PrintControls } from "@/components/print/PrintControls";
import { useCurrency } from "@/lib/hooks/useCurrency";
export default function WorkOrderPrintPage() {
  const { formatCurrency } = useCurrency();
  const { downloadPDF, isDownloading } = usePrint();
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

  const handleDownloadPDF = async () => {
    if (!workOrder) return;
    await downloadPDF({
      documentType: 'work_order',
      documentId: workOrderId,
      documentNumber: workOrder.work_order_number
    });
  };

  if (isLoading || !workOrder) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
    <div className="min-h-screen bg-gray-100">
      <PrintControls
        onPrint={() => window.print()}
        onDownloadPDF={handleDownloadPDF}
        isLoading={isDownloading}
      />

      <PrintLayout
        documentType="Work Order"
        documentNumber={workOrder.work_order_number}
        watermark={workOrder.status === 'completed' ? 'PAID' : (workOrder.status === 'draft' ? 'DRAFT' : null)}
        className="max-w-[1100px]" // Wider for landscape
        metaInfo={
          <>
            <div className="mb-1"><span className="font-bold text-gray-700">Date:</span> {format(new Date(workOrder.created_at), 'MMM dd, yyyy')}</div>
            <div className="mb-1"><span className="font-bold text-gray-700">Status:</span> <span className="uppercase font-semibold">{workOrder.status.replace('_', ' ')}</span></div>
            {workOrder.completed_at && (
              <div><span className="font-bold text-gray-700">Completed:</span> {format(new Date(workOrder.completed_at), 'MMM dd, yyyy')}</div>
            )}
          </>
        }
      >
        <style jsx global>{`
        @media print {
          @page {
            size: landscape;
            margin: 0.5cm;
          }
        }
      `}</style>

        {/* Header Info */}
        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <div className="font-bold text-gray-700 uppercase mb-1">Customer</div>
            <div className="font-semibold text-lg">{customerName}</div>
          </div>
          <div>
            <div className="font-bold text-gray-700 uppercase mb-1">Vehicle</div>
            <div className="font-semibold text-lg">{vehicleInfo || 'N/A'}</div>
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
                      <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(unitCost)}</td>
                      <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(lineTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={4} className="border border-gray-300 px-3 py-2 text-right">Total Parts:</td>
                  <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(totalPartsCost)}</td>
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
                    <td className="border border-gray-300 px-3 py-2 text-right">{formatCurrency(subtotal)}</td>
                  </tr>
                  <tr className="bg-gray-100">
                    <td className="border border-gray-300 px-3 py-2 text-right font-bold text-lg">TOTAL:</td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-bold text-lg">{formatCurrency(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Notes */}
        <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-gray-300 page-break-avoid">
          <div>
            <div className="text-xs font-bold uppercase mb-8">Service Advisor Signature</div>
            <div className="border-b border-gray-400 w-3/4"></div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase mb-8">Technician Signature</div>
            <div className="border-b border-gray-400 w-3/4"></div>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-gray-500">
          Internal Work Order - Not an Invoice
        </div>
      </PrintLayout>
    </div>
  );
}

