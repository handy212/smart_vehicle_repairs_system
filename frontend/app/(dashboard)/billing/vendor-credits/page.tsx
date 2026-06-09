"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { FileMinus2, ReceiptText, RotateCcw, Search, ShoppingCart } from "lucide-react";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { billingApi } from "@/lib/api/billing";
import { inventoryApi, type PurchaseOrder, type Supplier } from "@/lib/api/inventory";
import { useCurrency } from "@/lib/hooks/useCurrency";

function normalizeResults<T>(value: { results?: T[] } | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : value.results ?? [];
}

export default function VendorCreditsPage() {
  return (
    <PermissionPageGuard permission="view_billing">
      <VendorCreditsContent />
    </PermissionPageGuard>
  );
}

function VendorCreditsContent() {
  const [search, setSearch] = useState("");
  const { formatCurrency } = useCurrency();

  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ["vendor-credits-suppliers", search],
    queryFn: () => inventoryApi.listSuppliers({ search: search || undefined, is_active: true }),
  });

  const { data: billsData } = useQuery({
    queryKey: ["vendor-credits-bills"],
    queryFn: () => billingApi.bills.list({ status: "open" }),
  });

  const { data: purchaseOrdersData } = useQuery({
    queryKey: ["vendor-credits-purchase-orders"],
    queryFn: () => inventoryApi.listPurchaseOrders({}),
  });

  const suppliers = useMemo(() => normalizeResults<Supplier>(suppliersData), [suppliersData]);
  const bills = useMemo(() => billsData?.results ?? [], [billsData]);
  const purchaseOrders = useMemo(
    () => normalizeResults<PurchaseOrder>(purchaseOrdersData),
    [purchaseOrdersData]
  );

  const supplierSummaries = useMemo(
    () =>
      suppliers.map((supplier) => {
        const openBills = bills.filter((bill) => bill.vendor === supplier.id || bill.vendor_name === supplier.name);
        const relatedPurchaseOrders = purchaseOrders.filter((purchaseOrder) => {
          const supplierId =
            typeof purchaseOrder.supplier === "number" ? purchaseOrder.supplier : purchaseOrder.supplier?.id;
          return supplierId === supplier.id;
        });

        const outstandingAmount = openBills.reduce(
          (sum, bill) => sum + Number.parseFloat(bill.amount_due || bill.total || "0"),
          0
        );

        return {
          supplier,
          openBills,
          relatedPurchaseOrders,
          outstandingAmount,
        };
      }),
    [suppliers, bills, purchaseOrders]
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <PageHeader
          title="Vendor Credits"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Billing", href: "/billing" },
            { label: "Vendor Credits" },
          ]}
          actions={
            <div className="flex gap-2">
              <Link href="/inventory/suppliers">
                <Button variant="outline" size="sm">Vendor Centre</Button>
              </Link>
              <PermissionGuard permission="create_bills">
                <Link href="/billing/bills/new">
                  <Button size="sm">
                    <ReceiptText className="mr-1.5 h-4 w-4" />
                    New Bill
                  </Button>
                </Link>
              </PermissionGuard>
            </div>
          }
        >
          <Card className="border-dashed">
            <CardContent className="space-y-3 p-4 text-sm">
              <div className="font-medium text-foreground">Vendor credits workspace</div>
              <div className="text-muted-foreground">
                The app does not yet expose a dedicated vendor-credit posting API. This workspace gets the operational pieces together now: find the supplier, inspect open bills, review related purchase orders, and jump into the adjacent records we need for the credit workflow.
              </div>
              <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search suppliers..."
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>
        </PageHeader>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active Suppliers</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{suppliers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open Bills</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{bills.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Purchase Orders</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{purchaseOrders.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Supplier Review Queue</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Open Bills</TableHead>
                  <TableHead>Related POs</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="w-[260px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliersLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Loading suppliers...
                    </TableCell>
                  </TableRow>
                ) : supplierSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      No suppliers match the current search.
                    </TableCell>
                  </TableRow>
                ) : (
                  supplierSummaries.map(({ supplier, openBills, relatedPurchaseOrders, outstandingAmount }) => (
                    <TableRow key={supplier.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{supplier.name}</div>
                        <div className="text-xs text-muted-foreground">{supplier.supplier_code}</div>
                      </TableCell>
                      <TableCell>{openBills.length}</TableCell>
                      <TableCell>{relatedPurchaseOrders.length}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(outstandingAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link href={`/inventory/suppliers/${supplier.id}`}>
                            <Button variant="outline" size="sm">
                              <FileMinus2 className="mr-1.5 h-4 w-4" />
                              Vendor
                            </Button>
                          </Link>
                          <Link href={`/billing/bills${openBills[0] ? `/${openBills[0].id}` : ""}`}>
                            <Button variant="outline" size="sm">
                              <ReceiptText className="mr-1.5 h-4 w-4" />
                              Bills
                            </Button>
                          </Link>
                          <Link href="/inventory/purchase-orders">
                            <Button variant="outline" size="sm">
                              <ShoppingCart className="mr-1.5 h-4 w-4" />
                              POs
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current Workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Review the supplier record and confirm the return or billing issue with the vendor.</span>
              </div>
              <div className="flex gap-3">
                <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Open the related vendor bill to confirm the original amount and payment status.</span>
              </div>
              <div className="flex gap-3">
                <ShoppingCart className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Use purchase orders and receiving history to validate shortages, returns, or damaged stock.</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Next Backend Step</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div>
                A dedicated vendor-credit entity still needs backend support for posting, approval, application against bills, and accounting impact.
              </div>
              <div>
                This route is in place now so staff can start from one screen instead of hopping between suppliers, bills, and purchase orders manually.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
