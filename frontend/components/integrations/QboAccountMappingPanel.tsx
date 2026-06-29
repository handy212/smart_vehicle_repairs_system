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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QboSearchableSelect, type QboSearchableOption } from "@/components/integrations/QboSearchableSelect";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

const UNMAPPED_VALUE = "__unmapped__";

const CONTROL_ACCOUNT_GROUPS = new Set([
  "Receivables & Payables",
  "Revenue & Tax",
  "Purchasing & Inventory",
  "Cash & Banking",
  "Payroll",
  "Control Accounts",
]);

const MAPPING_SECTIONS = [
  {
    id: "accounts",
    label: "Control accounts",
    hint: "SVR posting roles → QBO chart accounts (AR, AP, revenue, inventory, cash, payroll).",
    groups: CONTROL_ACCOUNT_GROUPS,
  },
  {
    id: "invoices",
    label: "Invoice items",
    hint: "Each invoice line type → a QBO service/non-inventory Item.",
    groups: new Set(["Invoice items", "Invoice Line Types"]),
  },
  {
    id: "payments",
    label: "Payments",
    hint: "Customer and vendor settlement methods → QBO bank/cash/clearing accounts.",
    groups: new Set(["Customer payments", "Customer Payment Methods", "Vendor payments", "Vendor Payment Methods"]),
  },
  {
    id: "purchasing",
    label: "Bills & POs",
    hint: "Purchase order / bill line kinds → QBO expense or inventory accounts.",
    groups: new Set(["Bill & PO lines", "Purchase Order / Bill Lines"]),
  },
  {
    id: "tax",
    label: "Sales tax",
    hint: "SVR tax buckets → QBO tax codes on synced invoices.",
    groups: new Set(["Sales tax codes", "Sales Tax Codes"]),
  },
  {
    id: "classes",
    label: "Classes",
    hint: "Optional QBO class tracking for income and expense lines (advanced).",
    groups: new Set([
      "QBO classes — income (line type)",
      "QBO classes — income (category)",
      "QBO classes — expenses",
      "QuickBooks Classes — Income (by line type)",
      "QuickBooks Classes — Income (by income category)",
      "QuickBooks Classes — Expenses",
    ]),
  },
] as const;

type MappingSectionId = (typeof MAPPING_SECTIONS)[number]["id"];

function groupInSection(groupName: string, sectionGroups: ReadonlySet<string> | Set<string>): boolean {
  return sectionGroups.has(groupName);
}

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
  const [activeSection, setActiveSection] = useState<MappingSectionId>("accounts");

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
        title: "Workshop template applied",
        description: "QuickBooks mappings were updated from the workshop chart template.",
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

  const activeSectionConfig = MAPPING_SECTIONS.find((section) => section.id === activeSection) ?? MAPPING_SECTIONS[0];

  const sectionGroups = useMemo(() => {
    return filteredGroups.filter((group) => groupInSection(group.group, activeSectionConfig.groups));
  }, [filteredGroups, activeSectionConfig]);

  const sectionStats = useMemo(() => {
    let mapped = 0;
    let total = 0;
    sectionGroups.forEach((group) => {
      group.rows.forEach((row) => {
        total += 1;
        if (currentMappedValue(row) !== UNMAPPED_VALUE) {
          mapped += 1;
        }
      });
    });
    return { mapped, total };
  }, [sectionGroups]);

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
        label: "Not linked",
        searchText: "not linked unmapped",
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
        label: "Not linked",
        searchText: "not linked unmapped",
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
        label: "Not linked",
        searchText: "not linked unmapped",
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
        label: "Not linked",
        searchText: "not linked unmapped",
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
      <CardHeader className="py-3 px-4 border-b bg-muted/30 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              QuickBooks mappings
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Link SVR roles to QuickBooks accounts, items, tax codes, and optional classes.
              Detailed income accounts per service type are configured under{" "}
              <a href="/accounting/revenue-products" className="text-primary hover:underline">
                Income categories
              </a>
              .
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0"
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
            Refresh from QBO
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">
            Workshop template
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={previewOwnerMutation.isPending}
            onClick={() => previewOwnerMutation.mutate()}
          >
            {previewOwnerMutation.isPending ? "Previewing…" : "Preview"}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs"
            disabled={applyOwnerMutation.isPending}
            onClick={() => applyOwnerMutation.mutate()}
          >
            {applyOwnerMutation.isPending ? "Applying…" : "Apply template"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!isLoading && (
          <div className="px-4 py-3 border-b bg-muted/10 space-y-3">
            <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as MappingSectionId)}>
              <TabsList className="h-auto flex flex-wrap justify-start gap-1">
                {MAPPING_SECTIONS.map((section) => (
                  <TabsTrigger key={section.id} value={section.id} className="text-xs h-8">
                    {section.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground">{activeSectionConfig.hint}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {sectionStats.mapped} of {sectionStats.total} linked in this section
              </p>
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={rowSearch}
                  onChange={(event) => setRowSearch(event.target.value)}
                  placeholder="Search by label, SVR code, or QBO name…"
                  className="h-8 pl-8 text-xs bg-card"
                />
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading QuickBooks catalogs and mappings…</div>
        ) : sectionGroups.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No mappings match your search in this section.
          </div>
        ) : (
          <div className="divide-y">
            {sectionGroups.map((group) => (
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
                            {row.status === "synced" && isMapped ? (
                              <Badge variant="success" className="text-[10px] h-5">
                                Linked
                              </Badge>
                            ) : null}
                            {row.status === "failed" ? (
                              <Badge variant="danger" className="text-[10px] h-5">
                                Sync failed
                              </Badge>
                            ) : null}
                            {!isMapped && row.status !== "failed" ? (
                              <Badge variant="secondary" className="text-[10px] h-5">
                                Not linked
                              </Badge>
                            ) : null}
                          </div>
                          {row.svr_account ? (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              SVR GL: {row.svr_account.code} — {row.svr_account.name}
                            </p>
                          ) : null}
                          {row.qbo_account_hint ? (
                            <p className="text-[11px] text-muted-foreground mt-1">{row.qbo_account_hint}</p>
                          ) : null}
                          {mappedTarget ? (
                            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                              <Link2 className="w-3 h-3 shrink-0" />
                              QuickBooks: {mappedTarget}
                            </p>
                          ) : null}
                          {row.error_message ? (
                            <p className="text-[11px] text-destructive mt-1">{row.error_message}</p>
                          ) : null}
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
                                ? "Select QBO item…"
                                : row.uses_tax_code
                                  ? "Select tax code…"
                                  : row.uses_class
                                    ? "Select class…"
                                    : "Select QBO account…"
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
                            {isMapped ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                disabled={saveMutation.isPending}
                                onClick={() => handleClear(row)}
                                title="Clear link"
                              >
                                <Unlink className="w-4 h-4" />
                              </Button>
                            ) : null}
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
