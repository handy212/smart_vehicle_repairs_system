"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InspectionResult, inspectionsApi } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, Send, Printer, FileText, Camera, Calendar, Wrench } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { usePrint } from "@/lib/hooks/usePrint";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { VehicleDamageMarker, DamageMark } from "@/components/inspections/VehicleDamageMarker";
import { getUserFacingError } from "@/lib/api/errors";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/inspections/SignaturePad";
import { getInspectionApprovalLabel, getInspectionStageLabel, getInspectionStageTone, isInspectionStarted } from "@/lib/utils/inspection-status";
import { getMediaUrl } from "@/lib/api/utils";

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
  completed: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 text-primary border-orange-200 dark:border-orange-800",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
  rejected: "bg-red-100 text-destructive dark:bg-red-900/30 dark:text-red-400 border-destructive/20 dark:border-red-800",
};

const itemResultColors: Record<string, string> = {
  pass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200",
  fail: "bg-red-100 text-destructive dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200",
  advisory: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-200",
  na: "bg-muted text-foreground bg-muted text-muted-foreground hover:bg-muted",
};

export default function InspectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const inspectionId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { downloadPDF, openPrintWindow, isDownloading, isOpeningPrint } = usePrint();
  const [showApproveOnBehalfDialog, setShowApproveOnBehalfDialog] = useState(false);
  const [behalfSignature, setBehalfSignature] = useState<string | null>(null);
  const [behalfReason, setBehalfReason] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<{
    src: string;
    caption?: string | null;
    category?: string;
    itemName?: string;
  } | null>(null);

  const { data: inspection, isLoading } = useQuery({
    queryKey: ["inspection", inspectionId],
    queryFn: () => inspectionsApi.get(inspectionId),
  });

  useMutation({
    mutationFn: () => inspectionsApi.complete(inspectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      toast({ title: "Success", description: "Inspection marked as completed", variant: "success" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (data?: { customer_signature?: string; approve_on_behalf_reason?: string }) =>
      inspectionsApi.approve(inspectionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      setShowApproveOnBehalfDialog(false);
      setBehalfSignature(null);
      setBehalfReason("");
      toast({ title: "Success", description: "Inspection approved", variant: "success" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Approval Failed",
        description: getUserFacingError(error, "Failed to approve inspection"),
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => inspectionsApi.reject(inspectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      toast({ title: "Success", description: "Inspection rejected", variant: "success" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Rejection Failed",
        description: getUserFacingError(error, "Failed to reject inspection"),
        variant: "destructive",
      });
    },
  });

  const sendToCustomerMutation = useMutation({
    mutationFn: () => inspectionsApi.sendToCustomer(inspectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      const alreadySent = !!inspection?.sent_to_customer_at;
      toast({
        title: "Success",
        description: alreadySent ? "Inspection resent to customer." : "Inspection sent to customer.",
        variant: "success",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to send inspection"),
        variant: "destructive",
      });
    }
  });

  const generateSummaryMutation = useMutation({
    mutationFn: () => inspectionsApi.generateSummary(inspectionId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
      toast({ title: "AI Summary Generated", description: data.message, variant: "success" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to generate AI summary"),
        variant: "destructive",
      });
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

  const vehicle = typeof inspection.vehicle === 'object' ? inspection.vehicle : null;
  const inspectionStageLabel = getInspectionStageLabel(inspection);
  const inspectionStageTone = getInspectionStageTone(inspection);
  const inspectionApprovalLabel = getInspectionApprovalLabel(inspection);
  const inspectionHasStarted = isInspectionStarted(inspection);
  const customerSignatureRequired =
    typeof inspection.template === "object" && inspection.template.requires_customer_signature;
  const needsCustomerSignature = customerSignatureRequired && !inspection.customer_signature;
  const handleApproveClick = () => {
    if (needsCustomerSignature) {
      setShowApproveOnBehalfDialog(true);
      return;
    }
    approveMutation.mutate(undefined);
  };

  const handleApproveOnBehalf = () => {
    if (!behalfSignature) {
      toast({
        title: "Signature Required",
        description: "Capture a customer authorization signature to approve on behalf.",
        variant: "destructive",
      });
      return;
    }
    if (!behalfReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Add why staff is signing on behalf of the customer.",
        variant: "destructive",
      });
      return;
    }
    approveMutation.mutate({
      customer_signature: behalfSignature,
      approve_on_behalf_reason: behalfReason.trim(),
    });
  };

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
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="outline" size="icon" onClick={() => router.push('/inspections')} className="mt-1">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground">
                Inspection #{inspection.inspection_number}
              </h1>
              <Badge variant="outline" className={cn(statusColors[inspectionStageTone], "border shadow-none")}>
                {inspectionStageLabel}
              </Badge>
              {inspectionApprovalLabel ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "border shadow-none",
                    inspection.status === "approved" && "border-green-200 text-green-700 bg-success/10",
                    inspection.status === "rejected" && "border-destructive/20 text-destructive bg-destructive/10/50",
                  )}
                >
                  {inspectionApprovalLabel}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(inspection.inspection_date), "MMM dd, yyyy")}
              </span>
              {vehicle?.license_plate && <span className="flex items-center gap-1 font-medium text-foreground px-1.5 py-0.5 bg-border rounded">{vehicle.license_plate}</span>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openPrintWindow({ documentType: 'inspection', documentId: inspectionId })}
            disabled={isOpeningPrint}
          >
            <Printer className="w-3.5 h-3.5 mr-2" />
            {isOpeningPrint ? 'Opening...' : 'Print'}
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
          >
            <FileText className="w-3.5 h-3.5 mr-2" />
            {isDownloading ? 'Downloading...' : 'PDF'}
          </Button>

          {inspection.status === "in_progress" && (
            <Button
              size="sm"
              onClick={() => router.push(`/inspections/${inspectionId}/perform`)}
            >
              <CheckCircle className="w-3.5 h-3.5 mr-2" />
              {inspectionHasStarted ? "Resume Inspection" : "Start Inspection"}
            </Button>
          )}

          {inspection.status === "completed" && (
            <>
              <Button variant="outline" size="sm" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                Reject
              </Button>
              <Button size="sm" onClick={handleApproveClick} disabled={approveMutation.isPending} className="bg-success hover:bg-green-700">
                {needsCustomerSignature ? "Approve on Behalf" : "Approve"}
              </Button>
            </>
          )}

          {(inspection.status === "completed" || inspection.status === "approved") && (
            <Button
              size="sm"
              variant={inspection.sent_to_customer_at ? "outline" : "default"}
              onClick={() => sendToCustomerMutation.mutate()}
              disabled={sendToCustomerMutation.isPending}
            >
              <Send className="w-3.5 h-3.5 mr-2" />
              {sendToCustomerMutation.isPending
                ? "Sending..."
                : inspection.sent_to_customer_at
                ? "Resend to Customer"
                : "Send to Customer"}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={showApproveOnBehalfDialog} onOpenChange={setShowApproveOnBehalfDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Approve on Behalf of Customer</DialogTitle>
            <DialogDescription>
              Use this when the customer cannot sign through the portal but has authorized the work to proceed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <SignaturePad
              value={behalfSignature || undefined}
              onChange={setBehalfSignature}
              label="Customer Authorization Signature"
              required
              height={160}
            />
            <div className="space-y-2">
              <Label htmlFor="behalf-reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="behalf-reason"
                value={behalfReason}
                onChange={(event) => setBehalfReason(event.target.value)}
                placeholder="Example: Customer authorized by phone; vehicle is disabled and customer cannot access portal."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowApproveOnBehalfDialog(false);
                setBehalfSignature(null);
                setBehalfReason("");
              }}
              disabled={approveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApproveOnBehalf}
              disabled={approveMutation.isPending || !behalfSignature || !behalfReason.trim()}
              className="bg-success hover:bg-green-700"
            >
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPhoto} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selectedPhoto?.caption || selectedPhoto?.itemName || "Inspection photo"}</DialogTitle>
            {selectedPhoto?.category || selectedPhoto?.itemName ? (
              <DialogDescription>
                {[selectedPhoto.category, selectedPhoto.itemName].filter(Boolean).join(" • ")}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {selectedPhoto ? (
            <div className="px-1 pb-1">
              <div className="overflow-hidden rounded-lg border border-border bg-muted">
                <img
                  src={selectedPhoto.src}
                  alt={selectedPhoto.caption || selectedPhoto.itemName || "Inspection photo"}
                  className="max-h-[80vh] w-full object-contain"
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 flex flex-col justify-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Progress</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-500"
                  style={{ width: `${inspection.completion_percentage}%` }}
                />
              </div>
              <span className="text-sm font-bold">{inspection.completion_percentage}%</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex flex-col justify-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Summary</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-success" />
                <span className="text-xs font-medium">{inspection.pass_count}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-warning" />
                <span className="text-xs font-medium">{inspection.advisory_count}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                <span className="text-xs font-medium">{inspection.fail_count}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex flex-col justify-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Vehicle</p>
            <p className="text-sm font-bold truncate">
              {vehicle?.make} {vehicle?.model}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Main) */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="results" className="w-full">
            <TabsList className="grid w-full grid-cols-5 lg:w-[500px]">
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="damage">Damage</TabsTrigger>
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="photos">Photos ({allPhotos.length})</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            {/* Damage Tab */}
            <TabsContent value="damage" className="mt-4">
              <VehicleDamageMarker
                damage={(inspection.vehicle_damage as DamageMark[]) || []}
                onChange={() => { }}
                disabled={true}
              />
            </TabsContent>

            {/* Results Tab */}
            <TabsContent value="results" className="mt-4 space-y-6">
              {Object.keys(resultsByCategory).length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 flex flex-col items-center justify-center text-center">
                    <FileText className="w-12 h-12 text-gray-300 mb-2" />
                    <h3 className="font-medium text-foreground">No results yet</h3>
                    <p className="text-sm text-muted-foreground">Perform the inspection to see results here.</p>
                    {inspection.status === 'in_progress' && (
                      <Button className="mt-4" onClick={() => router.push(`/inspections/${inspectionId}/perform`)}>
                        {inspectionHasStarted ? "Resume Inspection" : "Start Inspection"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                Object.entries(resultsByCategory).map(([category, results]) => (
                  <Card key={category}>
                    <CardHeader className="py-3 px-4 border-b border-border bg-muted/50">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">{category}</CardTitle>
                        <Badge variant="secondary" className="text-xs font-normal bg-card">{results.length} items</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {results.map((result) => (
                          <div key={result.id} className="p-4 hover:bg-muted hover:bg-muted/30 transition-colors">
                            <div className="flex items-start gap-4">
                              <div className={cn(
                                "w-2 h-2 rounded-full mt-2 flex-shrink-0",
                                result.result === 'pass' ? 'bg-success/100' :
                                  result.result === 'fail' ? 'bg-destructive/100' :
                                    result.result === 'advisory' ? 'bg-warning/100' : 'bg-gray-300'
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
                                {result.text_note && <p className="text-sm text-muted-foreground">{result.text_note}</p>}
                                {(result.measurement_value) && (
                                  <p className="text-xs text-muted-foreground">
                                    Measured: <span className="font-medium text-foreground">{result.measurement_value}</span>
                                  </p>
                                )}
                                {result.photos && result.photos.length > 0 && (
                                  <div className="flex gap-2 mt-2">
                                    {result.photos.map(p => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() =>
                                          setSelectedPhoto({
                                            src: getMediaUrl(p.image),
                                            caption: p.caption,
                                            category,
                                            itemName: result.item_name,
                                          })
                                        }
                                        className="relative h-12 w-12 overflow-hidden rounded border border-border bg-muted transition hover:border-primary/50 hover:ring-2 hover:ring-primary/20"
                                        aria-label={`Open photo for ${result.item_name}`}
                                      >
                                        <img
                                          src={getMediaUrl(p.image)}
                                          className="h-full w-full object-cover"
                                          alt={p.caption || result.item_name || "Inspection photo"}
                                        />
                                      </button>
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
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() =>
                            setSelectedPhoto({
                              src: getMediaUrl(photo.image),
                              caption: photo.caption,
                            })
                          }
                          className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted text-left transition hover:border-primary/50 hover:ring-2 hover:ring-primary/20"
                          aria-label={`Open ${photo.caption || "inspection photo"}`}
                        >
                          <img src={getMediaUrl(photo.image)} alt={photo.caption || "Inspection"} className="w-full h-full object-cover" />
                          {photo.caption && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-white text-xs truncate">
                              {photo.caption}
                            </div>
                          )}
                        </button>
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
              <div className="flex justify-end pr-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => generateSummaryMutation.mutate()}
                  disabled={generateSummaryMutation.isPending || (inspection.status !== 'completed' && inspection.status !== 'approved')}
                  className="bg-primary/10 text-primary hover:bg-indigo-100 hover:text-indigo-800 border border-primary/20"
                >
                  {generateSummaryMutation.isPending ? "Analyzing..." : "✨ Generate AI Summary"}
                </Button>
              </div>
              {/* Inspection-level notes */}
              {inspection.notes && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Inspection Notes</CardTitle></CardHeader>
                  <CardContent><p className="text-sm whitespace-pre-wrap">{inspection.notes}</p></CardContent>
                </Card>
              )}

              {/* Individual item notes */}

              {inspection.results && inspection.results.filter((r) => r.notes && r.notes.trim()).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Item Notes</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Notes from individual inspection items
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {inspection.results

                      .filter((r) => r.notes && r.notes.trim())

                      .map((result: InspectionResult) => (
                        <div key={result.id} className="border-l-2 border-primary pl-4 py-2">
                          <div className="flex items-start justify-between mb-1">
                            <p className="font-medium text-sm text-foreground">
                              {result.item_name || `Item #${result.inspection_item}`}
                            </p>
                            {result.category_name && (
                              <Badge variant="outline" className="text-xs ml-2">
                                {result.category_name}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-card-foreground whitespace-pre-wrap">
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

                (!inspection.results || inspection.results.filter((r) => r.notes && r.notes.trim()).length === 0) &&
                !inspection.recommendations && (
                  <div className="text-center py-8 text-muted-foreground">No notes recorded</div>
                )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm font-medium">Linked Work Order</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {inspection.work_order ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                  <div className="bg-orange-100 dark:bg-orange-900 p-2 rounded-full">
                    <Wrench className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <Link href={`/workorders/${typeof inspection.work_order === 'object' ? inspection.work_order.id : inspection.work_order}`} className="font-medium text-sm hover:underline">
                      WO #{inspection.work_order_number || (typeof inspection.work_order === 'object' ? inspection.work_order.id : inspection.work_order)}
                    </Link>
                    <p className="text-xs text-muted-foreground">View service details</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <p className="text-sm text-muted-foreground">No work order linked</p>
                  {(inspection.status === 'completed' || inspection.status === 'approved') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/workorders/new?vehicle_id=${typeof inspection.vehicle === 'object' ? inspection.vehicle?.id : inspection.vehicle}&inspection_id=${inspection.id}`)}
                    >
                      Create Work Order
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex gap-3">
                <div className="w-8 flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <div className="w-0.5 h-full bg-border -mb-2" />
                </div>
                <div className="pb-4">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-medium">{format(new Date(inspection.created_at), "MMM dd, HH:mm")}</p>
                </div>
              </div>
              {inspection.completed_at && (
                <div className="flex gap-3">
                  <div className="w-8 flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-success/100" />
                    {inspection.sent_to_customer_at && <div className="w-0.5 h-full bg-border -mb-2" />}
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
