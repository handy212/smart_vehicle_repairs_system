"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inspectionsApi, VehicleInspection } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, AlertCircle, Send, Camera, FileText } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
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
          <Buttonvariant="secondary" className="mt-4">
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
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/inspections">
            <Buttonvariant="secondary" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Inspection #{inspection.inspection_number}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {format(new Date(inspection.inspection_date), "MMMM dd, yyyy 'at' h:mm a")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {inspection.status === "in_progress" && (
            <Button 
              onClick={() => router.push(`/inspections/${inspectionId}/perform`)} 
              disabled={completeMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Perform Inspection
            </Button>
          )}
          {inspection.status === "completed" && (
            <>
              <Button
               variant="secondary"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve
              </Button>
            </>
          )}
          {(inspection.status === "completed" || inspection.status === "approved") && !inspection.sent_to_customer_at && (
            <Button
             variant="secondary"
              onClick={() => sendToCustomerMutation.mutate()}
              disabled={sendToCustomerMutation.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              Send to Customer
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              className={statusColors[inspection.status] || "bg-gray-100 text-gray-800"}
            >
              {inspection.status_display || inspection.status}
            </Badge>
            {inspection.overall_result && (
              <div className="mt-2">
                <Badge
                  className={
                    resultColors[inspection.overall_result] || "bg-gray-100 text-gray-800"
                  }
                >
                  {inspection.overall_result_display || inspection.overall_result}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${inspection.completion_percentage || 0}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700">
                {inspection.completion_percentage || 0}%
              </span>
            </div>
            {inspection.result_counts && (
              <div className="mt-2 text-xs text-gray-600">
                {inspection.result_counts.pass} Pass, {inspection.result_counts.fail} Fail,{" "}
                {inspection.result_counts.advisory} Advisory
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Template</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-gray-900">
              {inspection.template_name || (template?.name || "N/A")}
            </p>
            {template && (
              <p className="text-xs text-gray-500 mt-1">
                {template.total_items || 0} items
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Vehicle Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {vehicle ? (
              <>
                <div>
                  <span className="text-sm text-gray-500">Vehicle:</span>
                  <Link
                    href={`/vehicles/${vehicle.id}`}
                    className="ml-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </Link>
                </div>
                {vehicle.license_plate && (
                  <div>
                    <span className="text-sm text-gray-500">License Plate:</span>
                    <span className="ml-2 text-sm font-medium">{vehicle.license_plate}</span>
                  </div>
                )}
                {vehicle.vin && (
                  <div>
                    <span className="text-sm text-gray-500">VIN:</span>
                    <span className="ml-2 text-sm font-medium">{vehicle.vin}</span>
                  </div>
                )}
              </>
            ) : (
              <Link
                href={`/vehicles/${typeof inspection.vehicle === 'object' ? inspection.vehicle.id : inspection.vehicle}`}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {inspection.vehicle_info || "View Vehicle"}
              </Link>
            )}
            {inspection.odometer_reading && (
              <div>
                <span className="text-sm text-gray-500">Odometer:</span>
                <span className="ml-2 text-sm font-medium">
                  {inspection.odometer_reading.toLocaleString()} miles
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inspection Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-gray-500">Performed By:</span>
              <span className="ml-2 text-sm font-medium">
                {inspection.performed_by_name || "N/A"}
              </span>
            </div>
            {inspection.approved_by_name && (
              <div>
                <span className="text-sm text-gray-500">Approved By:</span>
                <span className="ml-2 text-sm font-medium">{inspection.approved_by_name}</span>
              </div>
            )}
            {inspection.work_order && (
              <div>
                <span className="text-sm text-gray-500">Work Order:</span>
                <Link
                  href={`/workorders/${typeof inspection.work_order === 'object' ? inspection.work_order.id : inspection.work_order}`}
                  className="ml-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  {inspection.work_order_number || "View Work Order"}
                </Link>
              </div>
            )}
            {inspection.completed_at && (
              <div>
                <span className="text-sm text-gray-500">Completed:</span>
                <span className="ml-2 text-sm font-medium">
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

