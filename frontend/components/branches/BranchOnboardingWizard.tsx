"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import {
  branchesApi,
  Branch,
  BranchQboOnboardResult,
  QboDepartment,
} from "@/lib/api/branches";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

const UNMAPPED_VALUE = "__unmapped__";

type LocationMode = "auto_sync" | "map" | "skip";

export function BranchOnboardingWizard({
  branch,
  open,
  onClose,
}: {
  branch: Branch | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected, isApiReady, isLoading: qboStatusLoading } = useQuickBooksConnection();

  const [locationMode, setLocationMode] = useState<LocationMode>("auto_sync");
  const [departmentId, setDepartmentId] = useState(UNMAPPED_VALUE);
  const [provisionSettlement, setProvisionSettlement] = useState(true);
  const [provisionMainCash, setProvisionMainCash] = useState(true);
  const [result, setResult] = useState<BranchQboOnboardResult | null>(null);

  const { data: departmentsData, isLoading: departmentsLoading } = useQuery({
    queryKey: ["branches", "qbo-departments"],
    queryFn: () => branchesApi.listQboDepartments(),
    enabled: open && isConnected && isApiReady,
    retry: false,
  });

  const departments = departmentsData?.departments ?? [];

  const departmentOptions = useMemo(
    () =>
      departments.map((department: QboDepartment) => ({
        value: department.id,
        label: department.name,
        takenByOther:
          department.mapped_branch !== null && department.mapped_branch?.id !== branch?.id,
      })),
    [departments, branch?.id],
  );

  useEffect(() => {
    if (!open) {
      setResult(null);
      setLocationMode("auto_sync");
      setDepartmentId(UNMAPPED_VALUE);
      setProvisionSettlement(true);
      setProvisionMainCash(true);
    } else if (branch?.qbo_department_id) {
      setLocationMode("map");
      setDepartmentId(branch.qbo_department_id);
    }
  }, [open, branch?.id, branch?.qbo_department_id]);

  const onboardMutation = useMutation({
    mutationFn: (dryRun: boolean) =>
      branchesApi.onboardQuickBooks(branch!.id, {
        location_action: locationMode,
        department_id: locationMode === "map" && departmentId !== UNMAPPED_VALUE ? departmentId : undefined,
        provision_settlement: provisionSettlement,
        provision_main_cash: provisionMainCash,
        dry_run: dryRun,
      }),
    onSuccess: (data, dryRun) => {
      setResult(data);
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: ["branches"] });
        queryClient.invalidateQueries({ queryKey: ["branches", "qbo-departments"] });
        queryClient.invalidateQueries({ queryKey: ["branches", "settlement-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
        if (!data.errors?.length) {
          toast({
            title: "Branch QuickBooks setup complete",
            description: `${branch?.name} is ready for location reporting and settlement accounts.`,
          });
        }
      }
    },
    onError: (error: unknown) => {
      toast({
        title: "Setup failed",
        description: getUserFacingError(error, "Could not complete QuickBooks branch setup."),
        variant: "destructive",
      });
    },
  });

  if (!branch) {
    return null;
  }

  const canRun =
    isConnected &&
    (locationMode !== "map" || departmentId !== UNMAPPED_VALUE) &&
    (provisionSettlement || provisionMainCash || locationMode !== "skip");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            QuickBooks Branch Setup
          </DialogTitle>
          <DialogDescription className="text-xs">
            Set up <strong>{branch.name}</strong> ({branch.code}) — location, bank/cash accounts, and
            till main cash in one step.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          {qboStatusLoading ? (
            <p className="text-sm text-muted-foreground">Checking QuickBooks connection…</p>
          ) : !isConnected ? (
            <p className="text-sm text-muted-foreground">
              Connect QuickBooks under{" "}
              <a href="/admin/integrations" className="text-primary hover:underline">
                Admin → Integrations
              </a>{" "}
              before running setup.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-medium">QuickBooks location</Label>
                <Select value={locationMode} onValueChange={(v) => setLocationMode(v as LocationMode)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto_sync">Create or update location in QBO (recommended)</SelectItem>
                    <SelectItem value="map">Link to an existing QBO location</SelectItem>
                    <SelectItem value="skip">Skip location mapping for now</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {locationMode === "map" && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">QBO location</Label>
                  {departmentsLoading ? (
                    <p className="text-xs text-muted-foreground">Loading locations…</p>
                  ) : (
                    <Select value={departmentId || UNMAPPED_VALUE} onValueChange={setDepartmentId}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNMAPPED_VALUE}>Select location…</SelectItem>
                        {departmentOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            disabled={option.takenByOther}
                          >
                            {option.label}
                            {option.takenByOther ? " (mapped to another branch)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={provisionSettlement}
                    onCheckedChange={(checked) => setProvisionSettlement(Boolean(checked))}
                  />
                  <span className="text-xs leading-relaxed">
                    <span className="font-medium text-foreground">Match settlement accounts from QBO</span>
                    <span className="block text-muted-foreground">
                      Absa, MOMO, cash receipt, LPO — branch bank/cash GL rows
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={provisionMainCash}
                    onCheckedChange={(checked) => setProvisionMainCash(Boolean(checked))}
                  />
                  <span className="text-xs leading-relaxed">
                    <span className="font-medium text-foreground">Provision till Main Cash account</span>
                    <span className="block text-muted-foreground">
                      Per-branch till-enabled cash (114x series)
                    </span>
                  </span>
                </label>
              </div>

              {result && (
                <OnboardResultSummary result={result} />
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-3 gap-2 sm:justify-between">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {result && !result.errors?.length ? "Done" : "Cancel"}
          </Button>
          {isConnected && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canRun || onboardMutation.isPending}
                onClick={() => onboardMutation.mutate(true)}
              >
                Preview
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canRun || onboardMutation.isPending}
                onClick={() => onboardMutation.mutate(false)}
              >
                {onboardMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Run setup
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OnboardResultSummary({ result }: { result: BranchQboOnboardResult }) {
  const hasErrors = Boolean(result.errors?.length);
  const assigned = result.settlement_overview?.assigned?.length ?? 0;

  return (
    <div className="rounded-md border p-3 text-xs space-y-2">
      <div className="flex items-center gap-2 font-medium">
        {hasErrors ? (
          <XCircle className="h-4 w-4 text-destructive" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-success" />
        )}
        {result.dry_run ? "Preview" : hasErrors ? "Completed with errors" : "Setup finished"}
      </div>

      {result.location?.qbo_department_name && (
        <p>Location: {result.location.qbo_department_name}</p>
      )}
      {result.location?.skipped && <p>Location: skipped</p>}
      {result.location?.detail && <p>{result.location.detail}</p>}

      {(result.settlement?.created?.length ?? 0) > 0 && (
        <p>Settlement created: {result.settlement!.created!.join(", ")}</p>
      )}
      {(result.settlement?.mapped?.length ?? 0) > 0 && (
        <p>Settlement mapped: {result.settlement!.mapped!.join(", ")}</p>
      )}
      {(result.main_cash?.created?.length ?? 0) > 0 && (
        <p>Main cash created: {result.main_cash!.created!.join(", ")}</p>
      )}
      {!result.dry_run && assigned > 0 && (
        <p>{assigned} settlement account(s) now assigned to this branch.</p>
      )}

      {result.warnings?.map((line) => (
        <p key={line} className="text-muted-foreground">{line}</p>
      ))}
      {result.errors?.map((line) => (
        <p key={line} className="text-destructive">{line}</p>
      ))}
    </div>
  );
}
