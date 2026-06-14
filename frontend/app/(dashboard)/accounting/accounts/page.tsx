"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Edit, Loader2, MoreVertical, Plus, Power, PowerOff, Search } from "lucide-react";
import { accountingApi } from "@/lib/api/accounting";
import apiClient from "@/lib/api/client";
import { ACCOUNTING_TABLE_HEAD_CLASS } from "@/lib/constants/table-typography";
import { cn } from "@/lib/utils/cn";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";
import { getUserFacingError } from "@/lib/api/errors";

type AccountFormData = {
    code: string;
    name: string;
    account_type: string;
    balance_type: string;
    account_subtype: string;
    parent: string;
    description: string;
    is_active: boolean;
    is_till_enabled: boolean;
};

type Account = {
    id: number;
    code: string;
    name: string;
    account_type: string;
    balance_type: string;
    account_subtype?: string;
    parent?: number | null;
    parent_code?: string | null;
    parent_name?: string | null;
    description?: string | null;
    is_active: boolean;
    is_till_enabled?: boolean;
    children_count?: number;
    balance?: number | string;
};

type AccountNode = Account & { depth: number };

type ApiError = {
    response?: { data?: Record<string, string | string[] | Record<string, string[]>> };
};

const ACCOUNT_SUBTYPES = [
    ["", "Unclassified"],
    ["category", "Category/Header"],
    ["current_asset", "Current Asset"],
    ["cash", "Cash on Hand"],
    ["bank", "Bank Account"],
    ["cash_equivalent", "Cash Equivalent"],
    ["accounts_receivable", "Accounts Receivable"],
    ["inventory", "Inventory"],
    ["fixed_asset", "Fixed Asset"],
    ["current_liability", "Current Liability"],
    ["accounts_payable", "Accounts Payable"],
    ["tax_payable", "Taxes Payable"],
    ["revenue", "Revenue"],
    ["expense", "Expense"],
];

const emptyForm: AccountFormData = {
    code: "",
    name: "",
    account_type: "asset",
    balance_type: "debit",
    account_subtype: "",
    parent: "",
    description: "",
    is_active: true,
    is_till_enabled: false,
};

function buildTreeRows(accounts: Account[], expanded: Set<number>, searchTerm: string): AccountNode[] {
    const q = searchTerm.trim().toLowerCase();
    const children = new Map<number | null, Account[]>();
    accounts.forEach((account) => {
        const key = account.parent ?? null;
        children.set(key, [...(children.get(key) ?? []), account]);
    });
    children.forEach((items) => items.sort((a, b) => a.code.localeCompare(b.code)));

    const rows: AccountNode[] = [];
    const visit = (account: Account, depth: number, forceOpen = false) => {
        const descendants = children.get(account.id) ?? [];
        const selfMatch = !q || account.code.toLowerCase().includes(q) || account.name.toLowerCase().includes(q);
        const descendantMatch = q && descendants.some((child) => flatten(child).some((x) => x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)));
        if (selfMatch || descendantMatch) {
            rows.push({ ...account, depth });
        }
        if (forceOpen || expanded.has(account.id) || descendantMatch) {
            descendants.forEach((child) => visit(child, depth + 1, Boolean(q)));
        }
    };
    const flatten = (account: Account): Account[] => {
        const descendants = children.get(account.id) ?? [];
        return [account, ...descendants.flatMap(flatten)];
    };
    (children.get(null) ?? []).forEach((account) => visit(account, 0, Boolean(q)));
    return rows;
}

export default function ChartOfAccountsPage() {
    const { formatCurrency } = useCurrency();
    const { success, error: toastError } = useToast();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [formData, setFormData] = useState<AccountFormData>(emptyForm);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const handleSort = (field: string) => {
        setSortConfig((current) => toggleSortConfig(current, field));
    };

    const { data: accounts = [], isLoading } = useQuery({
        queryKey: ["accounting", "accounts", sortConfig],
        queryFn: () => accountingApi.getAccounts({
            ordering: sortOrderingParam(sortConfig) || "code",
        }) as Promise<Account[]>,
    });

    const accountRows = useMemo(() => buildTreeRows(accounts, expanded, searchTerm), [accounts, expanded, searchTerm]);
    const parentOptions = accounts.filter((account) => account.id !== editingAccount?.id);

    const createMutation = useMutation({
        mutationFn: async (data: AccountFormData) => {
            const response = await apiClient.post("/accounting/accounts/", normalizePayload(data));
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
            setDialogOpen(false);
            resetForm();
            success("Account created.");
        },
        onError: (error: unknown) => toastError(getUserFacingError(error, "Failed to create account")),
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: number; data: AccountFormData }) => {
            const response = await apiClient.put(`/accounting/accounts/${id}/`, normalizePayload(data));
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
            setDialogOpen(false);
            setEditingAccount(null);
            resetForm();
            success("Account updated.");
        },
        onError: (error: unknown) => toastError(getUserFacingError(error, "Failed to update account")),
    });

    const statusMutation = useMutation({
        mutationFn: async ({ account, is_active }: { account: Account; is_active: boolean }) => {
            const response = await apiClient.put(`/accounting/accounts/${account.id}/`, normalizePayload({
                code: account.code,
                name: account.name,
                account_type: account.account_type,
                balance_type: account.balance_type,
                account_subtype: account.account_subtype || "",
                parent: account.parent ? String(account.parent) : "",
                description: account.description || "",
                is_active,
                is_till_enabled: Boolean(account.is_till_enabled) && is_active,
            }));
            return response.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
            success(variables.is_active ? "Account activated." : "Account deactivated.");
        },
        onError: (error: unknown) => toastError(getUserFacingError(error, "Failed to update account status")),
    });

    function normalizePayload(data: AccountFormData) {
        return {
            ...data,
            parent: data.parent ? Number(data.parent) : null,
        };
    }

    function resetForm() {
        setFormData(emptyForm);
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (editingAccount) {
            updateMutation.mutate({ id: editingAccount.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    }

    function handleEdit(account: Account) {
        setEditingAccount(account);
        setFormData({
            code: account.code,
            name: account.name,
            account_type: account.account_type,
            balance_type: account.balance_type,
            account_subtype: account.account_subtype || "",
            parent: account.parent ? String(account.parent) : "",
            description: account.description || "",
            is_active: account.is_active,
            is_till_enabled: Boolean(account.is_till_enabled),
        });
        setDialogOpen(true);
    }

    function handleNew() {
        setEditingAccount(null);
        resetForm();
        setDialogOpen(true);
    }

    function toggleExpanded(id: number) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const isSaving = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                    <h1 className="text-lg font-semibold tracking-tight text-foreground">Chart of Accounts</h1>
                    <p className="mt-0.5 text-xs text-muted-foreground">Organize parent categories, subcategories, and posting accounts</p>
                </div>
                <Button onClick={handleNew} size="sm" className="h-9">
                    <Plus className="mr-2 h-4 w-4" />
                    New Account
                </Button>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="gap-0 p-0 sm:max-w-[640px]">
                    <DialogHeader>
                        <div className="border-b border-border px-5 py-4">
                            <DialogTitle className="text-base">{editingAccount ? "Edit Account" : "Create Account"}</DialogTitle>
                            <DialogDescription className="mt-1 text-xs">Parent accounts classify reports; journal postings use detail accounts.</DialogDescription>
                        </div>
                    </DialogHeader>
                    <form onSubmit={handleSubmit}>
                        <div className="space-y-4 px-5 py-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="code" className="mb-2 block text-sm font-medium">Account Code *</Label>
                                    <Input id="code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="h-9 text-sm" required />
                                </div>
                                <div>
                                    <Label htmlFor="name" className="mb-2 block text-sm font-medium">Account Name *</Label>
                                    <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="h-9 text-sm" required />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <SelectField label="Account Type" value={formData.account_type} onChange={(value) => setFormData({ ...formData, account_type: value })} options={[["asset", "Asset"], ["liability", "Liability"], ["equity", "Equity"], ["income", "Income"], ["expense", "Expense"]]} />
                                <SelectField label="Balance Type" value={formData.balance_type} onChange={(value) => setFormData({ ...formData, balance_type: value })} options={[["debit", "Debit"], ["credit", "Credit"]]} />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <SelectField label="Subtype" value={formData.account_subtype} onChange={(value) => setFormData({ ...formData, account_subtype: value })} options={ACCOUNT_SUBTYPES} />
                                <div>
                                    <Label htmlFor="parent" className="mb-2 block text-sm font-medium">Parent</Label>
                                    <select id="parent" className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={formData.parent} onChange={(e) => setFormData({ ...formData, parent: e.target.value })}>
                                        <option value="">No parent</option>
                                        {parentOptions.map((account) => (
                                            <option key={account.id} value={account.id}>{account.code} - {account.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="description" className="mb-2 block text-sm font-medium">Description</Label>
                                <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} className="resize-none text-sm" />
                            </div>

                            <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
                                <ToggleRow label="Active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
                                <ToggleRow label="Till enabled" checked={formData.is_till_enabled} onCheckedChange={(checked) => setFormData({ ...formData, is_till_enabled: checked })} />
                            </div>
                        </div>

                        <DialogFooter className="border-t border-border px-5 py-3">
                            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {editingAccount ? "Update" : "Create"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Card className="overflow-hidden">
                <CardHeader className="border-b border-border bg-muted/10 pb-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <CardTitle className="text-sm font-semibold">Account Hierarchy ({accountRows.length})</CardTitle>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input placeholder="Search accounts..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-9 bg-background pl-9 text-sm" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/10">
                                <TableRow className="border-none hover:bg-transparent">
                                    <SortableHeader field="code" sortConfig={sortConfig} onSort={handleSort} className={ACCOUNTING_TABLE_HEAD_CLASS}>Account</SortableHeader>
                                    <SortableHeader field="account_subtype" sortConfig={sortConfig} onSort={handleSort} className={ACCOUNTING_TABLE_HEAD_CLASS}>Subtype</SortableHeader>
                                    <SortableHeader field="account_type" sortConfig={sortConfig} onSort={handleSort} className={ACCOUNTING_TABLE_HEAD_CLASS}>Type</SortableHeader>
                                    <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Balance</TableHead>
                                    <SortableHeader field="is_active" sortConfig={sortConfig} onSort={handleSort} className={ACCOUNTING_TABLE_HEAD_CLASS}>Status</SortableHeader>
                                    <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {accountRows.map((account) => {
                                    const hasChildren = Boolean(account.children_count);
                                    return (
                                        <TableRow key={account.id} className="border-b border-border hover:bg-muted/20">
                                            <TableCell className="px-4 py-2">
                                                <div className="flex items-center gap-2" style={{ paddingLeft: `${account.depth * 18}px` }}>
                                                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={!hasChildren} onClick={() => toggleExpanded(account.id)}>
                                                        {hasChildren ? (expanded.has(account.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="h-4 w-4" />}
                                                    </Button>
                                                    <div>
                                                        <div className="font-medium text-foreground"><span className="font-mono text-xs text-muted-foreground">{account.code}</span> {account.name}</div>
                                                        {account.parent_name && <div className="text-[11px] text-muted-foreground">Under {account.parent_code} - {account.parent_name}</div>}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs capitalize text-muted-foreground">{(account.account_subtype || "unclassified").replace(/_/g, " ")}</TableCell>
                                            <TableCell className="px-4 py-2 text-xs capitalize text-muted-foreground">{account.account_type} / {account.balance_type}</TableCell>
                                            <TableCell className="px-4 py-2 text-right font-mono text-xs font-medium">{account.balance !== undefined ? formatCurrency(account.balance) : "-"}</TableCell>
                                            <TableCell className="px-4 py-2">
                                                <div className="flex flex-wrap gap-1">
                                                    <Badge variant="outline" className={account.is_active ? "border-success/20 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground"}>{account.is_active ? "Active" : "Inactive"}</Badge>
                                                    {account.is_till_enabled && <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">Till</Badge>}
                                                    {hasChildren && <Badge variant="secondary">Parent</Badge>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted"><MoreVertical className="h-3.5 w-3.5" /></Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-40">
                                                        <DropdownMenuItem onClick={() => handleEdit(account)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => statusMutation.mutate({ account, is_active: !account.is_active })} disabled={statusMutation.isPending}>
                                                            {account.is_active ? <PowerOff className="mr-2 h-4 w-4" /> : <Power className="mr-2 h-4 w-4" />}
                                                            {account.is_active ? "Deactivate" : "Activate"}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {accountRows.length === 0 && (
                                    <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No accounts found.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
    return (
        <div>
            <Label className="mb-2 block text-sm font-medium">{label}</Label>
            <select className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
                {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
            </select>
        </div>
    );
}

function ToggleRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-medium">{label}</Label>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}
