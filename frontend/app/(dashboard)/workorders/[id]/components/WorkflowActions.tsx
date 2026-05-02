"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import React from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { workordersApi } from "@/lib/api/workorders";
import { inspectionsApi } from "@/lib/api/inspections";
import { diagnosisApi } from "@/lib/api/diagnosis";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/useToast";
import { workOrderNotesApi } from "@/lib/api/workorder-notes";
import { useCurrency } from "@/lib/hooks/useCurrency";
import {
  Play,
  Pause,
  CheckCircle,
  FileCheck,
  Send,
  RotateCcw,
  ClipboardCheck,
  DollarSign,
  Lock,
  Eye,
  AlertTriangle,
  User,
} from "lucide-react";

// Refactored Forms
import { CompleteDiagnosisForm } from "./forms/CompleteDiagnosisForm";
import { AdditionalWorkForm } from "./forms/AdditionalWorkForm";
import { ApproveForm } from "./forms/ApproveForm";
import { RequestApprovalForm } from "./forms/RequestApprovalForm";
import { QualityCheckForm } from "./quality-check/QualityCheckForm";
import { CompleteForm } from "./forms/CompleteForm";
import { MarkInvoicedForm } from "./forms/MarkInvoicedForm";
import { CloseWorkOrderForm } from "./forms/CloseWorkOrderForm";
import { PauseForm } from "./forms/PauseForm";
import { StartDiagnosisForm } from "./forms/StartDiagnosisForm";
import { AssignServiceCoordinatorForm } from "./forms/AssignServiceCoordinatorForm";
import { CreateInspectionForm } from "./forms/CreateInspectionForm";

interface WorkflowActionsProps {
  workOrderId: number;
  status: string;

  workOrder?: any; // Work order data to get vehicle info
  onStatusChange?: () => void;
  onStartRepairs?: () => void;
  inline?: boolean; // If true, render just the primary button inline (for progress indicator)
}

const getWorkflowErrorMessage = (error: any) => {
  const data = error.response?.data;
  const taskNames = Array.isArray(data?.blocking_tasks)
    ? data.blocking_tasks.map((task: any) => task.description).filter(Boolean)
    : [];
  const partNames = Array.isArray(data?.blocking_parts)
    ? data.blocking_parts.map((part: any) => part.part_name).filter(Boolean)
    : [];

  if (taskNames.length) {
    const list = taskNames.slice(0, 4).join(", ");
    const more = taskNames.length > 4 ? `, +${taskNames.length - 4} more` : "";
    return `${data?.next_step || "Open the Tasks tab and resolve the blocking tasks."} Blocking tasks: ${list}${more}.`;
  }
  if (partNames.length) {
    const list = partNames.slice(0, 4).join(", ");
    const more = partNames.length > 4 ? `, +${partNames.length - 4} more` : "";
    return `${data?.next_step || "Open the Parts tab and resolve the blocking parts."} Blocking parts: ${list}${more}.`;
  }
  return data?.error || data?.errors?.join("; ") || error.message;
};

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
    onSuccess: () => {
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
    onSuccess: (data: any) => {
      const recommendationsApproved = data?.recommendations_approved || 0;
      const description = recommendationsApproved > 0
        ? `Work order approved. ${recommendationsApproved} diagnosis recommendation(s) were also approved and can now be sent to stores for quotation.`
        : "Work order approved.";

      toast({ title: "Success", description });
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
        title: "Quality check blocked",
        description: getWorkflowErrorMessage(error) || "Failed to request quality check",
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
        title: "Completion blocked",
        description: getWorkflowErrorMessage(error) || "Failed to complete work order",
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
          label: "Create Rework",
          icon: RotateCcw,
          onClick: () => router.push(`/workorders/new?related_work_order=${workOrderId}&rework=true`),
          disabled: false,
          variant: "outline",
          description: "Create a linked warranty/rework order",
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
              Request approval for the current estimate
            </DialogDescription>
          </DialogHeader>
          <RequestApprovalForm
            workOrder={currentWorkOrder}
            onSubmit={() => requestApprovalMutation.mutate()}
            onCancel={() => setShowRequestApprovalDialog(false)}
            isSubmitting={requestApprovalMutation.isPending}
            formatCurrency={formatCurrency}
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
        <DialogContent className="bg-muted border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Perform Quality Check</DialogTitle>
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

      {renderDialogs()}
    </>
  );
}
