"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { inspectionsApi } from "@/lib/api/inspections";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export default function InspectionPrintPage() {
  const params = useParams();
  const inspectionId = parseInt(params.id as string);

  const { data: inspection, isLoading } = useQuery({
    queryKey: ["portal", "inspection", inspectionId],
    queryFn: () => inspectionsApi.get(inspectionId),
    enabled: !!inspectionId,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="p-8 text-center">
        <p>Inspection not found</p>
      </div>
    );
  }

  const inspectionData = inspection as any;
  const results = inspectionData.results || [];
  const criticalIssues = results.filter((r: any) => r.needs_immediate_attention || r.is_critical);
  const failedItems = results.filter((r: any) => r.result === "fail");
  const advisoryItems = results.filter((r: any) => r.result === "advisory");
  const passedItems = results.filter((r: any) => r.result === "pass");

  const getResultIcon = (result?: string) => {
    switch (result) {
      case "pass":
        return <CheckCircle className="w-4 h-4 text-success" />;
      case "fail":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "advisory":
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getOverallStatus = () => {
    if (failedItems.length > 0 || criticalIssues.length > 0) return "FAILED";
    if (advisoryItems.length > 0) return "ADVISORY";
    if (passedItems.length > 0) return "PASSED";
    return "PENDING";
  };

  return (
    <div className="min-h-screen bg-card p-8 print:p-4">
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 1cm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="mb-8 border-b-2 border-border pb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">VEHICLE INSPECTION REPORT</h1>
            <p className="text-muted-foreground">Inspection #{inspectionData.inspection_number || inspectionData.id}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">
              Date: {format(new Date(inspectionData.inspection_date || inspectionData.created_at), "MMMM d, yyyy")}
            </p>
            <p className="text-sm font-semibold text-foreground mt-2">
              Status: <span className="uppercase">{getOverallStatus()}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Vehicle & Customer Info */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h2 className="font-semibold text-foreground mb-2">Vehicle Info:</h2>
          {inspectionData.vehicle && (
            <div className="text-foreground">
              <p className="font-medium">
                {typeof inspectionData.vehicle === "object"
                  ? `${inspectionData.vehicle.year || ""} ${inspectionData.vehicle.make || ""} ${inspectionData.vehicle.model || ""}`.trim()
                  : inspectionData.vehicle}
              </p>
              {typeof inspectionData.vehicle === "object" && inspectionData.vehicle.vin && (
                <p className="text-sm mt-1">VIN: {inspectionData.vehicle.vin}</p>
              )}
              {typeof inspectionData.vehicle === "object" && inspectionData.vehicle.license_plate && (
                <p className="text-sm">License: {inspectionData.vehicle.license_plate}</p>
              )}
            </div>
          )}
        </div>
        <div>
          <h2 className="font-semibold text-foreground mb-2">Customer:</h2>
          {inspectionData.customer && (
            <div className="text-foreground">
              <p className="font-medium">
                {typeof inspectionData.customer === "object"
                  ? `${(inspectionData.customer as any).first_name || ""} ${(inspectionData.customer as any).last_name || ""}`.trim()
                  : inspectionData.customer}
              </p>
            </div>
          )}
          {inspectionData.inspector && (
            <>
              <h2 className="font-semibold text-foreground mb-2 mt-4">Inspector:</h2>
              <p className="text-foreground">
                {typeof inspectionData.inspector === "object"
                  ? `${(inspectionData.inspector as any).first_name || ""} ${(inspectionData.inspector as any).last_name || ""}`.trim()
                  : inspectionData.inspector}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      {(criticalIssues.length > 0 || failedItems.length > 0 || advisoryItems.length > 0) && (
        <div className="mb-8 p-4 bg-muted border border-border rounded">
          <h3 className="font-semibold text-foreground mb-3">Summary</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {failedItems.length > 0 && (
              <div>
                <span className="font-medium text-red-600">Failed Items: {failedItems.length}</span>
              </div>
            )}
            {criticalIssues.length > 0 && (
              <div>
                <span className="font-medium text-red-600">Critical Issues: {criticalIssues.length}</span>
              </div>
            )}
            {advisoryItems.length > 0 && (
              <div>
                <span className="font-medium text-yellow-600">Advisories: {advisoryItems.length}</span>
              </div>
            )}
            {passedItems.length > 0 && (
              <div>
                <span className="font-medium text-success">Passed: {passedItems.length}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inspection Results */}
      {results.length > 0 && (
        <div className="mb-8">
          <h3 className="font-semibold text-foreground mb-4">Inspection Results</h3>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted border-b-2 border-border">
                <th className="text-left p-3 font-semibold text-foreground">Component</th>
                <th className="text-left p-3 font-semibold text-foreground">Condition</th>
                <th className="text-left p-3 font-semibold text-foreground">Result</th>
                <th className="text-left p-3 font-semibold text-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item: any, index: number) => (
                <tr key={index} className="border-b border-border">
                  <td className="p-3 text-foreground font-medium">{item.component_name || item.component || "N/A"}</td>
                  <td className="p-3 text-foreground capitalize">{item.condition || "N/A"}</td>
                  <td className="p-3">
                    <div className="flex items-center space-x-2">
                      {getResultIcon(item.result)}
                      <span className="capitalize font-medium">
                        {item.result === "pass"
                          ? "Pass"
                          : item.result === "fail"
                          ? "Fail"
                          : item.result === "advisory"
                          ? "Advisory"
                          : "N/A"}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-foreground text-sm">{item.notes || item.comments || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Critical Issues */}
      {criticalIssues.length > 0 && (
        <div className="mb-8 p-4 bg-red-50 border border-red-300 rounded">
          <h3 className="font-semibold text-red-900 mb-3">⚠️ Critical Issues Requiring Immediate Attention</h3>
          <ul className="list-disc list-inside space-y-2 text-sm text-red-800">
            {criticalIssues.map((item: any, index: number) => (
              <li key={index}>
                <strong>{item.component_name || item.component}:</strong> {item.notes || item.comments || "Critical issue detected"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {inspectionData.recommendations && (
        <div className="mb-8">
          <h3 className="font-semibold text-foreground mb-3">Recommendations</h3>
          <p className="text-foreground whitespace-pre-wrap">{inspectionData.recommendations}</p>
        </div>
      )}

      {/* Notes */}
      {inspectionData.notes && (
        <div className="mb-8">
          <h3 className="font-semibold text-foreground mb-3">Additional Notes</h3>
          <p className="text-foreground whitespace-pre-wrap">{inspectionData.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-border text-center text-sm text-muted-foreground">
        <p>This inspection report is for informational purposes only.</p>
        <p className="mt-2">
          Inspection performed on {format(new Date(inspectionData.inspection_date || inspectionData.created_at), "MMMM d, yyyy 'at' h:mm a")}
        </p>
      </div>

      {/* Print Button (hidden when printing) */}
      <div className="no-print mt-8 text-center">
        <button
          onClick={() => window.print()}
          className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
        >
          Print Inspection Report
        </button>
      </div>
    </div>
  );
}

