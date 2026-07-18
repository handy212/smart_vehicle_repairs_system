"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Trash2,
  Upload,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUserFacingError } from "@/lib/api/errors";
import {
  dataExchangeApi,
  type ImportBatch,
  type ImportIssue,
  type ImportModule,
  type WipeJob,
  type WipePreviewResult,
} from "@/lib/api/data-exchange";
import { useToast } from "@/lib/hooks/useToast";
import { useBranchStore } from "@/store/branchStore";

const WIPE_CONFIRM_PHRASE = "DELETE CUSTOMERS";

function isWipeBusy(status?: string | null) {
  return status === "running";
}

function statusVariant(status: string): "default" | "success" | "warning" | "danger" | "info" | "secondary" {
  switch (status) {
    case "completed":
      return "success";
    case "previewed":
      return "info";
    case "failed":
      return "danger";
    case "rolled_back":
      return "warning";
    case "previewing":
    case "committing":
      return "secondary";
    default:
      return "default";
  }
}

function isBusyStatus(status?: string) {
  return status === "previewing" || status === "committing";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export default function ImportExportPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeBranchId, activeBranch } = useBranchStore();
  const [moduleKey, setModuleKey] = useState("customers_vehicles");
  const [file, setFile] = useState<File | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [generatePlaceholderVin, setGeneratePlaceholderVin] = useState(true);
  const [matchExisting, setMatchExisting] = useState(true);
  const [decodeVinForMissingFields, setDecodeVinForMissingFields] = useState(false);
  const [decodeVinEnrichSpecs, setDecodeVinEnrichSpecs] = useState(false);
  const [defaultYear, setDefaultYear] = useState("2000");
  const [updateExistingParts, setUpdateExistingParts] = useState(true);
  const [updateExistingStaff, setUpdateExistingStaff] = useState(false);
  const [generateTempPassword, setGenerateTempPassword] = useState(true);
  const [wipePreview, setWipePreview] = useState<WipePreviewResult | null>(null);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [wipeJobId, setWipeJobId] = useState<string | null>(null);

  const { data: modulesData, isLoading: modulesLoading } = useQuery({
    queryKey: ["data-exchange", "modules"],
    queryFn: () => dataExchangeApi.modules(),
  });

  const { data: batchesData, isLoading: batchesLoading, refetch } = useQuery({
    queryKey: ["data-exchange", "batches"],
    queryFn: () => dataExchangeApi.listBatches({ page: 1 }),
    refetchInterval: (query) => {
      const rows = query.state.data?.results || [];
      return rows.some((row) => isBusyStatus(row.status)) ? 2500 : false;
    },
  });

  const importers = modulesData?.importers || [];
  const exporters = modulesData?.exporters || [];
  const selectedModule: ImportModule | undefined = useMemo(
    () => importers.find((item) => item.key === moduleKey),
    [importers, moduleKey]
  );

  const [reportDismissed, setReportDismissed] = useState(false);

  const selectedBatch = useMemo(() => {
    const rows = batchesData?.results || [];
    if (selectedBatchId) {
      return rows.find((row) => row.id === selectedBatchId) || null;
    }
    if (reportDismissed) return null;
    return rows[0] || null;
  }, [batchesData, selectedBatchId, reportDismissed]);

  const { data: liveBatch } = useQuery({
    queryKey: ["data-exchange", "batch", selectedBatch?.id],
    queryFn: () => dataExchangeApi.getBatch(selectedBatch!.id),
    enabled: Boolean(selectedBatch?.id),
    refetchInterval: (query) => (isBusyStatus(query.state.data?.status) ? 2000 : false),
  });

  const batch: ImportBatch | null = liveBatch || selectedBatch;

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose an Excel (.xlsx) file first");
      const options: Record<string, unknown> = {};
      if (moduleKey === "customers_vehicles" || moduleKey === "vehicles") {
        options.generate_placeholder_vin = generatePlaceholderVin;
        options.match_existing_customers = matchExisting;
        options.decode_vin_for_missing_fields = decodeVinForMissingFields;
        options.decode_vin_enrich_specs = decodeVinEnrichSpecs;
        options.default_year = Number(defaultYear) || 2000;
      }
      if (moduleKey === "parts") {
        options.update_existing = updateExistingParts;
        if (activeBranchId) options.branch_id = activeBranchId;
        if (activeBranch?.code) options.branch_code = activeBranch.code;
      }
      if (moduleKey === "staff") {
        options.update_existing = updateExistingStaff;
        options.generate_temp_password = generateTempPassword;
        if (activeBranchId) options.default_branch_id = activeBranchId;
        if (activeBranch?.code) options.default_branch_code = activeBranch.code;
      }
      return dataExchangeApi.upload(moduleKey, file, options);
    },
    onSuccess: (result) => {
      setReportDismissed(false);
      setSelectedBatchId(result.id);
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["data-exchange", "batches"] });
      queryClient.setQueryData(["data-exchange", "batch", result.id], result);
      toast({
        title: "Upload received",
        description: `${result.original_filename} is validating in the background. Keep this page open.`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Upload failed",
        description: getUserFacingError(error, "Unable to upload import file"),
        variant: "destructive",
      });
    },
  });

  const commitMutation = useMutation({
    mutationFn: (id: number) => dataExchangeApi.commit(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["data-exchange"] });
      queryClient.setQueryData(["data-exchange", "batch", result.id], result);
      toast({
        title: "Import started",
        description: "Commit is running in the background. This can take several minutes for large files.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Commit failed",
        description: getUserFacingError(error, "Unable to commit import"),
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => dataExchangeApi.cancel(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["data-exchange"] });
      queryClient.setQueryData(["data-exchange", "batch", result.id], result);
      toast({
        title: "Import cancelled",
        description: "Commit/preview was stopped. You can delete the batch or upload again. Partial rows already created may remain.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Cancel failed",
        description: getUserFacingError(error, "Unable to cancel import"),
        variant: "destructive",
      });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (id: number) => dataExchangeApi.rollback(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-exchange"] });
      toast({
        title: "Import rolled back",
        description: "Created records from this batch were removed where safe.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Rollback failed",
        description: getUserFacingError(error, "Unable to roll back import"),
        variant: "destructive",
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await dataExchangeApi.exportModule(key);
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${key}_export.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({ title: "Export ready", description: "Download started." });
    },
    onError: (error: unknown) => {
      toast({
        title: "Export failed",
        description: getUserFacingError(error, "Unable to export data"),
        variant: "destructive",
      });
    },
  });

  const deleteBatchMutation = useMutation({
    mutationFn: (id: number) => dataExchangeApi.deleteBatch(id),
    onSuccess: (_result, id) => {
      if (selectedBatchId === id || selectedBatch?.id === id) {
        setSelectedBatchId(null);
        setReportDismissed(true);
      }
      queryClient.removeQueries({ queryKey: ["data-exchange", "batch", id] });
      queryClient.invalidateQueries({ queryKey: ["data-exchange", "batches"] });
      toast({
        title: "Batch deleted",
        description: "Validation report and batch history entry were removed. Imported data was not deleted.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Delete failed",
        description: getUserFacingError(error, "Unable to delete import batch"),
        variant: "destructive",
      });
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: (includeCompleted: boolean) =>
      dataExchangeApi.clearHistory({ include_completed: includeCompleted }),
    onSuccess: (result) => {
      setSelectedBatchId(null);
      setReportDismissed(true);
      queryClient.invalidateQueries({ queryKey: ["data-exchange"] });
      toast({
        title: "History cleared",
        description: `Removed ${result.deleted_count} import batch(es). Customer/vehicle records were not deleted.`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Clear failed",
        description: getUserFacingError(error, "Unable to clear import history"),
        variant: "destructive",
      });
    },
  });

  const wipePreviewMutation = useMutation({
    mutationFn: () => dataExchangeApi.wipePreview(),
    onSuccess: (result) => {
      setWipePreview(result);
      if (result.active_job?.job_id && isWipeBusy(result.active_job.status)) {
        setWipeJobId(result.active_job.job_id);
      }
      toast({
        title: "Wipe preview ready",
        description: `Would remove ${result.counts.customers || 0} customers and ${result.counts.vehicles || 0} vehicles (plus related ops).`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Preview failed",
        description: getUserFacingError(error, "Unable to preview wipe"),
        variant: "destructive",
      });
    },
  });

  const wipeExecuteMutation = useMutation({
    mutationFn: () => dataExchangeApi.wipeExecute(wipeConfirm),
    onSuccess: (result) => {
      setWipeConfirm("");
      setWipeJobId(result.job_id);
      toast({
        title: "Wipe started",
        description: "Running in the background. This page will update when it finishes.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Wipe failed",
        description: getUserFacingError(error, "Unable to wipe migration data"),
        variant: "destructive",
      });
    },
  });

  const { data: wipeStatusData } = useQuery({
    queryKey: ["data-exchange", "wipe-status", wipeJobId],
    queryFn: () => dataExchangeApi.wipeStatus(),
    enabled: Boolean(wipeJobId),
    refetchInterval: (query) =>
      isWipeBusy(query.state.data?.job?.status || query.state.data?.status) ? 2500 : false,
  });

  const wipeJob: WipeJob | null = wipeStatusData?.job || null;
  const wipeTerminalHandled = useRef("");

  useEffect(() => {
    if (!wipeJob?.job_id || !wipeJob.status || isWipeBusy(wipeJob.status)) {
      return;
    }
    const key = `${wipeJob.job_id}:${wipeJob.status}`;
    if (wipeTerminalHandled.current === key) {
      return;
    }
    wipeTerminalHandled.current = key;
    setSelectedBatchId(null);
    setReportDismissed(true);
    setWipePreview(null);
    queryClient.invalidateQueries({ queryKey: ["data-exchange"] });
    if (wipeJob.status === "failed") {
      toast({
        title: "Wipe failed",
        description: wipeJob.error || "Background wipe failed",
        variant: "destructive",
      });
    } else {
      toast({
        title: wipeJob.ok ? "Migration data wiped" : "Wipe finished with leftovers",
        description: wipeJob.ok
          ? "Customers and vehicles cleared. You can re-import a cleaned sheet."
          : "Some records may remain — check counts and try again if needed.",
        variant: wipeJob.ok ? "default" : "destructive",
      });
    }
    setWipeJobId(null);
  }, [wipeJob, queryClient, toast]);

  const issues: ImportIssue[] = batch?.preview_report?.issues || [];
  const summary = batch?.summary || batch?.preview_report?.summary || {};

  return (
    <PermissionPageGuard permission="manage_data_exchange">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Import / Export</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Centralized Data &amp; Audit hub for safe imports with preview, validation,
              customer–vehicle linking, audit trail, and rollback.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Import
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Module</Label>
                <Select value={moduleKey} onValueChange={setModuleKey}>
                  <SelectTrigger>
                    <SelectValue placeholder={modulesLoading ? "Loading…" : "Select module"} />
                  </SelectTrigger>
                  <SelectContent>
                    {importers.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedModule ? (
                  <p className="text-xs text-muted-foreground">{selectedModule.description}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-file">Excel file (.xlsx)</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
              </div>

              {moduleKey === "customers_vehicles" || moduleKey === "vehicles" ? (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="match-existing"
                      checked={matchExisting}
                      onCheckedChange={(value) => setMatchExisting(Boolean(value))}
                    />
                    <div>
                      <Label htmlFor="match-existing">Match existing customers</Label>
                      <p className="text-xs text-muted-foreground">
                        Prefer email, then phone + name, to avoid duplicates. One customer can own many vehicles.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="placeholder-vin"
                      checked={generatePlaceholderVin}
                      onCheckedChange={(value) => setGeneratePlaceholderVin(Boolean(value))}
                    />
                    <div>
                      <Label htmlFor="placeholder-vin">Generate placeholder VINs</Label>
                      <p className="text-xs text-muted-foreground">
                        Recommended on. If off, missing/invalid VINs are counted as Failed and those
                        vehicles are not imported.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="fill-make-model-vin"
                      checked={decodeVinForMissingFields}
                      onCheckedChange={(value) => setDecodeVinForMissingFields(Boolean(value))}
                    />
                    <Label htmlFor="fill-make-model-vin">Fill missing make/model from VIN</Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="enrich-vin-specs"
                      checked={decodeVinEnrichSpecs}
                      onCheckedChange={(value) => setDecodeVinEnrichSpecs(Boolean(value))}
                    />
                    <Label htmlFor="enrich-vin-specs">Enrich technical specs from VIN</Label>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="default-year">Default year when missing</Label>
                    <Input
                      id="default-year"
                      value={defaultYear}
                      onChange={(event) => setDefaultYear(event.target.value)}
                      className="max-w-[140px]"
                    />
                  </div>
                </div>
              ) : null}

              {moduleKey === "parts" ? (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Stock quantities apply to the active branch
                    {activeBranch ? (
                      <>
                        : <span className="font-medium text-foreground">{activeBranch.name}</span>
                        {" "}({activeBranch.code})
                      </>
                    ) : (
                      " (select a branch in the header, or HQ/first active branch is used)."
                    )}
                  </p>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="update-existing-parts"
                      checked={updateExistingParts}
                      onCheckedChange={(value) => setUpdateExistingParts(Boolean(value))}
                    />
                    <div>
                      <Label htmlFor="update-existing-parts">Update existing parts</Label>
                      <p className="text-xs text-muted-foreground">
                        When part_number already exists, update catalog fields and stock instead of skipping.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {moduleKey === "staff" ? (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Required columns: email, first_name, last_name. Optional: password, phone, role,
                    branch, department, position, employment fields. Default branch for rows without
                    a branch column
                    {activeBranch ? (
                      <>
                        : <span className="font-medium text-foreground">{activeBranch.name}</span>
                        {" "}({activeBranch.code})
                      </>
                    ) : (
                      " — set an active branch for branch-required roles."
                    )}
                  </p>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="generate-temp-password"
                      checked={generateTempPassword}
                      onCheckedChange={(value) => setGenerateTempPassword(Boolean(value))}
                    />
                    <div>
                      <Label htmlFor="generate-temp-password">Generate temporary passwords</Label>
                      <p className="text-xs text-muted-foreground">
                        When password is blank, create a secure temp password (shown in the preview report).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="update-existing-staff"
                      checked={updateExistingStaff}
                      onCheckedChange={(value) => setUpdateExistingStaff(Boolean(value))}
                    />
                    <div>
                      <Label htmlFor="update-existing-staff">Update existing staff</Label>
                      <p className="text-xs text-muted-foreground">
                        When email already exists, update the user and HR profile instead of skipping.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <Button
                onClick={() => uploadMutation.mutate()}
                disabled={!file || uploadMutation.isPending}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {uploadMutation.isPending ? "Uploading…" : "Upload & preview"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Download import-compatible workbooks for backup or transfer between environments.
              </p>
              <div className="flex flex-wrap gap-2">
                {exporters.map((item) => (
                  <Button
                    key={item.key}
                    variant="outline"
                    size="sm"
                    disabled={exportMutation.isPending}
                    onClick={() => exportMutation.mutate(item.key)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {item.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Validation report</CardTitle>
            {batch ? <Badge variant={statusVariant(batch.status)}>{batch.status}</Badge> : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {!batch ? (
              <p className="text-sm text-muted-foreground">
                Upload a file to generate a preview. Nothing is written until you commit.
              </p>
            ) : (
              <>
                {isBusyStatus(batch.status) ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                    {batch.status === "previewing"
                      ? "Validating file in the background… large ERP files can take a few minutes. This page refreshes automatically."
                      : "Committing import in the background… keep this page open until status becomes completed."}
                  </div>
                ) : null}

                {batch.status === "failed" && batch.error_message ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                    {batch.error_message}
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{batch.original_filename}</p>
                    <p className="text-xs text-muted-foreground">
                      Module: {batch.module_key}
                      {batch.preview_report?.format_detected
                        ? ` · Format: ${batch.preview_report.format_detected}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedBatchId(null);
                        setReportDismissed(true);
                      }}
                      title="Hide this report without deleting the batch"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Delete this import batch and its validation report? Imported customers/vehicles will NOT be deleted."
                          )
                        ) {
                          deleteBatchMutation.mutate(batch.id);
                        }
                      }}
                      disabled={deleteBatchMutation.isPending || batch.status === "committing"}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete batch
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const response = await dataExchangeApi.downloadValidationReport(batch.id);
                          const blob = new Blob([response.data], {
                            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = `import_validation_batch_${batch.id}.xlsx`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          URL.revokeObjectURL(url);
                        } catch (error: unknown) {
                          toast({
                            title: "Download failed",
                            description: getUserFacingError(error, "Unable to download validation report"),
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Full report
                    </Button>
                    {isBusyStatus(batch.status) ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Stop this import? The batch will unlock. Rows already created may remain until you clean them up."
                            )
                          ) {
                            cancelMutation.mutate(batch.id);
                          }
                        }}
                        disabled={cancelMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-2" />
                        {cancelMutation.isPending ? "Stopping…" : "Stop"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => commitMutation.mutate(batch.id)}
                        disabled={!batch.can_commit || commitMutation.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Commit import
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Roll back this import? Vehicles/customers created by this batch will be deleted if they have no dependent records."
                          )
                        ) {
                          rollbackMutation.mutate(batch.id);
                        }
                      }}
                      disabled={!batch.can_rollback || rollbackMutation.isPending}
                    >
                      <Undo2 className="h-4 w-4 mr-2" />
                      Rollback
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  <strong className="text-foreground">Keep “Generate placeholder VINs” checked</strong> for
                  Book2 / ERP files. Missing or invalid VINs then become warnings + placeholders, not
                  failures. Duplicate VINs on different plates also get placeholders instead of being skipped.
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ["Customers to create", asNumber(summary.customers_to_create)],
                    ["Customers matched", asNumber(summary.customers_matched)],
                    ["Vehicles to create", asNumber(summary.vehicles_to_create)],
                    ["Vehicles created", asNumber(summary.vehicles_created)],
                    ["Vehicles failed", asNumber(summary.vehicles_failed)],
                    ["Vehicles skipped", asNumber(summary.vehicles_skipped)],
                    [
                      "Duplicate VIN → placeholder",
                      asNumber(summary.duplicate_vin_placeholders),
                    ],
                    [
                      "Missing/invalid VIN → placeholder",
                      asNumber(summary.missing_vin_placeholders),
                    ],
                    ["Duplicate VIN count", asNumber(summary.duplicate_vin_in_file)],
                    ["VIN fields decoded", asNumber(summary.vin_decoded_fields)],
                    ["VIN specs stored", asNumber(summary.vin_decoded_stored)],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-md border px-3 py-2">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-lg font-semibold">{value}</p>
                    </div>
                  ))}
                </div>

                {(batch.preview_report?.issue_breakdown?.length || 0) > 0 && (
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Level</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Count</TableHead>
                          <TableHead>Example</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batch.preview_report?.issue_breakdown?.map((row) => (
                          <TableRow key={`${row.level}-${row.code}`}>
                            <TableCell>
                              <Badge
                                variant={
                                  row.level === "error"
                                    ? "danger"
                                    : row.level === "warning"
                                      ? "warning"
                                      : "secondary"
                                }
                              >
                                {row.level}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{row.code}</TableCell>
                            <TableCell>{row.count}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.message}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {(asNumber(batch.preview_report?.error_count) > 0 ||
                  asNumber(batch.preview_report?.warning_count) > 0) && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>
                      {asNumber(batch.preview_report?.error_count)} errors ·{" "}
                      {asNumber(batch.preview_report?.warning_count)} warnings
                      {asNumber(batch.preview_report?.issues_truncated) > 0
                        ? ` · detail list shows errors + a warning sample (${asNumber(batch.preview_report?.issues_truncated)} omitted — use Full report)`
                        : ""}
                    </p>
                  </div>
                )}

                <div className="rounded-md border overflow-auto max-h-[360px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Identifier</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {issues.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-muted-foreground">
                            No row-level issues in the preview sample.
                          </TableCell>
                        </TableRow>
                      ) : (
                        issues.map((issue, index) => (
                          <TableRow key={`${issue.row_number}-${index}`}>
                            <TableCell>{issue.row_number || "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  issue.level === "error"
                                    ? "danger"
                                    : issue.level === "warning"
                                      ? "warning"
                                      : "secondary"
                                }
                              >
                                {issue.level}
                              </Badge>
                            </TableCell>
                            <TableCell>{issue.entity_type}</TableCell>
                            <TableCell>{issue.action}</TableCell>
                            <TableCell className="max-w-[140px] truncate">
                              {issue.identifier || "—"}
                            </TableCell>
                            <TableCell className="min-w-[220px]">{issue.message}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Reset migration data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Permanently delete all customers, vehicles, and related operational records
              (work orders, invoices, payments, appointments, roadside, gate passes,
              subscriptions). Staff, branches, inventory catalog, and settings are kept.
            </p>

            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
              <p className="font-medium">ERP sheet cleanup tips (before re-import)</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Work on a copy of the workbook; keep sheet columns as-is.</li>
                <li>One primary phone per row (avoid <code>0244… / 0552…</code>).</li>
                <li>Unique <code>REG NO</code>; fill MAKE/MODEL when VIN is empty.</li>
                <li>Duplicate VINs across plates are OK (importer uses placeholders).</li>
                <li>Remove non-vehicle junk rows, or accept Unknown make/model.</li>
              </ul>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={
                  wipePreviewMutation.isPending ||
                  wipeExecuteMutation.isPending ||
                  Boolean(wipeJobId)
                }
                onClick={() => wipePreviewMutation.mutate()}
              >
                Preview counts
              </Button>
            </div>

            {wipeJobId || isWipeBusy(wipeJob?.status) ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                Wipe running in the background
                {wipeJob?.progress ? ` (${wipeJob.progress})` : ""}. Keep this page open.
              </div>
            ) : null}

            {wipePreview ? (
              <div className="space-y-3">
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entity</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(wipePreview.counts)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([key, value]) => (
                          <TableRow key={key}>
                            <TableCell>{key}</TableCell>
                            <TableCell className="text-right tabular-nums">{value}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wipe-confirm">
                    Type <span className="font-mono font-semibold">{WIPE_CONFIRM_PHRASE}</span> to confirm
                  </Label>
                  <Input
                    id="wipe-confirm"
                    value={wipeConfirm}
                    onChange={(event) => setWipeConfirm(event.target.value)}
                    placeholder={WIPE_CONFIRM_PHRASE}
                    autoComplete="off"
                    disabled={Boolean(wipeJobId)}
                  />
                </div>

                <Button
                  variant="destructive"
                  disabled={
                    wipeConfirm !== WIPE_CONFIRM_PHRASE ||
                    wipeExecuteMutation.isPending ||
                    wipePreviewMutation.isPending ||
                    Boolean(wipeJobId)
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        "This permanently deletes customers, vehicles, and related ops data. Continue?"
                      )
                    ) {
                      wipeExecuteMutation.mutate();
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {wipeJobId || wipeExecuteMutation.isPending
                    ? "Wiping in background…"
                    : "Wipe customers & vehicles"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Recent import batches</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={clearHistoryMutation.isPending || !(batchesData?.results?.length)}
                onClick={() => {
                  if (
                    window.confirm(
                      "Clear preview/failed/rolled-back batches? Completed imports are kept so rollback remains available. Imported data is not deleted."
                    )
                  ) {
                    clearHistoryMutation.mutate(false);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear history
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={clearHistoryMutation.isPending || !(batchesData?.results?.length)}
                onClick={() => {
                  if (
                    window.confirm(
                      "Clear ALL import batches, including completed ones? You will lose rollback for those batches. Imported customers/vehicles are NOT deleted."
                    )
                  ) {
                    clearHistoryMutation.mutate(true);
                  }
                }}
              >
                Clear all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {batchesLoading ? (
              <p className="text-sm text-muted-foreground">Loading batches…</p>
            ) : (batchesData?.results || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No import batches yet.</p>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(batchesData?.results || []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.id}</TableCell>
                        <TableCell className="max-w-[220px] truncate">
                          {row.original_filename}
                        </TableCell>
                        <TableCell>{row.module_key}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="space-x-1 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReportDismissed(false);
                              setSelectedBatchId(row.id);
                            }}
                          >
                            View
                          </Button>
                          {isBusyStatus(row.status) ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={cancelMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`Stop batch #${row.id}?`)) {
                                  cancelMutation.mutate(row.id);
                                }
                              }}
                              title="Stop"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deleteBatchMutation.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete batch #${row.id}? Imported data will not be deleted.`
                                  )
                                ) {
                                  deleteBatchMutation.mutate(row.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionPageGuard>
  );
}
