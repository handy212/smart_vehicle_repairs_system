"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/useToast";
import { workOrderNotesApi } from "@/lib/api/workorder-notes";
import {
  Play,
  Pause,
  CheckCircle,
  AlertCircle,
  FileCheck,
  Send,
  X,
  RotateCcw,
  ClipboardCheck,
  DollarSign,
  Lock,
  Wrench,
  Eye,
  AlertTriangle,
} from "lucide-react";

interface WorkflowActionsProps {
  workOrderId: number;
  status: string;
  onStatusChange?: () => void;
}

export default function WorkflowActions({ workOrderId, status, onStatusChange }: WorkflowActionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCompleteDiagnosisDialog, setShowCompleteDiagnosisDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showQualityCheckDialog, setShowQualityCheckDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showAdditionalWorkDialog, setShowAdditionalWorkDialog] = useState(false);
  const [showRequestApprovalDialog, setShowRequestApprovalDialog] = useState(false);

  const refreshWorkOrder = () => {
    queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
    onStatusChange?.();
  };

  // Start Inspection (Phase 1: Initial Triage)
  const startInspectionMutation = useMutation({
    mutationFn: () => workordersApi.updateStatus(workOrderId, "inspection"),
    onSuccess: () => {
      toast({ title: "Success", description: "Work order moved to initial inspection." });
      refreshWorkOrder();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to start inspection",
        variant: "destructive",
      });
    },
  });

  // Start Intake (Phase 1: Customer Intake)
  const startIntakeMutation = useMutation({
    mutationFn: () => workordersApi.startIntake(workOrderId),
    onSuccess: () => {
      toast({ title: "Success", description: "Work order moved to intake." });
      refreshWorkOrder();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to start intake",
        variant: "destructive",
      });
    },
  });

  // Start Diagnosis (Phase 1: Diagnosis)
  const startDiagnosisMutation = useMutation({
    mutationFn: () => workordersApi.startDiagnosis(workOrderId),
    onSuccess: () => {
      toast({ title: "Success", description: "Diagnosis started." });
      refreshWorkOrder();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to start diagnosis",
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
    onSuccess: () => {
      toast({ title: "Success", description: "Approval requested from customer." });
      setShowRequestApprovalDialog(false);
      refreshWorkOrder();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to request approval",
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
    onSuccess: () => {
      toast({ title: "Success", description: "Work started." });
      refreshWorkOrder();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to start work",
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
    onSuccess: () => {
      toast({ title: "Success", description: "Quality check completed." });
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
    mutationFn: () => workordersApi.markInvoiced(workOrderId),
    onSuccess: () => {
      toast({ title: "Success", description: "Work order marked as invoiced." });
      refreshWorkOrder();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to mark as invoiced",
        variant: "destructive",
      });
    },
  });

  // Close (Phase 5: Vehicle Handover Complete)
  const closeMutation = useMutation({
    mutationFn: () => workordersApi.close(workOrderId),
    onSuccess: () => {
      toast({ title: "Success", description: "Work order closed." });
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
            onClick: () => startInspectionMutation.mutate(),
            disabled: startInspectionMutation.isPending,
            variant: "outline",
            description: "Perform initial visual inspection/triage",
          },
          {
            label: "Start Intake",
            icon: Play,
            onClick: () => startIntakeMutation.mutate(),
            disabled: startIntakeMutation.isPending,
            description: "Begin customer intake process",
          }
        );
        break;

      case "inspection":
        actions.push({
          label: "Start Intake",
          icon: Play,
          onClick: () => startIntakeMutation.mutate(),
          disabled: startIntakeMutation.isPending,
          description: "Move to intake after initial inspection",
        });
        break;

      case "intake":
        actions.push({
          label: "Start Diagnosis",
          icon: ClipboardCheck,
          onClick: () => startDiagnosisMutation.mutate(),
          disabled: startDiagnosisMutation.isPending,
          description: "Begin diagnostic testing",
        });
        break;

      case "diagnosis":
        actions.push(
          {
            label: "Complete Diagnosis",
            icon: CheckCircle,
            onClick: () => setShowCompleteDiagnosisDialog(true),
            disabled: completeDiagnosisMutation.isPending,
            description: "Finish diagnosis and create estimate",
          },
          {
            label: "Request Approval",
            icon: Send,
            onClick: () => setShowRequestApprovalDialog(true),
            disabled: requestApprovalMutation.isPending,
            variant: "outline",
            description: "Request customer approval for existing estimate",
          }
        );
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
          label: "Start Work",
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
          {
            label: "Complete",
            icon: CheckCircle,
            onClick: () => setShowCompleteDialog(true),
            disabled: completeMutation.isPending,
            description: "Mark work as completed",
          }
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
          onClick: () => markInvoicedMutation.mutate(),
          disabled: markInvoicedMutation.isPending,
          variant: "outline",
          description: "Mark invoice as generated",
        });
        break;

      // Phase 5: Vehicle Handover & Post-Service
      case "invoiced":
        actions.push({
          label: "Close",
          icon: Lock,
          onClick: () => closeMutation.mutate(),
          disabled: closeMutation.isPending,
          description: "Close work order after customer pickup",
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
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {availableActions.map((action, index) => {
          const Icon = action.icon;
          return (
            <Button
              key={index}
              variant={action.variant || "default"}
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.description}
              className="dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              <Icon className="w-4 h-4 mr-2" />
              {action.label}
            </Button>
          );
        })}
      </div>

      {/* Complete Diagnosis Dialog */}
      <Dialog open={showCompleteDiagnosisDialog} onOpenChange={setShowCompleteDiagnosisDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Complete Diagnosis</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
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
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Request Customer Approval</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Request approval for the current estimate. Ensure diagnosis notes and estimated costs are set.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
              <p className="text-sm text-blue-800 dark:text-blue-400">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                This requires diagnosis notes and an estimated total greater than $0. The work order will move to "Awaiting Approval" status and notify the customer.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowRequestApprovalDialog(false)}>
              Cancel
            </Button>
            <Button 
              type="button" 
              onClick={() => requestApprovalMutation.mutate()} 
              disabled={requestApprovalMutation.isPending}
            >
              {requestApprovalMutation.isPending ? "Requesting..." : "Request Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Additional Work Found Dialog */}
      <Dialog open={showAdditionalWorkDialog} onOpenChange={setShowAdditionalWorkDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="w-5 h-5" />
              <span>Additional Work Found</span>
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
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
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Approve Work Order</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
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
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Perform Quality Check</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Complete quality control inspection
            </DialogDescription>
          </DialogHeader>
          <QualityCheckForm
            onSubmit={(data) => qualityCheckMutation.mutate(data)}
            onCancel={() => setShowQualityCheckDialog(false)}
            isSubmitting={qualityCheckMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Complete Work Order</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
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

      {/* Pause Dialog */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">Pause Work Order</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
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
            <Label htmlFor="diagnosis_notes" className="block mb-2 dark:text-gray-300">
              Diagnosis Notes *
            </Label>
            <Textarea
              id="diagnosis_notes"
              value={diagnosisNotes}
              onChange={(e) => setDiagnosisNotes(e.target.value)}
              required
              rows={4}
              className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="estimated_labor_hours" className="block mb-2 dark:text-gray-300">
                Estimated Labor Hours
              </Label>
              <Input
                id="estimated_labor_hours"
                type="number"
                step="0.1"
                value={estimatedLaborHours}
                onChange={(e) => setEstimatedLaborHours(e.target.value)}
                className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>
            <div>
              <Label htmlFor="estimated_labor_cost" className="block mb-2 dark:text-gray-300">
                Estimated Labor Cost
              </Label>
              <Input
                id="estimated_labor_cost"
                type="number"
                step="0.01"
                value={estimatedLaborCost}
                onChange={(e) => setEstimatedLaborCost(e.target.value)}
                className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="estimated_parts_cost" className="block mb-2 dark:text-gray-300">
              Estimated Parts Cost
            </Label>
            <Input
              id="estimated_parts_cost"
              type="number"
              step="0.01"
              value={estimatedPartsCost}
              onChange={(e) => setEstimatedPartsCost(e.target.value)}
              className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="requires_approval"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            />
            <Label htmlFor="requires_approval" className="cursor-pointer dark:text-gray-300">
              Requires Customer Approval
            </Label>
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
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
            <Label htmlFor="additional_work_notes" className="block mb-2 dark:text-gray-300">
              Describe Additional Work Found *
            </Label>
            <Textarea
              id="additional_work_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required
              rows={4}
              placeholder="Describe the new problems discovered..."
              className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
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
        <Button type="button" variant="outline" onClick={onCancel}>
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
            <Label htmlFor="approval_method" className="block mb-2 dark:text-gray-300">
              Approval Method
            </Label>
            <select
              id="approval_method"
              value={approvalMethod}
              onChange={(e) => setApprovalMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            >
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="in_person">In Person</option>
              <option value="text">Text/SMS</option>
            </select>
          </div>
          <div>
            <Label htmlFor="approval_notes" className="block mb-2 dark:text-gray-300">
              Notes
            </Label>
            <Textarea
              id="approval_notes"
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              rows={3}
              className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
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
}: {
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [passed, setPassed] = useState(true);
  const [notes, setNotes] = useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSubmit({ passed, notes });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="px-6 pb-6">
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="passed"
              checked={passed}
              onChange={(e) => setPassed(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            />
            <Label htmlFor="passed" className="cursor-pointer dark:text-gray-300">
              Quality Check Passed
            </Label>
          </div>
          <div>
            <Label htmlFor="notes" className="block mb-2 dark:text-gray-300">
              Notes
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Add any notes about the quality check..."
              className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit Quality Check"}
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
            <Label htmlFor="odometer_out" className="block mb-2 dark:text-gray-300">
              Odometer Out (miles)
            </Label>
            <Input
              id="odometer_out"
              type="number"
              value={odometerOut}
              onChange={(e) => setOdometerOut(e.target.value)}
              className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
          <div>
            <Label htmlFor="completion_notes" className="block mb-2 dark:text-gray-300">
              Completion Notes
            </Label>
            <Textarea
              id="completion_notes"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={4}
              placeholder="Add any notes about the completion..."
              className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Completing..." : "Complete Work Order"}
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
            <Label htmlFor="reason" className="block mb-2 dark:text-gray-300">
              Reason for Pause
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Enter reason for pausing the work order..."
              className="w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isSubmitting} variant="outline">
          {isSubmitting ? "Pausing..." : "Pause"}
        </Button>
      </DialogFooter>
    </>
  );
}
