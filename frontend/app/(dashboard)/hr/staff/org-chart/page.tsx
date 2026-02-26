"use client";

import { useQuery } from "@tanstack/react-query";
import { hrApi } from "@/lib/api/hr";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, AlertCircle, ChevronDown, ChevronRight, User } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface OrgNode {
    id: number;
    name: string;
    position: string | null;
    department: string | null;
    reporting_to: number | null;
    profile_picture: string | null;
}

export default function OrgChartPage() {
    return (
        <PermissionGuard permission="view_staff">
            <DynamicPageTitle title="Interactive Org Chart" />
            <div className="space-y-4">
                <StaffPageHeader
                    title="Organization Chart"
                    breadcrumbs={[
                        { label: "Dashboard", href: "/dashboard" },
                        { label: "HR", href: "/hr" },
                        { label: "Staff", href: "/hr/staff" },
                        { label: "Org Chart" },
                    ]}
                />

                <Card className="min-h-[600px] bg-muted/20 border-border overflow-hidden">
                    <CardContent className="p-0 overflow-auto max-h-[750px] custom-scrollbar">
                        <OrgChartViewer />
                    </CardContent>
                </Card>
            </div>
        </PermissionGuard>
    );
}

function OrgChartViewer() {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["hr", "staff", "orgChart"],
        queryFn: async () => {
            const res = await hrApi.staff.orgChart();
            return res.data as OrgNode[];
        },
    });

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-24 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                <p>Loading organization structure...</p>
            </div>
        );
    }

    if (isError || !data) {
        return (
            <div className="flex flex-col items-center justify-center p-24 text-red-500">
                <AlertCircle className="h-8 w-8 mb-4" />
                <p>Failed to load org chart data.</p>
            </div>
        );
    }

    // Process data into a tree structure
    const treeMap = new Map<number | null, OrgNode[]>();
    data.forEach(node => {
        const parentId = node.reporting_to;
        if (!treeMap.has(parentId)) {
            treeMap.set(parentId, []);
        }
        treeMap.get(parentId)!.push(node);
    });

    // Find roots (those whose reporting_to is null or points to someone not in the dataset)
    const validIds = new Set(data.map(d => d.id));
    const roots = data.filter(node => !node.reporting_to || !validIds.has(node.reporting_to));

    if (roots.length === 0) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No reporting structure defined yet.</p>
            </div>
        );
    }

    return (
        <div className="p-8 min-w-max">
            <div className="flex flex-col items-center gap-12">
                {roots.map(root => (
                    <TreeNode key={root.id} node={root} treeMap={treeMap} isRoot />
                ))}
            </div>
        </div>
    );
}

function TreeNode({ node, treeMap, isRoot = false }: { node: OrgNode, treeMap: Map<number | null, OrgNode[]>, isRoot?: boolean }) {
    const [isExpanded, setIsExpanded] = useState(true);
    const children = treeMap.get(node.id) || [];
    const hasChildren = children.length > 0;

    return (
        <div className="flex flex-col items-center relative">
            {/* The Node Card */}
            <div className="relative z-10">
                <Card className={cn(
                    "w-64 border-2 shadow-md hover:shadow-lg transition-all relative overflow-visible",
                    isRoot ? "border-primary/50 shadow-primary/10" : "border-border"
                )}>
                    {hasChildren && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-background border-2 shadow-sm rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted z-20 cursor-pointer transition-colors"
                        >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                    )}
                    <CardContent className="p-4 flex flex-col items-center text-center gap-3">
                        <Avatar className={cn("border-2 shadow-sm", isRoot ? "h-16 w-16 border-primary/20" : "h-12 w-12 border-muted")}>
                            <AvatarImage src={node.profile_picture || undefined} />
                            <AvatarFallback className={isRoot ? "text-lg" : "text-sm"}>
                                {node.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                            </AvatarFallback>
                        </Avatar>

                        <div className="space-y-1">
                            <Link href={`/hr/staff/${node.id}`} className="font-semibold text-foreground hover:text-primary transition-colors hover:underline line-clamp-1">
                                {node.name}
                            </Link>
                            <p className="text-xs text-muted-foreground font-medium line-clamp-1">
                                {node.position || "—"}
                            </p>
                        </div>

                        {node.department && (
                            <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider opacity-80 mt-1">
                                {node.department}
                            </Badge>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Connecting lines & Children */}
            <AnimatePresence initial={false}>
                {hasChildren && isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, scaleY: 0.8, transformOrigin: 'top' }}
                        animate={{ opacity: 1, height: 'auto', scaleY: 1 }}
                        exit={{ opacity: 0, height: 0, scaleY: 0.8, transition: { duration: 0.2 } }}
                        className="relative pt-8 mt-2"
                    >
                        {/* Vertical line rising up from children wrapper to parent */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-8 bg-border z-0" />

                        {/* Horizontal line connecting all children if more than one */}
                        {children.length > 1 && (
                            <div className="absolute top-8 left-[calc(50%/var(--children-count))] right-[calc(50%/var(--children-count))] h-0.5 bg-border z-0"
                                style={{
                                    left: `calc(${100 / children.length / 2}%)`,
                                    right: `calc(${100 / children.length / 2}%)`,
                                }}
                            />
                        )}

                        <div className="flex justify-center gap-6" style={{ '--children-count': children.length } as any}>
                            {children.map(child => (
                                <div key={child.id} className="relative pt-6">
                                    {/* Downward line branching to each child */}
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-border z-0" />
                                    <TreeNode node={child} treeMap={treeMap} />
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
