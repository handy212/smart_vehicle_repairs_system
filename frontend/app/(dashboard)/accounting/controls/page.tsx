"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountingApi, type AccountingSettings, type AuditLog as AccountingAuditLog, type AuditLogResponse } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/useToast";
import { useState } from "react";
import { Loader2, Lock, ShieldAlert, Archive } from "lucide-react";
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

type ApiError = {
    response?: {
        data?: {
            error?: string;
            detail?: string;
        };
    };
};

type AuditLog = AccountingAuditLog;

function getErrorMessage(error: unknown, fallback: string) {
    const data = (error as ApiError)?.response?.data;
    return data?.error || data?.detail || fallback;
}

export default function ControlPanelPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [lockDate, setLockDate] = useState<string>("");
    const [lockDateTouched, setLockDateTouched] = useState(false);
    const [closeStartDate, setCloseStartDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
    const [closeEndDate, setCloseEndDate] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));

    // Fetch Settings
    const { data: settings, isLoading: settingsLoading } = useQuery<AccountingSettings>({
        queryKey: ["accounting", "settings"],
        queryFn: accountingApi.getAccountingSettings,
    });

    const currentLockDate = lockDateTouched ? lockDate : settings?.period_lock_date || "";

    // Update Settings Mutation
    const updateSettingsMutation = useMutation({
        mutationFn: accountingApi.updateAccountingSettings,
        onSuccess: () => {
            toast({
                title: "Settings Updated",
                description: "Accounting period lock date has been updated.",
                variant: "success",
            });
            queryClient.invalidateQueries({ queryKey: ["accounting", "settings"] });
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to update settings.",
                variant: "destructive",
            });
        }
    });

    const closePeriodMutation = useMutation({
        mutationFn: () => accountingApi.closePeriod({
            start_date: closeStartDate,
            end_date: closeEndDate,
        }),
        onSuccess: (entry) => {
            toast({
                title: "Period Closed",
                description: `Closing entry #${entry.id} posted to retained earnings.`,
                variant: "success",
            });
            queryClient.invalidateQueries({ queryKey: ["accounting", "journal-entries"] });
        },
        onError: (error: unknown) => {
            toast({
                title: "Close Failed",
                description: getErrorMessage(error, "Failed to close period."),
                variant: "destructive",
            });
        },
    });

    // Fetch Audit Logs
    const { data: auditLogsData, isLoading: logsLoading } = useQuery<AuditLogResponse | AuditLog[]>({
        queryKey: ["accounting", "audit-logs"],
        queryFn: () => accountingApi.getAuditLogs(),
    });

    const auditLogs: AuditLog[] = Array.isArray(auditLogsData)
        ? auditLogsData
        : auditLogsData?.results || [];

    const handleSaveLockDate = () => {
        updateSettingsMutation.mutate({ period_lock_date: currentLockDate || null });
    };

    return (
        <div className="space-y-4 max-w-6xl mx-auto">
            <div className="border-b border-border pb-3">
                <h1 className="text-lg font-semibold tracking-tight">Controls & Compliance</h1>
                <p className="text-xs text-muted-foreground">
                    Lock periods, close fiscal activity, and review accounting audit trails.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="overflow-hidden">
                    <CardHeader className="border-b border-border bg-muted/10 px-4 py-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                            <Lock className="w-5 h-5 text-warning" />
                            Period Locking
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Prevent modification of transactions on or before a specific date.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4">
                        {settingsLoading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="lockDate">Lock Date</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="lockDate"
                                        type="date"
                                        value={currentLockDate}
                                        onChange={(e) => {
                                            setLockDateTouched(true);
                                            setLockDate(e.target.value);
                                        }}
                                    />
                                    <Button size="sm" onClick={handleSaveLockDate} disabled={updateSettingsMutation.isPending}>
                                        {updateSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Set to clear/empty to unlock all periods.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="overflow-hidden">
                    <CardHeader className="border-b border-border bg-muted/10 px-4 py-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                            <Archive className="w-5 h-5 text-primary" />
                            Period Close
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Close income and expenses into retained earnings.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="closeStartDate">Start</Label>
                                <Input
                                    id="closeStartDate"
                                    type="date"
                                    value={closeStartDate}
                                    onChange={(event) => setCloseStartDate(event.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="closeEndDate">End</Label>
                                <Input
                                    id="closeEndDate"
                                    type="date"
                                    value={closeEndDate}
                                    onChange={(event) => setCloseEndDate(event.target.value)}
                                />
                            </div>
                        </div>
                        <Button
                            size="sm"
                            className="w-full"
                            onClick={() => closePeriodMutation.mutate()}
                            disabled={closePeriodMutation.isPending || !closeStartDate || !closeEndDate}
                        >
                            {closePeriodMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Post Closing Entry
                        </Button>
                    </CardContent>
                </Card>

                <Card className="md:col-span-3 overflow-hidden">
                    <CardHeader className="border-b border-border bg-muted/10 px-4 py-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                            <ShieldAlert className="w-5 h-5 text-primary" />
                            Recent Audit Logs
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Track changes to sensitive accounting records.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        {logsLoading ? (
                            <div className="flex justify-center p-4">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Time</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Resource</TableHead>
                                        <TableHead>Details</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>

                                    {auditLogs?.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                                {format(new Date(log.timestamp), "MMM d, HH:mm")}
                                            </TableCell>
                                            <TableCell className="font-medium text-sm">{log.user_name || "System"}</TableCell>
                                            <TableCell>
                                                <Badge variant={log.action === 'delete' ? 'danger' : 'outline'}>
                                                    {log.action}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {log.resource_type} #{log.resource_id}
                                            </TableCell>
                                            <TableCell className="text-xs max-w-xs truncate" title={log.details}>
                                                {log.details}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {(!auditLogs || auditLogs.length === 0) && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                                                No audit logs found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
