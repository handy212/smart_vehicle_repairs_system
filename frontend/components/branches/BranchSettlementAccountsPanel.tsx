"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, RefreshCcw, Wand2 } from "lucide-react";
import {
  branchesApi,
  Branch,
  BranchSettlementAccount,
  BranchSettlementAccountsOverview,
} from "@/lib/api/branches";
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

const NONE_VALUE = "__none__";

function accountLabel(account: BranchSettlementAccount) {
  return `${account.code} — ${account.name}`;
}

export function BranchSettlementAccountsPanel({ branches }: { branches: Branch[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draftAssign, setDraftAssign] = useState<Record<number, string>>({});

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.is_active),
    [branches],
  );

  const overviewQueries = useQuery({
    queryKey: ["branches", "settlement-accounts", activeBranches.map((b) => b.id)],
    queryFn: async () => {
      const entries = await Promise.all(
        activeBranches.map(async (branch) => {
          const overview = await branchesApi.getSettlementAccounts(branch.id);
          return [branch.id, overview] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<number, BranchSettlementAccountsOverview>;
    },
    enabled: activeBranches.length > 0,
  });

  const overviews = overviewQueries.data ?? {};

  const saveMutation = useMutation({
    mutationFn: ({
      branchId,
      payload,
    }: {
      branchId: number;
      payload: { assign?: number[]; unassign?: number[]; provision_from_qbo?: boolean };
    }) => branchesApi.updateSettlementAccounts(branchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches", "settlement-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
    },
  });

  const getDraftValue = (branchId: number) => draftAssign[branchId] ?? NONE_VALUE;

  const handleAssign = async (branch: Branch) => {
    const selected = getDraftValue(branch.id);
    if (selected === NONE_VALUE) return;
    const accountId = Number(selected);
    try {
      await saveMutation.mutateAsync({
        branchId: branch.id,
        payload: { assign: [accountId] },
      });
      toast({
        title: "Account assigned",
        description: `Settlement account linked to ${branch.name}.`,
      });
      setDraftAssign((current) => {
        const next = { ...current };
        delete next[branch.id];
        return next;
      });
    } catch (error: unknown) {
      toast({
        title: "Assign failed",
        description: getUserFacingError(error, "Could not assign settlement account."),
        variant: "destructive",
      });
    }
  };

  const handleUnassign = async (branch: Branch, account: BranchSettlementAccount) => {
    try {
      await saveMutation.mutateAsync({
        branchId: branch.id,
        payload: { unassign: [account.id] },
      });
      toast({
        title: "Account unassigned",
        description: `${account.code} is now shared across branches.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Unassign failed",
        description: getUserFacingError(error, "Could not unassign settlement account."),
        variant: "destructive",
      });
    }
  };

  const handleProvision = async (branch: Branch) => {
    try {
      const result = await saveMutation.mutateAsync({
        branchId: branch.id,
        payload: { provision_from_qbo: true },
      });
      const provision = result.provision;
      const created = provision?.created?.length ?? 0;
      const mapped = provision?.mapped?.length ?? 0;
      toast({
        title: "QBO provision finished",
        description:
          created || mapped
            ? `${branch.name}: ${created} created, ${mapped} mapped from QuickBooks.`
            : `${branch.name}: no new QBO settlement accounts matched.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Provision failed",
        description: getUserFacingError(error, "Could not provision from QuickBooks."),
        variant: "destructive",
      });
    }
  };

  if (activeBranches.length === 0) {
    return null;
  }

  return (
    <Card className="mx-4 border shadow-sm">
      <CardHeader className="py-3 px-4 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            Branch Settlement Accounts
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => overviewQueries.refetch()}
            disabled={overviewQueries.isFetching}
          >
            <RefreshCcw
              className={`w-3.5 h-3.5 mr-1.5 ${overviewQueries.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <p className="px-4 py-3 text-xs text-muted-foreground border-b">
          Assign bank and cash GL accounts to each branch for payments, refunds, and tills. Use{" "}
          <strong>Match from QBO</strong> to auto-create rows from QuickBooks, or assign shared
          accounts manually.
        </p>

        {overviewQueries.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading settlement accounts...</div>
        ) : (
          <div className="divide-y">
            {activeBranches.map((branch) => {
              const overview = overviews[branch.id];
              const assigned = overview?.assigned ?? [];
              const available = overview?.available ?? [];
              const selected = getDraftValue(branch.id);
              const isSaving = saveMutation.isPending;

              return (
                <div key={branch.id} className="px-4 py-3 space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{branch.name}</span>
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded border">
                          {branch.code}
                        </code>
                        <Badge variant="secondary" className="text-[10px] h-5">
                          {assigned.length} assigned
                        </Badge>
                      </div>
                      {assigned.length === 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          No branch-specific settlement accounts — payments fall back to shared
                          accounts.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                      <Select
                        value={selected}
                        onValueChange={(value) =>
                          setDraftAssign((current) => ({ ...current, [branch.id]: value }))
                        }
                      >
                        <SelectTrigger className="w-full sm:w-[280px] h-8 text-xs bg-card">
                          <SelectValue placeholder="Assign shared account..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>Select account...</SelectItem>
                          {available.map((account) => (
                            <SelectItem key={account.id} value={String(account.id)}>
                              {accountLabel(account)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          disabled={selected === NONE_VALUE || isSaving}
                          onClick={() => handleAssign(branch)}
                        >
                          Assign
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={isSaving}
                          onClick={() => handleProvision(branch)}
                          title="Create settlement accounts from QuickBooks"
                        >
                          <Wand2 className="w-3.5 h-3.5 mr-1" />
                          Match from QBO
                        </Button>
                      </div>
                    </div>
                  </div>

                  {assigned.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {assigned.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center gap-1.5 rounded-md border bg-muted/20 px-2 py-1"
                        >
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {account.code}
                          </span>
                          <span className="text-[11px] text-foreground">{account.name}</span>
                          {account.is_till_enabled && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1">
                              Till
                            </Badge>
                          )}
                          {account.qbo_mapped ? (
                            <Badge variant="success" className="text-[9px] h-4 px-1">
                              QBO
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1">
                              Unmapped
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                            disabled={isSaving}
                            onClick={() => handleUnassign(branch, account)}
                          >
                            Unassign
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
