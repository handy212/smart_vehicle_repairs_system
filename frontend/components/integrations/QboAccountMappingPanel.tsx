"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Link2, RefreshCcw, Search, Unlink } from "lucide-react";
import { qboMappingsApi, type QboAccountOption, type QboMappingRow } from "@/lib/api/qbo-mappings";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { QboSearchableSelect, type QboSearchableOption } from "@/components/integrations/QboSearchableSelect";
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
  if (row.uses_class) {
    return row.qbo_class_id || UNMAPPED_VALUE;
  }
  if (row.uses_item) {
    return row.qbo_item_id || UNMAPPED_VALUE;
  }
  return row.qbo_account_id || UNMAPPED_VALUE;
}

function formatQboAccountLabel(account: QboAccountOption): string {
  const typeSuffix = account.account_type
    ? ` (${account.account_type}${account.account_sub_type ? ` / ${account.account_sub_type}` : ""})`
    : "";
  if (account.account_number) {
    return `${account.account_number} · ${account.name}${typeSuffix}`;
  }
  return `${account.name}${typeSuffix}`;
}

function accountSearchText(account: QboAccountOption): string {
  return [
    account.account_number,
    account.name,
    account.account_type,
    account.account_sub_type,
    account.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function formatMappedQboTarget(
  row: QboMappingRow,
  accountNumberById: Map<string, string>,
): string | null {
  if (row.uses_item && row.qbo_item_name) {
    return row.qbo_item_name;
  }
  if (row.uses_class && row.qbo_class_name) {
    return row.qbo_class_name;
  }
  if (!row.qbo_account_name && !row.qbo_account_id) {
    return null;
  }
  const number =
    row.qbo_account_number || accountNumberById.get(row.qbo_account_id) || "";
  if (number) {
    return `${number} · ${row.qbo_account_name}`;
  }
  return row.qbo_account_name;
}

function rowMatchesSearch(
  row: QboMappingRow,
  term: string,
  accountNumberById: Map<string, string>,
): boolean {
  if (!term) {
    return true;
  }
  const mappedTarget = formatMappedQboTarget(row, accountNumberById) || "";
  const haystack = [
    row.label,
    row.mapping_kind,
    row.mapping_key,
    row.svr_account?.code,
    row.svr_account?.name,
    row.qbo_account_hint,
    row.qbo_account_name,
    row.qbo_account_number,
    row.qbo_item_name,
    row.qbo_class_name,
    mappedTarget,
    accountNumberById.get(row.qbo_account_id),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

export function QboAccountMappingPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected, isApiReady, connectionIssue, isLoading: qboStatusLoading } = useQuickBooksConnection();
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const [rowSearch, setRowSearch] = useState("");

  const draftKey = (row: QboMappingRow) => `${row.mapping_kind}:${row.mapping_key}`;
  const catalogEnabled = isConnected && isApiReady;

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["qbo", "account-mappings"],
    queryFn: () => qboMappingsApi.getOverview(),
    enabled: catalogEnabled,
    retry: false,
  });

  const {
    data: accountsData,
    isLoading: accountsLoading,
    refetch: refetchAccounts,
    isFetching: accountsFetching,
  } = useQuery({
    queryKey: ["qbo", "accounts"],
    queryFn: () => qboMappingsApi.listAccounts(),
    enabled: catalogEnabled,
    retry: false,
  });

  const {
    data: itemsData,
    isLoading: itemsLoading,
    refetch: refetchItems,
    isFetching: itemsFetching,
  } = useQuery({
    queryKey: ["qbo", "items"],
    queryFn: () => qboMappingsApi.listItems(),
    enabled: catalogEnabled,
    retry: false,
  });

  const {
    data: taxCodesData,
    isLoading: taxCodesLoading,
    refetch: refetchTaxCodes,
    isFetching: taxCodesFetching,
  } = useQuery({
    queryKey: ["qbo", "tax-codes"],
    queryFn: () => qboMappingsApi.listTaxCodes(),
    enabled: catalogEnabled,
    retry: false,
  });

  const {
    data: classesData,
    isLoading: classesLoading,
    refetch: refetchClasses,
    isFetching: classesFetching,
  } = useQuery({
    queryKey: ["qbo", "classes"],
    queryFn: () => qboMappingsApi.listClasses(),
    enabled: catalogEnabled,
    retry: false,
  });

  const accounts = accountsData?.accounts ?? [];
  const items = itemsData?.items ?? [];
  const taxCodes = taxCodesData?.tax_codes ?? [];
  const classes = classesData?.classes ?? [];

  const saveMutation = useMutation({
    mutationFn: ([mappingKind, mappingKey, payload]: [
      string,
      string,
      { qbo_account_id?: string; qbo_item_id?: string; qbo_class_id?: string; action?: "clear" },
    ]) => qboMappingsApi.saveMapping(mappingKind, mappingKey, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbo", "account-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["qbo", "accounts"] });
      queryClient.invalidateQueries({ queryKey: ["qbo", "items"] });
    },
  });

  const applyOwnerMutation = useMutation({
    mutationFn: () => qboMappingsApi.applyOwnerTemplate({ wire_svr: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbo", "account-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["qbo", "accounts"] });
      queryClient.invalidateQueries({ queryKey: ["qbo", "items"] });
      toast({
        title: "Workshop income template applied",
        description: "QuickBooks mappings were updated from the legacy income chart template.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Apply failed",
        description: getUserFacingError(error, "Could not apply workshop income template."),
        variant: "destructive",
      });
    },
  });

  const previewOwnerMutation = useMutation({
    mutationFn: () => qboMappingsApi.applyOwnerTemplate({ dry_run: true }),
    onSuccess: (result) => {
      const mapped = (result as { mapped?: unknown[] }).mapped?.length ?? 0;
      const items = (result as { invoice_line_items?: { items?: unknown[] } }).invoice_line_items?.items?.length ?? 0;
      const warnings = (result as { warnings?: unknown[] }).warnings?.length ?? 0;
      toast({
        title: "Dry-run preview",
        description: `Would map ${mapped} control/payment rows, ${items} invoice line templates${warnings ? `, ${warnings} warnings` : ""}.`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Preview failed",
        description: getUserFacingError(error, "Could not preview workshop income template."),
        variant: "destructive",
      });
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

  const accountNumberById = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((account) => {
      if (account.account_number) {
        map.set(account.id, account.account_number);
      }
    });
    return map;
  }, [accounts]);

  const rowSearchTerm = rowSearch.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    return (overview?.groups ?? [])
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => rowMatchesSearch(row, rowSearchTerm, accountNumberById)),
      }))
      .filter((group) => group.rows.length > 0);
  }, [overview?.groups, rowSearchTerm, accountNumberById]);

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

  if (!isApiReady) {
    return (
      <Card className="border shadow-sm border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 text-sm text-muted-foreground">
          {connectionIssue ||
            "QuickBooks is linked but the live API session is unavailable. Reconnect under Admin → Integrations."}{" "}
          <a href="/admin/integrations" className="text-primary hover:underline">
            Open Integrations
          </a>
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
      } else if (row.uses_class) {
        await saveMutation.mutateAsync([
          row.mapping_kind,
          row.mapping_key,
          { qbo_class_id: selected },
        ]);
        const qbClass = classes.find((entry) => entry.id === selected);
        toast({
          title: "Class mapped",
          description: qbClass ? `${row.label} → ${qbClass.name}` : `${row.label} mapped in QuickBooks.`,
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
          description: account
            ? `${row.label} → ${formatQboAccountLabel(account)}`
            : `${row.label} mapped in QuickBooks.`,
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

  const isLoading = overviewLoading || accountsLoading || itemsLoading || taxCodesLoading || classesLoading;
  const isRefreshing = accountsFetching || itemsFetching || taxCodesFetching || classesFetching;

  const buildAccountOptions = (row: QboMappingRow): QboSearchableOption[] => {
    const base: QboSearchableOption[] = [
      {
        value: UNMAPPED_VALUE,
        label: "Not mapped",
        searchText: "not mapped unmapped",
      },
    ];
    const rowAccounts = accountsForRow(row, accounts);
    return base.concat(
      rowAccounts.map((account) => {
        const taken = mappedAccountIds.has(account.id) && account.id !== row.qbo_account_id;
        const invalidForInventory =
          INVENTORY_QBO_MAPPING_KEYS.has(row.mapping_key) &&
          !accountMatchesInventoryMapping(row, account);
        const disabled = taken;
        const hints = [
          taken ? "Mapped elsewhere" : null,
          invalidForInventory ? "Wrong type for inventory mapping" : null,
        ].filter(Boolean);
        return {
          value: account.id,
          label: formatQboAccountLabel(account),
          searchText: accountSearchText(account),
          disabled,
          hint: hints.length > 0 ? hints.join(" · ") : undefined,
        };
      }),
    );
  };

  const buildItemOptions = (row: QboMappingRow): QboSearchableOption[] => {
    const base: QboSearchableOption[] = [
      {
        value: UNMAPPED_VALUE,
        label: "Not mapped",
        searchText: "not mapped unmapped",
      },
    ];
    return base.concat(
      items.map((item) => {
        const taken = mappedItemIds.has(item.id) && item.id !== row.qbo_item_id;
        const label = `${item.name}${item.type ? ` (${item.type})` : ""}`;
        return {
          value: item.id,
          label,
          searchText: [item.name, item.type, item.income_account_name, item.id].join(" ").toLowerCase(),
          disabled: taken,
          hint: taken ? "Mapped elsewhere" : item.income_account_name || undefined,
        };
      }),
    );
  };

  const buildTaxCodeOptions = (): QboSearchableOption[] => {
    const base: QboSearchableOption[] = [
      {
        value: UNMAPPED_VALUE,
        label: "Not mapped",
        searchText: "not mapped unmapped",
      },
    ];
    return base.concat(
      taxCodes.map((taxCode) => ({
        value: taxCode.id,
        label: taxCode.description ? `${taxCode.name} — ${taxCode.description}` : taxCode.name,
        searchText: [taxCode.name, taxCode.description, taxCode.id].join(" ").toLowerCase(),
      })),
    );
  };

  const buildClassOptions = (row: QboMappingRow): QboSearchableOption[] => {
    const base: QboSearchableOption[] = [
      {
        value: UNMAPPED_VALUE,
        label: "Not mapped",
        searchText: "not mapped unmapped",
      },
    ];
    return base.concat(
      classes.map((qbClass) => {
        const label = qbClass.parent_name
          ? `${qbClass.name} (${qbClass.parent_name})`
          : qbClass.name;
        return {
          value: qbClass.id,
          label,
          searchText: [qbClass.name, qbClass.parent_name, qbClass.id].filter(Boolean).join(" ").toLowerCase(),
          disabled: !qbClass.active,
        };
      }),
    );
  };

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
              refetchClasses();
              queryClient.invalidateQueries({ queryKey: ["qbo", "account-mappings"] });
            }}
            disabled={isRefreshing}
          >
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh QBO
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={previewOwnerMutation.isPending}
            onClick={() => previewOwnerMutation.mutate()}
          >
            {previewOwnerMutation.isPending ? "Previewing…" : "Preview income template"}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs"
            disabled={applyOwnerMutation.isPending}
            onClick={() => applyOwnerMutation.mutate()}
          >
            {applyOwnerMutation.isPending ? "Applying…" : "Apply income template"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <p className="px-4 py-3 text-xs text-muted-foreground border-b">
          Map SVR control accounts, invoice line types, payment methods, and sales tax codes to
          QuickBooks accounts, service items, and tax codes. Search by QBO account number or name.
        </p>

        {!isLoading && (
          <div className="px-4 py-3 border-b bg-muted/10">
            <div className="relative max-w-md">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={rowSearch}
                onChange={(event) => setRowSearch(event.target.value)}
                placeholder="Search mappings by SVR label, account code, QBO number, or name…"
                className="h-8 pl-8 text-xs bg-card"
              />
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading QuickBooks accounts and mappings...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No mappings match your search.</div>
        ) : (
          <div className="divide-y">
            {filteredGroups.map((group) => (
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
                    const mappedTarget = formatMappedQboTarget(row, accountNumberById);

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
                          {(mappedTarget || row.qbo_item_name) && (
                            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                              <Link2 className="w-3 h-3 shrink-0" />
                              QBO: {mappedTarget || row.qbo_item_name}
                            </p>
                          )}
                          {row.error_message && (
                            <p className="text-[11px] text-destructive mt-1">{row.error_message}</p>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto lg:min-w-[380px]">
                          <QboSearchableSelect
                            value={selected}
                            onValueChange={(value) =>
                              setDrafts((current) => ({ ...current, [draftKey(row)]: value }))
                            }
                            options={
                              row.uses_item
                                ? buildItemOptions(row)
                                : row.uses_tax_code
                                  ? buildTaxCodeOptions()
                                  : row.uses_class
                                    ? buildClassOptions(row)
                                    : buildAccountOptions(row)
                            }
                            placeholder={
                              row.uses_item
                                ? "Search QBO items…"
                                : row.uses_tax_code
                                  ? "Search QBO tax codes…"
                                  : row.uses_class
                                    ? "Search QBO classes…"
                                    : "Search QBO accounts…"
                            }
                            className="w-full sm:w-[320px]"
                          />

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
