"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workordersApi, type WorkOrder } from "@/lib/api/workorders";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";
import { useAuthStore } from "@/store/authStore";
import { CheckCircle, XCircle, RotateCcw, UserCheck } from "lucide-react";

interface AssignmentActionsProps {
  workOrder: WorkOrder;
  workOrderId: number;
  onStatusChange?: () => void;
}

export function AssignmentActions({
  workOrder,
  workOrderId,
  onStatusChange,
}: AssignmentActionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [acceptNote, setAcceptNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [releaseNote, setReleaseNote] = useState("");

  const assignmentStatus = workOrder.technician_assignment_status || "";
  const hasTechnician = workOrder.has_technician_assignment;
  const requiresAcceptance = workOrder.requires_assignment_acceptance;
  // Accept/Reject/Release apply only to pre-work technician assignment — not QC or later stages
  const assignmentActionStatuses = new Set([
    "draft",
    "inspection",
    "intake",
    "assigned",
    "diagnosis",
    "awaiting_approval",
    "approved",
    "paused",
  ]);
  const allowsAssignmentActions = assignmentActionStatuses.has(workOrder.status);
  // Release is for reassignment before repair execution (not mid-repair pause)
  const canReleaseAtStatus =
    allowsAssignmentActions &&
    !(workOrder.status === "paused" && workOrder.paused_from_status === "in_progress");

  const userRole = user?.role;
  const userId = user?.id;
  const isAssignedTechnician =
    (typeof workOrder.primary_technician === "object" &&
      workOrder.primary_technician?.id === userId) ||
    (Array.isArray(workOrder.assigned_technicians) &&
      workOrder.assigned_technicians.some(
        (t) => (typeof t === "object" ? t.id : t) === userId
      ));
  const isCoordinator =
    typeof workOrder.service_coordinator === "object" &&
    workOrder.service_coordinator?.id === userId;
  const canRespond =
    !!userId &&
    (userRole === "manager" ||
      userRole === "admin" ||
      isCoordinator ||
      isAssignedTechnician);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
    onStatusChange?.();
  };

  const acceptMutation = useMutation({
    mutationFn: () =>
      workordersApi.acceptAssignment(workOrderId, acceptNote.trim() ? { note: acceptNote.trim() } : undefined),
    onSuccess: () => {
      toast({ title: "Assignment accepted", variant: "success" });
      setShowAcceptDialog(false);
      setAcceptNote("");
      refresh();
    },
    onError: (error) => {
      toast({
        title: "Could not accept assignment",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => workordersApi.rejectAssignment(workOrderId, { reason: rejectReason.trim() }),
    onSuccess: () => {
      toast({ title: "Assignment rejected", variant: "success" });
      setShowRejectDialog(false);
      setRejectReason("");
      refresh();
    },
    onError: (error) => {
      toast({
        title: "Could not reject assignment",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: () =>
      workordersApi.releaseAssignment(
        workOrderId,
        releaseNote.trim() ? { note: releaseNote.trim() } : undefined
      ),
    onSuccess: () => {
      toast({
        title: "Assignment released",
        description: "The Service Coordinator can reassign this job.",
        variant: "success",
      });
      setShowReleaseDialog(false);
      setReleaseNote("");
      refresh();
    },
    onError: (error) => {
      toast({
        title: "Could not release assignment",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  if (!hasTechnician || !allowsAssignmentActions || !canRespond) {
    return null;
  }

  const showPendingActions = requiresAcceptance || assignmentStatus === "pending";
  const showRelease =
    canReleaseAtStatus &&
    (assignmentStatus === "accepted" ||
      assignmentStatus === "pending" ||
      (!assignmentStatus && hasTechnician));

  if (!showPendingActions && !showRelease) {
    return null;
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <UserCheck className="h-5 w-5 shrink-0 text-warning mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Technician assignment</p>
              {assignmentStatus && (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {workOrder.technician_assignment_status_display || assignmentStatus}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {showPendingActions
                ? "Accept or reject this assignment before work can begin."
                : "Release the assignment back to the Service Coordinator for reassignment."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {showPendingActions && (
            <>
              <Button
                size="sm"
                onClick={() => setShowAcceptDialog(true)}
                disabled={acceptMutation.isPending}
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRejectDialog(true)}
                disabled={rejectMutation.isPending}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Reject
              </Button>
            </>
          )}
          {showRelease && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowReleaseDialog(true)}
              disabled={releaseMutation.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Release
            </Button>
          )}
        </div>
      </div>

      <Dialog open={showAcceptDialog} onOpenChange={setShowAcceptDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accept assignment</DialogTitle>
            <DialogDescription>
              Confirm you will work on {workOrder.work_order_number}. Add an optional note for the coordinator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="accept-note">Note (optional)</Label>
              <Textarea
                id="accept-note"
                value={acceptNote}
                onChange={(e) => setAcceptNote(e.target.value)}
                rows={3}
                className="resize-none"
                placeholder="e.g. Starting after current bay job…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAcceptDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
                {acceptMutation.isPending ? "Accepting…" : "Accept assignment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject assignment</DialogTitle>
            <DialogDescription>
              A reason is required. The Service Coordinator will be notified to reassign this job.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Reason</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="resize-none"
                placeholder="Why you cannot take this job…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
              >
                {rejectMutation.isPending ? "Rejecting…" : "Reject assignment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReleaseDialog} onOpenChange={setShowReleaseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Release assignment</DialogTitle>
            <DialogDescription>
              Return this job to the Service Coordinator for reassignment. Work must not be in progress.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="release-note">Note (optional)</Label>
              <Textarea
                id="release-note"
                value={releaseNote}
                onChange={(e) => setReleaseNote(e.target.value)}
                rows={3}
                className="resize-none"
                placeholder="Context for the coordinator…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowReleaseDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => releaseMutation.mutate()} disabled={releaseMutation.isPending}>
                {releaseMutation.isPending ? "Releasing…" : "Release to coordinator"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
