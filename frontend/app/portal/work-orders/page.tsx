"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkOrder, workordersApi } from "@/lib/api/workorders";
import { useCurrentUser, getCustomerId } from "@/lib/hooks/useCurrentUser";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Filter, Calendar, Car, DollarSign, FileText, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { getWorkOrderListBillingDisplay } from "@/lib/workorders/workOrderBillingDisplay";

export default function MyWorkOrdersPage() {
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const { formatCurrency } = useCurrency();
    const { data: user } = useCurrentUser();
    const customerId = getCustomerId(user);

    const { data: workOrdersData, isLoading } = useQuery({
        queryKey: ["portal", "workorders", statusFilter],
        queryFn: () => {
            if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });

            const params: Parameters<typeof workordersApi.list>[0] = {
                ordering: "-created_at",
            };
            if (statusFilter !== "all") {
                params.status = statusFilter;
            }
            return workordersApi.list(params);
        },

        enabled: !!user && !!customerId,
    });


    const workOrders = (workOrdersData?.results || []) as WorkOrder[];

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div>
                    <Skeleton className="h-8 w-48 mb-2" />
                    <Skeleton className="h-4 w-96" />
                </div>
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <Card key={i}>
                            <CardContent className="p-6">
                                <Skeleton className="h-6 w-48 mb-4" />
                                <Skeleton className="h-4 w-full mb-2" />
                                <Skeleton className="h-4 w-3/4" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    const getStatusVariant = (status: string) => {
        switch (status) {
            case "completed":
            case "closed":
                return "success";
            case "in_progress":
            case "started":
                return "default";
            case "draft":
            case "pending":
            case "pending_approval":
                return "warning";
            case "cancelled":
                return "danger";
            default:
                return "secondary";
        }
    };

    const getStatusDisplay = (status: string) => {
        return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-foreground">My Work Orders</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    View and track your vehicle services and repairs
                </p>
            </div>

            {/* Filter */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center space-x-4">
                        <Filter className="w-5 h-5 text-muted-foreground" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="all">All Status</option>
                            <option value="awaiting_approval">Awaiting Approval</option>
                            <option value="approved">Approved</option>
                            <option value="in_progress">In Progress</option>
                            <option value="pending_approval">Pending Approval</option>
                            <option value="completed">Completed</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>
                </CardContent>
            </Card>

            {/* Work Orders List */}
            {workOrders.length > 0 ? (
                <div className="space-y-4">

                    {workOrders.map((wo) => (
                        <Card key={wo.id} className="overflow-hidden transition-all hover:shadow-md">
                            <CardContent className="p-0">
                                <div className="flex flex-col md:flex-row">
                                    <div className="flex-1 p-4">
                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                            <div className="space-y-3">
                                                <div className="flex items-center space-x-3">
                                                    <ClipboardList className="w-5 h-5 text-primary" />
                                                    <h3 className="text-lg font-bold text-foreground">
                                                        {wo.work_order_number}
                                                    </h3>
                                                    <Badge variant={getStatusVariant(wo.status)}>
                                                        {getStatusDisplay(wo.status)}
                                                    </Badge>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-muted-foreground">
                                                    <div className="flex items-center">
                                                        <Calendar className="w-4 h-4 mr-2 opacity-70" />
                                                        <span>{format(new Date(wo.created_at), "MMM d, yyyy")}</span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <Car className="w-4 h-4 mr-2 opacity-70" />
                                                        <span>{wo.vehicle_display || wo.vehicle_info || "Unknown Vehicle"}</span>
                                                    </div>
                                                    {(() => {
                                                        const billing = getWorkOrderListBillingDisplay(wo, {
                                                            audience: "customer",
                                                            formatDue: formatCurrency,
                                                        });
                                                        if (!billing) return null;
                                                        return (
                                                            <div className="flex items-center sm:col-span-2">
                                                                <DollarSign className="w-4 h-4 mr-2 opacity-70" />
                                                                <span className="font-medium text-foreground">
                                                                    {billing.label}: {formatCurrency(billing.amount)}
                                                                    {billing.statusLine ? (
                                                                        <span className="ml-2 text-xs text-muted-foreground capitalize">
                                                                            ({billing.statusLine})
                                                                        </span>
                                                                    ) : null}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                    {wo.estimate_summary && (
                                                        <Link
                                                            href={`/portal/estimates/${wo.estimate_summary.id}`}
                                                            className="flex items-center text-foreground hover:text-primary"
                                                        >
                                                            <FileText className="w-4 h-4 mr-2 opacity-70" />
                                                            <span className="font-medium">
                                                                Estimate {wo.estimate_summary.estimate_number}
                                                            </span>
                                                            <Badge variant="outline" className="ml-2 h-5 text-[10px] capitalize">
                                                                {wo.estimate_summary.status}
                                                            </Badge>
                                                        </Link>
                                                    )}
                                                    {wo.invoice_summary && (
                                                        <Link
                                                            href={`/portal/invoices/${wo.invoice_summary.id}`}
                                                            className="flex items-center text-foreground hover:text-primary"
                                                        >
                                                            <Receipt className="w-4 h-4 mr-2 opacity-70" />
                                                            <span className="font-medium">
                                                                Invoice {wo.invoice_summary.invoice_number}
                                                            </span>
                                                            <Badge variant="outline" className="ml-2 h-5 text-[10px] capitalize">
                                                                {wo.invoice_summary.status}
                                                            </Badge>
                                                        </Link>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center pt-2 md:pt-0">
                                                <Link href={`/portal/work-orders/${wo.id}`} className="w-full md:w-auto">
                                                    <Button className="w-full">
                                                        View Details
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card>
                    <CardContent className="py-12 text-center">
                        <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                            No work orders found
                        </h3>
                        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                            {statusFilter !== "all"
                                ? `No work orders with status "${getStatusDisplay(statusFilter)}" found.`
                                : "You don't have any work orders yet."}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
