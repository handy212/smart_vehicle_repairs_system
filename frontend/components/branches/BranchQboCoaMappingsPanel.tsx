"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronDown, ChevronRight, RefreshCcw, Unlink } from "lucide-react";
import {
  branchesApi,
  Branch,
  BranchQboCoaMappingRow,
  BranchQboCoaMappingsOverview,
} from "@/lib/api/branches";
import { qboMappingsApi, type QboAccountOption, type QboItemOption } from "@/lib/api/qbo-mappings";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { QboSearchableSelect, type QboSearchableOption } from "@/components/integrations/QboSearchableSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

const UNMAPPED_VALUE = "__unmapped__";

function formatAccountLabel(account: QboAccountOption): string {
  if (account.account_number) {
    return `${account.account_number} · ${account.name}`;
  }
  return account.name;
}

function formatItemLabel(item: QboItemOption): string {
  const income = item.income_account_name ? ` → ${item.income_account_name}` : "";
  return `${item.name}${income}`;
}

function rowDraftKey(branchId: number, row: BranchQboCoaMappingRow): string {
  return `${branchId}:${row.mapping_kind}:${row.mapping_key}`;
}

function currentRowValue(row: BranchQboCoaMappingRow): string {
  if (row.uses_item) {
    return row.qbo_item_id || UNMAPPED_VALUE;
  }
  return row.qbo_account_id || UNMAPPED_VALUE;
}

function effectiveLabel(row: BranchQboCoaMappingRow): string | null {
  const effective = row.effective_mapping;
  if (!effective) return null;
  if (effective.qbo_item_name) return effective.qbo_item_name;
  if (effective.qbo_account_name) return effective.qbo_account_name;
  return null;
}

export function BranchQboCoaMappingsPanel({ branches, embedded = false }: { branches: Branch[]; embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected, isApiReady, connectionIssue, isLoading: qboStatusLoading } = useQuickBooksConnection();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.is_active),
    [branches],
  );

  const catalogEnabled = isConnected && isApiReady;

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ["qbo", "accounts"],
    queryFn: () => qboMappingsApi.listAccounts(),
    enabled: catalogEnabled,
    retry: false,
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["qbo", "items"],
    queryFn: () => qboMappingsApi.listItems(),
    enabled: catalogEnabled,
    retry: false,
  });

  const overviewQuery = useQuery({
    queryKey: ["branches", "qbo-coa-mappings", activeBranches.map((b) => b.id)],
    queryFn: async () => {
      const entries = await Promise.all(
        activeBranches.map(async (branch) => {
          const overview = await branchesApi.getQboAccountMappings(branch.id);
          return [branch.id, overview] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<number, BranchQboCoaMappingsOverview>;
    },
    enabled: catalogEnabled && activeBranches.length > 0,
  });

  const saveMutation = useMutation({
    mutationFn: ({
      branchId,
      mappings,
    }: {
      branchId: number;
      mappings: Array<{
        mapping_kind: string;
        mapping_key: string;
        qbo_account_id?: string;
        qbo_item_id?: string;
        action?: "clear";
      }>;
    }) => branchesApi.updateQboAccountMappings(branchId, mappings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches", "qbo-coa-mappings"] });
    },
  });

  const accounts = accountsData?.accounts ?? [];
  const items = itemsData?.items ?? [];
  const overviews = overviewQuery.data ?? {};

  const accountOptions: QboSearchableOption[] = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: formatAccountLabel(account),
        searchText: [account.account_number, account.name, account.account_type, account.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [accounts],
  );

  const itemOptions: QboSearchableOption[] = useMemo(
    () =>
      items.map((item) => ({
        value: item.id,
        label: formatItemLabel(item),
        searchText: [item.name, item.income_account_name, item.type, item.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [items],
  );

  if (qboStatusLoading) {
    return null;
  }

  if (!isConnected) {
    return null;
  }

  if (!isApiReady) {
    return (
      <Card className="mx-4 border shadow-sm border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 text-sm text-muted-foreground">
          {connectionIssue ||
            "QuickBooks is linked but the live API session is unavailable. Reconnect under Admin → Integrations before configuring branch chart mappings."}
        </CardContent>
      </Card>
    );
  }

  if (activeBranches.length === 0) {
    return null;
  }

  const getDraftValue = (branchId: number, row: BranchQboCoaMappingRow) => {
    const key = rowDraftKey(branchId, row);
    return drafts[key] ?? currentRowValue(row);
  };

  const handleSaveRow = async (branch: Branch, row: BranchQboCoaMappingRow) => {
    const selected = getDraftValue(branch.id, row);
    const payload: {
      mapping_kind: string;
      mapping_key: string;
      qbo_account_id?: string;
      qbo_item_id?: string;
      action?: "clear";
    } = {
      mapping_kind: row.mapping_kind,
      mapping_key: row.mapping_key,
    };

    if (selected === UNMAPPED_VALUE) {
      if (currentRowValue(row) === UNMAPPED_VALUE) {
        return;
      }
      payload.action = "clear";
    } else if (row.uses_item) {
      payload.qbo_item_id = selected;
    } else {
      payload.qbo_account_id = selected;
    }

    try {
      await saveMutation.mutateAsync({ branchId: branch.id, mappings: [payload] });
      setDrafts((current) => {
        const next = { ...current };
        delete next[rowDraftKey(branch.id, row)];
        return next;
      });
      toast({
        title: "Branch mapping saved",
        description: `${branch.name}: ${row.label}`,
      });
    } catch (error: unknown) {
      toast({
        title: "Save failed",
        description: getUserFacingError(error, "Could not update branch QBO mapping."),
        variant: "destructive",
      });
    }
  };

  const isCatalogLoading = accountsLoading || itemsLoading || overviewQuery.isLoading;

  return (
    <Card className={embedded ? "border shadow-sm" : "mx-4 border shadow-sm"}>
      <CardHeader className="py-3 px-4 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            QuickBooks Branch Chart Overrides
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => overviewQuery.refetch()}
            disabled={overviewQuery.isFetching}
          >
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${overviewQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <p className="px-4 py-3 text-xs text-muted-foreground border-b">
          Optional per-branch overrides for AR, COGS, revenue, and invoice income items. Unset rows inherit
          company defaults from Accounting → Controls. Map a branch-specific <strong>Part</strong> QBO item when
          part lines must post to a different income account than the shared catalog item. Branch P&amp;L still
          uses QBO Departments above.
        </p>

        {isCatalogLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading branch chart mappings...</div>
        ) : (
          <div className="divide-y">
            {activeBranches.map((branch) => {
              const overview = overviews[branch.id];
              const isOpen = expanded[branch.id] ?? false;
              const rows = overview?.rows ?? [];
              const overrideCount = rows.filter((row) => row.status === "synced").length;

              return (
                <div key={branch.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-muted/40 transition-colors"
                    onClick={() =>
                      setExpanded((current) => ({ ...current, [branch.id]: !isOpen }))
                    }
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium truncate">{branch.name}</span>
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded border shrink-0">
                        {branch.code}
                      </code>
                    </div>
                    <Badge variant={overrideCount > 0 ? "success" : "secondary"} className="text-[10px] h-5 shrink-0">
                      {overrideCount > 0 ? `${overrideCount} override${overrideCount === 1 ? "" : "s"}` : "Inherits defaults"}
                    </Badge>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3 bg-muted/10">
                      {rows.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No mapping rows available.</p>
                      ) : (
                        rows.map((row) => {
                          const selected = getDraftValue(branch.id, row);
                          const hasChanges = selected !== currentRowValue(row);
                          const effective = effectiveLabel(row);
                          const options = row.uses_item ? itemOptions : accountOptions;

                          return (
                            <div
                              key={`${row.mapping_kind}:${row.mapping_key}`}
                              className="rounded-md border bg-card p-3 space-y-2"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-foreground">{row.label}</p>
                                  <p className="text-[10px] text-muted-foreground">{row.group}</p>
                                  {row.inherits_company_default && effective && (
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                      Effective: {effective} (company default)
                                    </p>
                                  )}
                                  {!row.inherits_company_default && effective && row.status !== "synced" && (
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                      Effective: {effective}
                                    </p>
                                  )}
                                  {row.qbo_account_hint && (
                                    <p className="text-[10px] text-muted-foreground mt-1">{row.qbo_account_hint}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 w-full sm:w-auto sm:min-w-[280px]">
                                  <QboSearchableSelect
                                    value={selected}
                                    onValueChange={(value) =>
                                      setDrafts((current) => ({
                                        ...current,
                                        [rowDraftKey(branch.id, row)]: value,
                                      }))
                                    }
                                    options={[
                                      { value: UNMAPPED_VALUE, label: "Inherit company default", searchText: "inherit default" },
                                      ...options,
                                    ]}
                                    placeholder={row.uses_item ? "Select QBO item" : "Select QBO account"}
                                    className="w-full sm:w-[240px]"
                                  />
                                  <Button
                                    size="sm"
                                    className="h-8 text-xs shrink-0"
                                    disabled={!hasChanges || saveMutation.isPending}
                                    onClick={() => handleSaveRow(branch, row)}
                                  >
                                    Save
                                  </Button>
                                  {row.status === "synced" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                                      disabled={saveMutation.isPending}
                                      onClick={async () => {
                                        setDrafts((current) => ({
                                          ...current,
                                          [rowDraftKey(branch.id, row)]: UNMAPPED_VALUE,
                                        }));
                                        try {
                                          await saveMutation.mutateAsync({
                                            branchId: branch.id,
                                            mappings: [
                                              {
                                                mapping_kind: row.mapping_kind,
                                                mapping_key: row.mapping_key,
                                                action: "clear",
                                              },
                                            ],
                                          });
                                          toast({
                                            title: "Override cleared",
                                            description: `${branch.name} now inherits company default for ${row.label}.`,
                                          });
                                        } catch (error: unknown) {
                                          toast({
                                            title: "Clear failed",
                                            description: getUserFacingError(error, "Could not clear branch override."),
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                      title="Clear branch override"
                                    >
                                      <Unlink className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
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
