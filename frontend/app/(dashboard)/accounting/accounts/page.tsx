"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi, type Account } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, ChevronRight } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export default function ChartOfAccountsPage() {
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState<string>("");

    const { data, isLoading } = useQuery({
        queryKey: ['chart-of-accounts'],
        queryFn: () => accountingApi.getChartOfAccounts(),
    });

    // Filter accounts
    const filteredAccounts = data?.accounts?.filter((account) => {
        const matchesSearch = search === "" ||
            account.code.toLowerCase().includes(search.toLowerCase()) ||
            account.name.toLowerCase().includes(search.toLowerCase());

        const matchesRole = roleFilter === "" || account.role === roleFilter;

        return matchesSearch && matchesRole;
    }) || [];

    // Group accounts by role
    const groupedAccounts = filteredAccounts.reduce((acc, account) => {
        if (!acc[account.role]) {
            acc[account.role] = [];
        }
        acc[account.role].push(account);
        return acc;
    }, {} as Record<string, Account[]>);

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'ASSET':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
            case 'LIABILITY':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
            case 'EQUITY':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
            case 'INCOME':
                return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
            case 'EXPENSE':
                return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
        }
    };

    const getBalanceTypeBadge = (type: string) => {
        return type === 'DEBIT'
            ? <Badge variant="secondary" className="text-xs">DR</Badge>
            : <Badge variant="secondary" className="text-xs">CR</Badge>;
    };

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Card>
                    <CardContent className="pt-6">
                        <div className="space-y-2">
                            {[...Array(8)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Chart of Accounts</h1>
                    <p className="text-muted-foreground mt-1">
                        {data?.entity_name} • {data?.total_accounts} accounts
                    </p>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                type="text"
                                placeholder="Search by code or name..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        {/* Role Filter */}
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Account Types</option>
                            <option value="ASSET">Assets</option>
                            <option value="LIABILITY">Liabilities</option>
                            <option value="EQUITY">Equity</option>
                            <option value="INCOME">Income</option>
                            <option value="EXPENSE">Expenses</option>
                        </select>

                        {/* Clear */}
                        {(search || roleFilter) && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSearch("");
                                    setRoleFilter("");
                                }}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Accounts by Role */}
            {Object.entries(groupedAccounts).map(([role, accounts]) => (
                <Card key={role}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Badge className={getRoleBadgeColor(role)}>
                                {role}
                            </Badge>
                            <span className="text-sm font-normal text-muted-foreground">
                                ({accounts.length} accounts)
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Account Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Balance Type</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {accounts.map((account) => (
                                        <TableRow key={account.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <TableCell>
                                                <code className="text-sm font-mono font-semibold">
                                                    {account.code}
                                                </code>
                                            </TableCell>
                                            <TableCell>
                                                <div
                                                    className="font-medium"
                                                    style={{ paddingLeft: `${account.depth * 20}px` }}
                                                >
                                                    {account.depth > 0 && (
                                                        <ChevronRight className="inline w-4 h-4 text-gray-400 mr-1" />
                                                    )}
                                                    {account.name}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="text-xs">
                                                    {account.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {getBalanceTypeBadge(account.balance_type)}
                                            </TableCell>
                                            <TableCell>
                                                {account.active ? (
                                                    <Badge variant="success" className="text-xs">Active</Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="text-xs">Inactive</Badge>
                                                )}
                                                {account.locked && (
                                                    <Badge variant="warning" className="text-xs ml-2">Locked</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Link href={`/accounting/accounts/${account.id}`}>
                                                    <Button variant="ghost" size="sm">
                                                        View Details
                                                        <ArrowRight className="ml-2 h-4 w-4" />
                                                    </Button>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            ))}

            {filteredAccounts.length === 0 && (
                <Card>
                    <CardContent className="pt-12 pb-12 text-center">
                        <p className="text-muted-foreground">
                            No accounts found matching your filters.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
