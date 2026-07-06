"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, RefreshCcw, Unlink, Wand2 } from "lucide-react";
import { branchesApi, Branch } from "@/lib/api/branches";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export function BranchQboMappingPanel({ branches, embedded = false }: { branches: Branch[]; embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected, isApiReady, connectionIssue, isLoading: qboStatusLoading } = useQuickBooksConnection();
  const [draftSelections, setDraftSelections] = useState<Record<number, string>>({});

  const {
    data: departmentsData,
    isLoading: departmentsLoading,
    refetch: refetchDepartments,
    isFetching: departmentsFetching,
  } = useQuery({
    queryKey: ["branches", "qbo-departments"],
    queryFn: () => branchesApi.listQboDepartments(),
    enabled: isConnected && isApiReady,
    retry: false,
  });

  const departments = departmentsData?.departments ?? [];

  const departmentOptions = useMemo(
    () =>
      departments.map((department) => ({
        value: department.id,
        label: department.name,
        mappedBranchId: department.mapped_branch?.id ?? null,
      })),
    [departments],
  );

  const mapMutation = useMutation({
    mutationFn: ({
      branchId,
      payload,
    }: {
      branchId: number;
      payload: { department_id?: string; action?: "auto_sync" | "clear" };
    }) => branchesApi.setQboMapping(branchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["branches", "qbo-departments"] });
    },
  });

  if (qboStatusLoading) {
    return null;
  }

  if (!isConnected) {
    return (
      <Card className="mx-4 border shadow-sm bg-muted/20">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Connect QuickBooks under{" "}
          <a href="/admin/integrations" className="text-primary hover:underline">
            Admin → Integrations
          </a>{" "}
        </CardContent>
      </Card>
    );
  }

  if (!isApiReady) {
    return (
      <Card className="mx-4 border shadow-sm border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 text-sm text-muted-foreground">
          {connectionIssue ||
            "QuickBooks is linked but the live API session is unavailable. Reconnect under Admin → Integrations."}
        </CardContent>
      </Card>
    );
  }

  const getSelectionValue = (branch: Branch): string => {
    if (draftSelections[branch.id] !== undefined) {
      return draftSelections[branch.id] || UNMAPPED_VALUE;
    }
    return branch.qbo_department_id || UNMAPPED_VALUE;
  };

  const selectValueForBranch = (branch: Branch, selected: string) => {
    if (selected === UNMAPPED_VALUE) {
      return UNMAPPED_VALUE;
    }
    const knownValues = new Set([
      UNMAPPED_VALUE,
      ...departmentOptions.map((option) => option.value),
    ]);
    return knownValues.has(selected) ? selected : UNMAPPED_VALUE;
  };

  const handleSaveMapping = async (branch: Branch) => {
    const selected = getSelectionValue(branch);
    try {
      if (selected === UNMAPPED_VALUE) {
        if (!branch.qbo_department_id) {
          return;
        }
        await mapMutation.mutateAsync({ branchId: branch.id, payload: { action: "clear" } });
        toast({ title: "Mapping cleared", description: `${branch.name} is no longer linked to QuickBooks.` });
      } else if (selected !== branch.qbo_department_id) {
        await mapMutation.mutateAsync({
          branchId: branch.id,
          payload: { department_id: selected },
        });
        toast({
          title: "Location mapped",
          description: `${branch.name} is now linked to QuickBooks.`,
        });
      }
      setDraftSelections((current) => {
        const next = { ...current };
        delete next[branch.id];
        return next;
      });
    } catch (error: unknown) {
      toast({
        title: "Mapping failed",
        description: getUserFacingError(error, "Could not update QuickBooks mapping."),
        variant: "destructive",
      });
    }
  };

  const handleAutoSync = async (branch: Branch) => {
    try {
      const result = await mapMutation.mutateAsync({
        branchId: branch.id,
        payload: { action: "auto_sync" },
      });
      toast({
        title: "Synced to QuickBooks",
        description: result.qbo_department_name
          ? `${branch.name} → ${result.qbo_department_name}`
          : `${branch.name} was pushed to QuickBooks.`,
      });
      setDraftSelections((current) => {
        const next = { ...current };
        delete next[branch.id];
        return next;
      });
    } catch (error: unknown) {
      toast({
        title: "Sync failed",
        description: getUserFacingError(error, "Could not sync branch to QuickBooks."),
        variant: "destructive",
      });
    }
  };

  const handleClear = async (branch: Branch) => {
    try {
      await mapMutation.mutateAsync({ branchId: branch.id, payload: { action: "clear" } });
      toast({ title: "Mapping cleared", description: `${branch.name} is no longer linked to QuickBooks.` });
      setDraftSelections((current) => ({
        ...current,
        [branch.id]: UNMAPPED_VALUE,
      }));
    } catch (error: unknown) {
      toast({
        title: "Clear failed",
        description: getUserFacingError(error, "Could not clear QuickBooks mapping."),
        variant: "destructive",
      });
    }
  };

  return (
    <Card className={embedded ? "border shadow-sm" : "mx-4 border shadow-sm"}>
      <CardHeader className="py-3 px-4 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            QuickBooks Location Mapping
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => refetchDepartments()}
            disabled={departmentsFetching}
          >
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${departmentsFetching ? "animate-spin" : ""}`} />
            Refresh QBO
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <p className="px-4 py-3 text-xs text-muted-foreground border-b">
          Map each SVR branch to a QuickBooks location (Department). Invoices and purchase-order bills use this
          mapping for location reporting in QBO.
        </p>

        {departmentsLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading QuickBooks locations...</div>
        ) : departments.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No QuickBooks locations found. Enable location tracking in QuickBooks, or use{" "}
            <strong>Create in QBO</strong> to push a branch as a new location.
          </div>
        ) : (
          <div className="divide-y">
            {branches.map((branch) => {
              const selected = getSelectionValue(branch);
              const currentDepartment = departments.find(
                (department) => department.id === branch.qbo_department_id,
              );
              const hasChanges =
                selected !== (branch.qbo_department_id ?? UNMAPPED_VALUE);
              const isSaving = mapMutation.isPending;

              return (
                <div
                  key={branch.id}
                  className="px-4 py-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{branch.name}</span>
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded border">{branch.code}</code>
                      {branch.qbo_sync_status === "synced" && (
                        <Badge variant="success" className="text-[10px] h-5">
                          Mapped
                        </Badge>
                      )}
                      {branch.qbo_sync_status === "failed" && (
                        <Badge variant="danger" className="text-[10px] h-5">
                          Failed
                        </Badge>
                      )}
                      {(!branch.qbo_sync_status || branch.qbo_sync_status === "unmapped") && (
                        <Badge variant="secondary" className="text-[10px] h-5">
                          Unmapped
                        </Badge>
                      )}
                    </div>
                    {currentDepartment && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Current QBO location: {currentDepartment.name}
                      </p>
                    )}
                    {branch.qbo_sync_error && (
                      <p className="text-[11px] text-destructive mt-1">{branch.qbo_sync_error}</p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                    <Select
                      value={selectValueForBranch(branch, selected)}
                      onValueChange={(value) =>
                        setDraftSelections((current) => ({ ...current, [branch.id]: value }))
                      }
                    >
                      <SelectTrigger className="w-full sm:w-[260px] h-8 text-xs bg-card">
                        <SelectValue placeholder="Select QBO location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNMAPPED_VALUE}>Not mapped</SelectItem>
                        {departmentOptions.map((option) => {
                          const takenByOther =
                            option.mappedBranchId !== null && option.mappedBranchId !== branch.id;
                          return (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              disabled={takenByOther}
                            >
                              {option.label}
                              {takenByOther ? " (mapped to another branch)" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        disabled={!hasChanges || isSaving}
                        onClick={() => handleSaveMapping(branch)}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={isSaving}
                        onClick={() => handleAutoSync(branch)}
                        title="Create or update this branch as a QBO location"
                      >
                        <Wand2 className="w-3.5 h-3.5 mr-1" />
                        Create in QBO
                      </Button>
                      {branch.qbo_department_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          disabled={isSaving}
                          onClick={() => handleClear(branch)}
                          title="Clear mapping"
                        >
                          <Unlink className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
