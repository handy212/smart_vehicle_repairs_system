"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inspectionsApi, VehicleInspection } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, AlertCircle, Send, Camera, FileText, Printer } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { usePrint } from "@/lib/hooks/usePrint";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";

const statusColors: Record<string, string> = {
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const resultColors: Record<string, string> = {
  pass: "bg-green-100 text-green-800",
  pass_with_advisory: "bg-yellow-100 text-yellow-800",
  fail: "bg-red-100 text-red-800",
  needs_attention: "bg-orange-100 text-orange-800",
};

const itemResultColors: Record<string, string> = {
  pass: "bg-green-100 text-green-800",
  fail: "bg-red-100 text-red-800",
  advisory: "bg-yellow-100 text-yellow-800",
  na: "bg-gray-100 text-gray-800",
};

export default function InspectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const inspectionId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { downloadPDF, isDownloading } = usePrint();

  const { data: inspection, isLoading } = useQuery({
    queryKey: ["inspection", inspectionId],
    queryFn: () => inspectionsApi.get(inspectionId),
  });

  const completeMutation = useMutation({
    mutationFn: () => inspectionsApi.complete(inspectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      toast({ title: "Success", description: "Inspection marked as completed", variant: "success" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => inspectionsApi.approve(inspectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      toast({ title: "Success", description: "Inspection approved", variant: "success" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => inspectionsApi.reject(inspectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      toast({ title: "Success", description: "Inspection rejected", variant: "success" });
    },
  });

  const sendToCustomerMutation = useMutation({
    mutationFn: () => inspectionsApi.sendToCustomer(inspectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      toast({ title: "Success", description: "Inspection sent to customer. The customer can now view and sign the report.", variant: "success" });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || error.response?.data?.detail || "Failed to send inspection to customer";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Inspection not found</p>
        <Link href="/inspections">
          <Button variant="secondary" className="mt-4">
            Back to Inspections
          </Button>
        </Link>
      </div>
    );
  }

  const template = typeof inspection.template === 'object' ? inspection.template : null;
  const vehicle = typeof inspection.vehicle === 'object' ? inspection.vehicle : null;

  // Group results by category
  const resultsByCategory: Record<string, NonNullable<typeof inspection.results>> = {};
  inspection.results?.forEach((result) => {
    const category = result.category_name || "Other";
    if (!resultsByCategory[category]) {
      resultsByCategory[category] = [];
    }
    resultsByCategory[category].push(result);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
            <span>/</span>
            <Link href="/inspections" className="hover:text-blue-600 transition-colors">Inspections</Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">#{inspection.inspection_number}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              Inspection Details
            </h1>
            <Badge variant="outline" className={statusColors[inspection.status] || "bg-gray-100 text-gray-800 border-gray-200"}>
              {inspection.status_display || inspection.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/inspections')} className="h-9">
            <ArrowLeft className="w-3.5 h-3.5 mr-2" />
            Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadPDF({
              documentType: 'inspection',
              documentId: inspectionId,
              documentNumber: inspection.inspection_number
            })}
            disabled={isDownloading}
            className="h-9"
          >
            <Printer className="w-3.5 h-3.5 mr-2" />
            {isDownloading ? 'Printing...' : 'Print Report'}
          </Button>
          {inspection.status === "in_progress" && (
            <Button
              size="sm"
              onClick={() => router.push(`/inspections/${inspectionId}/perform`)}
              disabled={completeMutation.isPending}
              className="h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-2" />
              Perform Inspection
            </Button>
          )}
          {inspection.status === "completed" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending}
                className="h-9 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                <XCircle className="w-3.5 h-3.5 mr-2" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="h-9 bg-green-600 hover:bg-green-700 text-white shadow-sm"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-2" />
                Approve
              </Button>
            </>
          )}
          {(inspection.status === "completed" || inspection.status === "approved") && !inspection.sent_to_customer_at && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendToCustomerMutation.mutate()}
              disabled={sendToCustomerMutation.isPending}
              className="h-9"
            >
              <Send className="w-3.5 h-3.5 mr-2" />
              Send to Customer
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-sm border-gray-200 dark:border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Overall Result</CardTitle>
          </CardHeader>
          <CardContent>
            {inspection.overall_result ? (
              <Badge
                variant="outline"
                className={
                  resultColors[inspection.overall_result] || "bg-gray-100 text-gray-800 border-gray-200"
                }
              >
                {inspection.overall_result_display || inspection.overall_result}
              </Badge>
            ) : (
              <span className="text-sm text-gray-400">Not available</span>
            )}
            <div className="mt-4 text-xs text-gray-500">
              Date: {format(new Date(inspection.inspection_date), "MMM dd, yyyy")}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200 dark:border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${inspection.completion_percentage || 0}%` }}
                />
              </div>
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                {inspection.completion_percentage || 0}%
              </span>
            </div>
            {inspection.result_counts && (
              <div className="mt-3 flex gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">{inspection.result_counts.pass} Pass</span>
                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">{inspection.result_counts.fail} Fail</span>
                <span className="px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-100">{inspection.result_counts.advisory} Advisory</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200 dark:border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Template</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={inspection.template_name || (template?.name || "N/A")}>
              {inspection.template_name || (template?.name || "N/A")}
            </p>
            {template && (
              <p className="text-xs text-gray-500 mt-1">
                {template.total_items || 0} inspection items
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm border-gray-200 dark:border-gray-800">
          <CardHeader className="pb-3 border-b bg-gray-50/50 dark:bg-gray-800/50">
            <CardTitle className="text-sm font-semibold text-gray-900 dark:text-gray-100">Vehicle Information</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {vehicle ? (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Vehicle</span>
                  <Link
                    href={`/vehicles/${vehicle.id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </Link>
                </div>
                {vehicle.license_plate && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">License Plate</span>
                    <span className="text-sm font-medium">{vehicle.license_plate}</span>
                  </div>
                )}
                {vehicle.vin && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">VIN</span>
                    <span className="text-sm font-medium font-mono text-gray-600">{vehicle.vin}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Vehicle</span>
                <Link
                  href={`/vehicles/${typeof inspection.vehicle === 'object' ? inspection.vehicle.id : inspection.vehicle}`}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {inspection.vehicle_info || "View Vehicle"}
                </Link>
              </div>
            )}
            {inspection.odometer_reading && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Odometer</span>
                <span className="text-sm font-medium">
                  {inspection.odometer_reading.toLocaleString()} miles
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200 dark:border-gray-800">
          <CardHeader className="pb-3 border-b bg-gray-50/50 dark:bg-gray-800/50">
            <CardTitle className="text-sm font-semibold text-gray-900 dark:text-gray-100">Inspection Details</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Performed By</span>
              <span className="text-sm font-medium">
                {inspection.performed_by_name || "N/A"}
              </span>
            </div>
            {inspection.approved_by_name && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Approved By</span>
                <span className="text-sm font-medium">{inspection.approved_by_name}</span>
              </div>
            )}
            {inspection.work_order && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Work Order</span>
                <Link
                  href={`/workorders/${typeof inspection.work_order === 'object' ? inspection.work_order.id : inspection.work_order}`}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  {inspection.work_order_number || "View Work Order"}
                </Link>
              </div>
            )}
            {inspection.completed_at && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Completed On</span>
                <span className="text-sm font-medium">
                  {format(new Date(inspection.completed_at), "MMM dd, yyyy h:mm a")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {inspection.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{inspection.notes}</p>
          </CardContent>
        </Card>
      )}

      {inspection.recommendations && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {inspection.recommendations}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Inspection Results</CardTitle>
        </CardHeader>
        <CardContent>
          {inspection.results && inspection.results.length > 0 ? (
            <div className="space-y-6">
              {Object.entries(resultsByCategory).map(([category, results]) => (
                <div key={category}>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">{category}</h3>
                  <div className="space-y-3">
                    {results?.map((result) => (
                      <div
                        key={result.id}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium text-gray-900">{result.item_name}</h4>
                              {result.is_critical && (
                                <Badge className="bg-red-100 text-red-800 text-xs">
                                  Critical
                                </Badge>
                              )}
                              {result.result && (
                                <Badge
                                  className={
                                    itemResultColors[result.result] || "bg-gray-100 text-gray-800"
                                  }
                                >
                                  {result.result_display || result.result}
                                </Badge>
                              )}
                            </div>
                            {result.measurement_value !== undefined && (
                              <p className="text-sm text-gray-600">
                                Measurement: {result.measurement_value}
                                {result.item_type === "measurement" && " units"}
                              </p>
                            )}
                            {result.condition && (
                              <p className="text-sm text-gray-600">
                                Condition: {result.condition_display || result.condition}
                              </p>
                            )}
                            {result.text_note && (
                              <p className="text-sm text-gray-700 mt-2">{result.text_note}</p>
                            )}
                            {result.notes && (
                              <p className="text-sm text-gray-600 mt-2">{result.notes}</p>
                            )}
                            {result.recommendation && (
                              <p className="text-sm text-blue-700 mt-2">
                                Recommendation: {result.recommendation}
                              </p>
                            )}
                            {result.needs_immediate_attention && (
                              <div className="mt-2 flex items-center gap-1 text-red-600 text-sm">
                                <AlertCircle className="w-4 h-4" />
                                <span>Needs immediate attention</span>
                              </div>
                            )}
                            {result.photos && result.photos.length > 0 && (
                              <div className="mt-3 flex gap-2">
                                {result.photos.map((photo) => (
                                  <img
                                    key={photo.id}
                                    src={photo.image}
                                    alt={photo.caption || "Inspection photo"}
                                    className="w-20 h-20 object-cover rounded border border-gray-200"
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileText className="mx-auto h-12 w-12 text-gray-400 mb-2" />
              <p>No results recorded yet</p>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

