"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { accountingApi, type AccountingSettings, type AuditLog as AccountingAuditLog } from "@/lib/api/accounting";
import {
  CONTROL_ACCOUNT_GROUPS,
  CONTROL_ACCOUNT_SPECS,
  type ControlAccountField,
} from "@/lib/accounting/control-accounts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/useToast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Lock, ShieldAlert, Archive, RotateCcw, ExternalLink, Link2, BookOpen } from "lucide-react";
import { endOfYear, format, startOfYear } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getUserFacingError } from "@/lib/api/errors";
import { QboAccountMappingPanel } from "@/components/integrations/QboAccountMappingPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ApiError = {
  response?: {
    data?: {
      error?: string;
      detail?: string;
    };
  };
};

function actionBadgeVariant(action: string): "success" | "info" | "danger" | "outline" {
  switch (action) {
    case "create":
      return "success";
    case "update":
      return "info";
    case "delete":
      return "danger";
    default:
      return "outline";
  }
}

function formatResourceLabel(resourceType: string, resourceId: string): string {
  const label = resourceType.replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${label} #${resourceId}`;
}

export default function ControlPanelPage() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("qbo_tab") === "mapping" ? "quickbooks" : "gl-accounts";

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManagePeriods = hasPermission("manage_accounting_periods");

  const [lockDate, setLockDate] = useState("");
  const [lockDateTouched, setLockDateTouched] = useState(false);
  const [closeStartDate, setCloseStartDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [closeEndDate, setCloseEndDate] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));

  const [controlDraft, setControlDraft] = useState<Partial<Record<ControlAccountField, string>>>({});
  const [controlsTouched, setControlsTouched] = useState(false);

  const { data: settings, isLoading: settingsLoading, isError: settingsError, refetch: refetchSettings } =
    useQuery<AccountingSettings>({
      queryKey: ["accounting", "settings"],
      queryFn: () => accountingApi.getAccountingSettings(),
    });

  const currentLockDate = lockDateTouched ? lockDate : settings?.period_lock_date || "";

  const { data: leafAccounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["accounting", "accounts", "leaf"],
    queryFn: () => accountingApi.getAccounts({ is_active: true }),
    select: (accounts) =>
      accounts.filter((a) => !a.children_count || a.children_count === 0),
  });

  const wireControlsMutation = useMutation({
    mutationFn: () => accountingApi.wireAccountingControls(true),
    onSuccess: (result) => {
      setControlsTouched(false);
      setControlDraft({});
      toast({
        title: "Control accounts wired",
        description:
          result.changed_fields.length > 0
            ? `Updated ${result.changed_fields.length} field(s) from the standard chart.`
            : "All control accounts were already configured.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "settings"] });
    },
    onError: (error: unknown) => {
      toast({
        title: "Wire failed",
        description: getUserFacingError(error, "Could not wire control accounts."),
        variant: "destructive",
      });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: accountingApi.updateAccountingSettings,
    onSuccess: () => {
      setLockDateTouched(false);
      setControlsTouched(false);
      setControlDraft({});
      toast({
        title: "Settings saved",
        description: "Accounting settings updated successfully.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "audit-logs"] });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to update lock date."),
        variant: "destructive",
      });
    },
  });

  const closePeriodMutation = useMutation({
    mutationFn: () =>
      accountingApi.closePeriod({
        start_date: closeStartDate,
        end_date: closeEndDate,
      }),
    onSuccess: (entry) => {
      toast({
        title: "Period closed",
        description: `Closing entry #${entry.id} posted to retained earnings.`,
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "audit-logs"] });
    },
    onError: (error: unknown) => {
      toast({
        title: "Close failed",
        description: getUserFacingError(error, "Failed to close period."),
        variant: "destructive",
      });
    },
  });

  const {
    data: auditLogsData,
    isLoading: logsLoading,
    isError: logsError,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ["accounting", "audit-logs"],
    queryFn: () => accountingApi.getAuditLogs({ page_size: 50 }),
  });

  const auditLogs: AccountingAuditLog[] = Array.isArray(auditLogsData)
    ? auditLogsData
    : auditLogsData?.results || [];

  const auditLogCount = Array.isArray(auditLogsData)
    ? auditLogs.length
    : (auditLogsData as { count?: number })?.count ?? auditLogs.length;

  const handleSaveLockDate = () => {
    updateSettingsMutation.mutate({ period_lock_date: currentLockDate || null });
  };

  const handleSaveControlAccounts = () => {
    const payload: Record<string, number | null> = {};
    for (const spec of CONTROL_ACCOUNT_SPECS) {
      const raw = controlsTouched
        ? controlDraft[spec.field]
        : settings?.[spec.field] != null
          ? String(settings[spec.field])
          : "";
      payload[spec.field] = raw ? Number(raw) : null;
    }
    updateSettingsMutation.mutate(payload);
  };

  const getControlAccountValue = (field: ControlAccountField): string => {
    if (controlsTouched && controlDraft[field] !== undefined) {
      return controlDraft[field] ?? "";
    }
    const id = settings?.[field];
    return id != null ? String(id) : "";
  };

  const configuredCount = CONTROL_ACCOUNT_SPECS.filter(
    (spec) => settings?.[spec.field] != null
  ).length;

  const handleClearLockDate = () => {
    setLockDateTouched(true);
    setLockDate("");
    updateSettingsMutation.mutate({ period_lock_date: null });
  };

  return (
    <div className="space-y-4 w-full">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Controls & Compliance</h1>
        <p className="text-sm text-muted-foreground mt-1 w-full">
          Configure SVR control accounts, QuickBooks mappings, accounting periods, and review ledger
          audit events. Subledger health:{" "}
          <Link href="/accounting/integrity" className="text-primary hover:underline">
            Integrity Check
          </Link>
          . App-wide changes:{" "}
          <Link href="/admin/audit-log" className="text-primary hover:underline">
            Admin → Audit Log
          </Link>
          .
        </p>
      </div>

      {!canManagePeriods && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          You have read-only access. Contact an administrator with period management permission to change
          lock dates or close periods.
        </div>
      )}

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="w-full flex flex-wrap justify-start h-auto gap-1 p-1">
          <TabsTrigger value="gl-accounts" className="gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            GL control accounts
          </TabsTrigger>
          <TabsTrigger value="quickbooks" className="gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            QuickBooks mapping
          </TabsTrigger>
          <TabsTrigger value="periods" className="gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            Periods
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            Audit trail
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gl-accounts" className="mt-4 space-y-4">
      <Card className="border shadow-sm">
        <CardHeader className="py-3 px-4 flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Link2 className="w-4 h-4 text-primary" />
              Control account mapping
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {configuredCount} of {CONTROL_ACCOUNT_SPECS.length} configured. These accounts receive
              automated postings from billing and inventory.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => wireControlsMutation.mutate()}
              disabled={!canManagePeriods || wireControlsMutation.isPending}
            >
              {wireControlsMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Link2 className="w-3.5 h-3.5 mr-1" />
              )}
              Wire from standard chart
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-4">
          {settingsLoading || accountsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            CONTROL_ACCOUNT_GROUPS.map((group) => (
              <div key={group} className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {group}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {CONTROL_ACCOUNT_SPECS.filter((spec) => spec.group === group).map((spec) => {
                    const value = getControlAccountValue(spec.field);
                    const isConfigured = Boolean(value);
                    return (
                      <div key={spec.field} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor={spec.field} className="text-xs font-medium">
                            {spec.label}
                            <span className="text-muted-foreground font-normal ml-1">
                              ({spec.defaultCode})
                            </span>
                          </Label>
                          <Badge
                            variant={isConfigured ? "success" : "outline"}
                            className="text-[10px] h-5"
                          >
                            {isConfigured ? "Configured" : "Missing"}
                          </Badge>
                        </div>
                        <Select
                          value={value || "__none__"}
                          onValueChange={(next) => {
                            setControlsTouched(true);
                            setControlDraft((prev) => ({
                              ...prev,
                              [spec.field]: next === "__none__" ? "" : next,
                            }));
                          }}
                          disabled={!canManagePeriods}
                        >
                          <SelectTrigger id={spec.field} className="h-8 text-xs">
                            <SelectValue placeholder="Select leaf account" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Not set —</SelectItem>
                            {leafAccounts.map((account) => (
                              <SelectItem key={account.id} value={String(account.id)}>
                                {account.code} — {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">{spec.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          {canManagePeriods && !settingsLoading && (
            <Button
              size="sm"
              className="h-8"
              onClick={handleSaveControlAccounts}
              disabled={updateSettingsMutation.isPending}
            >
              {updateSettingsMutation.isPending && (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              )}
              Save control accounts
            </Button>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="quickbooks" className="mt-4">
          <QboAccountMappingPanel />
        </TabsContent>

        <TabsContent value="periods" className="mt-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Lock className="w-4 h-4 text-warning" />
              Period lock
            </CardTitle>
            <CardDescription className="text-xs">
              Block create, edit, or delete of journal entries on or before this date.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            {settingsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : settingsError ? (
              <div className="text-center py-3 space-y-2">
                <p className="text-xs text-destructive">Could not load settings.</p>
                <Button variant="outline" size="sm" onClick={() => refetchSettings()}>
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="lockDate" className="text-xs">
                    Lock through date
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="lockDate"
                      type="date"
                      value={currentLockDate}
                      onChange={(e) => {
                        setLockDateTouched(true);
                        setLockDate(e.target.value);
                      }}
                      disabled={!canManagePeriods}
                      className="h-8 text-sm flex-1 min-w-[140px]"
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={handleSaveLockDate}
                      disabled={!canManagePeriods || updateSettingsMutation.isPending}
                    >
                      {updateSettingsMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                    {currentLockDate && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={handleClearLockDate}
                        disabled={!canManagePeriods || updateSettingsMutation.isPending}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                {settings?.period_lock_date && !lockDateTouched && (
                  <p className="text-xs text-muted-foreground">
                    Active lock: <span className="font-medium text-foreground">{settings.period_lock_date}</span>
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Archive className="w-4 h-4 text-primary" />
              Period close
            </CardTitle>
            <CardDescription className="text-xs">
              Post a closing entry that moves net income to retained earnings for the date range.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="closeStartDate" className="text-xs">
                  Start
                </Label>
                <Input
                  id="closeStartDate"
                  type="date"
                  value={closeStartDate}
                  onChange={(e) => setCloseStartDate(e.target.value)}
                  disabled={!canManagePeriods}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="closeEndDate" className="text-xs">
                  End
                </Label>
                <Input
                  id="closeEndDate"
                  type="date"
                  value={closeEndDate}
                  onChange={(e) => setCloseEndDate(e.target.value)}
                  disabled={!canManagePeriods}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <Button
              size="sm"
              className="h-8 w-full"
              onClick={() => closePeriodMutation.mutate()}
              disabled={
                !canManagePeriods ||
                closePeriodMutation.isPending ||
                !closeStartDate ||
                !closeEndDate
              }
            >
              {closePeriodMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Post closing entry
            </Button>
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="w-4 h-4 text-primary" />
              Ledger audit trail
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Journal entry changes recorded by the accounting module (latest {auditLogs.length} shown).
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={() => refetchLogs()}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : logsError ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-destructive">Failed to load audit trail.</p>
              <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                Retry
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="h-8 text-xs font-semibold">Time</TableHead>
                  <TableHead className="h-8 text-xs font-semibold">User</TableHead>
                  <TableHead className="h-8 text-xs font-semibold">Action</TableHead>
                  <TableHead className="h-8 text-xs font-semibold">Resource</TableHead>
                  <TableHead className="h-8 text-xs font-semibold">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                      No ledger audit events yet. Activity appears when journal entries are created or
                      changed.
                    </TableCell>
                  </TableRow>
                ) : (
                  auditLogs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/40">
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground py-2">
                        {format(new Date(log.timestamp), "MMM d yyyy, HH:mm")}
                      </TableCell>
                      <TableCell className="text-sm py-2 font-medium">{log.user_name || "System"}</TableCell>
                      <TableCell className="py-2">
                        <Badge variant={actionBadgeVariant(log.action)} className="text-xs capitalize">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {log.resource_type === "JournalEntry" ? (
                          <Link
                            href={`/accounting/journal-entries/${log.resource_id}`}
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {formatResourceLabel(log.resource_type, log.resource_id)}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          formatResourceLabel(log.resource_type, log.resource_id)
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2 max-w-[240px] truncate" title={log.details}>
                        {log.details || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          {auditLogCount > auditLogs.length && (
            <p className="text-xs text-muted-foreground px-4 py-2 border-t border-border">
              Showing {auditLogs.length} of {auditLogCount} events.
            </p>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
