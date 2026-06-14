"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InspectionResult, inspectionsApi } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, CheckCircle, XCircle, AlertTriangle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useToast } from "@/lib/hooks/useToast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { SignaturePad } from "@/components/inspections/SignaturePad";
import { useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { usePrint } from "@/lib/hooks/usePrint";
import { getUserFacingError } from "@/lib/api/errors";

export default function InspectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { openPrintWindow, isOpeningPrint } = usePrint();
  const inspectionId = parseInt(params.id as string);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [customerSignature, setCustomerSignature] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const signaturePadRef = useRef<SignatureCanvas>(null);

  const { data: inspection, isLoading } = useQuery({
    queryKey: ["portal", "inspection", inspectionId],
    queryFn: () => inspectionsApi.get(inspectionId),
    enabled: !!inspectionId,
  });

  const approveMutation = useMutation({
    mutationFn: (data?: { customer_signature?: string }) => {
      return inspectionsApi.approve(inspectionId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "inspection", inspectionId] });
      queryClient.invalidateQueries({ queryKey: ["portal", "history"] });
      setShowApproveDialog(false);
      setCustomerSignature(null);
      toast({
        title: "Inspection Approved",
        description: "The inspection has been successfully approved.",
        variant: "success",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Approval Failed",
        description: getUserFacingError(error, "Failed to approve inspection. Please try again."),
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (data?: { reason?: string }) => inspectionsApi.reject(inspectionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "inspection", inspectionId] });
      queryClient.invalidateQueries({ queryKey: ["portal", "history"] });
      setShowRejectDialog(false);
      setRejectReason("");
      toast({
        title: "Inspection Rejected",
        description: "The inspection has been rejected.",
        variant: "success",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Rejection Failed",
        description: getUserFacingError(error, "Failed to reject inspection. Please try again."),
        variant: "destructive",
      });
    },
  });

  const handleApprove = () => {
    const customerSignatureRequired =
      typeof inspection?.template === "object" && inspection.template.requires_customer_signature;

    if (customerSignatureRequired && !customerSignature) {
      toast({
        title: "Signature Required",
        description: "Please provide your signature to approve the inspection",
        variant: "destructive",
      });
      return;
    }
    approveMutation.mutate(customerSignature ? { customer_signature: customerSignature } : undefined);
  };

  const handleReject = () => {
    rejectMutation.mutate({ reason: rejectReason });
  };

  const handlePrint = () => {
    openPrintWindow({ documentType: 'inspection', documentId: inspectionId });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground mb-4">Inspection not found</p>
        <Button onClick={() => router.push("/portal/history")}>Back to History</Button>
      </div>
    );
  }

  const results = inspection.results || [];

  const failedItems = results.filter((r) => r.result === "fail");

  const advisoryItems = results.filter((r) => r.result === "advisory");

  const passedItems = results.filter((r) => r.result === "pass");
  const customerSignatureRequired =
    typeof inspection.template === "object" && inspection.template.requires_customer_signature;

  const getResultIcon = (result?: string) => {
    switch (result) {
      case "pass":
        return <CheckCircle className="w-3.5 h-3.5 text-success" />;
      case "fail":
        return <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />;
      case "advisory":
        return <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />;
      default:
        return null;
    }
  };

  // Group results by category

  const resultsByCategory: Record<string, InspectionResult[]> = {};

  results.forEach((result) => {
    const category = result.category_name || "Other";
    if (!resultsByCategory[category]) {
      resultsByCategory[category] = [];
    }
    resultsByCategory[category].push(result);
  });

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-8">
      {/* Compact Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="h-8 w-8 p-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Inspection #{inspection.inspection_number || inspection.id}
            </h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>{format(new Date(inspection.inspection_date), "MMM d, yyyy")}</span>
              {inspection.vehicle_info && <span>•</span>}
              {inspection.vehicle_info && <span>{inspection.vehicle_info}</span>}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handlePrint} disabled={isOpeningPrint} className="h-8">
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {isOpeningPrint ? 'Opening...' : 'Print / Download'}
        </Button>
      </div>

      {/* Approval Actions - Show when inspection is completed and not yet approved/rejected */}
      {inspection.status === "completed" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">
                  Inspection Ready for Review
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={rejectMutation.isPending || approveMutation.isPending}
                  className="h-8 border-destructive/20 text-destructive hover:bg-destructive/10"
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowApproveDialog(true)}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className="h-8 bg-success hover:bg-green-700 text-white"
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                  Approve
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-none shadow-sm">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Total Items</p>
            <p className="text-lg font-bold text-foreground">{inspection.total_items || results.length}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-success" />
              <p className="text-xs text-muted-foreground">Passed</p>
            </div>
            <p className="text-lg font-bold text-foreground">
              {inspection.pass_count || passedItems.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
            <p className="text-lg font-bold text-foreground">
              {inspection.fail_count || failedItems.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
              <p className="text-xs text-muted-foreground">Advisory</p>
            </div>
            <p className="text-lg font-bold text-foreground">
              {inspection.advisory_count || advisoryItems.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Inspection Details & Results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Quick Info */}
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {inspection.template_name && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Type</p>
                    <p className="font-medium text-foreground">{inspection.template_name}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                  <Badge variant="secondary" className="text-xs h-5">
                    {inspection.status_display || inspection.status}
                  </Badge>
                </div>
                {inspection.odometer_reading && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Odometer</p>
                    <p className="font-medium text-foreground">
                      {inspection.odometer_reading.toLocaleString()} mi
                    </p>
                  </div>
                )}
                {inspection.performed_by_name && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Technician</p>
                    <p className="font-medium text-foreground">{inspection.performed_by_name}</p>
                  </div>
                )}
                {inspection.completion_percentage !== undefined && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Completion</p>
                    <p className="font-medium text-foreground">{inspection.completion_percentage}%</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results by Category */}
          {Object.keys(resultsByCategory).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(resultsByCategory).map(([category, categoryResults]) => (
                <Card key={category} className="border-none shadow-sm">
                  <CardHeader className="pb-2 px-4 pt-3">
                    <CardTitle className="text-sm font-semibold">{category}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-0">
                    <div className="space-y-2">

                      {categoryResults.map((result) => (
                        <div
                          key={result.id}
                          className={cn(
                            "p-2.5 rounded-md border text-sm",
                            result.needs_immediate_attention || result.is_critical
                              ? "border-destructive/20 bg-destructive/5"
                              : "border-border bg-card"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              {getResultIcon(result.result)}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground text-sm">
                                  {result.item_name || "Item"}
                                </p>
                                {result.text_note && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                    {result.text_note}
                                  </p>
                                )}
                                {result.recommendation && (
                                  <p className="text-xs text-primary mt-1 font-medium">
                                    {result.recommendation}
                                  </p>
                                )}
                              </div>
                            </div>
                            {result.result && (
                              <Badge
                                variant={
                                  result.result === "pass"
                                    ? "default"
                                    : result.result === "fail"
                                      ? "danger"
                                      : "secondary"
                                }
                                className="text-[10px] h-5 shrink-0"
                              >
                                {result.result_display || result.result}
                              </Badge>
                            )}
                          </div>
                          {result.estimated_cost && (
                            <p className="text-xs text-muted-foreground mt-1.5">
                              Est. Cost: ${Number(result.estimated_cost).toLocaleString()}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-none shadow-sm">
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No results available</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Notes */}
          {inspection.notes && (
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2 px-4 pt-3">
                <CardTitle className="text-sm font-semibold">Notes</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {inspection.notes}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {inspection.recommendations && (
            <Card className="border-none shadow-sm border-primary/20 bg-primary/5">
              <CardHeader className="pb-2 px-4 pt-3">
                <CardTitle className="text-sm font-semibold text-primary">Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <p className="text-xs text-foreground whitespace-pre-wrap">
                  {inspection.recommendations}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Approval Dialog with Signature */}
      <Dialog
        open={showApproveDialog}
        onOpenChange={(open) => {
          setShowApproveDialog(open);
          if (!open) {
            setCustomerSignature(null);
            if (signaturePadRef.current) {
              signaturePadRef.current.clear();
            }
          }
        }}
      >
        <DialogContent className="max-w-lg p-0 sm:max-w-lg">
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
            <DialogTitle className="text-lg font-semibold">Approve Inspection</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {customerSignatureRequired
                ? "Please review the inspection results and provide your signature to approve."
                : "Please review the inspection results before approving."}
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 sm:px-6 pb-4 space-y-4">
            {/* Signature Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Your Signature
                  {customerSignatureRequired && <span className="text-destructive ml-1">*</span>}
                </Label>
                {customerSignature && (
                  <Badge variant="outline" className="text-xs">
                    Signed
                  </Badge>
                )}
              </div>
              <div className="border-2 border-dashed border-border rounded-lg bg-background p-2">
                <SignatureCanvas
                  ref={signaturePadRef}
                  canvasProps={{
                    width: 450,
                    height: 150,
                    className: "signature-canvas w-full",
                  }}
                  onEnd={() => {
                    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
                      const dataURL = signaturePadRef.current.toDataURL();
                      setCustomerSignature(dataURL);
                    } else {
                      setCustomerSignature(null);
                    }
                  }}
                  penColor="#000000"
                  backgroundColor="#ffffff"
                />
                <div className="flex items-center justify-end mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (signaturePadRef.current) {
                        signaturePadRef.current.clear();
                        setCustomerSignature(null);
                      }
                    }}
                    disabled={!customerSignature}
                    className="h-7 text-xs"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              {!customerSignature && (
                <p className="text-xs text-muted-foreground">
                  {customerSignatureRequired
                    ? "Please provide your signature to approve the inspection"
                    : "Signature is optional for this inspection template"}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <DialogFooter className="gap-2 sm:gap-3 pt-4 border-t">
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => {
                  setShowApproveDialog(false);
                  setCustomerSignature(null);
                  if (signaturePadRef.current) {
                    signaturePadRef.current.clear();
                  }
                }}
                disabled={approveMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 sm:flex-none bg-success hover:bg-green-700 text-white"
                onClick={handleApprove}
                disabled={(customerSignatureRequired && !customerSignature) || approveMutation.isPending}
              >
                {approveMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve Inspection
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-lg p-0 sm:max-w-lg">
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
            <DialogTitle className="text-lg font-semibold">Reject Inspection</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Please provide a reason for rejecting this inspection.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 sm:px-6 pb-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-reason" className="text-sm font-medium">
                Reason (Optional)
              </Label>
              <textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                className="w-full min-h-[100px] px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-3 pt-4 border-t">
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectReason("");
                }}
                disabled={rejectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 sm:flex-none"
                onClick={handleReject}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    Rejecting...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject Inspection
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
