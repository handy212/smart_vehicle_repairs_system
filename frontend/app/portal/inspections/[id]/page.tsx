"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { inspectionsApi } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Calendar, Car, ArrowLeft, Download, CheckCircle, XCircle, AlertTriangle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function InspectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const inspectionId = parseInt(params.id as string);

  const { data: inspection, isLoading } = useQuery({
    queryKey: ["portal", "inspection", inspectionId],
    queryFn: () => inspectionsApi.get(inspectionId),
    enabled: !!inspectionId,
  });

  const handleDownload = () => {
    // Open print-friendly view
    window.open(`/portal/inspections/${inspectionId}/print`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Inspection not found</p>
        <Button onClick={() => router.push("/portal/history")}>Back to History</Button>
      </div>
    );
  }

  const getResultIcon = (result?: string) => {
    switch (result) {
      case "pass":
        return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case "fail":
        return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
      case "advisory":
        return <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />;
      default:
        return null;
    }
  };

  const getResultVariant = (result?: string) => {
    switch (result) {
      case "pass":
        return "success";
      case "fail":
        return "danger";
      case "advisory":
        return "warning";
      default:
        return "secondary";
    }
  };

  const getConditionVariant = (condition?: string) => {
    switch (condition) {
      case "excellent":
        return "success";
      case "good":
        return "info";
      case "fair":
        return "warning";
      case "poor":
      case "critical":
        return "danger";
      default:
        return "secondary";
    }
  };

  const results = inspection.results || [];
  const criticalIssues = results.filter((r: any) => r.needs_immediate_attention || r.is_critical);
  const failedItems = results.filter((r: any) => r.result === "fail");
  const advisoryItems = results.filter((r: any) => r.result === "advisory");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" onClick={() => router.back()} className="mb-2 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Inspection #{inspection.inspection_number || inspection.id}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Inspection Details</p>
        </div>
        <Button variant="secondary" onClick={handleDownload}>
          <Download className="w-4 h-4 mr-2" />
          Download PDF
        </Button>
      </div>

      {/* Critical Issues Alert */}
      {criticalIssues.length > 0 && (
        <Card className="bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900 dark:text-red-100">
                  Critical Issues Found
                </p>
                <p className="text-xs text-red-800 dark:text-red-200 mt-1">
                  {criticalIssues.length} item(s) require immediate attention.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inspection Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Search className="w-5 h-5" />
                <span>Inspection Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Inspection Number</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    #{inspection.inspection_number || inspection.id}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Inspection Date</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {format(new Date(inspection.inspection_date), "MMM d, yyyy")}
                  </p>
                </div>
                {inspection.vehicle_info && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Vehicle</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {inspection.vehicle_info}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Status</p>
                  <Badge variant="secondary">{inspection.status}</Badge>
                </div>
                {inspection.template_name && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Type</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {inspection.template_name}
                    </p>
                  </div>
                )}
                {inspection.overall_result && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Overall Result</p>
                    <Badge variant={getResultVariant(inspection.overall_result)}>
                      {inspection.overall_result_display || inspection.overall_result}
                    </Badge>
                  </div>
                )}
              </div>

              {inspection.odometer_reading && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Odometer Reading</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {inspection.odometer_reading.toLocaleString()} miles
                  </p>
                </div>
              )}

              {inspection.performed_by_name && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Performed By</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {inspection.performed_by_name}
                  </p>
                </div>
              )}

              {inspection.notes && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {inspection.notes}
                  </p>
                </div>
              )}

              {inspection.recommendations && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Recommendations</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {inspection.recommendations}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inspection Results */}
          {results.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Inspection Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {results.map((result: any) => (
                    <div
                      key={result.id}
                      className={`p-4 rounded-lg border ${
                        result.needs_immediate_attention || result.is_critical
                          ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950"
                          : "border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {getResultIcon(result.result)}
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            {result.item_name || "Item"}
                          </h4>
                          {result.category_name && (
                            <Badge variant="secondary" className="text-xs">
                              {result.category_name}
                            </Badge>
                          )}
                        </div>
                        {result.result && (
                          <Badge variant={getResultVariant(result.result)}>
                            {result.result_display || result.result}
                          </Badge>
                        )}
                      </div>

                      {result.condition && (
                        <div className="mb-2">
                          <Badge variant={getConditionVariant(result.condition)}>
                            {result.condition_display || result.condition}
                          </Badge>
                        </div>
                      )}

                      {result.text_note && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          {result.text_note}
                        </p>
                      )}

                      {result.recommendation && (
                        <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 rounded">
                          <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                            Recommendation:
                          </p>
                          <p className="text-xs text-blue-800 dark:text-blue-200">
                            {result.recommendation}
                          </p>
                        </div>
                      )}

                      {result.estimated_cost && (
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-2">
                          Estimated Cost: ${result.estimated_cost}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Items</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {inspection.total_items || results.length}
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Passed</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {inspection.pass_count || results.filter((r: any) => r.result === "pass").length}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Failed</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {inspection.fail_count || failedItems.length}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Advisory</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {inspection.advisory_count || advisoryItems.length}
                  </span>
                </div>
              </div>

              {inspection.completion_percentage !== undefined && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Completion</p>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${inspection.completion_percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {inspection.completion_percentage}% complete
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

