"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
    fixedAssetsApi,
    type AssetAcquisitionRequest,
    type AssetAcquisitionStatus,
} from "@/lib/api/fixed-assets";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PermissionButton } from "@/components/auth/PermissionButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { format } from "date-fns";

function statusBadge(status: AssetAcquisitionStatus) {
    const map: Record<string, "success" | "secondary" | "danger" | "warning" | "info"> = {
        draft: "secondary",
        pending_approval: "warning",
        approved: "info",
        rejected: "danger",
        received: "success",
    };
    return map[status] || "secondary";
}

export default function AcquisitionsListPage() {
    return (
        <PermissionPageGuard permission="view_assets">
            <AcquisitionsListContent />
        </PermissionPageGuard>
    );
}

function AcquisitionsListContent() {
    const [statusFilter, setStatusFilter] = useState<string>("");

    const { data, isLoading } = useQuery({
        queryKey: ["fixed-assets-acquisitions", statusFilter],
        queryFn: () =>
            fixedAssetsApi.acquisitions.list({
                status: statusFilter || undefined,
            }),
    });

    const rows: AssetAcquisitionRequest[] = useMemo(() => {
        if (!data) return [];
        return Array.isArray(data) ? data : data.results || [];
    }, [data]);

    return (
        <div className="flex-1 overflow-auto p-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/fixed-assets">
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                            <ClipboardList className="w-5 h-5 text-primary" />
                            Asset acquisitions
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Requests, approvals, receipt & capitalization
                        </p>
                    </div>
                </div>
                <Link href="/fixed-assets/acquisitions/new">
                    <PermissionButton permission="create_assets" size="sm" className="h-9 text-xs font-bold">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        New request
                    </PermissionButton>
                </Link>
            </div>

            <Card className="border-border shadow-sm">
                <CardContent className="p-4 flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-semibold text-muted-foreground mr-2">Status</span>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-9 rounded-md border border-border bg-background px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                        <option value="">All</option>
                        <option value="draft">Draft</option>
                        <option value="pending_approval">Pending approval</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="received">Received</option>
                    </select>
                </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
                    ) : rows.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                            No acquisition requests yet.
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {rows.map((row) => (
                                <Link
                                    key={row.id}
                                    href={`/fixed-assets/acquisitions/${row.id}`}
                                    className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 hover:bg-muted/40 transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-primary">
                                                {row.request_number}
                                            </span>
                                            <Badge variant={statusBadge(row.status)} className="text-[10px] uppercase">
                                                {row.status.replace(/_/g, " ")}
                                            </Badge>
                                        </div>
                                        <p className="text-sm font-medium text-foreground truncate">{row.title}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {row.proposed_asset_name} · {row.branch_name || `Branch #${row.branch}`}
                                        </p>
                                    </div>
                                    <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                                        <div className="font-mono font-semibold text-foreground">
                                            {typeof row.expected_acquisition_cost === "string"
                                                ? row.expected_acquisition_cost
                                                : row.expected_acquisition_cost?.toFixed?.(2)}
                                        </div>
                                        <div>{format(new Date(row.created_at), "MMM d, yyyy")}</div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
