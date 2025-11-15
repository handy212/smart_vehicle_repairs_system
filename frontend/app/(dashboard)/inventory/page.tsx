"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Package, AlertTriangle, Trash2, Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { exportToCSV } from "@/lib/utils/export";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["inventory", page, search],
    queryFn: () =>
      inventoryApi.list({
        page,
        search: search || undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast({ title: "Success", description: "Part deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete part",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (part: any) => {
    if (confirm(`Are you sure you want to delete part "${part.name}" (${part.part_number})? This action cannot be undone.`)) {
      deleteMutation.mutate(part.id);
    }
  };

  const handleExport = () => {
    if (!data?.results || data.results.length === 0) {
      toast({
        title: "No Data",
        description: "No parts to export",
        variant: "destructive",
      });
      return;
    }

    exportToCSV(
      data.results,
      "inventory",
      [
        { key: "part_number", label: "Part Number" },
        { key: "name", label: "Name" },
        { key: "category", label: "Category" },
        { key: "quantity_in_stock", label: "Stock" },
        { key: "minimum_stock", label: "Min Stock" },
        { key: "cost_price", label: "Cost Price" },
        { key: "selling_price", label: "Selling Price" },
        { key: "is_active", label: "Status" },
      ]
    );

    toast({ title: "Success", description: "Inventory exported successfully" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        Error loading inventory. Please try again.
      </div>
    );
  }

  const isLowStock = (part: any) => {
    return part.quantity_in_stock <= part.minimum_stock;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage parts and inventory
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleExport} disabled={!data?.results || data.results.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Link href="/inventory/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Part
            </Button>
          </Link>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search parts by name, part number, or description..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            All Parts ({data?.count || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.results && data.results.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Min Stock</TableHead>
                    <TableHead>Cost Price</TableHead>
                    <TableHead>Selling Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((part) => (
                    <TableRow key={part.id} className={isLowStock(part) ? "bg-red-50" : ""}>
                      <TableCell className="font-mono text-sm">
                        {part.part_number || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Package className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{part.name || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">
                        {typeof part.category === 'object' && part.category !== null 
                          ? part.category.name 
                          : part.category || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span className={isLowStock(part) ? "font-semibold text-red-600" : ""}>
                            {part.quantity_in_stock || 0}
                          </span>
                          {isLowStock(part) && (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{part.minimum_stock || 0}</TableCell>
                      <TableCell>
                        {part.cost_price ? `$${parseFloat(part.cost_price).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell>
                        {part.selling_price ? `$${parseFloat(part.selling_price).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={part.is_active ? "success" : "secondary"}>
                          {part.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Link
                            href={`/inventory/${part.id}`}
                            className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                          >
                            View
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(part)}
                            disabled={deleteMutation.isPending}
                            className="text-red-600 hover:text-red-900 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No parts found.</p>
              <Link href="/inventory/new">
                <Button className="mt-4" variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Part
                </Button>
              </Link>
            </div>
          )}

          {/* Pagination */}
          {data && data.count > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing page {page} of {Math.ceil(data.count / 10)}
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!data.previous}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!data.next}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

