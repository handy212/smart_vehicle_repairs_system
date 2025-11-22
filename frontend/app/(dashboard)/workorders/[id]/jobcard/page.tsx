"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { workordersApi } from "@/lib/api/workorders";
import { format } from "date-fns";
import { useEffect } from "react";

export default function JobCardPrintPage() {
  const params = useParams();
  const router = useRouter();
  const workOrderId = parseInt(params.id as string);

  const { data: workOrder, isLoading } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId),
  });

  // Trigger print when component loads
  useEffect(() => {
    if (workOrder && !isLoading) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [workOrder, isLoading]);

  if (isLoading || !workOrder) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const customer = typeof workOrder.customer === "object" && workOrder.customer !== null
    ? workOrder.customer
    : null;
  
  const vehicle = typeof workOrder.vehicle === "object" && workOrder.vehicle !== null
    ? workOrder.vehicle
    : null;

  return (
    <div className="jobcard-print-wrapper">
      {/* Print styles */}
      <style jsx global>{`
        /* Print media query */
        @media print {
          /* Hide navigation and sidebar */
          nav,
          aside,
          header,
          [class*="sidebar"],
          [class*="navigation"],
          [data-sidebar],
          [role="navigation"],
          [role="complementary"],
          [role="banner"],
          .no-print,
          button {
            display: none !important;
            visibility: hidden !important;
          }

          /* Force white background */
          body {
            background: white !important;
          }

          html {
            background: white !important;
          }

          /* Make jobcard wrapper fill viewport for print */
          .jobcard-print-wrapper {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            min-height: 100vh !important;
            background: white !important;
            margin: 0 !important;
            padding: 0.5in !important;
            z-index: 999999 !important;
            display: block !important;
            visibility: visible !important;
          }

          /* Ensure jobcard content is visible */
          .jobcard-content {
            background: white !important;
            color: #000000 !important;
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            display: block !important;
            visibility: visible !important;
          }

          /* Ensure all content inside is visible and styled for print */
          .jobcard-print-wrapper * {
            visibility: visible !important;
            color: #000000 !important;
          }

          /* Ensure text colors are black for print */
          .jobcard-content p,
          .jobcard-content h1,
          .jobcard-content h2,
          .jobcard-content span,
          .jobcard-content div {
            color: #000000 !important;
          }

          /* Make sure borders and backgrounds show */
          .jobcard-content .border-2,
          .jobcard-content .border-gray-800,
          .jobcard-content .border-gray-300,
          .jobcard-content .border-b {
            border-color: #000000 !important;
          }

          /* Ensure grid works in print */
          .grid {
            display: grid !important;
          }

          /* Page margins */
          @page {
            size: letter;
            margin: 0.5in;
          }
        }

        /* Screen styles */
        @media screen {
          .jobcard-print-wrapper {
            max-width: 800px;
            margin: 2rem auto;
            padding: 2rem;
          }
        }
      `}</style>

      <div className="jobcard-content bg-white">

        <div className="border-2 border-gray-800 p-8 space-y-6">
          {/* Header */}
          <div className="text-center border-b-2 border-gray-800 pb-4">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">JOB CARD</h1>
            <p className="text-sm text-gray-600">Repair Service Request Acknowledgment</p>
          </div>

          {/* Work Order Info */}
          <div className="grid grid-cols-2 gap-4 border-b border-gray-300 pb-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Job Card Number</p>
              <p className="text-lg font-bold text-gray-900">{workOrder.work_order_number}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Date</p>
              <p className="text-lg font-semibold text-gray-900">
                {workOrder.created_at 
                  ? format(new Date(workOrder.created_at), "MMMM dd, yyyy")
                  : "-"}
              </p>
            </div>
          </div>

          {/* Customer Information */}
          <div className="border-b border-gray-300 pb-4">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Customer Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 mb-1">Name:</p>
                <p className="font-semibold text-gray-900">
                  {customer?.full_name || workOrder.customer_name || "-"}
                </p>
              </div>
              {customer?.phone && (
                <div>
                  <p className="text-gray-500 mb-1">Phone:</p>
                  <p className="font-semibold text-gray-900">{customer.phone}</p>
                </div>
              )}
              {customer?.email && (
                <div className="col-span-2">
                  <p className="text-gray-500 mb-1">Email:</p>
                  <p className="font-semibold text-gray-900 break-words">{customer.email}</p>
                </div>
              )}
            </div>
          </div>

          {/* Vehicle Information */}
          <div className="border-b border-gray-300 pb-4">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Vehicle Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {vehicle && (
                <>
                  <div>
                    <p className="text-gray-500 mb-1">Make/Model:</p>
                    <p className="font-semibold text-gray-900">
                      {vehicle.make} {vehicle.model} {vehicle.year}
                    </p>
                  </div>
                  {vehicle.license_plate && (
                    <div>
                      <p className="text-gray-500 mb-1">License Plate:</p>
                      <p className="font-semibold text-gray-900">{vehicle.license_plate}</p>
                    </div>
                  )}
                  {vehicle.vin && (
                    <div className="col-span-2">
                      <p className="text-gray-500 mb-1">VIN:</p>
                      <p className="font-semibold text-gray-900 font-mono text-xs">{vehicle.vin}</p>
                    </div>
                  )}
                </>
              )}
              {!vehicle && workOrder.vehicle_info && (
                <div>
                  <p className="text-gray-500 mb-1">Vehicle:</p>
                  <p className="font-semibold text-gray-900">{workOrder.vehicle_info}</p>
                </div>
              )}
            </div>
          </div>

          {/* Customer Concerns */}
          {workOrder.customer_concerns && (
            <div className="border-b border-gray-300 pb-4">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Service Request Description</h2>
              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                  {workOrder.customer_concerns}
                </p>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="border-b border-gray-300 pb-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 mb-1">Status:</p>
                <p className="font-semibold text-gray-900 capitalize">
                  {workOrder.status?.replace("_", " ") || "-"}
                </p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Priority:</p>
                <p className="font-semibold text-gray-900 capitalize">
                  {workOrder.priority || "-"}
                </p>
              </div>
            </div>
          </div>

          {/* Footer Message */}
          <div className="pt-4 text-center border-t-2 border-gray-800">
            <p className="text-xs text-gray-600 mb-2">
              This Job Card confirms that repair services have been requested for the above vehicle.
            </p>
            <p className="text-xs text-gray-500">
              Please keep this card for your records. We will contact you when your vehicle is ready for pickup.
            </p>
            {workOrder.created_at && (
              <p className="text-xs text-gray-400 mt-4">
                Generated on {format(new Date(workOrder.created_at), "MMMM dd, yyyy 'at' h:mm a")}
              </p>
            )}
          </div>
        </div>

        {/* Back button (hidden when printing) */}
        <div className="no-print mt-8 text-center">
          <button
            onClick={() => router.push(`/workorders/${workOrderId}`)}
            className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Back to Work Order
          </button>
        </div>
      </div>
    </div>
  );
}

