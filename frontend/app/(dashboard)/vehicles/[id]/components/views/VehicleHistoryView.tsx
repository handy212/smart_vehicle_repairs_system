"use client";

import { useCurrency } from "@/lib/hooks/useCurrency";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AlertCircle, FileText, Calendar, DollarSign, Wrench, Eye, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface VehicleHistoryViewProps {
    vehicleId: number;

    workOrders: any[];
}

export function VehicleHistoryView({ vehicleId, workOrders }: VehicleHistoryViewProps) {
    const { formatCurrency } = useCurrency();
    const router = useRouter();

    // Calculate Summary Stats
    const totalSpent = workOrders.reduce((sum, wo) => sum + parseFloat(wo.total_cost || "0"), 0);
    const totalServices = workOrders.length;
    const sortedWorkOrders = [...workOrders].sort((a, b) =>
        new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime()
    );
    const lastServiceDate = sortedWorkOrders[0]
        ? (sortedWorkOrders[0].completed_at || sortedWorkOrders[0].created_at)
        : null;

    const getStatusVariant = (status: string) => {
        switch (status) {
            case "completed":
            case "closed":
                return "success";
            case "in_progress":
                return "info";
            case "cancelled":
                return "destructive"; // 'danger' in some contexts, using standard simplified
            default:
                return "secondary";
        }
    };

    return (
        <div className="space-y-6">
            {/* Summary Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Spent</span>
                        <div className="flex items-end justify-between">
                            <span className="text-2xl font-bold text-foreground">{formatCurrency(totalSpent)}</span>
                            <DollarSign className="w-5 h-5 text-muted-foreground mb-1" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Services</span>
                        <div className="flex items-end justify-between">
                            <span className="text-2xl font-bold text-foreground">{totalServices}</span>
                            <Wrench className="w-5 h-5 text-muted-foreground mb-1" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Service</span>
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-bold text-foreground">
                                {lastServiceDate ? format(new Date(lastServiceDate), "MMM dd, yyyy") : "N/A"}
                            </span>
                            <Calendar className="w-5 h-5 text-muted-foreground mb-1" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* History Table */}
            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-foreground">Service Records</CardTitle>
                    <Link href={`/workorders/new?vehicle=${vehicleId}`}>
                        <Button size="sm" className="h-8">
                            <FileText className="w-3.5 h-3.5 mr-1.5" />
                            New Service
                        </Button>
                    </Link>
                </CardHeader>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="w-[100px] px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">WO #</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Date</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Type</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Concerns</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-right text-muted-foreground">Amount</TableHead>
                                <TableHead className="w-[50px] px-4 h-10"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedWorkOrders.length > 0 ? (
                                sortedWorkOrders.map((wo) => {
                                    const date = wo.completed_at || wo.created_at;

                                    const isWarrantyRework = (wo as any).is_warranty_rework;

                                    const hasRelated = (wo as any).related_work_order_detail;

                                    return (
                                        <TableRow
                                            key={wo.id}
                                            className="group hover:bg-muted/80 transition-colors border-b border-border last:border-0 cursor-pointer"
                                            onDoubleClick={() => router.push(`/workorders/${wo.id}`)}
                                        >
                                            <TableCell className="px-4 py-2 font-mono text-xs font-medium text-primary">
                                                {wo.work_order_number}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">

                                                <Badge variant={getStatusVariant(wo.status) as any} className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
                                                    {wo.status.replace(/_/g, " ")}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {date ? format(new Date(date), "MMM dd, yyyy") : "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <div className="flex gap-1">
                                                    {isWarrantyRework && (
                                                        <Badge variant="warning" className="text-[10px] py-0 h-5">Warranty</Badge>
                                                    )}
                                                    {hasRelated && !isWarrantyRework && (
                                                        <Badge variant="outline" className="text-[10px] py-0 h-5 border-orange-200 text-primary">Related</Badge>
                                                    )}
                                                    {!isWarrantyRework && !hasRelated && (
                                                        <span className="text-xs text-muted-foreground">Standard</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                                                    {wo.customer_concerns || "No concerns recorded"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right font-medium text-sm text-foreground">
                                                {formatCurrency(parseFloat(wo.total_cost || "0"))}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right">
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Link href={`/workorders/${wo.id}`}>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors focus-visible:ring-1"
                                                                aria-label="View work order details"
                                                            >
                                                                <ArrowUpRight className="w-4 h-4" />
                                                            </Button>
                                                        </Link>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="left">
                                                        <p>View Details</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground text-sm">
                                        No service history found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
}
