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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
          /* Reset all margins and padding for print */
          * {
            box-sizing: border-box;
          }

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
            margin: 0 !important;
            padding: 0 !important;
          }

          html {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Hide everything except jobcard */
          body > *:not(.jobcard-print-wrapper) {
            display: none !important;
          }

          /* Hide everything except jobcard */
          body > *:not(.jobcard-print-wrapper) {
            display: none !important;
          }

          /* Make jobcard wrapper fill viewport for print - single page only */
          .jobcard-print-wrapper {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            z-index: 999999 !important;
            display: block !important;
            visibility: visible !important;
            overflow: visible !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
          }

          /* Ensure jobcard content is visible and fits on one page */
          .jobcard-content {
            background: white !important;
            color: #000000 !important;
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
            visibility: visible !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            height: auto !important;
            max-height: calc(11in - 0.7in) !important;
            overflow: hidden !important;
          }

          /* Prevent page breaks inside sections */
          .jobcard-content > div {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
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
          .jobcard-content .border-border,
          .jobcard-content .border-b {
            border-color: #000000 !important;
          }

          /* Ensure grid works in print */
          .grid {
            display: grid !important;
          }

          /* Optimize inner jobcard box - keep on single page with compact spacing */
          .print-jobcard-inner {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            overflow: visible !important;
            padding: 1rem !important;
          }

          .print-jobcard-inner .space-y-6 > * + * {
            margin-top: 0.75rem !important;
          }

          /* Reduce font sizes and spacing for compact print */
          .print-jobcard-inner h1 {
            font-size: 1.5rem !important;
            margin-bottom: 0.25rem !important;
            line-height: 1.2 !important;
          }

          .print-jobcard-inner h2 {
            font-size: 0.75rem !important;
            margin-bottom: 0.5rem !important;
            line-height: 1.3 !important;
          }

          .print-jobcard-inner p {
            margin-bottom: 0.25rem !important;
            line-height: 1.3 !important;
          }

          .print-jobcard-inner .pb-4 {
            padding-bottom: 0.5rem !important;
          }

          .print-jobcard-inner .pt-4 {
            padding-top: 0.5rem !important;
          }

          .print-jobcard-inner .mb-2 {
            margin-bottom: 0.25rem !important;
          }

          .print-jobcard-inner .mb-3 {
            margin-bottom: 0.5rem !important;
          }

          .print-jobcard-inner .gap-4 {
            gap: 0.5rem !important;
          }

          .print-jobcard-inner .border-b {
            padding-bottom: 0.5rem !important;
            margin-bottom: 0.5rem !important;
            page-break-after: avoid !important;
          }

          .print-jobcard-inner .text-lg {
            font-size: 1rem !important;
          }

          .print-jobcard-inner .text-3xl {
            font-size: 1.5rem !important;
          }

          /* Prevent orphaned sections and unwanted breaks */
          .jobcard-content > div > div {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Ensure sections don't split across pages */
          .jobcard-content .border-b {
            page-break-after: avoid !important;
          }

          /* Page margins - optimized for single page */
          @page {
            size: letter portrait;
            margin: 0.35in;
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

      <div className="jobcard-content bg-card">

        <div className="border-2 border-gray-800 p-8 space-y-6 print-jobcard-inner">
          {/* Header */}
          <div className="text-center border-b-2 border-gray-800 pb-4">
            <h1 className="text-3xl font-bold text-foreground mb-2">JOB CARD</h1>
            <p className="text-sm text-muted-foreground">Repair Service Request Acknowledgment</p>
          </div>

          {/* Work Order Info */}
          <div className="grid grid-cols-2 gap-4 border-b border-border pb-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Job Card Number</p>
              <p className="text-lg font-bold text-foreground">{workOrder.work_order_number}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Date</p>
              <p className="text-lg font-semibold text-foreground">
                {workOrder.created_at 
                  ? format(new Date(workOrder.created_at), "MMMM dd, yyyy")
                  : "-"}
              </p>
            </div>
          </div>

          {/* Customer Information */}
          <div className="border-b border-border pb-4">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wide mb-3">Customer Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Name:</p>
                <p className="font-semibold text-foreground">
                  {customer?.full_name || workOrder.customer_name || "-"}
                </p>
              </div>
              {customer?.phone && (
                <div>
                  <p className="text-muted-foreground mb-1">Phone:</p>
                  <p className="font-semibold text-foreground">{customer.phone}</p>
                </div>
              )}
              {customer?.email && (
                <div className="col-span-2">
                  <p className="text-muted-foreground mb-1">Email:</p>
                  <p className="font-semibold text-foreground break-words">{customer.email}</p>
                </div>
              )}
            </div>
          </div>

          {/* Vehicle Info */}
          <div className="border-b border-border pb-4">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wide mb-3">Vehicle Info</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {vehicle && (
                <>
                  <div>
                    <p className="text-muted-foreground mb-1">Make/Model:</p>
                    <p className="font-semibold text-foreground">
                      {vehicle.make} {vehicle.model} {vehicle.year}
                    </p>
                  </div>
                  {vehicle.license_plate && (
                    <div>
                      <p className="text-muted-foreground mb-1">License Plate:</p>
                      <p className="font-semibold text-foreground">{vehicle.license_plate}</p>
                    </div>
                  )}
                  {vehicle.vin && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground mb-1">VIN:</p>
                      <p className="font-semibold text-foreground font-mono text-xs">{vehicle.vin}</p>
                    </div>
                  )}
                </>
              )}
              {!vehicle && workOrder.vehicle_info && (
                <div>
                  <p className="text-muted-foreground mb-1">Vehicle:</p>
                  <p className="font-semibold text-foreground">{workOrder.vehicle_info}</p>
                </div>
              )}
            </div>
          </div>

          {/* Customer Concerns */}
          {workOrder.customer_concerns && (
            <div className="border-b border-border pb-4">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wide mb-3">Service Request Description</h2>
              <div className="bg-muted p-4 rounded border border-border">
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {workOrder.customer_concerns}
                </p>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="border-b border-border pb-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Status:</p>
                <p className="font-semibold text-foreground capitalize">
                  {workOrder.status?.replace("_", " ") || "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Priority:</p>
                <p className="font-semibold text-foreground capitalize">
                  {workOrder.priority || "-"}
                </p>
              </div>
            </div>
          </div>

          {/* Footer Message */}
          <div className="pt-4 text-center border-t-2 border-gray-800">
            <p className="text-xs text-muted-foreground mb-2">
              This Job Card confirms that repair services have been requested for the above vehicle.
            </p>
            <p className="text-xs text-muted-foreground">
              Please keep this card for your records. We will contact you when your vehicle is ready for pickup.
            </p>
            {workOrder.created_at && (
              <p className="text-xs text-muted-foreground mt-4">
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

