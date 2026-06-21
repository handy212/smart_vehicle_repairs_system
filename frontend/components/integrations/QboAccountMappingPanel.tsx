"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Link2, RefreshCcw, Unlink } from "lucide-react";
import { qboMappingsApi, type QboAccountOption, type QboMappingRow } from "@/lib/api/qbo-mappings";
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

const INVENTORY_QBO_MAPPING_KEYS = new Set([
  "inventory_asset_account",
  "cost_of_goods_sold_account",
  "sales_revenue_account",
]);

/** QBO account filters for inventory product sync mappings. */
function accountMatchesInventoryMapping(row: QboMappingRow, account: QboAccountOption): boolean {
  const subtype = (account.account_sub_type || "").toLowerCase();
  const type = account.account_type || "";

  switch (row.mapping_key) {
    case "inventory_asset_account":
      return type === "Other Current Asset" && subtype.includes("inventory");
    case "cost_of_goods_sold_account":
      return type === "Cost of Goods Sold" && /supplies.*material|suppliesmaterials/i.test(subtype);
    case "sales_revenue_account":
      return type === "Income" && /sales.*product|salesofproduct/i.test(subtype);
    default:
      return true;
  }
}

function accountsForRow(row: QboMappingRow, accounts: QboAccountOption[]): QboAccountOption[] {
  if (row.uses_item || row.uses_tax_code) {
    return accounts;
  }
  if (!INVENTORY_QBO_MAPPING_KEYS.has(row.mapping_key)) {
    return accounts;
  }
  const filtered = accounts.filter((account) => accountMatchesInventoryMapping(row, account));
  const currentId = row.qbo_account_id;
  if (currentId && !filtered.some((account) => account.id === currentId)) {
    const current = accounts.find((account) => account.id === currentId);
    if (current) {
      return [current, ...filtered];
    }
  }
  return filtered;
}

type DraftValue = string;

function currentMappedValue(row: QboMappingRow): DraftValue {
  if (row.uses_item) {
    return row.qbo_item_id || UNMAPPED_VALUE;
  }
  return row.qbo_account_id || UNMAPPED_VALUE;
}

export function QboAccountMappingPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected, isLoading: qboStatusLoading } = useQuickBooksConnection();
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});

  const draftKey = (row: QboMappingRow) => `${row.mapping_kind}:${row.mapping_key}`;

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["qbo", "account-mappings"],
    queryFn: () => qboMappingsApi.getOverview(),
    enabled: isConnected,
  });

  const {
    data: accountsData,
    isLoading: accountsLoading,
    refetch: refetchAccounts,
    isFetching: accountsFetching,
  } = useQuery({
    queryKey: ["qbo", "accounts"],
    queryFn: () => qboMappingsApi.listAccounts(),
    enabled: isConnected,
  });

  const {
    data: itemsData,
    isLoading: itemsLoading,
    refetch: refetchItems,
    isFetching: itemsFetching,
  } = useQuery({
    queryKey: ["qbo", "items"],
    queryFn: () => qboMappingsApi.listItems(),
    enabled: isConnected,
  });

  const {
    data: taxCodesData,
    isLoading: taxCodesLoading,
    refetch: refetchTaxCodes,
    isFetching: taxCodesFetching,
  } = useQuery({
    queryKey: ["qbo", "tax-codes"],
    queryFn: () => qboMappingsApi.listTaxCodes(),
    enabled: isConnected,
  });

  const accounts = accountsData?.accounts ?? [];
  const items = itemsData?.items ?? [];
  const taxCodes = taxCodesData?.tax_codes ?? [];

  const saveMutation = useMutation({
    mutationFn: ([mappingKind, mappingKey, payload]: [
      string,
      string,
      { qbo_account_id?: string; qbo_item_id?: string; action?: "clear" },
    ]) => qboMappingsApi.saveMapping(mappingKind, mappingKey, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbo", "account-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["qbo", "accounts"] });
      queryClient.invalidateQueries({ queryKey: ["qbo", "items"] });
    },
  });

  const mappedAccountIds = useMemo(() => {
    const ids = new Set<string>();
    overview?.rows.forEach((row) => {
      if (row.qbo_account_id) ids.add(row.qbo_account_id);
    });
    return ids;
  }, [overview?.rows]);

  const mappedItemIds = useMemo(() => {
    const ids = new Set<string>();
    overview?.rows.forEach((row) => {
      if (row.qbo_item_id) ids.add(row.qbo_item_id);
    });
    return ids;
  }, [overview?.rows]);

  if (qboStatusLoading) {
    return null;
  }

  if (!isConnected) {
    return (
      <Card className="border shadow-sm bg-muted/20">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Connect QuickBooks under{" "}
          <a href="/admin/integrations" className="text-primary hover:underline">
            Admin → Integrations
          </a>{" "}
          to map invoices, payments, and control accounts to the QBO chart of accounts.
        </CardContent>
      </Card>
    );
  }

  const getDraftValue = (row: QboMappingRow) => {
    const key = draftKey(row);
    if (drafts[key] !== undefined) {
      return drafts[key];
    }
    return currentMappedValue(row);
  };

  const handleSave = async (row: QboMappingRow) => {
    const selected = getDraftValue(row);
    const current = currentMappedValue(row);
    if (selected === current) {
      return;
    }

    try {
      if (selected === UNMAPPED_VALUE) {
        await saveMutation.mutateAsync([row.mapping_kind, row.mapping_key, { action: "clear" }]);
        toast({ title: "Mapping cleared", description: `${row.label} is no longer linked to QuickBooks.` });
      } else if (row.uses_item) {
        await saveMutation.mutateAsync([
          row.mapping_kind,
          row.mapping_key,
          { qbo_item_id: selected },
        ]);
        const item = items.find((entry) => entry.id === selected);
        toast({
          title: "Item mapped",
          description: item ? `${row.label} → ${item.name}` : `${row.label} mapped in QuickBooks.`,
        });
      } else {
        await saveMutation.mutateAsync([
          row.mapping_kind,
          row.mapping_key,
          { qbo_account_id: selected },
        ]);
        const account = accounts.find((entry) => entry.id === selected);
        toast({
          title: "Account mapped",
          description: account ? `${row.label} → ${account.name}` : `${row.label} mapped in QuickBooks.`,
        });
      }
      setDrafts((current) => {
        const next = { ...current };
        delete next[draftKey(row)];
        return next;
      });
    } catch (error: unknown) {
      toast({
        title: "Mapping failed",
        description: getUserFacingError(error, "Could not save QuickBooks mapping."),
        variant: "destructive",
      });
    }
  };

  const handleClear = async (row: QboMappingRow) => {
    try {
      await saveMutation.mutateAsync([row.mapping_kind, row.mapping_key, { action: "clear" }]);
      setDrafts((current) => ({ ...current, [draftKey(row)]: UNMAPPED_VALUE }));
      toast({ title: "Mapping cleared", description: `${row.label} is no longer linked to QuickBooks.` });
    } catch (error: unknown) {
      toast({
        title: "Clear failed",
        description: getUserFacingError(error, "Could not clear QuickBooks mapping."),
        variant: "destructive",
      });
    }
  };

  const isLoading = overviewLoading || accountsLoading || itemsLoading || taxCodesLoading;
  const isRefreshing = accountsFetching || itemsFetching || taxCodesFetching;

  return (
    <Card className="border shadow-sm">
      <CardHeader className="py-3 px-4 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            QuickBooks Chart of Accounts Mapping
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              refetchAccounts();
              refetchItems();
              refetchTaxCodes();
              queryClient.invalidateQueries({ queryKey: ["qbo", "account-mappings"] });
            }}
            disabled={isRefreshing}
          >
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh QBO
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <p className="px-4 py-3 text-xs text-muted-foreground border-b">
          Map SVR control accounts, invoice line types, payment methods, and sales tax codes to
          QuickBooks accounts, service items, and tax codes. Outbound invoice, estimate, and credit
          memo sync uses these mappings.
        </p>

        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading QuickBooks accounts and mappings...</div>
        ) : (
          <div className="divide-y">
            {(overview?.groups ?? []).map((group) => (
              <div key={group.group} className="px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  {group.group}
                </h3>
                <div className="space-y-3">
                  {group.rows.map((row) => {
                    const selected = getDraftValue(row);
                    const current = currentMappedValue(row);
                    const hasChanges = selected !== current;
                    const isMapped = current !== UNMAPPED_VALUE;

                    return (
                      <div
                        key={draftKey(row)}
                        className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between border border-border/60 rounded-md p-3 bg-card"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{row.label}</span>
                            {row.status === "synced" && isMapped && (
                              <Badge variant="success" className="text-[10px] h-5">
                                Mapped
                              </Badge>
                            )}
                            {row.status === "failed" && (
                              <Badge variant="danger" className="text-[10px] h-5">
                                Failed
                              </Badge>
                            )}
                            {(!isMapped || row.status === "unmapped") && (
                              <Badge variant="secondary" className="text-[10px] h-5">
                                Unmapped
                              </Badge>
                            )}
                          </div>
                          {row.svr_account && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              SVR account: {row.svr_account.code} — {row.svr_account.name}
                            </p>
                          )}
                          {row.qbo_account_hint && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {row.qbo_account_hint}
                            </p>
                          )}
                          {(row.qbo_account_name || row.qbo_item_name) && (
                            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                              <Link2 className="w-3 h-3" />
                              QBO: {row.qbo_item_name || row.qbo_account_name}
                            </p>
                          )}
                          {row.error_message && (
                            <p className="text-[11px] text-destructive mt-1">{row.error_message}</p>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto lg:min-w-[360px]">
                          <Select
                            value={selected}
                            onValueChange={(value) =>
                              setDrafts((current) => ({ ...current, [draftKey(row)]: value }))
                            }
                          >
                            <SelectTrigger className="w-full sm:w-[280px] h-8 text-xs bg-card">
                              <SelectValue
                                placeholder={
                                  row.uses_item
                                    ? "Select QBO item"
                                    : row.uses_tax_code
                                      ? "Select QBO tax code"
                                      : "Select QBO account"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNMAPPED_VALUE}>Not mapped</SelectItem>
                              {row.uses_item
                                ? items.map((item) => {
                                    const taken =
                                      mappedItemIds.has(item.id) && item.id !== row.qbo_item_id;
                                    return (
                                      <SelectItem key={item.id} value={item.id} disabled={taken}>
                                        {item.name}
                                        {item.type ? ` (${item.type})` : ""}
                                        {taken ? " — mapped elsewhere" : ""}
                                      </SelectItem>
                                    );
                                  })
                                : row.uses_tax_code
                                  ? taxCodes.map((taxCode) => (
                                      <SelectItem key={taxCode.id} value={taxCode.id}>
                                        {taxCode.name}
                                        {taxCode.description ? ` — ${taxCode.description}` : ""}
                                      </SelectItem>
                                    ))
                                  : accountsForRow(row, accounts).map((account) => {
                                    const taken =
                                      mappedAccountIds.has(account.id) &&
                                      account.id !== row.qbo_account_id;
                                    const invalidForInventory =
                                      INVENTORY_QBO_MAPPING_KEYS.has(row.mapping_key) &&
                                      !accountMatchesInventoryMapping(row, account);
                                    return (
                                      <SelectItem key={account.id} value={account.id} disabled={taken}>
                                        {account.name}
                                        {account.account_type
                                          ? ` (${account.account_type}${account.account_sub_type ? ` / ${account.account_sub_type}` : ""})`
                                          : ""}
                                        {taken ? " — mapped elsewhere" : ""}
                                        {invalidForInventory ? " — wrong type for inventory" : ""}
                                      </SelectItem>
                                    );
                                  })}
                            </SelectContent>
                          </Select>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={!hasChanges || saveMutation.isPending}
                              onClick={() => handleSave(row)}
                            >
                              Save
                            </Button>
                            {isMapped && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                disabled={saveMutation.isPending}
                                onClick={() => handleClear(row)}
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
