"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RoadsideRequest,
  roadsideApi,
  RoadsideAssignmentStatus,
} from "@/lib/api/roadside";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MobileStickyActionBar } from "@/components/mobile/MobilePageShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle,
  Loader2,
  MapPin,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { queueRequest } from "@/lib/offline/queue";
import { roadsideRequestsDB } from "@/lib/offline/db";
import { useOfflineStore } from "@/store/offlineStore";
import { cn } from "@/lib/utils";
import { getEffectiveAssignmentStatus } from "@/lib/mobile/roadside-assignment";

type WorkflowAction = "en_route" | "arrive" | "in_progress" | "complete";

const STATUS_ENDPOINT: Record<WorkflowAction, string> = {
  en_route: "en_route",
  arrive: "arrive",
  in_progress: "in_progress",
  complete: "complete",
};

export type RoadsideWorkflowPhase =
  | "pending_response"
  | "ready"
  | "en_route"
  | "on_site"
  | "in_progress"
  | "done"
  | "rejected";

export function getRoadsideWorkflowPhase(
  request: RoadsideRequest,
  userId?: number | null
): RoadsideWorkflowPhase {
  const assignment = getEffectiveAssignmentStatus(request, userId);
  if (assignment === "rejected") return "rejected";
  if (assignment === "pending") return "pending_response";
  if (["completed", "cancelled", "failed"].includes(request.status)) return "done";
  if (request.status === "en_route") return "en_route";
  if (request.status === "on_site") return "on_site";
  if (request.status === "in_progress") return "in_progress";
  return "ready";
}

function primaryTripAction(phase: RoadsideWorkflowPhase): {
  action: WorkflowAction;
  label: string;
  hint: string;
} | null {
  switch (phase) {
    case "ready":
      return {
        action: "en_route",
        label: "Start trip",
        hint: "Head to the breakdown location",
      };
    case "en_route":
      return {
        action: "arrive",
        label: "I've arrived on site",
        hint: "Confirm when you reach the customer",
      };
    case "on_site":
      return {
        action: "in_progress",
        label: "Start job",
        hint: "Begin the roadside service",
      };
    case "in_progress":
      return {
        action: "complete",
        label: "Complete job",
        hint: "Finish when work and photos are done",
      };
    default:
      return null;
  }
}

/** Compact call + directions — only while heading to the job */
export function RoadsideContactBar({
  request,
  userId,
  onOpenDirections,
  className,
}: {
  request: RoadsideRequest;
  userId?: number | null;
  onOpenDirections: () => void;
  className?: string;
}) {
  const phase = getRoadsideWorkflowPhase(request, userId);
  if (
    getEffectiveAssignmentStatus(request, userId) !== "accepted" ||
    !["ready", "en_route"].includes(phase)
  ) {
    return null;
  }

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <Button
        type="button"
        className="h-10"
        onClick={() => request.customer_phone && window.open(`tel:${request.customer_phone}`, "_self")}
        disabled={!request.customer_phone}
      >
        Call
      </Button>
      <Button type="button" variant="outline" className="h-10" onClick={onOpenDirections}>
        Directions
      </Button>
    </div>
  );
}

export function RoadsideTechnicianWorkflow({
  request,
  requestId,
  userId,
  onRequestUpdated,
}: {
  request: RoadsideRequest;
  requestId: string;
  userId?: number | null;
  onRequestUpdated: (updated: RoadsideRequest) => void;
}) {
  const router = useRouter();
  const { isOnline } = useOfflineStore();
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const phase = getRoadsideWorkflowPhase(request, userId);
  const tripAction = primaryTripAction(phase);

  const persist = async (updated: RoadsideRequest, synced: boolean) => {
    onRequestUpdated(updated);
    await roadsideRequestsDB.set(requestId, updated, synced);
  };

  const handleAccept = async () => {
    setActionLoading(true);
    try {
      if (isOnline) {
        const updated = await roadsideApi.acceptAssignment(request.id);
        await persist(updated, true);
        toast.success("Assignment accepted");
      } else {
        const updated = {
          ...request,
          my_assignment_status: "accepted" as RoadsideAssignmentStatus,
        };
        await persist(updated, false);
        await queueRequest(
          "update",
          `/roadside/requests/${request.id}/accept-assignment/`,
          "POST",
          {}
        );
        toast.success("Acceptance queued");
      }
    } catch {
      toast.error("Could not accept assignment");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      if (isOnline) {
        await roadsideApi.rejectAssignment(request.id, rejectReason);
        toast.success("Assignment declined");
        router.push("/mobile/roadside");
      } else {
        await queueRequest(
          "update",
          `/roadside/requests/${request.id}/reject-assignment/`,
          "POST",
          { reason: rejectReason }
        );
        toast.success("Decline queued");
        router.push("/mobile/roadside");
      }
    } catch {
      toast.error("Could not decline assignment");
    } finally {
      setActionLoading(false);
      setRejectOpen(false);
    }
  };

  const handleStatus = async (action: WorkflowAction) => {
    setActionLoading(true);
    const nextStatus: Record<WorkflowAction, RoadsideRequest["status"]> = {
      en_route: "en_route",
      arrive: "on_site",
      in_progress: "in_progress",
      complete: "completed",
    };
    try {
      if (isOnline) {
        const api = {
          en_route: roadsideApi.enRoute,
          arrive: roadsideApi.arrive,
          in_progress: roadsideApi.inProgress,
          complete: roadsideApi.complete,
        } as const;
        const updated = await api[action](request.id);
        await persist(updated, true);
        toast.success("Status updated");
      } else {
        const updated = { ...request, status: nextStatus[action] };
        await persist(updated, false);
        await queueRequest(
          "update",
          `/roadside/requests/${request.id}/${STATUS_ENDPOINT[action]}/`,
          "POST",
          {}
        );
        toast.success("Status queued");
      }
    } catch {
      toast.error("Failed to update status");
    } finally {
      setActionLoading(false);
    }
  };

  if (phase === "rejected") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
          <XCircle className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">You declined this assignment</p>
          <Button variant="outline" onClick={() => router.push("/mobile/roadside")}>
            Back to jobs
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === "done") {
    return null;
  }

  return (
    <>
      {phase === "pending_response" && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium">Respond to this assignment</p>
            <p className="text-sm text-muted-foreground">
              Review location and job details below. Accept to see directions and continue.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setRejectOpen(true)}
                disabled={actionLoading}
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                Decline
              </Button>
              <Button className="h-11" onClick={handleAccept} disabled={actionLoading}>
                {actionLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ThumbsUp className="mr-2 h-4 w-4" />
                )}
                Accept
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tripAction && (
        <MobileStickyActionBar>
          <p className="mb-2 text-center text-xs text-muted-foreground">{tripAction.hint}</p>
          <Button
            className="h-12 w-full text-base"
            onClick={() => handleStatus(tripAction.action)}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : tripAction.action === "complete" ? (
              <CheckCircle className="mr-2 h-5 w-5" />
            ) : tripAction.action === "arrive" ? (
              <MapPin className="mr-2 h-5 w-5" />
            ) : null}
            {tripAction.label}
          </Button>
        </MobileStickyActionBar>
      )}

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this job?</AlertDialogTitle>
            <AlertDialogDescription>
              Dispatch will be notified to assign another technician.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleReject}
            >
              Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Whether the page needs extra bottom padding for the sticky action bar */
export function roadsideHasActionBar(
  request: RoadsideRequest,
  userId?: number | null
): boolean {
  const phase = getRoadsideWorkflowPhase(request, userId);
  return primaryTripAction(phase) !== null;
}
