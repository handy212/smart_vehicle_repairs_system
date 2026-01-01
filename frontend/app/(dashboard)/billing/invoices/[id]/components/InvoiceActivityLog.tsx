
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { History, User as UserIcon, Calendar, Activity, Info } from "lucide-react";
import { format } from "date-fns";

interface InvoiceActivityLogProps {
    invoiceId: number;
}

interface LogEntry {
    id: number;
    action: string;
    timestamp: string;
    actor: string;
    changes: string | object;
    remote_addr?: string;
}

export function InvoiceActivityLog({ invoiceId }: InvoiceActivityLogProps) {
    const { data: logs, isLoading } = useQuery({
        queryKey: ["invoice", invoiceId, "history"],
        queryFn: () => billingApi.invoices.history(invoiceId),
    });

    const getActionColor = (action: string) => {
        switch (action.toLowerCase()) {
            case 'create': return 'bg-green-100 text-green-800 border-green-200';
            case 'update': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'delete': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const formatChanges = (changes: string | object) => {
        try {
            let parsed: any = changes;
            if (typeof changes === 'string') {
                try {
                    parsed = JSON.parse(changes);
                } catch (e) {
                    // If parsing fails, it might be a plain string message
                    return <p className="text-xs text-gray-500 italic mt-1">{changes}</p>;
                }
            } else if (!changes) {
                return null;
            }

            if (!parsed || Object.keys(parsed).length === 0) return null;

            return (
                <div className="mt-2 space-y-1 text-xs">
                    {Object.entries(parsed).map(([field, values]: [string, any]) => (
                        <div key={field} className="flex flex-col sm:flex-row gap-1 sm:gap-2 text-gray-600 bg-gray-50 p-1.5 rounded">
                            <span className="font-medium capitalize min-w-[100px]">{field.replace(/_/g, " ")}:</span>
                            <div className="flex items-center gap-1 flex-1 flex-wrap">
                                {Array.isArray(values) ? (
                                    <>
                                        <span className="line-through text-gray-400">{String(values[0])}</span>
                                        <span className="text-gray-400">→</span>
                                        <span className="text-gray-900 font-medium">{String(values[1])}</span>
                                    </>
                                ) : (
                                    <span className="text-gray-900 font-medium">{String(values)}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            );
        } catch (e) {
            console.error("Error formatting changes:", e);
            return <p className="text-xs text-gray-500 italic mt-1">Unable to display changes</p>;
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-gray-500" />
                    <div>
                        <CardTitle>Activity Log</CardTitle>
                        <CardDescription>History of changes and actions on this invoice</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="text-center py-8 text-gray-500">Loading activity history...</div>
                ) : logs && logs.length > 0 ? (
                    <ScrollArea className="h-[400px] pr-4">
                        <div className="space-y-6 relative ml-2 before:absolute before:left-[11px] before:top-2 before:h-[95%] before:w-[2px] before:bg-gray-100">
                            {logs.map((log: LogEntry) => (
                                <div key={log.id} className="relative pl-8">
                                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center z-10">
                                        <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-gray-900">{log.actor}</span>
                                            <Badge variant="outline" className={`text-xs capitalize ${getActionColor(log.action)}`}>
                                                {log.action}
                                            </Badge>
                                            <span className="text-xs text-gray-500 flex items-center gap-1 ml-auto">
                                                <Calendar className="w-3 h-3" />
                                                {format(new Date(log.timestamp), "MMM d, yyyy h:mm a")}
                                            </span>
                                        </div>
                                        {formatChanges(log.changes)}
                                        {log.remote_addr && (
                                            <p className="text-[10px] text-gray-300 mt-0.5">IP: {log.remote_addr}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
                        <History className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-lg font-medium text-gray-900">No Activity Yet</p>
                        <p className="text-sm max-w-sm mt-1">
                            Actions performed on this invoice will be logged here.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
