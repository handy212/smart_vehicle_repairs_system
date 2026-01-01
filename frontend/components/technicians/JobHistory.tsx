"use client";

import { JobHistoryItem } from "@/lib/api/technicians";
import { useCurrency } from "@/lib/hooks/useCurrency";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { ExternalLink, CheckCircle, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface JobHistoryProps {
    history: JobHistoryItem[];
}

export function JobHistory({ history }: JobHistoryProps) {
    const { formatCurrency } = useCurrency();

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'completed': return "secondary"; // or dedicated success/green if available
            case 'invoiced': return "secondary";
            case 'closed': return "outline";
            default: return "outline";
        }
    };

    if (history.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground border rounded-lg bg-muted/5 border-dashed">
                <Clock className="h-12 w-12 mb-4 opacity-20" />
                <h3 className="text-lg font-semibold mb-1 text-foreground">No History</h3>
                <p>No completed jobs found for this technician yet.</p>
            </div>
        );
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Work Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Completion Date</TableHead>
                        <TableHead>Total Value</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {history.map((job) => (
                        <TableRow key={job.id}>
                            <TableCell className="font-medium">{job.work_order_number}</TableCell>
                            <TableCell>{job.customer_name}</TableCell>
                            <TableCell>{job.vehicle_info}</TableCell>
                            <TableCell>
                                {job.completed_at ? format(parseISO(job.completed_at), "MMM d, yyyy") : "-"}
                            </TableCell>
                            <TableCell>
                                {formatCurrency(Number(job.actual_total || 0))}
                            </TableCell>
                            <TableCell>
                                <Badge variant={getStatusVariant(job.status)} className="capitalize">
                                    {job.status_display}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                <Button variant="ghost" size="sm" asChild>
                                    <Link href={`/workorders/${job.id}`}>
                                        <ExternalLink className="h-4 w-4" />
                                        <span className="sr-only">View</span>
                                    </Link>
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
