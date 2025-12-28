"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ArrowLeft, Edit, Package, AlertTriangle, DollarSign, MapPin, Wrench, FileText, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import StockAdjustmentDialog from "./components/StockAdjustmentDialog";
import { useState } from "react";
import Image from "next/image";

export default function PartDetailPage() {
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !part) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Error loading part. Please try again.</p>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="secondary" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{part.name}</h1>
            <p className="text-sm text-gray-500 mt-1 font-mono">{part.part_number}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="secondary" onClick={() => setShowAdjustDialog(true)}>
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

      {/* Status Badges */}
      <div className="flex items-center space-x-2">
        <Badge variant={stockStatus.variant} className="text-sm px-3 py-1">
          <stockStatus.icon className="w-3 h-3 mr-1" />
          {stockStatus.text}
        </Badge>
        <Badge variant={part.is_active ? "success" : "secondary"} className="text-sm px-3 py-1">
          {part.is_active ? "Active" : "Inactive"}
        </Badge>
        {part.is_taxable && (
          <Badge variant="default" className="text-sm px-3 py-1">
            Taxable
          </Badge>
        )}
        {part.is_core && (
          <Badge variant="warning" className="text-sm px-3 py-1">
            Core Part
          </Badge>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-3">
          {/* Tabs for organized sections */}
          <Card>
            <CardContent className="p-0">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="border-b border-gray-200 dark:border-gray-700 px-6 pt-4">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="inventory">Inventory</TabsTrigger>
                    <TabsTrigger value="pricing">Pricing</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="overview" className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Left Column - Part Image */}
                    {part.image && (
                      <div className="flex-shrink-0">
                        <div
                          className="w-40 cursor-pointer"
                          onClick={() => setShowImageModal(true)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && setShowImageModal(true)}
                        >
                          <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
                            <Image
                              src={part.image}
                              alt={part.name}
                              fill
                              className="object-cover"
                              sizes="160px"
                              unoptimized={
                                part.image?.startsWith("http://localhost") ||
                                part.image?.startsWith("https://localhost")
                              }
                            />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">Click to enlarge</p>
                        </div>
                      </div>
                    )}

                    {/* Right Column - Part Information */}
                    <div className="flex-1 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Part Number</p>
                          <p className="text-sm font-mono text-gray-900 dark:text-gray-100">{part.part_number}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Category</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">{part.category_path || part.category_name || "-"}</p>
                        </div>
                      </div>
                      {part.description && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{part.description}</p>
                        </div>
                      )}
                      {(part.manufacturer || part.manufacturer_part_number) && (
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                          {part.manufacturer && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Manufacturer</p>
                              <p className="text-sm text-gray-900 dark:text-gray-100">{part.manufacturer}</p>
                            </div>
                          )}
                          {part.manufacturer_part_number && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Mfr Part #</p>
                              <p className="text-sm font-mono text-gray-900 dark:text-gray-100">{part.manufacturer_part_number}</p>
                            </div>
                          )}
                        </div>
                      )}
                      {part.branch_name && (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Branch</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">{part.branch_name}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="inventory" className="p-6 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-600/50 p-4 rounded-lg">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">In Stock</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{part.quantity_in_stock || 0}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{part.unit || "piece"}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-600/50 p-4 rounded-lg">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Available</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{part.available_quantity || part.quantity_in_stock || 0}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{part.unit || "piece"}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-600/50 p-4 rounded-lg">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Reserved</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{part.quantity_reserved || 0}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{part.unit || "piece"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Reorder Point</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{part.reorder_point || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Minimum Stock</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{part.minimum_stock || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Reorder Quantity</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{part.reorder_quantity || 0}</p>
                    </div>
                  </div>
                  {part.bin_location && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                        <MapPin className="w-3 h-3 mr-1" />
                        Location
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{part.bin_location}{part.shelf ? ` - Shelf: ${part.shelf}` : ""}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="pricing" className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cost Price</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {part.cost_price ? `$${parseFloat(part.cost_price).toFixed(2)}` : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Selling Price</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {part.selling_price ? `$${parseFloat(part.selling_price).toFixed(2)}` : "-"}
                      </p>
                    </div>
                  </div>
                  {(part.markup_percentage || part.profit_margin) && (
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                      {part.markup_percentage && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Markup</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">{parseFloat(part.markup_percentage).toFixed(2)}%</p>
                        </div>
                      )}
                      {part.profit_margin && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Profit Margin</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">{parseFloat(part.profit_margin).toFixed(2)}%</p>
                        </div>
                      )}
                    </div>
                  )}
                  {part.total_value && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Inventory Value</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        ${parseFloat(part.total_value).toFixed(2)}
                      </p>
                    </div>
                  )}
                  {part.list_price && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">List Price (MSRP)</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        ${parseFloat(part.list_price).toFixed(2)}
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="details" className="p-6 space-y-4">
                  {(part.weight || part.dimensions) && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Specifications</p>
                      <div className="grid grid-cols-2 gap-4">
                        {part.weight && (
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Weight</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100">{parseFloat(part.weight).toFixed(2)} lbs</p>
                          </div>
                        )}
                        {part.dimensions && (
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Dimensions</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100">{part.dimensions}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(part.compatible_makes || part.compatible_models || part.compatible_years) && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Vehicle Compatibility</p>
                      <div className="space-y-2">
                        {part.compatible_makes && (
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Makes</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100">{part.compatible_makes}</p>
                          </div>
                        )}
                        {part.compatible_models && (
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Models</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100">{part.compatible_models}</p>
                          </div>
                        )}
                        {part.compatible_years && (
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Years</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100">{part.compatible_years}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {part.warranty_months && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Warranty</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{part.warranty_months} months</p>
                      {part.warranty_notes && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400">Notes</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{part.warranty_notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="p-6">
                  <div className="rounded-md border">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 font-medium">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3 text-right">Quantity</th>
                          <th className="px-4 py-3 text-right">Balance</th>
                          <th className="px-4 py-3">User</th>
                          <th className="px-4 py-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {transactions?.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                              No transactions found.
                            </td>
                          </tr>
                        ) : (
                          transactions?.map((txn) => (
                            <tr key={txn.id}>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {format(new Date(txn.created_at), "MMM dd, yyyy HH:mm")}
                              </td>
                              <td className="px-4 py-3 capitalize">
                                {txn.transaction_type.replace('_', ' ')}
                              </td>
                              <td className={`px-4 py-3 text-right font-medium ${txn.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {txn.quantity > 0 ? '+' : ''}{txn.quantity}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {txn.balance_after}
                              </td>
                              <td className="px-4 py-3">
                                {txn.created_by_name || '-'}
                              </td>
                              <td className="px-4 py-3 text-gray-500">
                                {txn.reason || txn.notes || '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <Button className="w-full" variant="secondary" size="sm" onClick={() => setShowAdjustDialog(true)}>
                Adjust Stock
              </Button>
              <Link href={`/inventory/${partId}/edit`} className="block">
                <Button className="w-full" variant="secondary" size="sm">
                  <Edit className="w-3 h-3 mr-1.5" />
                  Edit Part
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Supplier Information */}
          {part.preferred_supplier_name && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Supplier</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-gray-900 dark:text-gray-100">{part.preferred_supplier_name}</p>
              </CardContent>
            </Card>
          )}

          {/* Part Information */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Info</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {part.created_at && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Created</p>
                  <p className="text-xs text-gray-900 dark:text-gray-100">
                    {format(new Date(part.created_at), "MMM dd, yyyy")}
                  </p>
                </div>
              )}
              {part.updated_at && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Updated</p>
                  <p className="text-xs text-gray-900 dark:text-gray-100">
                    {format(new Date(part.updated_at), "MMM dd, yyyy")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Image Dialog */}
      {part.image && (
        <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
          <DialogContent className="!max-w-[60vw] !w-[60vw] !h-[60vh] !p-0 !mx-0 max-h-[60vh]">
            <div className="relative w-full h-full min-h-0 rounded-lg overflow-hidden bg-black flex items-center justify-center">
              <Image
                src={part.image}
                alt={part.name}
                fill
                className="object-contain"
                sizes="60vw"
                priority
                unoptimized={
                  part.image?.startsWith("http://localhost") ||
                  part.image?.startsWith("https://localhost")
                }
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showAdjustDialog && (
        <StockAdjustmentDialog
          part={part}
          open={showAdjustDialog}
          onClose={() => setShowAdjustDialog(false)}
          onSuccess={() => {
            setShowAdjustDialog(false);
            // Refresh data
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

