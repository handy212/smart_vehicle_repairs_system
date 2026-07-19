"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Search, UserPlus, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { customersApi } from "@/lib/api/customers";
import { WORKSHOP_PANEL_CLASS } from "@/lib/constants/table-typography";
import { cn } from "@/lib/utils/cn";
import type { SMSRecipient } from "@/services/sms";
import { RecipientSelector } from "./RecipientSelector";
import {
  searchCustomersForSms,
  type SmsCustomer,
} from "./sms-customers";

export type { SmsCustomer };

type CustomerTypeFilter = "all" | "individual" | "business" | "fleet";

const TYPE_TABS: { key: CustomerTypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "individual", label: "Individuals" },
  { key: "business", label: "Companies" },
  { key: "fleet", label: "Fleet" },
];

function customerDisplayName(c: SmsCustomer) {
  return (
    c.company_name ||
    c.full_name ||
    `${c.first_name || ""} ${c.last_name || ""}`.trim() ||
    "Customer"
  );
}

function customerTypeLabel(type?: string) {
  if (!type) return "Individual";
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

interface SmsRecipientsPanelProps {
  recipients: SMSRecipient[];
  onAdd: (recipient: {
    type: "user" | "phone";
    value: string;
    name: string;
  }) => void;
  onAddMany: (
    recipients: {
      type: "user" | "phone";
      value: string;
      name: string;
    }[]
  ) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
}

export function SmsRecipientsPanel({
  recipients,
  onAdd,
  onAddMany,
  onRemove,
  onClear,
}: SmsRecipientsPanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<CustomerTypeFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);
  const [loadedCustomers, setLoadedCustomers] = useState<SmsCustomer[]>([]);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(customerSearch.trim()),
      300
    );
    return () => clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    setPage(1);
    setLoadedCustomers([]);
    setSelectedCustomerIds([]);
  }, [debouncedSearch, typeFilter]);

  const { data: stats } = useQuery({
    queryKey: ["customers-dashboard-stats"],
    queryFn: () => customersApi.dashboardStats(),
    enabled: isDialogOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "sms-customer-picker",
      debouncedSearch,
      typeFilter,
      page,
    ],
    queryFn: () =>
      searchCustomersForSms({
        search: debouncedSearch || undefined,
        customer_type: typeFilter === "all" ? undefined : typeFilter,
        page,
        page_size: 100,
      }),
    enabled: isDialogOpen,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!data) return;
    const withPhone = data.results.filter((c) => c.phone);
    setLoadedCustomers((prev) => {
      if (page === 1) return withPhone;
      const seen = new Set(prev.map((c) => c.id));
      const additions = withPhone.filter((c) => !seen.has(c.id));
      return additions.length === 0 ? prev : [...prev, ...additions];
    });
  }, [data, page]);

  const selectableCustomers = useMemo(
    () =>
      loadedCustomers.filter(
        (c) =>
          !recipients.some(
            (r) =>
              r.value === (c.user_id ?? c.id).toString() && r.type === "user"
          )
      ),
    [loadedCustomers, recipients]
  );

  const allSelectableSelected =
    selectableCustomers.length > 0 &&
    selectableCustomers.every((c) => selectedCustomerIds.includes(c.id));

  const typeCounts = {
    all: stats?.active_customers,
    individual: stats?.individual_customers,
    business: stats?.company_customers,
    fleet: undefined as number | undefined,
  };

  const resetDialogState = () => {
    setSelectedCustomerIds([]);
    setCustomerSearch("");
    setDebouncedSearch("");
    setTypeFilter("all");
    setPage(1);
    setLoadedCustomers([]);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) resetDialogState();
  };

  const handleToggleCustomer = (id: number) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedCustomerIds((prev) =>
        prev.filter((id) => !selectableCustomers.some((c) => c.id === id))
      );
      return;
    }
    setSelectedCustomerIds((prev) => {
      const toAdd = selectableCustomers
        .map((c) => c.id)
        .filter((id) => !prev.includes(id));
      return [...prev, ...toAdd];
    });
  };

  const handleAddSelected = () => {
    const selected = loadedCustomers.filter((c) =>
      selectedCustomerIds.includes(c.id)
    );
    const batch = selected
      .filter((c) => c.phone)
      .map((c) => {
        const name = customerDisplayName(c);
        return {
          type: "user" as const,
          value: (c.user_id ?? c.id).toString(),
          name: `${name} (${c.phone})`,
        };
      });
    if (batch.length > 0) onAddMany(batch);
    handleDialogOpenChange(false);
  };

  const hasMore = Boolean(data?.next);
  const totalMatchCount = data?.count ?? 0;

  return (
    <div className={cn(WORKSHOP_PANEL_CLASS, "flex flex-col overflow-hidden")}>
      <div className="flex h-full min-h-[320px] flex-col gap-3 p-4">
        <div className="flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-primary" />
            <span>Recipients</span>
          </div>
          <Badge
            variant="secondary"
            className="border-none bg-primary/10 text-primary"
          >
            {recipients.length}
          </Badge>
        </div>

        <div className="shrink-0 space-y-2">
          <RecipientSelector
            onSelect={onAdd}
            placeholder="Search customer or phone…"
          />
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full border-dashed text-sm font-medium"
            onClick={() => handleDialogOpenChange(true)}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Select from contacts
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1 pr-2">
          {recipients.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted/50">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">No recipients yet</p>
                <p className="max-w-[220px] text-xs text-muted-foreground">
                  Search above or select from contacts to start messaging.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={() => handleDialogOpenChange(true)}
              >
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Select from contacts
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recipients.map((r, i) => (
                <div
                  key={`${r.type}-${r.value}-${i}`}
                  className="group flex items-center gap-2 rounded-md bg-muted/20 px-2 py-1.5 hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {r.name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {r.type === "phone" ? "Phone" : "Customer"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 opacity-100 hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={() => onRemove(i)}
                    aria-label="Remove recipient"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {recipients.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full shrink-0 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onClear}
          >
            Clear all
          </Button>
        )}

        <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="flex h-[min(80vh,680px)] max-w-2xl flex-col overflow-hidden p-0">
            <DialogHeader className="space-y-3 border-b p-4 pb-3">
              <DialogTitle>Select customers</DialogTitle>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex w-full items-center overflow-x-auto rounded-xl bg-muted p-1 sm:w-auto">
                  {TYPE_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      aria-pressed={typeFilter === tab.key}
                      onClick={() => setTypeFilter(tab.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-all",
                        typeFilter === tab.key
                          ? "bg-background text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span>{tab.label}</span>
                      {typeof typeCounts[tab.key] === "number" && (
                        <span className="tabular-nums opacity-75">
                          ({typeCounts[tab.key]})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="relative w-full sm:max-w-[240px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search name or phone…"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="h-9 rounded-md bg-background pl-10"
                  />
                </div>
              </div>
            </DialogHeader>

            <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2.5">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium text-foreground disabled:opacity-50"
                onClick={handleSelectAll}
                disabled={selectableCustomers.length === 0}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded border-2",
                    allSelectableSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  )}
                >
                  {allSelectableSelected && (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                </span>
                {allSelectableSelected
                  ? "Deselect loaded"
                  : `Select loaded (${selectableCustomers.length})`}
              </button>
              <span className="text-xs text-muted-foreground">
                {loadedCustomers.length}
                {totalMatchCount ? ` / ${totalMatchCount}` : ""} shown
              </span>
            </div>

            <ScrollArea className="flex-1 px-4">
              <div className="space-y-1 py-2">
                {isLoading && loadedCustomers.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading customers…
                  </div>
                ) : loadedCustomers.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No customers with phone numbers match this search.
                  </p>
                ) : (
                  loadedCustomers.map((c) => {
                    const alreadyAdded = recipients.some(
                      (r) =>
                        r.value === (c.user_id ?? c.id).toString() &&
                        r.type === "user"
                    );
                    const checked = selectedCustomerIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          "flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 hover:bg-muted/30",
                          alreadyAdded && "opacity-50"
                        )}
                        onClick={() => {
                          if (!alreadyAdded) handleToggleCustomer(c.id);
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2",
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/30",
                              alreadyAdded && "opacity-40"
                            )}
                          >
                            {(checked || alreadyAdded) && (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="truncate text-sm font-medium">
                                {customerDisplayName(c)}
                              </p>
                              <Badge
                                variant="secondary"
                                className="shrink-0 px-1.5 py-0 text-[10px] font-medium capitalize"
                              >
                                {customerTypeLabel(c.customer_type)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {c.phone}
                              {alreadyAdded ? " · Already added" : ""}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={alreadyAdded}
                          onClick={(e) => {
                            e.stopPropagation();
                            const name = customerDisplayName(c);
                            onAdd({
                              type: "user",
                              value: (c.user_id ?? c.id).toString(),
                              name: `${name} (${c.phone})`,
                            });
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {hasMore && (
              <div className="border-t px-4 py-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full"
                  disabled={isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {isFetching ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Load more
                </Button>
              </div>
            )}

            <DialogFooter className="items-center justify-between border-t bg-muted/20 p-4 sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedCustomerIds.length > 0
                  ? `${selectedCustomerIds.length} selected`
                  : "Search or filter, then select customers"}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleDialogOpenChange(false)}
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddSelected}
                  disabled={selectedCustomerIds.length === 0}
                >
                  Add {selectedCustomerIds.length || ""} selected
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
