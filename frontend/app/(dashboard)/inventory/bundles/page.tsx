"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, ServiceBundle } from "@/lib/api/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Edit, Trash2, Box, MoreVertical, X, Package, Wrench } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

export default function ServiceBundlesPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState("");

    const { data, isLoading } = useQuery({
        queryKey: ["service-bundles", searchQuery],
        queryFn: () => inventoryApi.listBundles({
            search: searchQuery || undefined,
        }),
    });

    const bundles = (Array.isArray(data) ? data : (data as any)?.results || []) as ServiceBundle[];

    const deleteMutation = useMutation({
        mutationFn: (id: number) => inventoryApi.deleteBundle(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["service-bundles"] });
            toast({
                title: "Success",
                description: "Service bundle deleted successfully",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to delete bundle",
                variant: "destructive",
            });
        },
    });

    const handleDelete = (id: number) => {
        if (confirm("Are you sure you want to delete this service bundle?")) {
            deleteMutation.mutate(id);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-center pt-2">
                    <div>
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                            <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                            <span>/</span>
                            <Link href="/inventory" className="hover:text-primary transition-colors">Inventory</Link>
                            <span>/</span>
                            <span className="text-gray-900 dark:text-gray-100 font-medium">Service Bundles</span>
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                            Service Bundles
                        </h1>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-gray-900/50 p-1 rounded-lg">
                <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none md:w-64">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                            type="text"
                            placeholder="Search bundles..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 text-sm bg-gray-50 dark:bg-gray-800 border-none focus:ring-1 transition-all"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <PermissionGuard permission="manage_bundles">
                        <Link href="/inventory/bundles/new">
                            <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-sm">
                                <Plus className="w-4 h-4 mr-2" />
                                New Bundle
                            </Button>
                        </Link>
                    </PermissionGuard>
                </div>
            </div>

            {/* Bundles Table */}
            <Card className="border-none shadow-sm overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6"><TableSkeleton rows={5} columns={6} /></div>
                    ) : bundles.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-gray-50/50 dark:bg-gray-800/50 border-y border-gray-100 dark:border-gray-800">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Name</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Service Type</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-center">Parts Count</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Status</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {bundles.map((bundle) => (
                                        <TableRow
                                            key={bundle.id}
                                            className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors"
                                        >
                                            <TableCell className="px-4 py-3">
                                                <div className="flex items-center">
                                                    <Box className="w-4 h-4 mr-2 text-primary" />
                                                    <div>
                                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{bundle.name}</span>
                                                        {bundle.description && (
                                                            <p className="text-xs text-muted-foreground line-clamp-1 truncate max-w-xs">{bundle.description}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-3">
                                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 font-normal">
                                                    <Wrench className="w-3 h-3 mr-1" />
                                                    {bundle.service_type_name || "Unlinked"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-4 py-3 text-center">
                                                <Badge variant="secondary" className="bg-gray-100 text-gray-600 font-normal">
                                                    {bundle.items?.length || 0} Parts
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-4 py-3">
                                                <Badge variant={bundle.is_active ? "success" : "secondary"} className="text-[10px] px-2 py-0">
                                                    {bundle.is_active ? "Active" : "Inactive"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-4 py-3 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-gray-100 text-gray-500">
                                                            <MoreVertical className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-40">
                                                        <PermissionGuard permission="manage_bundles">
                                                            <DropdownMenuItem asChild>
                                                                <Link href={`/inventory/bundles/${bundle.id}/edit`} className="flex items-center cursor-pointer">
                                                                    <Edit className="w-4 h-4 mr-2" />
                                                                    Edit
                                                                </Link>
                                                            </DropdownMenuItem>
                                                        </PermissionGuard>
                                                        <DropdownMenuSeparator />
                                                        <PermissionGuard permission="manage_bundles">
                                                            <DropdownMenuItem
                                                                onClick={() => handleDelete(bundle.id)}
                                                                className="text-red-600 focus:text-red-700 cursor-pointer"
                                                                disabled={deleteMutation.isPending}
                                                            >
                                                                <Trash2 className="w-4 h-4 mr-2" />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        </PermissionGuard>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No service bundles found</h3>
                            <p className="text-gray-500 max-w-sm mx-auto mt-1 mb-4">
                                Service bundles make it easy to add common parts to work orders in one click.
                            </p>
                            <PermissionGuard permission="manage_bundles">
                                <Link href="/inventory/bundles/new">
                                    <Button variant="outline" size="sm">
                                        <Plus className="w-3.5 h-3.5 mr-2" />
                                        Create First Bundle
                                    </Button>
                                </Link>
                            </PermissionGuard>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
