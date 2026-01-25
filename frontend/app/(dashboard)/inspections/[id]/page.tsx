"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inspectionsApi, VehicleInspection } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, AlertCircle, Send, Printer, FileText, Camera, Calendar, User, Wrench, Clock } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { usePrint } from "@/lib/hooks/usePrint";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
  completed: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-primary border-orange-200 dark:border-orange-800",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
};

const resultColors: Record<string, string> = {
  pass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
  pass_with_advisory: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
  fail: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  needs_attention: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800",
};

const itemResultColors: Record<string, string> = {
  pass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200",
  fail: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200",
  advisory: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-200",
  na: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200",
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
      toast({ title: "Success", description: "Inspection sent to customer.", variant: "success" });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to send inspection";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <p className="text-muted-foreground">Inspection not found</p>
        <Link href="/inspections">
          <Button variant="outline">Back to Inspections</Button>
        </Link>
      </div>
    );
  }

  const template = typeof inspection.template === 'object' ? inspection.template : null;
  const vehicle = typeof inspection.vehicle === 'object' ? inspection.vehicle : null;

  // Group results by category
  const resultsByCategory: Record<string, NonNullable<typeof inspection.results>> = {};
  inspection.results?.forEach((result) => {
    const category = result.category_name || "Checklist";
    if (!resultsByCategory[category]) {
      resultsByCategory[category] = [];
    }
    resultsByCategory[category].push(result);
  });

  // Collect all photos
  const allPhotos = inspection.results?.flatMap(r => r.photos || []).filter(Boolean) || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="outline" size="icon" onClick={() => router.push('/inspections')} className="mt-1">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Inspection #{inspection.inspection_number}
              </h1>
              <Badge variant="outline" className={cn(statusColors[inspection.status], "border shadow-none")}>
                {inspection.status_display || inspection.status}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(inspection.inspection_date), "MMM dd, yyyy")}
              </span>
              {vehicle?.license_plate && <span className="flex items-center gap-1 font-medium text-gray-900 dark:text-gray-100 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">{vehicle.license_plate}</span>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadPDF({
              documentType: 'inspection',
              documentId: inspectionId,
              documentNumber: inspection.inspection_number
            })}
            disabled={isDownloading}
          >
            <Printer className="w-3.5 h-3.5 mr-2" />
            Print
          </Button>

          {inspection.status === "in_progress" && (
            <Button
              size="sm"
              onClick={() => router.push(`/inspections/${inspectionId}/perform`)}
            >
              <CheckCircle className="w-3.5 h-3.5 mr-2" />
              {inspection.results && inspection.results.length > 0 ? "Resume Inspection" : "Perform Inspection"}
            </Button>
          )}

          {inspection.status === "completed" && (
            <>
              <Button variant="outline" size="sm" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                Reject
              </Button>
              <Button size="sm" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} className="bg-green-600 hover:bg-green-700">
                Approve
              </Button>
            </>
          )}

          {(inspection.status === "completed" || inspection.status === "approved") && !inspection.sent_to_customer_at && (
            <Button size="sm" onClick={() => sendToCustomerMutation.mutate()} disabled={sendToCustomerMutation.isPending}>
              <Send className="w-3.5 h-3.5 mr-2" />
              Send to Customer
            </Button>
          )}
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col justify-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Progress</p>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{inspection.completion_percentage || 0}%</span>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden max-w-[100px]">
                <div className="bg-primary h-full" style={{ width: `${inspection.completion_percentage || 0}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col justify-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Finding Summary</p>
            <div className="flex gap-3 text-sm">
              {(inspection.result_counts?.fail ?? 0) > 0 && <span className="text-red-600 font-medium">{inspection.result_counts?.fail} Fail</span>}
              {(inspection.result_counts?.advisory ?? 0) > 0 && <span className="text-yellow-600 font-medium">{inspection.result_counts?.advisory} Visual</span>}
              {(inspection.result_counts?.pass ?? 0) > 0 && <span className="text-green-600 font-medium">{inspection.result_counts?.pass} Pass</span>}
              {!inspection.result_counts?.fail && !inspection.result_counts?.advisory && !inspection.result_counts?.pass && <span className="text-muted-foreground">No data</span>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col justify-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Technician</p>
            <div className="flex items-center gap-2 text-sm font-medium">
              <User className="w-4 h-4 text-gray-400" />
              {inspection.performed_by_name || "Unassigned"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Main) */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="results" className="w-full">
            <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="photos">Photos ({allPhotos.length})</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            {/* Results Tab */}
            <TabsContent value="results" className="mt-4 space-y-6">
              {Object.keys(resultsByCategory).length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 flex flex-col items-center justify-center text-center">
                    <FileText className="w-12 h-12 text-gray-300 mb-2" />
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">No results yet</h3>
                    <p className="text-sm text-gray-500">Perform the inspection to see results here.</p>
                    {inspection.status === 'in_progress' && (
                      <Button className="mt-4" onClick={() => router.push(`/inspections/${inspectionId}/perform`)}>
                        {inspection.results && inspection.results.length > 0 ? "Resume Inspection" : "Start Inspection"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                Object.entries(resultsByCategory).map(([category, results]) => (
                  <Card key={category}>
                    <CardHeader className="py-3 px-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">{category}</CardTitle>
                        <Badge variant="secondary" className="text-xs font-normal bg-white dark:bg-gray-800">{results.length} items</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {results.map((result) => (
                          <div key={result.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                            <div className="flex items-start gap-4">
                              <div className={cn(
                                "w-2 h-2 rounded-full mt-2 flex-shrink-0",
                                result.result === 'pass' ? 'bg-green-500' :
                                  result.result === 'fail' ? 'bg-red-500' :
                                    result.result === 'advisory' ? 'bg-yellow-500' : 'bg-gray-300'
                              )} />
                              <div className="flex-1 space-y-1">
                                <div className="flex items-start justify-between">
                                  <p className="font-medium text-sm">{result.item_name}</p>
                                  {result.result && (
                                    <Badge className={cn("text-[10px] px-1.5 py-0 h-5 font-medium ml-2 uppercase", itemResultColors[result.result])} variant="secondary">
                                      {result.result_display || result.result}
                                    </Badge>
                                  )}
                                </div>
                                {result.text_note && <p className="text-sm text-gray-600 dark:text-gray-400">{result.text_note}</p>}
                                {(result.measurement_value) && (
                                  <p className="text-xs text-muted-foreground">
                                    Measured: <span className="font-medium text-gray-900 dark:text-gray-100">{result.measurement_value}</span>
                                  </p>
                                )}
                                {result.photos && result.photos.length > 0 && (
                                  <div className="flex gap-2 mt-2">
                                    {result.photos.map(p => (
                                      <div key={p.id} className="w-12 h-12 rounded border bg-gray-100 overflow-hidden relative">
                                        <img src={p.image} className="w-full h-full object-cover" alt="Thumb" />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Photos Tab */}
            <TabsContent value="photos" className="mt-4">
              <Card>
                <CardContent className="p-6">
                  {allPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {allPhotos.map((photo) => (
                        <div key={photo.id} className="aspect-square relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 group">
                          <img src={photo.image} alt={photo.caption || "Inspection"} className="w-full h-full object-cover" />
                          {photo.caption && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-white text-xs truncate">
                              {photo.caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Camera className="w-12 h-12 mx-auto mb-2 opacity-20" />
                      <p>No photos attached to inspection results</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="info" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Vehicle Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Vehicle</p>
                    <Link href={`/vehicles/${vehicle?.id}`} className="text-sm font-medium text-primary hover:underline">
                      {vehicle?.year} {vehicle?.make} {vehicle?.model}
                    </Link>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">License Plate</p>
                    <p className="text-sm font-medium">{vehicle?.license_plate || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">VIN</p>
                    <p className="text-sm font-mono">{vehicle?.vin || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Odometer at Inspection</p>
                    <p className="text-sm font-medium">{inspection.odometer_reading ? `${inspection.odometer_reading} mi` : "-"}</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes" className="mt-4 space-y-4">
              {/* Inspection-level notes */}
              {inspection.notes && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Inspection Notes</CardTitle></CardHeader>
                  <CardContent><p className="text-sm whitespace-pre-wrap">{inspection.notes}</p></CardContent>
                </Card>
              )}
              
              {/* Individual item notes */}
              {inspection.results && inspection.results.filter((r: any) => r.notes && r.notes.trim()).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Item Notes</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Notes from individual inspection items
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {inspection.results
                      .filter((r: any) => r.notes && r.notes.trim())
                      .map((result: any) => (
                        <div key={result.id} className="border-l-2 border-primary pl-4 py-2">
                          <div className="flex items-start justify-between mb-1">
                            <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                              {result.item_name || `Item #${result.inspection_item}`}
                            </p>
                            {result.category_name && (
                              <Badge variant="outline" className="text-xs ml-2">
                                {result.category_name}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {result.notes}
                          </p>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              )}
              
              {/* Recommendations */}
              {inspection.recommendations && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base text-primary">Recommendations</CardTitle></CardHeader>
                  <CardContent><p className="text-sm whitespace-pre-wrap">{inspection.recommendations}</p></CardContent>
                </Card>
              )}
              
              {/* Empty state */}
              {!inspection.notes && 
               (!inspection.results || inspection.results.filter((r: any) => r.notes && r.notes.trim()).length === 0) && 
               !inspection.recommendations && (
                <div className="text-center py-8 text-muted-foreground">No notes recorded</div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-sm font-medium">Linked Work Order</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {inspection.work_order ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50">
                  <div className="bg-orange-100 dark:bg-orange-900 p-2 rounded-full">
                    <Wrench className="w-4 h-4 text-primary dark:text-primary" />
                  </div>
                  <div>
                    <Link href={`/workorders/${typeof inspection.work_order === 'object' ? inspection.work_order.id : inspection.work_order}`} className="font-medium text-sm hover:underline">
                      WO #{inspection.work_order_number || (typeof inspection.work_order === 'object' ? inspection.work_order.id : inspection.work_order)}
                    </Link>
                    <p className="text-xs text-muted-foreground">View service details</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">No work order linked</p>
                  {/* Could add a 'Create Work Order' button here if needed */}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
              <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex gap-3">
                <div className="w-8 flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <div className="w-0.5 h-full bg-gray-100 dark:bg-gray-800 -mb-2" />
                </div>
                <div className="pb-4">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-medium">{format(new Date(inspection.created_at), "MMM dd, HH:mm")}</p>
                </div>
              </div>
              {inspection.completed_at && (
                <div className="flex gap-3">
                  <div className="w-8 flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    {inspection.sent_to_customer_at && <div className="w-0.5 h-full bg-gray-100 dark:bg-gray-800 -mb-2" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="text-sm font-medium">{format(new Date(inspection.completed_at), "MMM dd, HH:mm")}</p>
                  </div>
                </div>
              )}
              {inspection.sent_to_customer_at && (
                <div className="flex gap-3">
                  <div className="w-8 flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sent to Customer</p>
                    <p className="text-sm font-medium">{format(new Date(inspection.sent_to_customer_at), "MMM dd, HH:mm")}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
