"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil, Plus, Tags } from "lucide-react";
import {
  revenueProductsApi,
  REVENUE_CLASS_LABELS,
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
  roadside_service_type: "",
  sort_order: 0,
  is_active: true,
};

export default function RevenueProductsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RevenueProduct | null>(null);
  const [form, setForm] = useState<RevenueProductPayload>(EMPTY_FORM);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["revenue-products", "manage"],
    queryFn: () => revenueProductsApi.list(),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.owner_account_code ?? "").toLowerCase().includes(q),
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
      };
      return editing
        ? revenueProductsApi.update(editing.id, payload)
        : revenueProductsApi.create(payload as RevenueProductPayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue-products"] });
      setDialogOpen(false);
      resetDialog();
      toast({ title: editing ? "Income category updated" : "Income category created", variant: "success" });
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
          <PermissionGuard permission="manage_accounting_periods">
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add category
            </Button>
          </PermissionGuard>
        </div>

        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-sm font-semibold">Income category catalog</CardTitle>
              <Input
                placeholder="Search code, name, account…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 max-w-xs text-sm"
              />
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
                    <TableHead>Category</TableHead>
                    <TableHead>{QBO_INCOME_ACCOUNT_SHORT}</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Line type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.code}</div>
                      </TableCell>
                      <TableCell>
                        {product.owner_account_code ? (
                          <span className="font-mono text-xs">
                            {product.owner_account_code}
                            {product.owner_account_label ? ` — ${product.owner_account_label}` : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {REVENUE_CLASS_LABELS[product.revenue_class] ?? product.revenue_class}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{product.default_billing_line_type}</TableCell>
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
                      <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                        No income categories found. Run seed or add your first category.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog(); }}>
          <DialogContent className="max-w-lg">
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
                  <Label className="text-xs">{QBO_INCOME_ACCOUNT_LABEL}</Label>
                  <Input
                    value={form.owner_account_code ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, owner_account_code: e.target.value }))}
                    placeholder="680"
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
                <Label className="text-xs">QBO account name</Label>
                <Input
                  value={form.owner_account_label ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, owner_account_label: e.target.value }))}
                  placeholder="Vehicle Assessment Sales"
                  className="h-8 text-sm"
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
