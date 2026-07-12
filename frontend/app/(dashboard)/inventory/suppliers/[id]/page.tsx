"use client";

import { useQuery } from "@tanstack/react-query";
import { inventoryApi, type PurchaseOrder } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Edit, 
  Building2, 
  Mail, 
  Phone, 
  MapPin, 
  Globe, 
  Database,
  FileText,
  CircleDollarSign,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { useQboEntitySync } from "@/hooks/useQboEntitySync";
import { QboSyncBadge } from "@/components/integrations/QboSyncBadge";
import { useToast } from "@/lib/hooks/useToast";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default function SupplierDetailPage() {
  const { formatCurrency } = useCurrency();
  const params = useParams();
  const id = parseInt(params.id as string);
  const { isLinked: isQboConnected, isOperational: isQboCanSync, connectionIssue: qboConnectionIssue } = useQuickBooksConnection();
  const {
    isSyncing,
    isClearing,
    handleSync: handleQBOSync,
    handleClearMapping: handleQboClearMapping,
  } = useQboEntitySync({
    entityType: "supplier",
    objectId: id,
    queryKey: ["supplier", id],
    syncSuccessMessage: "Supplier push to QuickBooks triggered successfully.",
    syncErrorMessage: "Failed to trigger QuickBooks sync",
  });

  const { data: supplier, isLoading, refetch } = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => inventoryApi.getSupplier(id),
  });

  const { data: transactions, isLoading: isTransLoading } = useQuery({
    queryKey: ["supplier-transactions", id],
    queryFn: () => inventoryApi.listPurchaseOrders({ supplier: id }),
    enabled: !!supplier,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Supplier not found.</p>
        <Link href="/inventory/suppliers">
          <Button className="mt-4" variant="secondary">
            Back to Suppliers
          </Button>
        </Link>
      </div>
    );
  }

  const transactionList = Array.isArray(transactions) ? transactions : transactions?.results || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/inventory/suppliers">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">
                {supplier.name} ({supplier.supplier_code})
              </h1>
              <div className="flex items-center gap-2">
                {supplier.email && (
                  <a href={`mailto:${supplier.email}`} className="text-muted-foreground hover:text-primary transition-colors">
                    <Mail className="w-5 h-5" />
                  </a>
                )}
                {supplier.phone && (
                  <a href={`tel:${supplier.phone}`} className="text-muted-foreground hover:text-primary transition-colors">
                    <Phone className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-1">
              <p className="text-sm text-muted-foreground">Supplier Management</p>
              <div className="flex items-center gap-2">
                <Badge variant={supplier.is_active ? "success" : "secondary"} className="text-[10px] px-1.5 py-0 h-4">
                  {supplier.is_active ? "Active" : "Inactive"}
                </Badge>
                {supplier.is_preferred && (
                  <Badge variant="success" className="text-[10px] px-1.5 py-0 h-4 bg-warning/100 hover:bg-amber-600 border-none">
                    Preferred
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isQboConnected ? (
            <QboSyncBadge
              status={supplier.qbo_sync_status}
              error={supplier.qbo_sync_error}
              connected={isQboConnected}
              connectionIssue={!isQboCanSync ? qboConnectionIssue : undefined}
              onRetry={isQboCanSync ? handleQBOSync : undefined}
              onClearMapping={isQboCanSync ? handleQboClearMapping : undefined}
              isRetrying={isSyncing}
              isClearing={isClearing}
              retryLabel={isSyncing ? "Syncing..." : "Sync QBO"}
              className="mr-2"
            />
          ) : null}
          <Link href={`/inventory/suppliers/${id}/edit`}>
            <Button size="sm">
              <Edit className="w-4 h-4 mr-2" />
              Edit Supplier
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-l-2 border-l-blue-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Summary</p>
                <h3 className="text-xl font-bold text-foreground">Status</h3>
                <p className="text-[10px] text-muted-foreground">{supplier.is_active ? 'Active Account' : 'Inactive Account'}</p>
              </div>
              <Building2 className="h-6 w-6 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-amber-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Open Balance</p>
                <h3 className="text-xl font-bold text-foreground">
                  {formatCurrency(parseFloat(supplier.open_balance || "0"))}
                </h3>
                <p className="text-[10px] text-muted-foreground">Unpaid amount</p>
              </div>
              <CircleDollarSign className="h-6 w-6 text-warning/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-red-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Overdue</p>
                <h3 className="text-xl font-bold text-destructive">
                  {formatCurrency(parseFloat(supplier.overdue_payment || "0"))}
                </h3>
                <p className="text-[10px] text-muted-foreground">Past due date</p>
              </div>
              <AlertCircle className="h-6 w-6 text-destructive/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-green-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Orders</p>
                <h3 className="text-xl font-bold text-foreground">{supplier.total_po_count || 0}</h3>
                <p className="text-[10px] text-muted-foreground">All time orders</p>
              </div>
              <FileText className="h-6 w-6 text-success/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="transactions" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 gap-6">
          <TabsTrigger 
            value="transactions" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2 text-xs font-bold uppercase tracking-tight"
          >
            Transactions
          </TabsTrigger>
          <TabsTrigger 
            value="details" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2 text-xs font-bold uppercase tracking-tight"
          >
            Details
          </TabsTrigger>
          <TabsTrigger 
            value="notes" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2 text-xs font-bold uppercase tracking-tight"
          >
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="pt-4">
          <Card className="shadow-sm border-muted/40">
            <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
              <CardTitle className="text-sm font-bold uppercase tracking-wide">Purchase History</CardTitle>
              <Link href={`/inventory/purchase-orders/new?supplier=${id}`}>
                <Button size="sm" className="h-7 text-[10px] px-2 font-bold uppercase tracking-wider">Create PO</Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {isTransLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : transactionList.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-xs text-muted-foreground">No transactions found.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="h-8">
                      <TableHead className="text-[10px] font-bold px-4">PO #</TableHead>
                      <TableHead className="text-[10px] font-bold">DATE</TableHead>
                      <TableHead className="text-[10px] font-bold">DUE</TableHead>
                      <TableHead className="text-[10px] font-bold">STATUS</TableHead>
                      <TableHead className="text-right text-[10px] font-bold px-4">TOTAL</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactionList.map((po: PurchaseOrder) => (
                      <TableRow key={po.id} className="h-9 hover:bg-muted/10">
                        <TableCell className="font-bold py-1 px-4 text-xs">
                          <Link href={`/inventory/purchase-orders/${po.id}`} className="text-primary hover:underline">
                            {po.po_number}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs">{format(new Date(po.order_date), "MMM dd, yy")}</TableCell>
                        <TableCell className="text-xs">
                          {po.due_date ? (
                            <span className={cn(
                              new Date(po.due_date) < new Date() && po.status !== 'received' && "text-destructive font-bold"
                            )}>
                              {format(new Date(po.due_date), "MMM dd, yy")}
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="py-1">
                          <Badge variant={
                            po.status === 'received' ? 'success' : 
                            po.status === 'cancelled' ? 'secondary' : 
                            po.status === 'draft' ? 'outline' : 'warning'
                          } className="text-[9px] px-1 py-0 h-4 capitalize leading-none">
                            {po.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs px-4">
                          {formatCurrency(parseFloat(po.total ?? "0"))}
                        </TableCell>
                        <TableCell className="px-1">
                          <Link href={`/inventory/purchase-orders/${po.id}`}>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <FileText className="h-3 w-3" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm border-muted/40">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs font-bold uppercase tracking-wide">Contact Details</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Person</label>
                    <p className="text-xs font-semibold mt-0.5">{supplier.contact_person || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Phone</label>
                    <p className="text-xs font-semibold mt-0.5">{supplier.phone || "N/A"}</p>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Email</label>
                  <p className="text-xs font-semibold mt-0.5">{supplier.email || "N/A"}</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Website</label>
                  <div className="mt-0.5">
                    {supplier.website ? (
                      <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline font-semibold">
                        {supplier.website}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">N/A</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-muted/40">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs font-bold uppercase tracking-wide">Business & Terms</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Type</label>
                    <p className="text-xs font-semibold mt-0.5 capitalize">{supplier.supplier_type || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Tax ID</label>
                    <p className="text-xs font-semibold mt-0.5">{supplier.tax_id || "N/A"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Terms</label>
                    <p className="text-xs font-semibold mt-0.5">{supplier.payment_terms || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Credit</label>
                    <p className="text-xs font-semibold mt-0.5">{formatCurrency(parseFloat(supplier.credit_limit || "0"))}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 shadow-sm border-muted/40">
              <CardHeader className="py-2 px-4 border-b bg-muted/20">
                <CardTitle className="text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                  <MapPin className="h-3 w-3 text-primary" />
                  Address Details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-3">
                  <div className="col-span-1 p-4 border-r">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Billing</label>
                    <div className="mt-1.5 text-xs text-foreground leading-snug font-medium">
                      {supplier.address_line1 ? (
                        <>
                          <p>{supplier.address_line1}</p>
                          {supplier.address_line2 && <p>{supplier.address_line2}</p>}
                          <p>{[supplier.area, supplier.city, supplier.region].filter(Boolean).join(", ")}</p>
                          <p className="text-muted-foreground text-[10px]">{supplier.country}</p>
                        </>
                      ) : (
                        <p className="text-muted-foreground italic font-normal">No address recorded</p>
                      )}
                    </div>
                  </div>
                  <div className="col-span-1 p-4 border-r">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Shipping</label>
                    <div className="mt-1.5 text-xs text-foreground leading-snug font-medium">
                      <p className="text-muted-foreground italic font-normal">Same as billing</p>
                    </div>
                  </div>
                  <div className="col-span-1 p-4 bg-muted/5 flex items-center justify-center text-center">
                    <div className="flex flex-col items-center">
                      <Globe className="h-5 w-5 text-muted-foreground/30 mb-1" />
                      <p className="text-[9px] text-muted-foreground leading-tight">Branch-specific overrides can be configured in settings.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          <Card className="shadow-sm border-muted/40">
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                <FileText className="h-3 w-3 text-primary" />
                Special Notes & Internal Memos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {supplier.notes ? (
                <div className="bg-muted/10 p-4 rounded border border-muted/30">
                  <p className="text-xs leading-relaxed whitespace-pre-wrap font-medium">{supplier.notes}</p>
                </div>
              ) : (
                <div className="text-center py-10 opacity-60">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-3">No active notes for this supplier</p>
                  <Link href={`/inventory/suppliers/${id}/edit`}>
                    <Button variant="outline" size="sm" className="h-6 text-[9px] font-bold uppercase px-2">Add First Note</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
