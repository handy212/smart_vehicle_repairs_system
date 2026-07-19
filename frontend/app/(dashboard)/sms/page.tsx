"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { AIAssistDialog } from "@/components/sms/AIAssistDialog";
import { SmsComposer } from "@/components/sms/SmsComposer";
import {
  SmsFullLogsTable,
  SmsHistoryTable,
} from "@/components/sms/SmsHistoryTable";
import { SmsRecipientsPanel } from "@/components/sms/SmsRecipientsPanel";
import { SmsStatsRow } from "@/components/sms/SmsStatsRow";
import {
  formatSmsDate,
  formatSmsTime,
  SmsStatusBadge,
  type SmsStatusFilter,
} from "@/components/sms/sms-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUserFacingError } from "@/lib/api/errors";
import { useToast } from "@/lib/hooks/useToast";
import smsApi, { SMSHistoryItem, SMSRecipient } from "@/services/sms";

export default function SMSConsolePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [message, setMessage] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [recipients, setRecipients] = useState<SMSRecipient[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [isFullLogsOpen, setIsFullLogsOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SMSHistoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SMSHistoryItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<SmsStatusFilter>("all");

  const { data: templates } = useQuery({
    queryKey: ["sms-templates"],
    queryFn: () => smsApi.getTemplates(),
  });

  const {
    data: history,
    refetch: refetchHistory,
    isLoading: isHistoryLoading,
  } = useQuery({
    queryKey: ["sms-history"],
    queryFn: () => smsApi.getHistory(),
  });

  const { data: fullHistory, isFetching: isFetchingFullHistory } = useQuery({
    queryKey: ["sms-history", "full"],
    queryFn: () => smsApi.getHistory({ limit: 500 }),
    enabled: isFullLogsOpen,
  });

  const { data: stats } = useQuery({
    queryKey: ["sms-stats"],
    queryFn: () => smsApi.getStats(),
    refetchInterval: 30000,
  });

  const refreshSmsHistory = () => {
    refetchHistory();
    queryClient.invalidateQueries({ queryKey: ["sms-history"] });
    queryClient.invalidateQueries({ queryKey: ["sms-stats"] });
  };

  const resendMutation = useMutation({
    mutationFn: (id: number) => smsApi.resendLog(id),
    onSuccess: () => {
      toast({ title: "Sent", description: "SMS resent successfully." });
      refreshSmsHistory();
    },
    onError: (error: unknown) => {
      toast({
        title: "Resend failed",
        description: getUserFacingError(error, "Could not resend SMS."),
        variant: "destructive",
      });
      refreshSmsHistory();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => smsApi.deleteLog(id),
    onSuccess: () => {
      toast({ title: "Deleted", description: "SMS log deleted." });
      setDeleteTarget(null);
      setSelectedLog(null);
      refreshSmsHistory();
    },
    onError: (error: unknown) => {
      toast({
        title: "Delete failed",
        description: getUserFacingError(error, "Could not delete SMS log."),
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const rId = searchParams.get("recipient_id");
    const rName = searchParams.get("recipient_name");
    const rPhone = searchParams.get("phone");

    if (rId && rName && rPhone) {
      setRecipients((prev) => {
        if (prev.some((p) => p.value === rId && p.type === "user")) return prev;
        return [
          ...prev,
          {
            type: "user",
            value: rId,
            name: `${decodeURIComponent(rName)} (${rPhone})`,
          },
        ];
      });
    }
  }, [searchParams]);

  const handleAddRecipient = (recipient: {
    type: "user" | "phone";
    value: string;
    name: string;
  }) => {
    if (
      recipients.some(
        (r) => r.value === recipient.value && r.type === recipient.type
      )
    ) {
      toast({ title: "Already added", description: "Recipient already in list." });
      return;
    }
    setRecipients((prev) => [...prev, recipient as SMSRecipient]);
  };

  const handleAddManyRecipients = (
    batch: { type: "user" | "phone"; value: string; name: string }[]
  ) => {
    const existing = new Set(
      recipients.map((r) => `${r.type}:${r.value}`)
    );
    const toAdd = batch.filter(
      (r) => !existing.has(`${r.type}:${r.value}`)
    ) as SMSRecipient[];
    if (toAdd.length === 0) {
      toast({
        title: "Already added",
        description: "Selected customers are already in the list.",
      });
      return;
    }
    setRecipients((prev) => [...prev, ...toAdd]);
    toast({
      title: "Added",
      description: `${toAdd.length} customer(s) added.`,
    });
  };

  const handleSend = async () => {
    if (!message.trim()) {
      toast({
        title: "Message required",
        description: "Please enter a message to send.",
      });
      return;
    }
    if (recipients.length === 0) {
      toast({
        title: "Recipients required",
        description: "Please add at least one recipient.",
      });
      return;
    }

    setIsSending(true);
    try {
      if (recipients.length === 1) {
        const r = recipients[0];
        const payload = {
          message,
          ...(r.type === "user"
            ? { recipient_id: parseInt(r.value, 10) }
            : { phone: r.value }),
          scheduled_for: scheduledFor || undefined,
        };
        await smsApi.sendSingle(payload);
        toast({
          title: scheduledFor ? "Scheduled" : "Sent",
          description: scheduledFor
            ? "SMS scheduled successfully."
            : "SMS sent successfully.",
        });
      } else {
        const response = await smsApi.sendBulk({
          message,
          recipients: recipients.map((r) => ({
            type: r.type,
            value: r.value,
          })),
          scheduled_for: scheduledFor || undefined,
        });
        const failed = response.failed || response.total - response.successful;
        toast({
          title: failed === 0 ? "Success" : "Partial Success",
          description: response.message,
          variant: failed === response.total ? "destructive" : "default",
        });
      }
      setMessage("");
      setSelectedTemplateId("");
      setRecipients([]);
      setScheduledFor("");
      refreshSmsHistory();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to send SMS."),
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const isMutating = resendMutation.isPending || deleteMutation.isPending;

  return (
    <PermissionPageGuard permission="send_notifications">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Compose
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Send texts to customers and review delivery
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => refreshSmsHistory()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="h-9" asChild>
              <Link href="/sms/templates">Templates</Link>
            </Button>
          </div>
        </div>

        <SmsStatsRow
          stats={stats}
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <SmsComposer
            message={message}
            onMessageChange={(value) => {
              setMessage(value);
              setSelectedTemplateId("");
            }}
            scheduledFor={scheduledFor}
            onScheduledForChange={setScheduledFor}
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onTemplateChange={(id, body) => {
              setSelectedTemplateId(id);
              setMessage(body);
            }}
            recipientCount={recipients.length}
            isSending={isSending}
            onSend={handleSend}
            onOpenAI={() => setIsAIDialogOpen(true)}
          />

          <SmsRecipientsPanel
            recipients={recipients}
            onAdd={handleAddRecipient}
            onAddMany={handleAddManyRecipients}
            onRemove={(index) =>
              setRecipients((prev) => prev.filter((_, i) => i !== index))
            }
            onClear={() => setRecipients([])}
          />
        </div>

        <SmsHistoryTable
          rows={history}
          isLoading={isHistoryLoading}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onViewFullLogs={() => setIsFullLogsOpen(true)}
          onResend={(row) => resendMutation.mutate(row.id)}
          onView={setSelectedLog}
          onDelete={setDeleteTarget}
          isMutating={isMutating}
        />
      </div>

      <AIAssistDialog
        open={isAIDialogOpen}
        onOpenChange={setIsAIDialogOpen}
        currentDraft={message}
        mode="sms"
        onUseSuggestion={(text) => {
          setMessage(text);
          setSelectedTemplateId("");
        }}
      />

      <SMSLogDetailsDialog
        log={selectedLog}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
        onResend={(id) => resendMutation.mutate(id)}
        onDelete={(log) => setDeleteTarget(log)}
        isResending={resendMutation.isPending}
      />

      <Dialog open={isFullLogsOpen} onOpenChange={setIsFullLogsOpen}>
        <DialogContent className="max-w-6xl p-0">
          <DialogHeader className="border-b p-4">
            <DialogTitle>SMS logs</DialogTitle>
            <DialogDescription>
              Recent message activity and delivery status.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto">
            <SmsFullLogsTable
              rows={fullHistory || []}
              isLoading={isFetchingFullHistory}
              onResend={(row) => resendMutation.mutate(row.id)}
              onView={setSelectedLog}
              onDelete={setDeleteTarget}
              isMutating={isMutating}
            />
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SMS log?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected log from history. It will not recall any
              message already sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteTarget && (
            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
              <div className="font-semibold text-foreground">
                {deleteTarget.recipient_name}
              </div>
              <div className="mt-1 line-clamp-2">{deleteTarget.message}</div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete log
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PermissionPageGuard>
  );
}

function SMSLogDetailsDialog({
  log,
  onOpenChange,
  onResend,
  onDelete,
  isResending,
}: {
  log: SMSHistoryItem | null;
  onOpenChange: (open: boolean) => void;
  onResend: (id: number) => void;
  onDelete: (log: SMSHistoryItem) => void;
  isResending: boolean;
}) {
  return (
    <Dialog open={!!log} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Message details</DialogTitle>
          <DialogDescription>
            Delivery information for this SMS log.
          </DialogDescription>
        </DialogHeader>
        {log && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailItem label="Recipient" value={log.recipient_name} />
              <DetailItem
                label="Phone"
                value={log.recipient_phone || "No phone recorded"}
              />
              <div className="rounded-md border bg-muted/10 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Status
                </div>
                <div className="mt-1.5">
                  <SmsStatusBadge status={log.status} />
                </div>
              </div>
              <DetailItem
                label="Created"
                value={`${formatSmsDate(log.created_at)} ${formatSmsTime(log.created_at)}`}
              />
              <DetailItem
                label="Scheduled"
                value={
                  log.scheduled_for
                    ? `${formatSmsDate(log.scheduled_for)} ${formatSmsTime(log.scheduled_for)}`
                    : "Not scheduled"
                }
              />
              <DetailItem
                label="Sent"
                value={
                  log.sent_at
                    ? `${formatSmsDate(log.sent_at)} ${formatSmsTime(log.sent_at)}`
                    : "Not recorded"
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Message
              </Label>
              <div className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm text-foreground">
                {log.message}
              </div>
            </div>
            {log.error_message ? (
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-destructive">
                  Error
                </Label>
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {log.error_message}
                </div>
              </div>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {log && (
            <>
              <Button
                variant="outline"
                disabled={isResending}
                onClick={() => onResend(log.id)}
              >
                {isResending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Resend
              </Button>
              <Button variant="destructive" onClick={() => onDelete(log)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-medium text-foreground">
        {value}
      </div>
    </div>
  );
}
