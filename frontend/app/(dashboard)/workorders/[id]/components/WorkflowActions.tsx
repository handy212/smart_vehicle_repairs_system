"use client";

import { useState } from "react";
import React from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { workordersApi } from "@/lib/api/workorders";
import { inspectionsApi } from "@/lib/api/inspections";
import { diagnosisApi } from "@/lib/api/diagnosis";
import { VehicleDamageMarker } from "@/components/inspections/VehicleDamageMarker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/useToast";
import { workOrderNotesApi } from "@/lib/api/workorder-notes";
import { adminApi } from "@/lib/api/admin";
import { useCurrency } from "@/lib/hooks/useCurrency";
import {
  Play,
  Pause,
  CheckCircle,
  AlertCircle,
  FileCheck,
  Send,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  X,
  RotateCcw,
  ClipboardCheck,
  DollarSign,
  Lock,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Wrench,
  Eye,
  AlertTriangle,
  User,
  Sparkles,
  Info,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { SignaturePad } from "@/components/inspections/SignaturePad";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface WorkflowActionsProps {
  workOrderId: number;
  status: string;

  workOrder?: any; // Work order data to get vehicle info
  onStatusChange?: () => void;
  onStartRepairs?: () => void;
  inline?: boolean; // If true, render just the primary button inline (for progress indicator)
}

export default function WorkflowActions({
  workOrderId, status, workOrder, onStatusChange, onStartRepairs, inline = false }: WorkflowActionsProps) {
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showCompleteDiagnosisDialog, setShowCompleteDiagnosisDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showQualityCheckDialog, setShowQualityCheckDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showMarkInvoicedDialog, setShowMarkInvoicedDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showAdditionalWorkDialog, setShowAdditionalWorkDialog] = useState(false);
  const [showRequestApprovalDialog, setShowRequestApprovalDialog] = useState(false);
  const [showInspectionDialog, setShowInspectionDialog] = useState(false);
  const [showStartDiagnosisDialog, setShowStartDiagnosisDialog] = useState(false);
  const [showAssignServiceCoordinatorDialog, setShowAssignServiceCoordinatorDialog] = useState(false);
  const [inspectionFieldErrors, setInspectionFieldErrors] = useState<Record<string, string>>({});

  // Fetch work order data if not provided
  const { data: workOrderData } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId),
    enabled: !workOrder,
  });

  const currentWorkOrder = workOrder || workOrderData;

  // Fetch diagnosis to check completion status
  const { data: diagnosisData } = useQuery({
    queryKey: ["diagnosis", "workorder", workOrderId],
    queryFn: () => diagnosisApi.getByWorkOrder(workOrderId),
    enabled: !!workOrderId && !isNaN(workOrderId) && status === "diagnosis",
    retry: false, // Don't retry if diagnosis doesn't exist yet
  });

  // Check if diagnosis is completed
  const isDiagnosisCompleted = diagnosisData?.status === "completed" || diagnosisData?.is_completed === true;

  // Fetch inspections for this work order
  const { data: inspectionsData } = useQuery({
    queryKey: ["inspections", "workorder", workOrderId],
    queryFn: async () => {
      if (!workOrderId || isNaN(workOrderId)) {
        console.warn("Invalid workOrderId for inspections query:", workOrderId);
        return { results: [], count: 0, next: null, previous: null };
      }
      return inspectionsApi.list({ work_order: workOrderId });
    },
    enabled: !!workOrderId && !isNaN(workOrderId),
  });

  // Check if there's an approved inspection (fully done)
  // Inspection must be "approved" status (not just "completed") to proceed to intake
  const hasApprovedInspection = inspectionsData?.results?.some(

    (inspection: any) => inspection.status === "approved"
  ) || false;

  const refreshWorkOrder = () => {
    queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
    onStatusChange?.();
  };

  // Create Inspection
  const createInspectionMutation = useMutation({
    mutationFn: async (data: any) => {
      setInspectionFieldErrors({});
      try {
        const response = await inspectionsApi.create(data);

        // Check if response is empty
        if (!response || (typeof response === 'object' && Object.keys(response).length === 0)) {
          console.error("Empty response received from inspection creation");
          throw new Error("Inspection creation returned an empty response. Please check server logs.");
        }

        return response;

      } catch (error: any) {
        if (process.env.NODE_ENV === 'development') {
          console.error("Inspection creation mutation error:", {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            stack: error.stack
          });
        }
        throw error;
      }
    },
    onSuccess: (inspection) => {
      // Validate inspection response has an ID
      if (!inspection) {
        console.error("Inspection creation response is null or undefined");
        toast({
          title: "Error",
          description: "Inspection creation failed. Please try again.",
          variant: "destructive",
        });
        setShowInspectionDialog(false);
        return;
      }

      const inspectionId = inspection.id;

      if (!inspectionId || inspectionId === null || inspectionId === undefined) {
        console.error("Inspection creation response missing ID:", inspection);
        toast({
          title: "Error",
          description: "Inspection was created but could not retrieve the ID. Please check the inspections list.",
          variant: "destructive",
        });
        setShowInspectionDialog(false);
        queryClient.invalidateQueries({ queryKey: ["inspections", "workorder", workOrderId] });
        return;
      }

      // Ensure inspectionId is a number
      const numericId = typeof inspectionId === 'number' ? inspectionId : parseInt(String(inspectionId));

      if (isNaN(numericId) || numericId <= 0) {
        console.error("Invalid inspection ID:", inspectionId, "numericId:", numericId);
        toast({
          title: "Error",
          description: "Inspection was created but has an invalid ID. Please check the inspections list.",
          variant: "destructive",
        });
        setShowInspectionDialog(false);
        queryClient.invalidateQueries({ queryKey: ["inspections", "workorder", workOrderId] });
        return;
      }

      // Update work order status to inspection
      workordersApi.updateStatus(workOrderId, "inspection").then(() => {
        queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
        queryClient.invalidateQueries({ queryKey: ["inspections", "workorder", workOrderId] });
        setShowInspectionDialog(false);
        toast({
          title: "Success",
          description: "Inspection created. Please complete it before proceeding to intake.",
          variant: "success",
        });
        // Navigate to inspection detail page
        router.push(`/inspections/${numericId}`);
        onStatusChange?.();
      }).catch((error) => {
        console.error("Error updating work order status:", error);
        // Still navigate to inspection even if status update fails
        setShowInspectionDialog(false);
        queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
        queryClient.invalidateQueries({ queryKey: ["inspections", "workorder", workOrderId] });
        toast({
          title: "Warning",
          description: "Inspection created but work order status update failed. Navigating to inspection page.",
          variant: "default",
        });
        router.push(`/inspections/${numericId}`);
        onStatusChange?.();
      });
    },

    onError: (error: any) => {
      if (process.env.NODE_ENV === 'development') {
        console.error("Inspection creation onError caught:", {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data ? JSON.parse(JSON.stringify(error.response.data)) : null
        });
      }

      let errorMessage = "Failed to create inspection";

      if (error.response?.data) {
        const data = error.response.data;

        // Handle field-level errors
        const newFieldErrors: Record<string, string> = {};
        let hasFieldErrors = false;

        // Ensure data is an object before iterating
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
          Object.keys(data).forEach((field) => {
            if (field !== 'non_field_errors' && field !== 'detail' && field !== 'error' && field !== 'message') {
              const fieldData = data[field];
              let fieldError = "";

              if (Array.isArray(fieldData)) {
                // If it's an array of strings or objects, get the first one
                const first = fieldData[0];
                fieldError = typeof first === 'object' ? (first.message || JSON.stringify(first)) : String(first);
              } else {
                fieldError = typeof fieldData === 'object' ? (fieldData.message || JSON.stringify(fieldData)) : String(fieldData);
              }

              newFieldErrors[field] = fieldError;
              hasFieldErrors = true;
            }
          });
        }

        if (hasFieldErrors) {
          setInspectionFieldErrors(newFieldErrors);
          errorMessage = "Please correct the errors in the form below.";
        } else if (typeof data === 'string' && data.length > 0) {
          errorMessage = data;
        } else if (data.error) {
          errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        } else if (data.detail) {
          errorMessage = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
        } else if (data.message) {
          errorMessage = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
        } else if (Array.isArray(data) && data.length > 0) {
          errorMessage = data.join(', ');
        } else if (Object.keys(data).length > 0) {
          errorMessage = JSON.stringify(data);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Assign Service Coordinator mutation (after intake)
  const assignServiceCoordinatorMutation = useMutation({
    mutationFn: ({ serviceCoordinatorId, initialObservations }: { serviceCoordinatorId: number; initialObservations?: string }) => {
      // Store initial observations in localStorage for later use when starting diagnosis
      if (initialObservations && initialObservations.trim()) {
        localStorage.setItem(`initial_observations_${workOrderId}`, initialObservations.trim());
      }
      return workordersApi.startIntake(workOrderId, { service_coordinator: serviceCoordinatorId });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Service Coordinator assigned. Work order moved to 'Assigned' status."
      });
      setShowAssignServiceCoordinatorDialog(false);
      refreshWorkOrder();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.detail || "Failed to assign Service Coordinator",
        variant: "destructive",
      });
    },
  });

  // Start Intake (Phase 1: Customer Intake) - with validation
  const startIntakeMutation = useMutation({
    mutationFn: () => workordersApi.startIntake(workOrderId),
    onSuccess: () => {
      // After intake, show Service Coordinator assignment dialog
      setShowAssignServiceCoordinatorDialog(true);
    },

    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || error.response?.data?.detail || "Failed to start intake";

      // Check if error is about missing inspection
      if (errorMessage.includes("inspection") || !hasApprovedInspection) {
        toast({
          title: "Inspection Required",
          description: "Please complete the initial inspection before starting intake.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  // Start Diagnosis (Phase 1: Diagnosis) - Using new diagnosis system
  const startDiagnosisMutation = useMutation({
    mutationFn: async (data?: { primary_technician?: number; priority?: string }) => {
      // Validate Service Coordinator is assigned before starting diagnosis
      if (!currentWorkOrder?.service_coordinator) {
        throw new Error('A Service Coordinator must be assigned before diagnosis can be carried out. Please assign a Service Coordinator during intake.');
      }

      // Retrieve initial observations from localStorage if stored during Service Coordinator assignment
      let initialObservations: string | undefined;
      try {
        const stored = localStorage.getItem(`initial_observations_${workOrderId}`);
        if (stored) {
          initialObservations = stored;
          // Clear from localStorage after retrieving
          localStorage.removeItem(`initial_observations_${workOrderId}`);
        }
      } catch (error) {
        console.error("Failed to retrieve initial observations from storage:", error);
      }

      // Check if diagnosis already exists for this work order
      let diagnosis = await diagnosisApi.getByWorkOrder(workOrderId);

      if (!diagnosis) {
        // Create new Diagnosis record using the new diagnosis system
        const customerComplaint = currentWorkOrder?.customer_concerns || "No complaint specified";
        diagnosis = await diagnosisApi.create({
          work_order: workOrderId,
          technician: data?.primary_technician || undefined,
          customer_complaint: customerComplaint,
          initial_observations: initialObservations,
        });
      }

      // Update work order status to diagnosis
      await workordersApi.startDiagnosis(workOrderId);

      // Update work order with additional info if provided
      if (data && (data.primary_technician || data.priority)) {

        const updateData: any = {};
        if (data.primary_technician) updateData.primary_technician = data.primary_technician;
        if (data.priority) updateData.priority = data.priority;

        await workordersApi.update(workOrderId, updateData);
      }

      return diagnosis;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onSuccess: (diagnosis) => {
      toast({
        title: "Success",
        description: "Diagnosis started. Redirecting to diagnosis page..."
      });
      setShowStartDiagnosisDialog(false);
      refreshWorkOrder();
      // Navigate to the diagnosis detail page
      router.push(`/workorders/${workOrderId}/diagnosis`);
    },

    onError: (error: any) => {
      console.error("Start diagnosis error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.detail || "Failed to start diagnosis",
        variant: "destructive",
      });
    },
  });

  // Complete Diagnosis (Phase 1 → Phase 2: Diagnosis Complete, Estimate Ready)
  const completeDiagnosisMutation = useMutation({

    mutationFn: (data: any) => workordersApi.completeDiagnosis(workOrderId, data),
    onSuccess: () => {
      toast({ title: "Success", description: "Diagnosis completed." });
      setShowCompleteDiagnosisDialog(false);
      refreshWorkOrder();
    },

    onError: (error: any) => {
      console.error("Complete diagnosis error - Full error object:", error);
      console.error("Complete diagnosis error - Response:", error.response);
      console.error("Complete diagnosis error - Response data:", error.response?.data);

      let errorMessage = "Failed to complete diagnosis";

      if (error.response?.data) {
        const data = error.response.data;
        if (typeof data === 'string') {
          errorMessage = data;
        } else if (data.error) {
          errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        } else if (data.detail) {
          errorMessage = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
        } else if (data.message) {
          errorMessage = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
        } else if (Array.isArray(data)) {
          errorMessage = data.join(', ');
        } else {
          const errorValues = Object.values(data).filter(v => v);
          if (errorValues.length > 0) {
            errorMessage = errorValues.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(', ');
          } else {
            errorMessage = JSON.stringify(data);
          }
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Request Approval (Phase 2: Customer Approval - Manual Request)
  const requestApprovalMutation = useMutation({
    mutationFn: () => workordersApi.requestApproval(workOrderId),

    onSuccess: (data: any) => {
      const estimateNumber = data?.estimate_number || data?.estimate?.estimate_number;
      const message = estimateNumber
        ? `Estimate #${estimateNumber} submitted for customer approval. Customer will be notified.`
        : "Work order moved to 'Awaiting Approval' status. Customer will be notified.";

      toast({
        title: "Approval requested successfully",
        description: message
      });
      setShowRequestApprovalDialog(false);
      refreshWorkOrder();
    },

    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || error.response?.data?.detail || error.message || "Failed to request approval";

      // Provide helpful error messages for common validation failures
      let description = errorMessage;
      if (errorMessage.includes("diagnosis notes")) {
        description = "Please ensure diagnosis notes are filled in before requesting approval.";
      } else if (errorMessage.includes("estimated total") || errorMessage.includes("greater than 0")) {
        description = "Please ensure the estimated total cost is greater than $0. This is calculated from repair recommendations in the diagnosis.";
      }

      toast({
        title: "Failed to request approval",
        description: description,
        variant: "destructive",
      });
    },
  });

  // Approve (Phase 2: Customer Approved)
  const approveMutation = useMutation({

    mutationFn: (data: any) => workordersApi.approve(workOrderId, data),
    onSuccess: () => {
      toast({ title: "Success", description: "Work order approved." });
      setShowApproveDialog(false);
      refreshWorkOrder();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to approve work order",
        variant: "destructive",
      });
    },
  });

  // Start Work (Phase 3: Repair Execution Begins)
  const startWorkMutation = useMutation({
    mutationFn: () => workordersApi.startWork(workOrderId),

    onSuccess: (data: any) => {
      const tasksCreated = data?.tasks_created || 0;
      const partsLinked = data?.parts_linked || 0;

      let description = "Repairs started. Switched to Tasks view.";
      if (tasksCreated > 0) {
        description += ` Created ${tasksCreated} task(s) from approved recommendations.`;
        if (partsLinked > 0) {
          description += ` Linked ${partsLinked} part(s) to tasks.`;
        }
      }

      toast({
        title: "Success",
        description: description
      });
      refreshWorkOrder();
      onStartRepairs?.();
    },

    onError: (error: any) => {
      console.error("Start work error:", error);
      console.error("Error response:", error.response);
      console.error("Error response data:", error.response?.data);

      // Extract error message from various possible locations
      let errorMessage = "Failed to start repairs";

      if (error.response?.data) {
        const data = error.response.data;
        errorMessage = data.error || data.detail || data.message || JSON.stringify(data);
      } else if (error.message) {
        errorMessage = error.message;
      }

      // If it's still empty or just an object, try to stringify
      if (!errorMessage || errorMessage === "{}" || errorMessage === "[object Object]") {
        errorMessage = error.response?.data
          ? JSON.stringify(error.response.data)
          : "An unexpected error occurred. Please check the console for details.";
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Additional Work Found (Phase 3: New Problems Discovered)
  const additionalWorkFoundMutation = useMutation({
    mutationFn: async (notes: string) => {
      // First update status
      const workOrder = await workordersApi.updateStatus(workOrderId, "additional_work_found");
      // Then create a note with the specific additional work details
      if (notes && notes.trim()) {
        try {
          await workOrderNotesApi.create({
            work_order: workOrderId,
            note_type: "internal",
            note: `Additional work discovered: ${notes.trim()}`,
            is_important: true,
            is_customer_visible: false,
          });
        } catch (noteError) {
          // Log but don't fail the mutation if note creation fails
          console.error("Failed to create additional work note:", noteError);
        }
      }
      return workOrder;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Additional work flagged - customer approval required." });
      setShowAdditionalWorkDialog(false);
      refreshWorkOrder();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.detail || "Failed to flag additional work",
        variant: "destructive",
      });
    },
  });

  // Pause (Phase 3: Work Paused)
  const pauseMutation = useMutation({
    mutationFn: (reason: string) => workordersApi.pause(workOrderId, reason),
    onSuccess: () => {
      toast({ title: "Success", description: "Work order paused." });
      setShowPauseDialog(false);
      refreshWorkOrder();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to pause work order",
        variant: "destructive",
      });
    },
  });

  // Resume (Phase 3: Work Resumed)
  const resumeMutation = useMutation({
    mutationFn: () => workordersApi.resume(workOrderId),
    onSuccess: () => {
      toast({ title: "Success", description: "Work order resumed." });
      refreshWorkOrder();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to resume work order",
        variant: "destructive",
      });
    },
  });

  // Request Quality Check (Phase 4: Quality Control Requested)
  const requestQualityCheckMutation = useMutation({
    mutationFn: () => workordersApi.requestQualityCheck(workOrderId),
    onSuccess: () => {
      toast({ title: "Success", description: "Quality check requested." });
      refreshWorkOrder();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to request quality check",
        variant: "destructive",
      });
    },
  });

  // Quality Check (Phase 4: Quality Control Performed)
  const qualityCheckMutation = useMutation({

    mutationFn: (data: any) => workordersApi.qualityCheck(workOrderId, data),
    onSuccess: (response, variables) => {
      // Check if QC passed or failed based on the data sent
      const passed = variables?.passed ?? false;
      if (passed) {
        toast({
          title: "Success",
          description: "Quality check passed! Work order marked as completed.",
          variant: "success",
        });
      } else {
        toast({
          title: "Quality Check Failed",
          description: "Quality check failed. Work order returned to 'In Progress' status. Technicians have been notified to fix the issues.",
          variant: "warning",
        });
      }
      setShowQualityCheckDialog(false);
      refreshWorkOrder();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to complete quality check",
        variant: "destructive",
      });
    },
  });

  // Complete (Phase 4: Work Completed)
  const completeMutation = useMutation({

    mutationFn: (data: any) => workordersApi.complete(workOrderId, data),
    onSuccess: () => {
      toast({ title: "Success", description: "Work order completed." });
      setShowCompleteDialog(false);
      refreshWorkOrder();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to complete work order",
        variant: "destructive",
      });
    },
  });

  // Mark Invoiced (Phase 4: Invoicing Complete)
  const markInvoicedMutation = useMutation({
    mutationFn: (data: { odometer_out?: number }) => workordersApi.markInvoiced(workOrderId, data),
    onSuccess: () => {
      toast({ title: "Success", description: "Work order marked as invoiced." });
      setShowMarkInvoicedDialog(false);
      refreshWorkOrder();
    },

    onError: (error: any) => {
      let errorMessage = "Failed to mark as invoiced";
      if (error.response?.data) {
        const data = error.response.data;
        if (data.odometer_out) {
          errorMessage = Array.isArray(data.odometer_out) ? data.odometer_out[0] : data.odometer_out;
        } else if (data.error) {
          errorMessage = data.error;
        } else if (data.detail) {
          errorMessage = data.detail;
        } else {
          errorMessage = JSON.stringify(data);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      console.error("Mark invoiced error:", error.response?.data || error);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Close (Phase 5: Vehicle Handover Complete)
  const closeMutation = useMutation({
    mutationFn: (data?: { payment_received?: boolean; closing_notes?: string }) =>
      workordersApi.close(workOrderId, data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Work order closed successfully. Vehicle has been handed over to customer.",
        variant: "success",
      });
      setShowCloseDialog(false);
      refreshWorkOrder();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to close work order",
        variant: "destructive",
      });
    },
  });

  // Reopen (Phase 5: Reopen Closed Work Order)
  const reopenMutation = useMutation({
    mutationFn: () => workordersApi.reopen(workOrderId),
    onSuccess: () => {
      toast({ title: "Success", description: "Work order reopened." });
      refreshWorkOrder();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to reopen work order",
        variant: "destructive",
      });
    },
  });

  // Determine which actions are available based on status
  const getAvailableActions = () => {
    const actions: Array<{
      label: string;

      icon: any;
      onClick: () => void;
      variant?: "default" | "outline" | "destructive" | "secondary";
      disabled?: boolean;
      description?: string;
    }> = [];

    switch (status) {
      // Phase 1: Customer Intake & Diagnosis
      case "draft":
        actions.push(
          {
            label: "Start Initial Inspection",
            icon: Eye,
            onClick: () => setShowInspectionDialog(true),
            disabled: createInspectionMutation.isPending,
            variant: "outline",
            description: "Perform initial visual inspection/triage",
          },
          {
            label: "Start Intake",
            icon: Play,
            onClick: () => startIntakeMutation.mutate(),
            disabled: startIntakeMutation.isPending || !hasApprovedInspection,
            description: hasApprovedInspection
              ? "Begin customer intake process"
              : "Inspection must be completed and approved before starting intake",
          }
        );
        break;

      case "inspection":
        actions.push({
          label: "Start Intake",
          icon: Play,
          onClick: () => startIntakeMutation.mutate(),
          disabled: startIntakeMutation.isPending || !hasApprovedInspection,
          description: hasApprovedInspection
            ? "Move to intake after initial inspection"
            : "Inspection must be completed and approved before starting intake",
        });
        break;

      case "intake":
        actions.push({
          label: "Assign Service Coordinator",
          icon: User,
          onClick: () => setShowAssignServiceCoordinatorDialog(true),
          description: "Assign a Service Coordinator to proceed with diagnosis",
        });
        break;

      case "assigned":
        // Only Service Coordinator or managers/admins can trigger diagnosis
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const isServiceCoordinator = currentWorkOrder?.service_coordinator && (
          typeof currentWorkOrder.service_coordinator === 'object'

            ? currentWorkOrder.service_coordinator.id === (currentWorkOrder as any).current_user_id

            : currentWorkOrder.service_coordinator === (currentWorkOrder as any).current_user_id
        );
        actions.push({
          label: "Start Diagnosis",
          icon: ClipboardCheck,
          onClick: () => setShowStartDiagnosisDialog(true),
          disabled: startDiagnosisMutation.isPending,
          description: "Service Coordinator: Trigger diagnosis and assign technician",
        });
        break;

      case "diagnosis":
        // If diagnosis is completed, prioritize next stage actions
        if (isDiagnosisCompleted) {
          // Diagnosis is complete - show next stage action as primary
          // Check if we should show "Request Approval" or other next step
          const requiresApproval = diagnosisData?.requires_approval ?? currentWorkOrder?.requires_approval ?? true;

          if (requiresApproval) {
            // Primary action: Request Approval (next stage)
            actions.push(
              {
                label: "Request Approval",
                icon: Send,
                onClick: () => setShowRequestApprovalDialog(true),
                disabled: requestApprovalMutation.isPending,
                variant: "default",
                description: "Request customer approval to proceed with repairs",
              },
              {
                label: "View Diagnosis",
                icon: Eye,
                onClick: () => router.push(`/workorders/${workOrderId}/diagnosis`),
                variant: "outline",
                description: "View completed diagnosis details",
              }
            );
          } else {
            // No approval needed - show actions for next stage
            actions.push(
              {
                label: "View Diagnosis",
                icon: Eye,
                onClick: () => router.push(`/workorders/${workOrderId}/diagnosis`),
                variant: "default",
                description: "View completed diagnosis details",
              }
            );
          }
        } else {
          // Diagnosis not completed yet
          actions.push(
            {
              label: "Open Diagnosis",
              icon: Eye,
              onClick: () => router.push(`/workorders/${workOrderId}/diagnosis`),
              variant: "default",
              description: "View and manage diagnosis details",
            },
            {
              label: "Request Approval",
              icon: Send,
              onClick: () => setShowRequestApprovalDialog(true),
              disabled: requestApprovalMutation.isPending,
              description: "Request customer approval for existing estimate",
            }
          );
        }
        break;

      // Phase 2: Quotation & Customer Approval
      case "awaiting_approval":
        actions.push({
          label: "Approve",
          icon: CheckCircle,
          onClick: () => setShowApproveDialog(true),
          disabled: approveMutation.isPending,
          description: "Record customer approval",
        });
        break;

      case "approved":
        actions.push({
          label: "Start Repairs",
          icon: Play,
          onClick: () => startWorkMutation.mutate(),
          disabled: startWorkMutation.isPending,
          description: "Begin repair work",
        });
        break;

      // Phase 3: Repair Execution
      case "in_progress":
        actions.push(
          {
            label: "Additional Work Found",
            icon: AlertTriangle,
            onClick: () => setShowAdditionalWorkDialog(true),
            disabled: additionalWorkFoundMutation.isPending,
            variant: "outline",
            description: "Flag new problems - requires customer approval",
          },
          {
            label: "Pause",
            icon: Pause,
            onClick: () => setShowPauseDialog(true),
            disabled: pauseMutation.isPending,
            variant: "outline",
            description: "Pause work temporarily",
          },
          {
            label: "Request Quality Check",
            icon: FileCheck,
            onClick: () => requestQualityCheckMutation.mutate(),
            disabled: requestQualityCheckMutation.isPending,
            variant: "outline",
            description: "Request quality control inspection",
          },
          // Only allow direct "Complete" when QC is not required. If QC is required,
          // the correct next step is to request/perform QC (which transitions to completed).
          ...(!currentWorkOrder?.quality_check_required
            ? [
              {
                label: "Complete",
                icon: CheckCircle,
                onClick: () => setShowCompleteDialog(true),
                disabled: completeMutation.isPending,
                description: "Mark work as completed",
              },
            ]
            : [])
        );
        break;

      case "additional_work_found":
        actions.push(
          {
            label: "Request Approval",
            icon: Send,
            onClick: () => setShowRequestApprovalDialog(true),
            disabled: requestApprovalMutation.isPending,
            description: "Request customer approval for additional work",
          },
          {
            label: "Continue Without Approval",
            icon: Play,
            onClick: async () => {
              try {
                await workordersApi.updateStatus(workOrderId, "in_progress");
                refreshWorkOrder();
                toast({
                  title: "Warning",
                  description: "Work continued without approval",
                  variant: "default",
                });

              } catch (error: any) {
                toast({
                  title: "Error",
                  description: error.response?.data?.error || error.response?.data?.detail || "Failed to continue work",
                  variant: "destructive",
                });
              }
            },
            variant: "outline",
            description: "Continue work without approval (not recommended)",
          }
        );
        break;

      case "paused":
        actions.push({
          label: "Resume",
          icon: Play,
          onClick: () => resumeMutation.mutate(),
          disabled: resumeMutation.isPending,
          description: "Resume paused work",
        });
        break;

      // Phase 4: Quality Control & Billing
      case "quality_check":
        actions.push({
          label: "Perform Quality Check",
          icon: FileCheck,
          onClick: () => setShowQualityCheckDialog(true),
          disabled: qualityCheckMutation.isPending,
          description: "Complete quality control inspection",
        });
        break;

      case "completed":
        actions.push({
          label: "Mark as Invoiced",
          icon: DollarSign,
          onClick: () => setShowMarkInvoicedDialog(true),
          disabled: markInvoicedMutation.isPending,
          variant: "outline",
          description: "Mark invoice as generated",
        });
        break;

      // Phase 5: Vehicle Handover & Post-Service
      case "invoiced":
        actions.push({
          label: "Close Work Order",
          icon: Lock,
          onClick: () => setShowCloseDialog(true),
          disabled: closeMutation.isPending,
          description: "Close work order after customer pickup and payment",
        });
        break;

      case "closed":
        actions.push({
          label: "Reopen",
          icon: RotateCcw,
          onClick: () => reopenMutation.mutate(),
          disabled: reopenMutation.isPending,
          variant: "outline",
          description: "Reopen closed work order",
        });
        break;
    }

    return actions;
  };

  const availableActions = getAvailableActions();

  if (availableActions.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">
          No actions available at this stage.
        </p>
      </div>
    );
  }

  // Determine if current workflow step is completed
  // "Other Actions" should only show when we're in a waiting/stable state,
  // not when actively working through a primary workflow step
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isCurrentStepCompleted = (() => {
    // These statuses indicate we're at a stable/waiting state where primary workflow step is done
    // and secondary actions are safe to show
    const completedStates = [
      'awaiting_approval',  // Waiting for customer approval - diagnosis step is done
      'approved',           // Approved and ready - can show other actions
      'paused',             // Work paused - can show other actions
      'completed',          // Work completed - can show other actions
      'invoiced',           // Invoiced - can show other actions
      'closed',             // Closed - can show other actions
    ];

    // For "in_progress", "diagnosis", and "inspection" - these are active workflow steps
    // Only show other actions if there are truly secondary actions (like in_progress has pause, etc.)
    // For now, we'll hide for active workflow steps: draft, inspection, intake, diagnosis
    const activeWorkflowSteps = ['draft', 'inspection', 'intake', 'diagnosis'];

    if (activeWorkflowSteps.includes(status)) {
      return false; // Don't show other actions during active workflow steps
    }

    // For "in_progress" and "additional_work_found", we allow secondary actions since they're part of active work management
    if (status === 'in_progress' || status === 'additional_work_found') {
      return true; // Allow secondary actions for work management
    }

    return completedStates.includes(status);
  })();

  // Primary action is the first one
  const primaryAction = availableActions[0];
  const secondaryActions = availableActions.slice(1);
  const PrimaryIcon = primaryAction.icon;

  // Render primary button (inline or full card)
  const primaryButton = (
    <Button
      variant={primaryAction.variant || "default"}
      onClick={primaryAction.onClick}
      disabled={primaryAction.disabled}
      className={inline ? "bg-muted text-foreground " : "w-full h-12 text-base font-medium bg-muted text-foreground "}
      size={inline ? "default" : "lg"}
    >
      <PrimaryIcon className={inline ? "w-4 h-4 mr-2" : "w-5 h-5 mr-2"} />
      {primaryAction.label}
    </Button>
  );

  // Render dialogs (always needed, whether inline or not)
  const renderDialogs = () => (
    <>
      {/* Complete Diagnosis Dialog */}
      <Dialog open={showCompleteDiagnosisDialog} onOpenChange={setShowCompleteDiagnosisDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Complete Diagnosis</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Finish diagnosis and create estimate for customer approval
            </DialogDescription>
          </DialogHeader>
          <CompleteDiagnosisForm
            onSubmit={(data) => completeDiagnosisMutation.mutate(data)}
            onCancel={() => setShowCompleteDiagnosisDialog(false)}
            isSubmitting={completeDiagnosisMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Request Approval Dialog */}
      <Dialog open={showRequestApprovalDialog} onOpenChange={setShowRequestApprovalDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Request Customer Approval</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Request approval for the current estimate. Ensure diagnosis notes and estimated costs are set.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-3">
            <div className="bg-primary/10 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded p-3">
              <p className="text-sm text-orange-800 text-primary">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                This requires diagnosis notes and an estimated total greater than $0. The work order will move to "Awaiting Approval" status and notify the customer.
              </p>
            </div>
            {/* Show prerequisites status */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Diagnosis Notes:</span>
                <span className={`font-medium ${currentWorkOrder?.diagnosis_notes ? 'text-success' : 'text-red-600 dark:text-red-400'}`}>
                  {currentWorkOrder?.diagnosis_notes ? '✓ Set' : '✗ Missing'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimated Total:</span>
                <span className={`font-medium ${parseFloat(currentWorkOrder?.estimated_total || '0') > 0 ? 'text-success' : 'text-red-600 dark:text-red-400'}`}>
                  {parseFloat(currentWorkOrder?.estimated_total || '0') > 0
                    ? `✓ ${formatCurrency(parseFloat(currentWorkOrder?.estimated_total || '0'))}`
                    : '✗ $0.00'}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setShowRequestApprovalDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => requestApprovalMutation.mutate()}
              disabled={
                requestApprovalMutation.isPending ||
                !currentWorkOrder?.diagnosis_notes ||
                parseFloat(currentWorkOrder?.estimated_total || '0') <= 0
              }
            >
              {requestApprovalMutation.isPending ? "Requesting..." : "Request Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Additional Work Found Dialog */}
      <Dialog open={showAdditionalWorkDialog} onOpenChange={setShowAdditionalWorkDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-primary">
              <AlertTriangle className="w-5 h-5" />
              <span>Additional Work Found</span>
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              New problems discovered during repair - customer approval required
            </DialogDescription>
          </DialogHeader>
          <AdditionalWorkForm
            onSubmit={(notes) => additionalWorkFoundMutation.mutate(notes)}
            onCancel={() => setShowAdditionalWorkDialog(false)}
            isSubmitting={additionalWorkFoundMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Approve Work Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Record customer approval details
            </DialogDescription>
          </DialogHeader>
          <ApproveForm
            onSubmit={(data) => approveMutation.mutate(data)}
            onCancel={() => setShowApproveDialog(false)}
            isSubmitting={approveMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Quality Check Dialog */}
      <Dialog open={showQualityCheckDialog} onOpenChange={setShowQualityCheckDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Perform Quality Check</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Complete quality control inspection
            </DialogDescription>
          </DialogHeader>
          <QualityCheckForm
            onSubmit={(data) => qualityCheckMutation.mutate(data)}
            onCancel={() => setShowQualityCheckDialog(false)}
            isSubmitting={qualityCheckMutation.isPending}
            workOrderId={workOrderId}
          />
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Complete Work Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Mark work order as completed
            </DialogDescription>
          </DialogHeader>
          <CompleteForm
            onSubmit={(data) => completeMutation.mutate(data)}
            onCancel={() => setShowCompleteDialog(false)}
            isSubmitting={completeMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Mark Invoiced Dialog */}
      <Dialog open={showMarkInvoicedDialog} onOpenChange={setShowMarkInvoicedDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Mark Work Order as Invoiced</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Confirm that the invoice has been generated and sent to the customer
            </DialogDescription>
          </DialogHeader>
          <MarkInvoicedForm
            workOrder={currentWorkOrder}
            onSubmit={(data) => markInvoicedMutation.mutate(data)}
            onCancel={() => setShowMarkInvoicedDialog(false)}
            isSubmitting={markInvoicedMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Close Work Order Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Close Work Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Confirm customer pickup and close this work order
            </DialogDescription>
          </DialogHeader>
          <CloseWorkOrderForm
            workOrder={currentWorkOrder}
            onSubmit={(data) => closeMutation.mutate(data)}
            onCancel={() => setShowCloseDialog(false)}
            isSubmitting={closeMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Pause Dialog */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Pause Work Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Temporarily pause work on this order
            </DialogDescription>
          </DialogHeader>
          <PauseForm
            onSubmit={(reason) => pauseMutation.mutate(reason)}
            onCancel={() => setShowPauseDialog(false)}
            isSubmitting={pauseMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Create Inspection Dialog */}
      <Dialog open={showInspectionDialog} onOpenChange={setShowInspectionDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create Initial Inspection</DialogTitle>
          </DialogHeader>
          <CreateInspectionForm
            workOrder={currentWorkOrder}
            onSubmit={(data) => createInspectionMutation.mutate(data)}
            onCancel={() => setShowInspectionDialog(false)}
            isSubmitting={createInspectionMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Assign Service Coordinator Dialog */}
      <Dialog open={showAssignServiceCoordinatorDialog} onOpenChange={setShowAssignServiceCoordinatorDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Assign Service Coordinator</DialogTitle>
          </DialogHeader>
          <AssignServiceCoordinatorForm
            workOrder={currentWorkOrder}
            onSubmit={(data) => assignServiceCoordinatorMutation.mutate(data)}
            onCancel={() => setShowAssignServiceCoordinatorDialog(false)}
            isSubmitting={assignServiceCoordinatorMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Start Diagnosis Dialog */}
      <Dialog open={showStartDiagnosisDialog} onOpenChange={setShowStartDiagnosisDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Start Diagnosis</DialogTitle>

          </DialogHeader>
          <StartDiagnosisForm
            workOrder={currentWorkOrder}
            onSubmit={(data) => startDiagnosisMutation.mutate(data)}
            onCancel={() => setShowStartDiagnosisDialog(false)}
            isSubmitting={startDiagnosisMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </>
  );

  // Inline mode - for in_progress status, show secondary actions too
  if (inline) {
    // For active work statuses, show secondary actions even in inline mode
    const showSecondaryInInline = status === 'in_progress' || status === 'additional_work_found';

    return (
      <>
        <div className="flex flex-col gap-2">
          {primaryButton}
          {showSecondaryInInline && secondaryActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {secondaryActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={index}
                    variant={action.variant || "outline"}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    title={action.description}
                    size="sm"
                    className="bg-muted text-foreground "
                  >
                    <Icon className="w-4 h-4 mr-1" />
                    {action.label}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
        {renderDialogs()}
      </>
    );
  }

  return (
    <>
      {/* Primary Action - Large, Prominent */}
      <div className="space-y-3">
        {primaryButton}
        {primaryAction.description && (
          <p className="text-xs text-muted-foreground text-center">
            {primaryAction.description}
          </p>
        )}

        {/* Secondary Actions - Always show if there are any, but label differently based on status */}
        {secondaryActions.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {status === 'in_progress' || status === 'additional_work_found' ? 'Work Management Actions' : 'Other Actions'}
            </p>
            <div className="flex flex-wrap gap-2">
              {secondaryActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={index}
                    variant={action.variant || "outline"}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    title={action.description}
                    size="sm"
                    className="bg-muted text-foreground "
                  >
                    <Icon className="w-4 h-4 mr-1" />
                    {action.label}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Complete Diagnosis Dialog */}
      <Dialog open={showCompleteDiagnosisDialog} onOpenChange={setShowCompleteDiagnosisDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Complete Diagnosis</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Finish diagnosis and create estimate for customer approval
            </DialogDescription>
          </DialogHeader>
          <CompleteDiagnosisForm
            onSubmit={(data) => completeDiagnosisMutation.mutate(data)}
            onCancel={() => setShowCompleteDiagnosisDialog(false)}
            isSubmitting={completeDiagnosisMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Additional Work Found Dialog */}
      <Dialog open={showAdditionalWorkDialog} onOpenChange={setShowAdditionalWorkDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-primary">
              <AlertTriangle className="w-5 h-5" />
              <span>Additional Work Found</span>
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              New problems discovered during repair - customer approval required
            </DialogDescription>
          </DialogHeader>
          <AdditionalWorkForm
            onSubmit={(notes) => additionalWorkFoundMutation.mutate(notes)}
            onCancel={() => setShowAdditionalWorkDialog(false)}
            isSubmitting={additionalWorkFoundMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Approve Work Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Record customer approval details
            </DialogDescription>
          </DialogHeader>
          <ApproveForm
            onSubmit={(data) => approveMutation.mutate(data)}
            onCancel={() => setShowApproveDialog(false)}
            isSubmitting={approveMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Quality Check Dialog */}
      <Dialog open={showQualityCheckDialog} onOpenChange={setShowQualityCheckDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Perform Quality Check</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Complete quality control inspection
            </DialogDescription>
          </DialogHeader>
          <QualityCheckForm
            onSubmit={(data) => qualityCheckMutation.mutate(data)}
            onCancel={() => setShowQualityCheckDialog(false)}
            isSubmitting={qualityCheckMutation.isPending}
            workOrderId={workOrderId}
          />
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Complete Work Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Mark work order as completed
            </DialogDescription>
          </DialogHeader>
          <CompleteForm
            onSubmit={(data) => completeMutation.mutate(data)}
            onCancel={() => setShowCompleteDialog(false)}
            isSubmitting={completeMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Mark Invoiced Dialog */}
      <Dialog open={showMarkInvoicedDialog} onOpenChange={setShowMarkInvoicedDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Mark Work Order as Invoiced</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Confirm that the invoice has been generated and sent to the customer
            </DialogDescription>
          </DialogHeader>
          <MarkInvoicedForm
            workOrder={currentWorkOrder}
            onSubmit={(data) => markInvoicedMutation.mutate(data)}
            onCancel={() => setShowMarkInvoicedDialog(false)}
            isSubmitting={markInvoicedMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Close Work Order Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Close Work Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Confirm customer pickup and close this work order
            </DialogDescription>
          </DialogHeader>
          <CloseWorkOrderForm
            workOrder={currentWorkOrder}
            onSubmit={(data) => closeMutation.mutate(data)}
            onCancel={() => setShowCloseDialog(false)}
            isSubmitting={closeMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Pause Dialog */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Pause Work Order</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Temporarily pause work on this order
            </DialogDescription>
          </DialogHeader>
          <PauseForm
            onSubmit={(reason) => pauseMutation.mutate(reason)}
            onCancel={() => setShowPauseDialog(false)}
            isSubmitting={pauseMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Create Inspection Dialog */}
      <Dialog open={showInspectionDialog} onOpenChange={setShowInspectionDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create Initial Inspection</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Create a new inspection for this work order
            </DialogDescription>
          </DialogHeader>
          <CreateInspectionForm
            workOrder={currentWorkOrder}
            onSubmit={(data) => createInspectionMutation.mutate(data)}
            onCancel={() => setShowInspectionDialog(false)}
            isSubmitting={createInspectionMutation.isPending}
            fieldErrors={inspectionFieldErrors}
          />
        </DialogContent>
      </Dialog>

      {/* Assign Service Coordinator Dialog */}
      <Dialog open={showAssignServiceCoordinatorDialog} onOpenChange={setShowAssignServiceCoordinatorDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Assign Service Coordinator</DialogTitle>
          </DialogHeader>
          <AssignServiceCoordinatorForm
            workOrder={currentWorkOrder}
            onSubmit={(data) => assignServiceCoordinatorMutation.mutate(data)}
            onCancel={() => setShowAssignServiceCoordinatorDialog(false)}
            isSubmitting={assignServiceCoordinatorMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Start Diagnosis Dialog */}
      <Dialog open={showStartDiagnosisDialog} onOpenChange={setShowStartDiagnosisDialog}>
        <DialogContent className="bg-muted border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Start Diagnosis</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Begin diagnostic testing for this vehicle. You can assign a technician for the diagnosis process.
            </DialogDescription>
          </DialogHeader>
          <StartDiagnosisForm
            workOrder={currentWorkOrder}
            onSubmit={(data) => startDiagnosisMutation.mutate(data)}
            onCancel={() => setShowStartDiagnosisDialog(false)}
            isSubmitting={startDiagnosisMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// Form Components
function CompleteDiagnosisForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {

  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [diagnosisNotes, setDiagnosisNotes] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [estimatedLaborHours, setEstimatedLaborHours] = useState("");
  const [estimatedLaborCost, setEstimatedLaborCost] = useState("");
  const [estimatedPartsCost, setEstimatedPartsCost] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setValidationError(null);

    // Validate: If requires approval, must have at least one cost estimate
    if (requiresApproval) {
      const hasLaborCost = estimatedLaborCost && estimatedLaborCost.trim() !== '' && parseFloat(estimatedLaborCost) > 0;
      const hasPartsCost = estimatedPartsCost && estimatedPartsCost.trim() !== '' && parseFloat(estimatedPartsCost) > 0;

      if (!hasLaborCost && !hasPartsCost) {
        setValidationError("When customer approval is required, you must provide at least one cost estimate (labor cost or parts cost).");
        return;
      }
    }


    const data: any = {
      diagnosis_notes: diagnosisNotes,
      requires_approval: requiresApproval,
    };

    // Only include fields that have values
    if (estimatedLaborHours && estimatedLaborHours.trim() !== '') {
      data.estimated_labor_hours = parseFloat(estimatedLaborHours);
    }
    if (estimatedLaborCost && estimatedLaborCost.trim() !== '') {
      data.estimated_labor_cost = estimatedLaborCost;
    }
    if (estimatedPartsCost && estimatedPartsCost.trim() !== '') {
      data.estimated_parts_cost = estimatedPartsCost;
    }

    onSubmit(data);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="space-y-4">
          {validationError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
              {validationError}
            </div>
          )}
          <div>
            <Label htmlFor="diagnosis_notes" className="block mb-2 text-foreground">
              Diagnosis Notes *
            </Label>
            <Textarea
              id="diagnosis_notes"
              value={diagnosisNotes}
              onChange={(e) => setDiagnosisNotes(e.target.value)}
              required
              rows={4}
              className="w-full bg-muted border-border text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="estimated_labor_hours" className="block mb-2 text-foreground">
                Estimated Labor Hours
              </Label>
              <Input
                id="estimated_labor_hours"
                type="number"
                step="0.1"
                value={estimatedLaborHours}
                onChange={(e) => setEstimatedLaborHours(e.target.value)}
                className="w-full bg-muted border-border text-foreground"
              />
            </div>
            <div>
              <Label htmlFor="estimated_labor_cost" className="block mb-2 text-foreground">
                Estimated Labor Cost
              </Label>
              <Input
                id="estimated_labor_cost"
                type="number"
                step="0.01"
                value={estimatedLaborCost}
                onChange={(e) => setEstimatedLaborCost(e.target.value)}
                className="w-full bg-muted border-border text-foreground"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="estimated_parts_cost" className="block mb-2 text-foreground">
              Estimated Parts Cost
            </Label>
            <Input
              id="estimated_parts_cost"
              type="number"
              step="0.01"
              value={estimatedPartsCost}
              onChange={(e) => setEstimatedPartsCost(e.target.value)}
              className="w-full bg-muted border-border text-foreground"
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="requires_approval"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary bg-muted border-border"
            />
            <Label htmlFor="requires_approval" className="cursor-pointer text-foreground">
              Requires Customer Approval
            </Label>
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Completing..." : "Complete Diagnosis"}
        </Button>
      </DialogFooter>
    </>
  );
}

function AdditionalWorkForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (notes: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [notes, setNotes] = useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSubmit(notes);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="additional_work_notes" className="block mb-2 text-foreground">
              Describe Additional Work Found *
            </Label>
            <Textarea
              id="additional_work_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required
              rows={4}
              placeholder="Describe the new problems discovered..."
              className="w-full bg-muted border-border text-foreground"
            />
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded p-3">
            <p className="text-sm text-orange-800 dark:text-orange-400">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              This will pause the work order and require customer approval before continuing.
            </p>
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" onClick={handleSubmit} disabled={isSubmitting || !notes.trim()}>
          {isSubmitting ? "Flagging..." : "Flag Additional Work"}
        </Button>
      </DialogFooter>
    </>
  );
}

function ApproveForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {

  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [approvalMethod, setApprovalMethod] = useState("phone");
  const [approvalNotes, setApprovalNotes] = useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSubmit({
      approval_method: approvalMethod,
      approval_notes: approvalNotes,
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="approval_method" className="block mb-2 text-foreground">
              Approval Method
            </Label>
            <select
              id="approval_method"
              value={approvalMethod}
              onChange={(e) => setApprovalMethod(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted border-border text-foreground"
            >
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="in_person">In Person</option>
              <option value="text">Text/SMS</option>
            </select>
          </div>
          <div>
            <Label htmlFor="approval_notes" className="block mb-2 text-foreground">
              Notes
            </Label>
            <Textarea
              id="approval_notes"
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              rows={3}
              className="w-full bg-muted border-border text-foreground"
            />
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Approving..." : "Approve"}
        </Button>
      </DialogFooter>
    </>
  );
}

function QualityCheckForm({
  onSubmit,
  onCancel,
  isSubmitting,
  workOrderId,
}: {

  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  workOrderId?: number;
}) {
  const [passed, setPassed] = useState(true);
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState({
    allTasksCompleted: false,
    allPartsInstalled: false,
    vehicleClean: false,
    noDamage: false,
    testDrivePassed: false,
    customerSatisfied: false,
  });
  const [signature, setSignature] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Fetch work order data to verify tasks and parts
  const { data: workOrder } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId!),
    enabled: !!workOrderId,
  });

  // Fetch initial inspection for comparison
  const { data: initialInspection } = useQuery({
    queryKey: ["initial-inspection", workOrderId],
    queryFn: async () => {
      const response = await inspectionsApi.list({
        work_order: workOrderId,
        ordering: 'created_at'
      });
      return response.results[0] || null;
    },
    enabled: !!workOrderId,
  });

  // Auto-check items based on actual data
  React.useEffect(() => {
    if (workOrder) {
      // Check if all tasks are completed

      const tasks = (workOrder as any).tasks || [];

      const allTasksDone = tasks.length > 0 && tasks.every((t: any) =>
        t.status === 'completed' || t.status === 'skipped'
      );

      // Check if all parts are installed

      const parts = (workOrder as any).parts || [];

      const allPartsInstalled = parts.length === 0 || parts.every((p: any) =>
        p.status === 'installed' || p.status === 'returned'
      );

      setChecklist(prev => ({
        ...prev,
        allTasksCompleted: allTasksDone,
        allPartsInstalled: allPartsInstalled,
      }));
    }
  }, [workOrder]);

  const handleChecklistChange = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecksPassed = Object.values(checklist).every(v => v === true);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Auto-set passed based on checklist if not manually overridden
    const finalPassed = allChecksPassed && passed;

    onSubmit({
      passed: finalPassed,
      notes,
      checklist: checklist,
      signature: signature,
    });
  };

  const handleSuggestNotes = async () => {
    if (!workOrderId) return;
    setIsAiLoading(true);
    try {
      const response = await workordersApi.suggestQCNotes(workOrderId);
      setNotes(response.notes);
      toast({
        title: "AI Suggestion Generated",
        description: "Review and edit the suggested quality check notes below.",
      });
    } catch (error) {
      toast({
        title: "AI Suggestion Failed",
        description: "Could not generate suggested notes. Please try again or write manually.",
        variant: "destructive",
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-1 pb-6">
        <div className="space-y-6">
          {/* Initial Vehicle State Comparison */}
          {initialInspection && (
            <Card className="border-border/50 bg-muted/20 shadow-none overflow-hidden">
              <CardHeader className="py-3 px-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary" />
                    Intake State Reference
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] h-5 bg-background font-mono">
                    {new Date(initialInspection.created_at).toLocaleDateString()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-6 pb-2">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      Intake Mileage
                    </p>
                    <p className="text-sm font-semibold">
                      {initialInspection.odometer_reading ? initialInspection.odometer_reading.toLocaleString() : "N/A"} km
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      Initial Condition
                    </p>
                    <p className="text-sm font-semibold">
                      {initialInspection.overall_result_display || initialInspection.overall_result || "N/A"}
                    </p>
                  </div>
                </div>

                {initialInspection.vehicle_damage && initialInspection.vehicle_damage.length > 0 && (
                  <>
                    <Separator className="bg-border/50" />
                    <div className="space-y-3">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        Initial Damage Markers
                      </p>
                      <div className="border border-border/40 rounded-lg overflow-hidden bg-background/50 ring-1 ring-border/5">
                        <VehicleDamageMarker
                          damage={initialInspection.vehicle_damage}
                          onChange={() => { }}
                          disabled={true}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground italic leading-tight">
                        Reference the damages marked during intake to ensure no new damage occurred.
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Quality Check Checklist */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="bg-primary/10 p-1.5 rounded-md">
                  <ListChecks className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Verification Checklist</h3>
              </div>
              {allChecksPassed ? (
                <Badge className="bg-green-500/10 text-green-600 border-green-200/50 hover:bg-green-500/10 gap-1.5 px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  All Verified
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground border-border/50 font-medium">
                  {Object.values(checklist).filter((v) => v).length} / {Object.values(checklist).length} Tasks
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Category: Execution */}
              <Card className="border-border/50 shadow-none bg-background/50">
                <CardHeader className="py-3 px-4 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-3.5 h-3.5 text-primary" />
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Execution</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="allTasksCompleted"
                      checked={checklist.allTasksCompleted}
                      onCheckedChange={() => handleChecklistChange("allTasksCompleted")}
                      className="mt-0.5"
                    />
                    <div className="grid gap-1 leading-none cursor-pointer" onClick={() => handleChecklistChange("allTasksCompleted")}>
                      <Label htmlFor="allTasksCompleted" className="text-sm font-semibold cursor-pointer">
                        Performance Tasks
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        {(workOrder as any)?.tasks?.filter((t: any) => t.status === "completed" || t.status === "skipped").length || 0}/
                        {(workOrder as any)?.tasks?.length || 0} tasks completed
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="allPartsInstalled"
                      checked={checklist.allPartsInstalled}
                      onCheckedChange={() => handleChecklistChange("allPartsInstalled")}
                      className="mt-0.5"
                    />
                    <div className="grid gap-1 leading-none cursor-pointer" onClick={() => handleChecklistChange("allPartsInstalled")}>
                      <Label htmlFor="allPartsInstalled" className="text-sm font-semibold cursor-pointer">
                        Components Verified
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        {(workOrder as any)?.parts?.filter((p: any) => p.status === "installed" || p.status === "returned").length || 0}/
                        {(workOrder as any)?.parts?.length || 0} parts verified
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="testDrivePassed"
                      checked={checklist.testDrivePassed}
                      onCheckedChange={() => handleChecklistChange("testDrivePassed")}
                      className="mt-0.5"
                    />
                    <div className="grid gap-1 leading-none cursor-pointer" onClick={() => handleChecklistChange("testDrivePassed")}>
                      <Label htmlFor="testDrivePassed" className="text-sm font-semibold cursor-pointer">
                        Test Drive Passed
                      </Label>
                      <p className="text-[11px] text-muted-foreground">Functional verification complete</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Category: Quality & Care */}
              <Card className="border-border/50 shadow-none bg-background/50">
                <CardHeader className="py-3 px-4 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-primary" />
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quality & Care</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="noDamage"
                      checked={checklist.noDamage}
                      onCheckedChange={() => handleChecklistChange("noDamage")}
                      className="mt-0.5"
                    />
                    <div className="grid gap-1 leading-none cursor-pointer" onClick={() => handleChecklistChange("noDamage")}>
                      <Label htmlFor="noDamage" className="text-sm font-semibold cursor-pointer">
                        No New Damage
                      </Label>
                      <p className="text-[11px] text-muted-foreground">Verified against intake state</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="vehicleClean"
                      checked={checklist.vehicleClean}
                      onCheckedChange={() => handleChecklistChange("vehicleClean")}
                      className="mt-0.5"
                    />
                    <div className="grid gap-1 leading-none cursor-pointer" onClick={() => handleChecklistChange("vehicleClean")}>
                      <Label htmlFor="vehicleClean" className="text-sm font-semibold cursor-pointer">
                        Vehicle Cleanliness
                      </Label>
                      <p className="text-[11px] text-muted-foreground">Cleaned and delivery ready</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="customerSatisfied"
                      checked={checklist.customerSatisfied}
                      onCheckedChange={() => handleChecklistChange("customerSatisfied")}
                      className="mt-0.5"
                    />
                    <div className="grid gap-1 leading-none cursor-pointer" onClick={() => handleChecklistChange("customerSatisfied")}>
                      <Label htmlFor="customerSatisfied" className="text-sm font-semibold cursor-pointer">
                        Verification Complete
                      </Label>
                      <p className="text-[11px] text-muted-foreground">Internal QA standards met</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator className="bg-border/60" />

          {/* Overall Result & Notes */}
          <div className="space-y-5 px-1">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold">Overall Result</Label>
                <p className="text-[11px] text-muted-foreground italic">Determine final status</p>
              </div>
              <div className="flex items-center bg-muted/40 p-1 rounded-lg border border-border/50">
                <Button
                  type="button"
                  variant={passed ? "default" : "ghost"}
                  size="sm"
                  className={passed ? "h-8 px-4 font-bold shadow-sm" : "h-8 px-4 text-muted-foreground"}
                  onClick={() => setPassed(true)}
                >
                  Pass
                </Button>
                <Button
                  type="button"
                  variant={!passed ? "destructive" : "ghost"}
                  size="sm"
                  className={!passed ? "h-8 px-4 font-bold shadow-sm" : "h-8 px-4 text-muted-foreground"}
                  onClick={() => setPassed(false)}
                >
                  Fail
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="notes" className="text-sm font-bold">
                  Quality Control Notes
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] font-bold text-primary hover:text-primary hover:bg-primary/5 uppercase"
                  onClick={handleSuggestNotes}
                  disabled={isAiLoading || !workOrderId}
                >
                  {isAiLoading ? (
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3 h-3 animate-pulse" />
                      Analyzing...
                    </div>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 mr-1.5" />
                      Suggest with AI
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Detailed observations or required fixes..."
                className="resize-none bg-muted/20 border-border/50 focus:border-primary/50 text-sm leading-relaxed"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-bold">Technician Authorization</Label>
              <div className="bg-background rounded-xl border border-border/50 p-1 shadow-inner ring-1 ring-border/5">
                <SignaturePad
                  value={signature || undefined}
                  onChange={(val) => setSignature(val)}
                  label="Digital Signature Required"
                  required={true}
                />
              </div>
            </div>
          </div>
        </div>
      </form>

      <DialogFooter className="bg-muted/30 px-6 py-4 border-t border-border/50 gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="h-10 border-border/50 font-medium">
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !allChecksPassed || !signature}
          className={`h-10 px-8 font-bold transition-all ${passed ? 'bg-primary hover:bg-primary/90' : 'bg-destructive hover:bg-destructive/90'}`}
        >
          {isSubmitting ? (
            "Processing..."
          ) : passed ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Completed & Verified
            </div>
          ) : (
            "Flag for Rework"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}

function CompleteForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {

  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [odometerOut, setOdometerOut] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSubmit({
      odometer_out: odometerOut ? parseInt(odometerOut) : undefined,
      completion_notes: completionNotes,
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="odometer_out" className="block mb-2 text-foreground">
              Odometer Out (miles)
            </Label>
            <Input
              id="odometer_out"
              type="number"
              value={odometerOut}
              onChange={(e) => setOdometerOut(e.target.value)}
              className="w-full bg-muted border-border text-foreground"
            />
          </div>
          <div>
            <Label htmlFor="completion_notes" className="block mb-2 text-foreground">
              Completion Notes
            </Label>
            <Textarea
              id="completion_notes"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={4}
              placeholder="Add any notes about the completion..."
              className="w-full bg-muted border-border text-foreground"
            />
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Completing..." : "Complete Work Order"}
        </Button>
      </DialogFooter>
    </>
  );
}

function MarkInvoicedForm({
  onSubmit,
  onCancel,
  isSubmitting,
  workOrder,
}: {

  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;

  workOrder?: any;
}) {
  const [odometerOut, setOdometerOut] = useState("");
  const odometerIn = workOrder?.odometer_in || 0;
  const existingOdometerOut = workOrder?.odometer_out;

  // Initialize with existing odometer_out if available
  React.useEffect(() => {
    if (existingOdometerOut) {
      setOdometerOut(existingOdometerOut.toString());
    } else if (odometerIn) {
      // Pre-fill with odometer_in if odometer_out not set
      setOdometerOut(odometerIn.toString());
    }
  }, [existingOdometerOut, odometerIn]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!odometerOut) {
      return; // Validation will prevent submission
    }

    onSubmit({
      odometer_out: parseInt(odometerOut),
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="space-y-4">
          <div className="bg-primary/10 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded p-3">
            <p className="text-sm text-orange-800 text-primary">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              Odometer reading is required before marking as invoiced.
            </p>
          </div>

          <div>
            <Label htmlFor="mark_invoiced_odometer_out" className="block mb-2 text-foreground">
              Odometer Out (miles) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="mark_invoiced_odometer_out"
              type="number"
              value={odometerOut}
              onChange={(e) => setOdometerOut(e.target.value)}
              placeholder={odometerIn ? `Odometer In: ${odometerIn}` : "Enter odometer reading"}
              min={odometerIn || 0}
              required
              className="w-full bg-muted border-border text-foreground"
            />
            {odometerIn && (
              <p className="text-xs text-muted-foreground mt-1">
                Odometer In: {odometerIn.toLocaleString()} miles
              </p>
            )}
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !odometerOut}
        >
          {isSubmitting ? "Marking..." : "Mark as Invoiced"}
        </Button>
      </DialogFooter>
    </>
  );
}

function CloseWorkOrderForm({
  onSubmit,
  onCancel,
  isSubmitting,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  workOrder,
}: {

  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;

  workOrder?: any;
}) {
  const [paymentReceived, setPaymentReceived] = useState(true);
  const [closingNotes, setClosingNotes] = useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSubmit({
      payment_received: paymentReceived,
      closing_notes: closingNotes,
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="space-y-4">
          <div className="bg-success/10 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
            <p className="text-sm text-green-800 dark:text-green-400">
              <CheckCircle className="w-4 h-4 inline mr-1" />
              This will mark the work order as closed. Make sure the vehicle has been handed over to the customer.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="payment_received"
              checked={paymentReceived}
              onChange={(e) => setPaymentReceived(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary bg-muted border-border"
            />
            <Label htmlFor="payment_received" className="cursor-pointer text-foreground">
              Payment received
            </Label>
          </div>

          <div>
            <Label htmlFor="closing_notes" className="block mb-2 text-foreground">
              Closing Notes <span className="text-muted-foreground">(Optional)</span>
            </Label>
            <Textarea
              id="closing_notes"
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              rows={4}
              placeholder="Add any notes about the handover, customer feedback, or final observations..."
              className="w-full bg-muted border-border text-foreground"
            />
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          variant="default"
        >
          {isSubmitting ? "Closing..." : "Close Work Order"}
        </Button>
      </DialogFooter>
    </>
  );
}

function PauseForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (reason: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSubmit(reason);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="reason" className="block mb-2 text-foreground">
              Reason for Pause
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Enter reason for pausing the work order..."
              className="w-full bg-muted border-border text-foreground"
            />
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isSubmitting} variant="secondary">
          {isSubmitting ? "Pausing..." : "Pause"}
        </Button>
      </DialogFooter>
    </>
  );
}

function StartDiagnosisForm({
  workOrder,
  onSubmit,
  onCancel,
  isSubmitting,
}: {

  workOrder?: any;
  onSubmit: (data: { primary_technician?: number; priority?: string }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [primaryTechnician, setPrimaryTechnician] = useState<string>(() => {
    const tech = workOrder?.primary_technician;
    if (!tech || tech === null) return "";
    if (typeof tech === "object" && "id" in tech) {
      return String(tech.id);
    }
    if (typeof tech === "number") {
      return String(tech);
    }
    return "";
  });
  const [priority, setPriority] = useState(workOrder?.priority || "normal");

  // Fetch technicians
  const { data: technicians } = useQuery({
    queryKey: ["technicians"],
    queryFn: () => adminApi.users.technicians(),
  });

  const techniciansList = technicians || [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hasServiceCoordinator = !!workOrder?.service_coordinator;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const data: { primary_technician?: number; priority?: string } = {};

    if (primaryTechnician && primaryTechnician !== "") {
      data.primary_technician = Number(primaryTechnician);
    }
    if (priority && priority !== workOrder?.priority) {
      data.priority = priority;
    }

    onSubmit(data);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="space-y-4">
          <div className="bg-primary/10 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded p-3">
            <p className="text-sm text-orange-800 text-primary">
              <CheckCircle className="w-4 h-4 inline mr-1" />
              <strong>Assign to Mechanic/Technician:</strong>
            </p>
          </div>

          <div>
            <Label htmlFor="primary_technician" className="block mb-2 text-foreground">
              Assign to:
            </Label>
            <select
              id="primary_technician"
              value={primaryTechnician}
              onChange={(e) => setPrimaryTechnician(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted border-border text-foreground"
            >
              <option value="">Select Mechanic/Technician</option>

              {techniciansList.map((tech: any) => (
                <option key={tech.id} value={String(tech.id)}>
                  {tech.full_name || `${tech.first_name || ''} ${tech.last_name || ''}`.trim() || `User ${tech.id}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="priority" className="block mb-2 text-foreground">
              Priority (Optional)
            </Label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted border-border text-foreground"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Starting..." : "Start Diagnosis"}
        </Button>
      </DialogFooter>
    </>
  );
}

function AssignServiceCoordinatorForm({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  workOrder,
  onSubmit,
  onCancel,
  isSubmitting,
}: {

  workOrder?: any;
  onSubmit: (data: { serviceCoordinatorId: number; initialObservations?: string }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [serviceCoordinatorId, setServiceCoordinatorId] = useState<string>("");
  const [initialObservations, setInitialObservations] = useState<string>("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const { toast } = useToast();

  const handleGenerateAI = async () => {
    if (!workOrder?.id) return;

    setIsGeneratingAI(true);
    try {
      const data = await workordersApi.suggestObservations(workOrder.id);
      setInitialObservations(data.observations);
      toast({
        title: "AI Generated",
        description: "Initial observations have been drafted based on customer concerns.",
        variant: "success",
      });
    } catch (error) {
      console.error("Failed to generate AI observations:", error);
      toast({
        title: "AI Generation Failed",
        description: "Could not generate observations automatically.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Fetch service coordinators
  const { data: serviceCoordinators } = useQuery({
    queryKey: ["service-coordinators"],
    queryFn: () => adminApi.users.serviceCoordinators(),
  });

  const serviceCoordinatorsList = serviceCoordinators || [];

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!serviceCoordinatorId) {
      return;
    }
    onSubmit({
      serviceCoordinatorId: Number(serviceCoordinatorId),
      initialObservations: initialObservations.trim() || undefined
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="service_coordinator" className="block mb-2 text-foreground">
              Service Coordinator <span className="text-red-500">*</span>
            </Label>
            <select
              id="service_coordinator"
              value={serviceCoordinatorId}
              onChange={(e) => setServiceCoordinatorId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted border-border text-foreground"
            >
              <option value="">Select Service Coordinator</option>

              {serviceCoordinatorsList.map((coord: any) => (
                <option key={coord.id} value={String(coord.id)}>
                  {coord.full_name || `${coord.first_name || ''} ${coord.last_name || ''}`.trim() || `User ${coord.id}`}
                </option>
              ))}
            </select>
            {serviceCoordinatorsList.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No service coordinators available. Please ensure there are users with the Service Coordinator role.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="initial_observations" className="text-foreground">
                Initial Observations (Optional)
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateAI}
                disabled={isGeneratingAI}
                className="h-7 text-[11px] gap-1.5 px-2.5 border-primary/30 hover:border-primary/50 hover:bg-primary/5 font-medium transition-all"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAI ? 'animate-pulse' : ''} text-primary`} />
                {isGeneratingAI ? 'Generating...' : 'Generate with AI'}
              </Button>
            </div>
            <Textarea
              id="initial_observations"
              value={initialObservations}
              onChange={(e) => setInitialObservations(e.target.value)}
              placeholder="Quick notes or initial observations before detailed testing..."
              rows={4}
              className="w-full bg-muted border-border text-foreground focus-visible:ring-primary/30"
            />
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !serviceCoordinatorId || serviceCoordinatorsList.length === 0}
        >
          {isSubmitting ? "Assigning..." : "Assign & Continue"}
        </Button>
      </DialogFooter>
    </>
  );
}

function CreateInspectionForm({
  workOrder,
  onSubmit,
  onCancel,
  isSubmitting,
  fieldErrors,
}: {
  workOrder?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  fieldErrors?: Record<string, string>;
}) {
  const [templateId, setTemplateId] = useState<number | "">("");
  const [inspectionDate] = useState(new Date().toISOString().slice(0, 16));
  const [odometerReading, setOdometerReading] = useState("");

  // Fetch templates
  const { data: templatesData } = useQuery({
    queryKey: ["inspection-templates", "active"],
    queryFn: () => inspectionsApi.templates.active(),
  });

  const templates = templatesData || [];
  const vehicleId = workOrder?.vehicle
    ? (typeof workOrder.vehicle === "object" ? workOrder.vehicle.id : workOrder.vehicle)
    : null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!templateId || !vehicleId) {
      return;
    }

    const data: any = {
      vehicle: vehicleId,
      template: templateId,
      work_order: workOrder?.id,
      inspection_date: inspectionDate,
    };

    if (odometerReading) {
      data.odometer_reading = parseFloat(odometerReading);
    }

    onSubmit(data);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="template" className="block mb-2 text-foreground">
              Inspection Template <span className="text-red-500">*</span>
            </Label>
            <select
              id="template"
              value={templateId}
              onChange={(e) => setTemplateId(parseInt(e.target.value) || "")}
              required
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted border-border text-foreground"
            >
              <option value="">Select a template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.is_default && " (Default)"}
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No templates available. Please create a template first.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="inspection_date" className="block mb-2 text-foreground">
              Inspection Date <span className="text-red-500">*</span>
            </Label>
            <Input
              id="inspection_date"
              type="datetime-local"
              value={inspectionDate}
              readOnly
              required
              className="w-full bg-muted border-border text-foreground bg-border cursor-not-allowed"
            />
          </div>

          <div>
            <Label htmlFor="inspection_odometer_reading" className="block mb-2 text-foreground">
              Odometer Reading <span className="text-red-500">*</span>
            </Label>
            <Input
              id="inspection_odometer_reading"
              type="number"
              value={odometerReading}
              onChange={(e) => setOdometerReading(e.target.value)}
              placeholder="Enter odometer reading"
              min={0}
              required
              className={`w-full bg-muted border-border text-foreground ${fieldErrors?.odometer_reading ? "border-red-500" : ""}`}
            />
            {fieldErrors?.odometer_reading && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {fieldErrors.odometer_reading}
              </p>
            )}
            {workOrder?.vehicle && typeof workOrder.vehicle === 'object' && workOrder.vehicle.current_mileage > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Current Mileage: {workOrder.vehicle.current_mileage.toLocaleString()}
              </p>
            )}
          </div>

          {!vehicleId && (
            <div className="bg-warning/10 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-400">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                No vehicle selected for this work order. Please ensure the work order has a vehicle assigned.
              </p>
            </div>
          )}
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !templateId || !vehicleId || !odometerReading || templates.length === 0}
        >
          {isSubmitting ? "Creating..." : "Create Inspection"}
        </Button>
      </DialogFooter>
    </>
  );
}
