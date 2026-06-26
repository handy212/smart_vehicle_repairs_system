"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Loader2,
  Pencil,
  Plus,
  Tags,
} from "lucide-react";
import {
  revenueProductsApi,
  REVENUE_CLASS_LABELS,
  type RevenueClass,
  type RevenueProduct,
  type RevenueProductPayload,
} from "@/lib/api/revenue-products";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { CatalogPartSelect } from "@/components/accounting/CatalogPartSelect";
import { QboIncomeAccountSelect } from "@/components/accounting/QboIncomeAccountSelect";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import {
  CONTROLS_VS_INCOME_CATEGORIES_HELP,
  INCOME_CATEGORY_PAGE_TITLE,
  QBO_INCOME_ACCOUNT_LABEL,
  QBO_INCOME_ACCOUNT_SHORT,
} from "@/lib/accounting/income-category-labels";

const EMPTY_FORM: RevenueProductPayload = {
  code: "",
  name: "",
  owner_account_code: "",
  owner_account_label: "",
  revenue_class: "service",
  default_billing_line_type: "other",
  catalog_part: null,
  roadside_service_type: "",
  sort_order: 0,
  is_active: true,
};

const ALL_FILTER = "__all__";

function formatIncomeAccount(code?: string | null, label?: string | null) {
  const number = (code ?? "").trim();
  const name = (label ?? "").trim();
  if (number && name) {
    return `${number} · ${name}`;
  }
  return number || name || "—";
}

export default function RevenueProductsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected: qboConnected } = useQuickBooksConnection();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RevenueProduct | null>(null);
  const [form, setForm] = useState<RevenueProductPayload>(EMPTY_FORM);

  const listParams = useMemo(
    () => ({
      ...(statusFilter === "active" ? { is_active: true } : {}),
      ...(statusFilter === "inactive" ? { is_active: false } : {}),
      ...(classFilter !== ALL_FILTER ? { revenue_class: classFilter } : {}),
    }),
    [classFilter, statusFilter],
  );

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["revenue-products", "manage", listParams],
    queryFn: () => revenueProductsApi.list(listParams),
  });

  const stats = useMemo(() => {
    const missingAccount = products.filter((p) => !p.owner_account_code?.trim()).length;
    const missingCatalog = products.filter((p) => !p.catalog_part).length;
    const inactive = products.filter((p) => !p.is_active).length;
    return {
      total: products.length,
      missingAccount,
      missingCatalog,
      inactive,
    };
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.owner_account_code ?? "").toLowerCase().includes(q) ||
        (p.owner_account_label ?? "").toLowerCase().includes(q) ||
        (p.catalog_part_number ?? "").toLowerCase().includes(q) ||
        (p.roadside_service_type ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const resetDialog = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    resetDialog();
    setDialogOpen(true);
  };

  const openEdit = (product: RevenueProduct) => {
    setEditing(product);
    setForm({
      code: product.code,
      name: product.name,
      owner_account_code: product.owner_account_code ?? "",
      owner_account_label: product.owner_account_label ?? "",
      revenue_class: product.revenue_class,
      default_billing_line_type: product.default_billing_line_type,
      catalog_part: product.catalog_part ?? null,
      roadside_service_type: product.roadside_service_type ?? "",
      sort_order: product.sort_order,
      is_active: product.is_active,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        code: (form.code ?? "").trim().toLowerCase().replace(/\s+/g, "_"),
        roadside_service_type: form.roadside_service_type?.trim() || null,
        catalog_part: form.catalog_part ?? null,
        sort_order: Number(form.sort_order ?? 0),
      };
      return editing
        ? revenueProductsApi.update(editing.id, payload)
        : revenueProductsApi.create(payload as RevenueProductPayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue-products"] });
      setDialogOpen(false);
      resetDialog();
      toast({
        title: editing ? "Income category updated" : "Income category created",
        variant: "success",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Save failed",
        description: getUserFacingError(error, "Could not save income category."),
        variant: "destructive",
      });
    },
  });

  return (
    <PermissionGuard permission="view_accounting">
      <div className="space-y-4 p-4 md:p-0 max-w-6xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/accounting/controls"
              className="inline-flex items-center text-xs text-muted-foreground hover:text-primary mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Back to Controls
            </Link>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Tags className="w-5 h-5 text-primary" />
              {INCOME_CATEGORY_PAGE_TITLE}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Map workshop services, labour, parts, and AA offerings to QuickBooks income
              accounts. Used on invoice lines and QBO item sync — SVR GL stays lean.
            </p>
            <p className="text-xs text-muted-foreground mt-2 max-w-3xl rounded-md border border-border bg-muted/40 px-3 py-2">
              {CONTROLS_VS_INCOME_CATEGORIES_HELP}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/accounting/reports/management">
                <BarChart3 className="w-4 h-4 mr-1.5" />
                Revenue report
              </Link>
            </Button>
            <PermissionGuard permission="manage_accounting_periods">
              <Button size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add category
              </Button>
            </PermissionGuard>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card>
            <CardContent className="px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Categories</p>
              <p className="text-lg font-semibold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">No income acct</p>
              <p className={`text-lg font-semibold ${stats.missingAccount ? "text-warning" : ""}`}>
                {stats.missingAccount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">No QBO item</p>
              <p className={`text-lg font-semibold ${stats.missingCatalog ? "text-warning" : ""}`}>
                {stats.missingCatalog}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inactive</p>
              <p className="text-lg font-semibold">{stats.inactive}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="text-sm font-semibold">Income category catalog</CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger className="h-8 w-full sm:w-[180px] text-xs">
                    <SelectValue placeholder="All classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>All classes</SelectItem>
                    {Object.entries(REVENUE_CLASS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
                >
                  <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active only</SelectItem>
                    <SelectItem value="inactive">Inactive only</SelectItem>
                    <SelectItem value="all">All statuses</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search code, name, account, item…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-full sm:max-w-xs text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>{QBO_INCOME_ACCOUNT_SHORT}</TableHead>
                    <TableHead>QBO item</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {product.sort_order}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.code}</div>
                        {product.roadside_service_type ? (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Roadside: {product.roadside_service_type}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {product.owner_account_code ? (
                          <span className="font-mono text-xs">
                            {formatIncomeAccount(product.owner_account_code, product.owner_account_label)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-warning text-xs">
                            <AlertTriangle className="w-3 h-3" />
                            Unmapped
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {product.catalog_part_number ? (
                          <span className="font-mono">{product.catalog_part_number}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {REVENUE_CLASS_LABELS[product.revenue_class] ?? product.revenue_class}
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.is_active ? "success" : "secondary"} className="text-[10px]">
                          {product.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <PermissionGuard permission="manage_accounting_periods">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(product)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </PermissionGuard>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                        No income categories found. Run{" "}
                        <code className="text-xs">seed_owner_revenue_products</code> or add your first category.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit income category" : "New income category"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Code</Label>
                  <Input
                    value={form.code ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    disabled={Boolean(editing)}
                    placeholder="service_vehicle_assessment"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Sort order</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.sort_order ?? 0}
                    onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Vehicle Assessment"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{QBO_INCOME_ACCOUNT_LABEL}</Label>
                {qboConnected ? (
                  <QboIncomeAccountSelect
                    accountCode={form.owner_account_code ?? ""}
                    accountLabel={form.owner_account_label ?? ""}
                    onChange={({ accountCode, accountLabel }) =>
                      setForm((f) => ({
                        ...f,
                        owner_account_code: accountCode,
                        owner_account_label: accountLabel,
                      }))
                    }
                  />
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    value={form.owner_account_code ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, owner_account_code: e.target.value }))}
                    placeholder="680"
                    className="h-8 text-sm font-mono"
                  />
                  <Input
                    value={form.owner_account_label ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, owner_account_label: e.target.value }))}
                    placeholder="Vehicle Assessment Sales"
                    className="h-8 text-sm"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {qboConnected
                    ? "Pick from QuickBooks or edit the code and label manually."
                    : "Connect QuickBooks under Admin → Integrations to pick from your live chart."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">QBO item template</Label>
                <CatalogPartSelect
                  value={form.catalog_part ?? null}
                  onChange={(catalogPart) => setForm((f) => ({ ...f, catalog_part: catalogPart }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Revenue class</Label>
                  <Select
                    value={form.revenue_class ?? "service"}
                    onValueChange={(v) => setForm((f) => ({ ...f, revenue_class: v as RevenueProductPayload["revenue_class"] }))}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(REVENUE_CLASS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Default billing line type</Label>
                  <Select
                    value={form.default_billing_line_type ?? "other"}
                    onValueChange={(v) => setForm((f) => ({ ...f, default_billing_line_type: v as RevenueProductPayload["default_billing_line_type"] }))}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["labor", "part", "fee", "sublet", "other"].map((value) => (
                        <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.revenue_class === "aa_roadside" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Roadside service type</Label>
                  <Input
                    value={form.roadside_service_type ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, roadside_service_type: e.target.value }))}
                    placeholder="towing"
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Must match roadside request service type when set (unique per category).
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active ?? true}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
                />
                <Label className="text-sm">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!form.name?.trim() || !form.code?.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}
