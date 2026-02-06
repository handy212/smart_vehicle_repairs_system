"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ArrowLeft, Edit, Package, AlertTriangle, MapPin, Calendar, Clock, RotateCcw, Building2, User, Hash, FileText } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import StockAdjustmentDialog from "./components/StockAdjustmentDialog";
import { useState } from "react";
import Image from "next/image";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useBranchStore } from "@/store/branchStore";

export default function PartDetailPage() {
  const { formatCurrency } = useCurrency();
  const { activeBranch } = useBranchStore();
  const params = useParams();
  const router = useRouter();
  const partId = parseInt(params.id as string);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showImageModal, setShowImageModal] = useState(false);

  const { data: part, isLoading, error } = useQuery({
    queryKey: ["part", partId],
    queryFn: () => inventoryApi.get(partId),
  });

  const { data: transactions } = useQuery({
    queryKey: ["part-transactions", partId],
    queryFn: () => inventoryApi.getTransactions(partId),
    enabled: !!partId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !part) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">Error loading part. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStockStatus = () => {
    if (part.is_out_of_stock) return { variant: "danger" as const, text: "Out of Stock", icon: AlertTriangle };
    if (part.is_low_stock) return { variant: "warning" as const, text: "Low Stock", icon: AlertTriangle };
    return { variant: "success" as const, text: "In Stock", icon: Package };
  };

  const stockStatus = getStockStatus();

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="outline" size="icon" onClick={() => router.push('/inventory')} className="mt-1">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{part.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm font-mono text-muted-foreground bg-border px-2 py-0.5 rounded">
                {part.part_number}
              </p>
              <Badge variant={stockStatus.variant} className="h-6 gap-1">
                <stockStatus.icon className="w-3 h-3" />
                {stockStatus.text}
              </Badge>
              {!part.is_active && <Badge variant="secondary">Inactive</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowAdjustDialog(true)}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Adjust Stock
          </Button>
          <Link href={`/inventory/${partId}/edit`}>
            <Button>
              <Edit className="w-4 h-4 mr-2" />
              Edit Part
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Main Info) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-base font-medium">Overview</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Image */}
                <div className="flex-shrink-0">
                  {part.image ? (
                    <div
                      className="w-full md:w-48 aspect-square rounded-lg overflow-hidden border border-border relative cursor-pointer group"
                      onClick={() => setShowImageModal(true)}
                    >
                      <Image
                        src={part.image}
                        alt={part.name}
                        fill
                        className="object-contain bg-muted transition-transform group-hover:scale-105"
                        unoptimized={part.image?.startsWith("data:")}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 bg-black/60 text-white text-xs px-2 py-1 rounded">View</span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full md:w-48 aspect-square rounded-lg bg-border flex items-center justify-center border border-border">
                      <Package className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Category</p>
                      <p className="font-medium">{part.category_path || part.category_name || "Uncategorized"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Manufacturer</p>
                      <p className="font-medium">{part.manufacturer || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cost Price</p>
                      <p className="font-medium">{part.cost_price ? formatCurrency(parseFloat(part.cost_price)) : "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Selling Price</p>
                      <p className="font-medium text-lg text-primary">{part.selling_price ? formatCurrency(parseFloat(part.selling_price)) : "-"}</p>
                    </div>
                  </div>
                  {part.description && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1">Description</p>
                      <p className="text-sm text-card-foreground">{part.description}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs for detailed info */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Stock</TabsTrigger>
              <TabsTrigger value="details">Specs</TabsTrigger>
              <TabsTrigger value="compatibility">Vehicles</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            {/* Stock Tab */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              {activeBranch && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Building2 className="w-4 h-4" />
                  <span>Stock levels shown for: <strong className="text-foreground">{activeBranch.name}</strong></span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">In Stock</p>
                    <p className="text-3xl font-bold mt-1 text-primary">{part.quantity_in_stock || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">{part.unit || 'units'}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Reserved</p>
                    <p className="text-3xl font-bold mt-1 text-orange-500">{part.quantity_reserved || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">on work orders</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Available</p>
                    <p className="text-3xl font-bold mt-1 text-success">{part.available_quantity || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">to sell</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3 border-b border-border">
                  <CardTitle className="text-base font-medium">Inventory Rules</CardTitle>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Min Stock</p>
                    <p className="font-semibold">{part.minimum_stock || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reorder Point</p>
                    <p className="font-semibold">{part.reorder_point || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reorder Qty</p>
                    <p className="font-semibold">{part.reorder_quantity || 0}</p>
                  </div>
                  {part.bin_location && (
                    <div className="col-span-3 pt-2 text-sm flex items-center">
                      <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                      Location: <span className="font-medium ml-1">{part.bin_location}</span>
                      {part.shelf && <span className="text-muted-foreground ml-2">(Shelf {part.shelf})</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Specs Tab */}
            <TabsContent value="details" className="mt-4">
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-4">Physical Specifications</h3>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <p className="text-xs text-muted-foreground">Weight</p>
                      <p className="text-sm">{part.weight ? `${parseFloat(part.weight)} lbs` : '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Dimensions</p>
                      <p className="text-sm">{part.dimensions || '-'}</p>
                    </div>
                  </div>

                  <h3 className="text-sm font-medium mb-4 pt-4 border-t border-border">Configuration</h3>
                  <div className="flex flex-wrap gap-2">
                    {part.is_taxable && <Badge variant="outline">Taxable</Badge>}
                    {part.is_core && <Badge variant="outline">Core Part</Badge>}
                    {part.is_active ? <Badge variant="outline" className="border-green-200 text-green-700">Active</Badge> : <Badge variant="outline" className="border-red-200 text-red-700">Inactive</Badge>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Compatibility Tab */}
            <TabsContent value="compatibility" className="mt-4">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Compatible Makes</p>
                    <p className="text-sm">{part.compatible_makes || "Universal / Not specified"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Compatible Models</p>
                    <p className="text-sm">{part.compatible_models || "Not specified"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Year Range</p>
                    <p className="text-sm">{part.compatible_years || "All years"}</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="mt-4">
              <Card className="border-none shadow-none bg-transparent">
                <CardContent className="p-0">
                  <div className="rounded-lg border border-border overflow-hidden bg-card shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/50 text-gray-500 font-semibold uppercase tracking-wider border-b border-border">
                          <tr>
                            <th className="px-4 py-2.5 font-bold">Event</th>
                            <th className="px-4 py-2.5">Reference</th>
                            <th className="px-4 py-2.5 text-right">Change</th>
                            <th className="px-4 py-2.5 text-right">Balance</th>
                            <th className="px-4 py-2.5">User</th>
                            <th className="px-4 py-2.5">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {transactions?.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground bg-gray-50/20">
                                <div className="flex flex-col items-center justify-center opacity-40">
                                  <RotateCcw className="w-8 h-8 mb-2" />
                                  <p>No transaction history found.</p>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            transactions?.map((txn) => {
                              const isPositive = txn.quantity > 0;
                              const getBadgeColor = (type: string) => {
                                switch (type.toLowerCase()) {
                                  case 'adjustment': return 'bg-info/10 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800';
                                  case 'purchase':
                                  case 'receive':
                                  case 'return': return 'bg-success/10 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
                                  case 'sale':
                                  case 'use':
                                  case 'damage':
                                  case 'adjustment_out': return 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
                                  default: return 'bg-gray-50 text-gray-700 border-gray-100 dark:bg-gray-800 dark:text-gray-400 border-border';
                                }
                              };

                              return (
                                <tr key={txn.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                  <td className="px-4 py-3">
                                    <div className="flex flex-col gap-1">
                                      <Badge variant="outline" className={`w-fit text-[10px] h-4 px-1.5 font-medium border uppercase ${getBadgeColor(txn.transaction_type)}`}>
                                        {txn.transaction_type.replace('_', ' ')}
                                      </Badge>
                                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {format(new Date(txn.created_at), "MMM dd, HH:mm")}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    {txn.reference_number ? (
                                      <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <Hash className="w-3 h-3 opacity-60" />
                                        <span className="font-mono text-[11px] font-medium tracking-tight bg-muted px-1.5 py-0.5 rounded border border-gray-100 border-border">
                                          {txn.reference_number}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-gray-300 dark:text-gray-600">—</span>
                                    )}
                                  </td>
                                  <td className={`px-4 py-3 text-right font-bold text-sm ${isPositive ? 'text-success' : 'text-red-600 dark:text-red-400'}`}>
                                    <div className="flex flex-col items-end">
                                      <span>{isPositive ? '+' : ''}{txn.quantity}</span>
                                      <span className="text-[9px] font-normal uppercase opacity-60">{part.unit || 'units'}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className="font-medium text-foreground">{txn.balance_after}</span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5 text-gray-500">
                                      <div className="w-5 h-5 rounded-full bg-border flex items-center justify-center">
                                        <User className="w-3 h-3 opacity-60" />
                                      </div>
                                      <span className="text-[11px] truncate max-w-[80px]">{txn.created_by_name?.split(' ')[0] || 'System'}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 min-w-[150px]">
                                    <div className="flex items-start gap-1.5 italic text-gray-500 leading-tight">
                                      <FileText className="w-3 h-3 mt-0.5 shrink-0 opacity-40" />
                                      <span className="text-[10px] line-clamp-2" title={txn.reason || txn.notes}>
                                        {txn.reason || txn.notes || 'No description provided'}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column (Sidebar) */}
        <div className="space-y-6">
          {/* Value Card */}
          <Card className="bg-primary/5 border-primary/10">
            <CardContent className="p-6">
              <p className="text-sm font-medium text-muted-foreground">Total Value</p>
              <p className="text-2xl font-bold text-primary">{part.total_value ? formatCurrency(parseFloat(part.total_value)) : "$0.00"}</p>
              <p className="text-xs text-muted-foreground mt-1">Based on cost price</p>
            </CardContent>
          </Card>

          {/* Supplier Info */}
          <Card>
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-base font-medium">Supplier Info</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Preferred Supplier</p>
                <p className="font-medium text-sm text-primary">{part.preferred_supplier_name || "None Set"}</p>
              </div>
              {part.manufacturer_part_number && (
                <div>
                  <p className="text-xs text-muted-foreground">Mfr Part #</p>
                  <p className="text-sm font-mono">{part.manufacturer_part_number}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timestamps */}
          <div className="space-y-2 px-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Created</span>
              <span>{part.created_at ? format(new Date(part.created_at), "MMM dd, yyyy") : "-"}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Last Updated</span>
              <span>{part.updated_at ? format(new Date(part.updated_at), "MMM dd, yyyy") : "-"}</span>
            </div>
          </div>

        </div>
      </div>

      {/* Images Modal */}
      <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black/95 border-none">
          <div className="relative w-full h-[80vh] flex items-center justify-center">
            {part.image && (
              <Image
                src={part.image}
                alt={part.name}
                fill
                className="object-contain"
                unoptimized={part.image?.startsWith("data:")}
              />
            )}
            <button
              onClick={() => setShowImageModal(false)}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white rounded-full p-2"
            >
              <span className="sr-only">Close</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {showAdjustDialog && (
        <StockAdjustmentDialog
          part={part}
          open={showAdjustDialog}
          onClose={() => setShowAdjustDialog(false)}
          onSuccess={() => {
            setShowAdjustDialog(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
