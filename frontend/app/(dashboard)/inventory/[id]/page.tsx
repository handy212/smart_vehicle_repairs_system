"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Package, AlertTriangle, DollarSign, MapPin, Wrench, FileText } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import StockAdjustmentDialog from "./components/StockAdjustmentDialog";
import { useState } from "react";

export default function PartDetailPage() {
  const params = useParams();
  const router = useRouter();
  const partId = parseInt(params.id as string);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);

  const { data: part, isLoading, error } = useQuery({
    queryKey: ["part", partId],
    queryFn: () => inventoryApi.get(partId),
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
        <Button variant="outline" onClick={() => router.back()}>
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
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{part.name}</h1>
            <p className="text-sm text-gray-500 mt-1 font-mono">{part.part_number}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => setShowAdjustDialog(true)}>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Part Number</p>
                  <p className="text-gray-900 font-mono">{part.part_number}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Category</p>
                  <p className="text-gray-900">{part.category_path || part.category_name || "-"}</p>
                </div>
              </div>
              {part.description && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Description</p>
                  <p className="text-gray-900 whitespace-pre-wrap">{part.description}</p>
                </div>
              )}
              {(part.manufacturer || part.manufacturer_part_number) && (
                <div className="grid grid-cols-2 gap-4">
                  {part.manufacturer && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Manufacturer</p>
                      <p className="text-gray-900">{part.manufacturer}</p>
                    </div>
                  )}
                  {part.manufacturer_part_number && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Manufacturer Part #</p>
                      <p className="text-gray-900 font-mono">{part.manufacturer_part_number}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inventory Information */}
          <Card>
            <CardHeader>
              <CardTitle>Inventory Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">In Stock</p>
                  <p className="text-2xl font-bold text-gray-900">{part.quantity_in_stock || 0}</p>
                  <p className="text-xs text-gray-500">{part.unit || "piece"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Available</p>
                  <p className="text-2xl font-bold text-gray-900">{part.available_quantity || part.quantity_in_stock || 0}</p>
                  <p className="text-xs text-gray-500">{part.unit || "piece"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Reserved</p>
                  <p className="text-2xl font-bold text-gray-900">{part.quantity_reserved || 0}</p>
                  <p className="text-xs text-gray-500">{part.unit || "piece"}</p>
                </div>
              </div>
              <div className="border-t pt-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Reorder Point</p>
                  <p className="text-lg font-semibold text-gray-900">{part.reorder_point || 0}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Minimum Stock</p>
                  <p className="text-lg font-semibold text-gray-900">{part.minimum_stock || 0}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Reorder Quantity</p>
                  <p className="text-lg font-semibold text-gray-900">{part.reorder_quantity || 0}</p>
                </div>
              </div>
              {part.bin_location && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-500 flex items-center">
                    <MapPin className="w-4 h-4 mr-2" />
                    Location
                  </p>
                  <p className="text-gray-900">{part.bin_location}{part.shelf ? ` - Shelf: ${part.shelf}` : ""}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Cost Price</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {part.cost_price ? `$${parseFloat(part.cost_price).toFixed(2)}` : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Selling Price</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {part.selling_price ? `$${parseFloat(part.selling_price).toFixed(2)}` : "-"}
                  </p>
                </div>
              </div>
              {part.markup_percentage && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Markup</p>
                  <p className="text-gray-900">{parseFloat(part.markup_percentage).toFixed(2)}%</p>
                </div>
              )}
              {part.profit_margin && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Profit Margin</p>
                  <p className="text-gray-900">{parseFloat(part.profit_margin).toFixed(2)}%</p>
                </div>
              )}
              {part.total_value && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-500">Total Inventory Value</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${parseFloat(part.total_value).toFixed(2)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Compatibility */}
          {(part.compatible_makes || part.compatible_models || part.compatible_years) && (
            <Card>
              <CardHeader>
                <CardTitle>Vehicle Compatibility</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {part.compatible_makes && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">Makes</p>
                    <p className="text-gray-900">{part.compatible_makes}</p>
                  </div>
                )}
                {part.compatible_models && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">Models</p>
                    <p className="text-gray-900">{part.compatible_models}</p>
                  </div>
                )}
                {part.compatible_years && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">Years</p>
                    <p className="text-gray-900">{part.compatible_years}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Warranty */}
          {part.warranty_months && (
            <Card>
              <CardHeader>
                <CardTitle>Warranty</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-gray-500">Warranty Period</p>
                <p className="text-gray-900">{part.warranty_months} months</p>
                {part.warranty_notes && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-gray-500">Warranty Notes</p>
                    <p className="text-gray-900 whitespace-pre-wrap">{part.warranty_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" variant="outline" onClick={() => setShowAdjustDialog(true)}>
                Adjust Stock
              </Button>
              <Link href={`/inventory/${partId}/edit`} className="block">
                <Button className="w-full" variant="outline">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Part
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Supplier Information */}
          {part.preferred_supplier_name && (
            <Card>
              <CardHeader>
                <CardTitle>Preferred Supplier</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-gray-900">{part.preferred_supplier_name}</p>
              </CardContent>
            </Card>
          )}

          {/* Part Information */}
          <Card>
            <CardHeader>
              <CardTitle>Part Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {part.created_at && (
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="text-sm">
                    {format(new Date(part.created_at), "MMM dd, yyyy 'at' h:mm a")}
                  </p>
                </div>
              )}
              {part.updated_at && (
                <div>
                  <p className="text-xs text-gray-500">Last Updated</p>
                  <p className="text-sm">
                    {format(new Date(part.updated_at), "MMM dd, yyyy 'at' h:mm a")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

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

