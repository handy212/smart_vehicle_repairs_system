"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { diagnosisApi, Diagnosis, DiagnosticCode, DiagnosticTest, DiagnosisFinding, DiagnosisPhoto } from "@/lib/api/diagnosis";
import { workordersApi } from "@/lib/api/workorders";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/lib/hooks/useToast";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Edit,
  Plus,
  Wrench,
  FileText,
  Settings,
  ListChecks,
  MessageSquare,
  Code,
  TestTube,
  Camera,
  Trash2,
  X,
  Search,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { CodesTab } from "./components/CodesTab";

export default function DiagnosisPage() {
  const params = useParams();
  const router = useRouter();
  const workOrderId = parseInt(params.id as string);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("complaint");

  // Fetch work order
  const { data: workOrder } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId),
  });

  // Fetch or create diagnosis
  const { data: diagnosis, isLoading, error: diagnosisError } = useQuery({
    queryKey: ["diagnosis", "workorder", workOrderId],
    queryFn: async () => {
      try {
        console.log("Fetching diagnosis for work order:", workOrderId);
        let existing = await diagnosisApi.getByWorkOrder(workOrderId);
        console.log("Existing diagnosis:", existing);
        
        if (!existing && workOrder) {
          // Auto-create diagnosis if it doesn't exist
          console.log("No diagnosis found, creating new one...");
          try {
            existing = await diagnosisApi.create({
              work_order: workOrderId,
              customer_complaint: workOrder.customer_concerns || "",
            });
            console.log("Diagnosis created:", existing);
          } catch (error: any) {
            console.error("Failed to create diagnosis:", error);
            console.error("Error details:", error.response?.data || error.message);
            throw error;
          }
        }
        return existing;
      } catch (error: any) {
        console.error("Error in diagnosis query:", error);
        console.error("Error response:", error.response?.data);
        console.error("Error status:", error.response?.status);
        throw error;
      }
    },
    enabled: !!workOrderId && !!workOrder,
    retry: 1,
    retryDelay: 1000,
  });

  const updateDiagnosisMutation = useMutation({
    mutationFn: (data: Partial<Diagnosis>) => {
      if (!diagnosis) throw new Error("Diagnosis not found");
      return diagnosisApi.update(diagnosis.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      toast({ title: "Diagnosis updated", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update diagnosis",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const completeDiagnosisMutation = useMutation({
    mutationFn: () => {
      if (!diagnosis) throw new Error("Diagnosis not found");
      return diagnosisApi.complete(diagnosis.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
      toast({ title: "Diagnosis completed", variant: "default" });
      router.push(`/workorders/${workOrderId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to complete diagnosis",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Error loading work order. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (diagnosisError) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-red-600 font-semibold">Error loading diagnosis</p>
              <p className="text-sm text-gray-600">
                {(diagnosisError as any)?.response?.data?.detail ||
                  (diagnosisError as any)?.message ||
                  "Please try again or contact support."}
              </p>
              <Button
                variant="outline"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] })}
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!diagnosis) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-600">No diagnosis found. This should be created automatically.</p>
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] })}
              className="mt-4"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href={`/workorders/${workOrderId}`}>
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Work Order
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Diagnosis</h1>
            <p className="text-sm text-gray-500">
              Work Order #{workOrder.work_order_number}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {diagnosis.status === "in_progress" && (
            <Button
              onClick={() => completeDiagnosisMutation.mutate()}
              disabled={completeDiagnosisMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Complete Diagnosis
            </Button>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center space-x-2">
        <Badge
          variant={
            diagnosis.status === "completed"
              ? "default"
              : diagnosis.status === "on_hold"
              ? "secondary"
              : "info"
          }
        >
          {diagnosis.status_display || diagnosis.status}
        </Badge>
        {diagnosis.technician_name && (
          <span className="text-sm text-gray-500">
            Technician: {diagnosis.technician_name}
          </span>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="complaint">
            <MessageSquare className="w-4 h-4 mr-2" />
            Complaint
          </TabsTrigger>
          <TabsTrigger value="notes">
            <FileText className="w-4 h-4 mr-2" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="codes">
            <Code className="w-4 h-4 mr-2" />
            Codes ({diagnosis.diagnostic_codes?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="tests">
            <TestTube className="w-4 h-4 mr-2" />
            Tests ({diagnosis.diagnostic_tests?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="findings">
            <ListChecks className="w-4 h-4 mr-2" />
            Findings ({diagnosis.findings?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="photos">
            <Camera className="w-4 h-4 mr-2" />
            Photos ({diagnosis.photos?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            <Wrench className="w-4 h-4 mr-2" />
            Recommendations ({diagnosis.repair_recommendations?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="summary">
            <Settings className="w-4 h-4 mr-2" />
            Summary
          </TabsTrigger>
        </TabsList>

        {/* Complaint Tab */}
        <TabsContent value="complaint" className="mt-6">
          <ComplaintTab
            diagnosis={diagnosis}
            onUpdate={(data) => updateDiagnosisMutation.mutate(data)}
            isUpdating={updateDiagnosisMutation.isPending}
          />
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="mt-6">
          <NotesTab
            diagnosis={diagnosis}
            onUpdate={(data) => updateDiagnosisMutation.mutate(data)}
            isUpdating={updateDiagnosisMutation.isPending}
          />
        </TabsContent>

        {/* Codes Tab */}
        <TabsContent value="codes" className="mt-6">
          <CodesTab
            diagnosisId={diagnosis.id}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] })}
          />
        </TabsContent>

        {/* Tests Tab */}
        <TabsContent value="tests" className="mt-6">
          <TestsTab
            diagnosisId={diagnosis.id}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] })}
          />
        </TabsContent>

        {/* Findings Tab */}
        <TabsContent value="findings" className="mt-6">
          <FindingsTab
            diagnosis={diagnosis}
            onUpdate={(data) => updateDiagnosisMutation.mutate(data)}
            isUpdating={updateDiagnosisMutation.isPending}
          />
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos" className="mt-6">
          <PhotosTab
            diagnosisId={diagnosis.id}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] })}
          />
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="mt-6">
          <RecommendationsTab
            diagnosis={diagnosis}
            workOrderId={workOrderId}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] })}
          />
        </TabsContent>

        {/* Summary Tab */}
        <TabsContent value="summary" className="mt-6">
          <SummaryTab diagnosis={diagnosis} workOrder={workOrder} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Complaint Tab Component
function ComplaintTab({
  diagnosis,
  onUpdate,
  isUpdating,
}: {
  diagnosis: Diagnosis;
  onUpdate: (data: Partial<Diagnosis>) => void;
  isUpdating: boolean;
}) {
  const [customerComplaint, setCustomerComplaint] = useState(diagnosis.customer_complaint || "");
  const [initialObservations, setInitialObservations] = useState(diagnosis.initial_observations || "");

  const handleSave = () => {
    onUpdate({
      customer_complaint: customerComplaint,
      initial_observations: initialObservations,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Complaint</CardTitle>
        <CardDescription>
          What the customer reported (in their words)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Customer Complaint</label>
          <textarea
            className="w-full min-h-32 p-3 border rounded-md"
            value={customerComplaint}
            onChange={(e) => setCustomerComplaint(e.target.value)}
            placeholder="Enter what the customer reported..."
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">Initial Observations</label>
          <textarea
            className="w-full min-h-24 p-3 border rounded-md"
            value={initialObservations}
            onChange={(e) => setInitialObservations(e.target.value)}
            placeholder="Initial visual observations during intake..."
          />
        </div>
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Notes Tab Component
function NotesTab({
  diagnosis,
  onUpdate,
  isUpdating,
}: {
  diagnosis: Diagnosis;
  onUpdate: (data: Partial<Diagnosis>) => void;
  isUpdating: boolean;
}) {
  const [notes, setNotes] = useState(diagnosis.diagnostic_notes || "");
  const [timeHours, setTimeHours] = useState(diagnosis.diagnostic_time_hours?.toString() || "");
  const [fee, setFee] = useState(diagnosis.diagnostic_fee?.toString() || "");

  const handleSave = () => {
    onUpdate({
      diagnostic_notes: notes,
      diagnostic_time_hours: timeHours ? parseFloat(timeHours) : 0,
      diagnostic_fee: fee ? parseFloat(fee) : 0,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnostic Notes</CardTitle>
        <CardDescription>
          Technician notes during diagnosis process
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Diagnostic Notes</label>
          <textarea
            className="w-full min-h-48 p-3 border rounded-md"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter diagnostic notes..."
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Diagnostic Time (hours)</label>
            <input
              type="number"
              step="0.25"
              className="w-full p-2 border rounded-md"
              value={timeHours}
              onChange={(e) => setTimeHours(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Diagnostic Fee ($)</label>
            <input
              type="number"
              step="0.01"
              className="w-full p-2 border rounded-md"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Findings Tab Component
function FindingsTab({
  diagnosis,
  onUpdate,
  isUpdating,
}: {
  diagnosis: Diagnosis;
  onUpdate: (data: Partial<Diagnosis>) => void;
  isUpdating: boolean;
}) {
  const [rootCause, setRootCause] = useState(diagnosis.root_cause || "");
  const [explanation, setExplanation] = useState(diagnosis.root_cause_explanation || "");

  const handleSave = () => {
    onUpdate({
      root_cause: rootCause,
      root_cause_explanation: explanation,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Root Cause & Findings</CardTitle>
        <CardDescription>
          Document the confirmed root cause and explanation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Root Cause</label>
          <input
            type="text"
            className="w-full p-3 border rounded-md"
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            placeholder="Enter root cause..."
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">
            Root Cause Explanation (Customer-Friendly)
          </label>
          <textarea
            className="w-full min-h-32 p-3 border rounded-md"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Explain why this happened in simple terms for the customer..."
          />
        </div>
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Tests Tab Component (Phase 2 placeholder)
function TestsTab({
  diagnosisId,
  onRefresh,
}: {
  diagnosisId: number;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: tests = [], isLoading, error } = useQuery({
    queryKey: ["diagnosis-tests", diagnosisId],
    queryFn: () => diagnosisApi.tests.list({ diagnosis: diagnosisId }),
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["diagnosis-tests", diagnosisId] });
    onRefresh();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Diagnostic Tests</CardTitle>
          <CardDescription>
            Procedures, measurements, and tools used during diagnosis
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">
            Failed to load diagnostic tests. Please try again.
          </p>
        ) : tests.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <TestTube className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>No diagnostic tests recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tests.map((test) => (
              <div
                key={test.id}
                className="p-4 border rounded-lg hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-lg font-semibold">{test.test_name}</p>
                    <p className="text-sm text-gray-500">
                      {test.category_display || test.category}
                    </p>
                  </div>
                  <Badge
                    variant={
                      test.status === "pass"
                        ? "default"
                        : test.status === "fail"
                        ? "danger"
                        : "secondary"
                    }
                  >
                    {test.status_display || test.status}
                  </Badge>
                </div>
                {test.actual_result && (
                  <p className="text-sm text-gray-700 mb-2">
                    Result: {test.actual_result}
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Performed:{" "}
                  {test.performed_at
                    ? format(new Date(test.performed_at), "PPp")
                    : "Not recorded"}
                  {test.performed_by_name ? ` • ${test.performed_by_name}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Recommendations Tab Component (simplified for Phase 1)
function RecommendationsTab({
  diagnosis,
  workOrderId,
  onRefresh,
}: {
  diagnosis: Diagnosis;
  workOrderId: number;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Repair Recommendations</CardTitle>
            <CardDescription>
              What needs to be fixed - {diagnosis.repair_recommendations?.length || 0} recommendation(s)
            </CardDescription>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Recommendation
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {diagnosis.repair_recommendations && diagnosis.repair_recommendations.length > 0 ? (
          <div className="space-y-4">
            {diagnosis.repair_recommendations.map((rec) => (
              <div key={rec.id} className="p-4 border rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Badge variant="default">{rec.priority_display || rec.priority}</Badge>
                    <Badge variant="secondary">{rec.recommendation_type_display || rec.recommendation_type}</Badge>
                  </div>
                  <span className="text-lg font-bold">
                    ${Number(rec.estimated_total_cost || 0).toFixed(2)}
                  </span>
                </div>
                <p className="text-sm mb-2">{rec.description}</p>
                <div className="text-xs text-gray-500">
                  Parts: ${Number(rec.estimated_parts_cost || 0).toFixed(2)} • 
                  Labor: {rec.estimated_labor_hours}h @ ${Number(rec.estimated_labor_cost || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Wrench className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>No recommendations yet. Add your first recommendation to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Photos Tab Component (Phase 2 placeholder)
function PhotosTab({
  diagnosisId,
  onRefresh,
}: {
  diagnosisId: number;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: photos = [], isLoading, error } = useQuery({
    queryKey: ["diagnosis-photos", diagnosisId],
    queryFn: () => diagnosisApi.photos.list({ diagnosis: diagnosisId }),
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["diagnosis-photos", diagnosisId] });
    onRefresh();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Diagnosis Photos</CardTitle>
          <CardDescription>
            Visual evidence captured during the diagnostic process
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">
            Failed to load photos. Please try again.
          </p>
        ) : photos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Camera className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>No photos uploaded yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="border rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900"
              >
                {photo.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.photo_url}
                    alt={photo.caption || "Diagnosis photo"}
                    className="w-full h-48 object-cover"
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center bg-gray-200 text-gray-500">
                    No preview available
                  </div>
                )}
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium">{photo.caption || "Untitled"}</p>
                  <Badge variant="secondary">
                    {photo.photo_type_display || photo.photo_type}
                  </Badge>
                  <p className="text-xs text-gray-500">
                    Taken:{" "}
                    {photo.taken_at
                      ? format(new Date(photo.taken_at), "PPp")
                      : "Unknown"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Summary Tab Component
function SummaryTab({ diagnosis, workOrder }: { diagnosis: Diagnosis; workOrder: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnosis Summary</CardTitle>
        <CardDescription>
          Overall diagnosis summary and totals
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-medium">Diagnostic Time</span>
            </div>
            <p className="text-2xl font-bold">
              {diagnosis.diagnostic_time_formatted || `${diagnosis.diagnostic_time_hours}h`}
            </p>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-medium">Diagnostic Fee</span>
            </div>
            <p className="text-2xl font-bold">
              ${Number(diagnosis.diagnostic_fee || 0).toFixed(2)}
            </p>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <Wrench className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-medium">Recommendations</span>
            </div>
            <p className="text-2xl font-bold">
              {diagnosis.repair_recommendations?.length || 0}
            </p>
          </div>
        </div>

        {diagnosis.total_estimated_cost && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">Total Estimated Cost</span>
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                ${Number(diagnosis.total_estimated_cost).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold mb-2">Root Cause</h3>
          <p className="text-sm mb-4">{diagnosis.root_cause || "Not yet identified"}</p>
          {diagnosis.root_cause_explanation && (
            <>
              <h3 className="font-semibold mb-2">Explanation</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {diagnosis.root_cause_explanation}
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

