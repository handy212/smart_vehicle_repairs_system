"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowDownCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  History,
} from "lucide-react";
import { adminApi, SystemUpdateRun } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "secondary" | "outline";

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "in_progress":
      return "info";
    default:
      return "warning";
  }
}

export default function SystemUpdatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<SystemUpdateRun | null>(null);

  const {
    data: checkData,
    isLoading: checking,
    refetch: refetchCheck,
    isFetching: isChecking,
  } = useQuery({
    queryKey: ["system-updates", "check"],
    queryFn: () => adminApi.updates.check(),
    refetchOnWindowFocus: false,
  });

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["system-updates", "history"],
    queryFn: () => adminApi.updates.list(),
    refetchInterval: (query) => {
      const rows = query.state.data?.results || [];
      return rows.some((run) => run.status === "pending" || run.status === "in_progress")
        ? 5000
        : false;
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => adminApi.updates.apply({ git_ref: checkData?.git_ref || "main" }),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["system-updates"] });
      toast({
        title: "Update started",
        description: `Update #${run.id} is running. This may take several minutes.`,
      });
      setConfirmOpen(false);
    },
    onError: (error: unknown) => {
      toast({
        title: "Update failed to start",
        description: getUserFacingError(error, "Could not start the update."),
        variant: "destructive",
      });
    },
  });

  const runs = historyData?.results || [];
  const updater = checkData?.updater;
  const updateAvailable = Boolean(checkData?.available);
  const canApply = Boolean(updater?.can_apply);

  return (
    <PermissionGuard permission="manage_system_updates">
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">System Updates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Check for new releases and apply updates without using the command line.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchCheck();
              refetchHistory();
            }}
            disabled={checking || isChecking}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4" />
              Update status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {checking && !checkData ? (
              <p className="text-sm text-muted-foreground">Checking for updates...</p>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Deployed version
                    </p>
                    <p className="font-mono text-sm">
                      {checkData?.deployed_short || "unknown"}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {checkData?.deployed_message || "No commit message available"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Latest on {checkData?.git_ref || "main"}
                    </p>
                    <p className="font-mono text-sm">
                      {checkData?.remote_short || "unknown"}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {checkData?.remote_message || "Could not read remote commit"}
                    </p>
                  </div>
                </div>

                {checkData?.check_error && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                    <span>{checkData.check_error}</span>
                  </div>
                )}

                {!updater?.bare_metal_layout && (
                  <div className="flex items-start gap-2 rounded-lg border border-muted p-3 text-sm text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      UI updates are only available on bare-metal installs with{" "}
                      <code className="text-xs">/opt</code> and <code className="text-xs">/var/www/svr</code>.
                    </span>
                  </div>
                )}

                {updater?.bare_metal_layout && !updater?.enabled && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                    <span>
                      Set <code className="text-xs">SYSTEM_UPDATE_ENABLED=true</code> in production{" "}
                      <code className="text-xs">.env</code> to enable apply from the UI.
                    </span>
                  </div>
                )}

                {updater?.enabled && !updater?.sudo_configured && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                    <span>
                      Install <code className="text-xs">deploy/sudoers-svr-system-update</code> on the
                      server so the app can run updates as root.
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  {updateAvailable ? (
                    <Badge variant="warning">
                      {checkData?.commits_behind ?? "?"} commit(s) behind
                    </Badge>
                  ) : (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Up to date
                    </Badge>
                  )}

                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={!updateAvailable || !canApply || applyMutation.isPending}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Apply update
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Update history
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <p className="text-sm text-muted-foreground">Loading history...</p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No updates have been run yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="text-right">Log</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(run.started_at), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell>{run.git_ref}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {run.from_commit?.slice(0, 7) || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {run.to_commit?.slice(0, 7) || "—"}
                      </TableCell>
                      <TableCell>{run.created_by_name || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!run.log_output}
                          onClick={() => setSelectedRun(run)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apply system update?</DialogTitle>
              <DialogDescription>
                This will pull the latest code, rebuild the frontend and backend, run migrations,
                and restart services. The site may be briefly unavailable.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Branch:</span> {checkData?.git_ref}
              </p>
              <p>
                <span className="text-muted-foreground">From:</span>{" "}
                <span className="font-mono">{checkData?.deployed_short}</span>
              </p>
              <p>
                <span className="text-muted-foreground">To:</span>{" "}
                <span className="font-mono">{checkData?.remote_short}</span>
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
                {applyMutation.isPending ? "Starting..." : "Apply update"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(selectedRun)} onOpenChange={(open) => !open && setSelectedRun(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Update log #{selectedRun?.id}</DialogTitle>
              <DialogDescription>
                {selectedRun?.error_message || "Deployment output"}
              </DialogDescription>
            </DialogHeader>
            <pre className="flex-1 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
              {selectedRun?.log_output || "No log output captured."}
            </pre>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}
