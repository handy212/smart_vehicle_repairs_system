"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/useToast";
import { useState } from "react";
import { Loader2, Lock, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function ControlPanelPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [lockDate, setLockDate] = useState<string>("");

    // Fetch Settings
    const { data: settings, isLoading: settingsLoading } = useQuery({
        queryKey: ["accounting", "settings"],
        queryFn: accountingApi.getAccountingSettings,
    });

    // Sync state when settings are loaded
    useState(() => {
        if (settings?.period_lock_date) {
            setLockDate(settings.period_lock_date);
        }
    });

    // Better way to sync state on subsequent fetches
    if (settings?.period_lock_date && settings.period_lock_date !== lockDate && !document.activeElement?.id?.includes('lockDate')) {
        // Only update if not focused to avoid fighting user input? 
        // Actually, let's just use useEffect
    }

    // Correct approach using useEffect
    const [initialized, setInitialized] = useState(false);
    if (settings && !initialized) {
        setLockDate(settings.period_lock_date || "");
        setInitialized(true);
    }

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

    // Fetch Audit Logs
    const { data: auditLogsData, isLoading: logsLoading } = useQuery({
        queryKey: ["accounting", "audit-logs"],
        queryFn: () => accountingApi.getAuditLogs(),
    });

    const auditLogs = auditLogsData?.results || auditLogsData || [];

    const handleSaveLockDate = () => {
        updateSettingsMutation.mutate({ period_lock_date: lockDate || null });
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Controls & Compliance</h1>
                <p className="text-muted-foreground">
                    Manage accounting periods and view audit trails.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Period Locking Control */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5 text-amber-600" />
                            Period Locking
                        </CardTitle>
                        <CardDescription>
                            Prevent modification of transactions on or before a specific date.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {settingsLoading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="lockDate">Lock Date</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="lockDate"
                                        type="date"
                                        value={lockDate}
                                        onChange={(e) => setLockDate(e.target.value)}
                                    />
                                    <Button onClick={handleSaveLockDate} disabled={updateSettingsMutation.isPending}>
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

                {/* Audit Log Summary */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-blue-600" />
                            Recent Audit Logs
                        </CardTitle>
                        <CardDescription>
                            Track changes to sensitive accounting records.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
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
                                    {auditLogs?.map((log: any) => (
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
