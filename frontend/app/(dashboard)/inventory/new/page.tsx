"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";

const partSchema = z.object({
  part_number: z.string().min(1, "Part number is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  category: z.number().min(1, "Category is required"),
  manufacturer: z.string().optional(),
  manufacturer_part_number: z.string().optional(),
  preferred_supplier: z.number().optional(),
  quantity_in_stock: z.number().min(0),
  reorder_point: z.number().min(0),
  reorder_quantity: z.number().min(0),
  minimum_stock: z.number().min(0),
  maximum_stock: z.number().min(0).optional(),
  unit: z.enum(["piece", "set", "pair", "gallon", "quart", "liter", "bottle", "can", "box", "package", "roll", "foot", "meter", "other"]),
  cost_price: z.number().min(0.01, "Cost price must be greater than 0").optional(),
  selling_price: z.number().min(0.01, "Selling price must be greater than 0").optional(),
  markup_percentage: z.number().min(0).optional(),
  bin_location: z.string().optional(),
  shelf: z.string().optional(),
  is_active: z.boolean(),
  is_taxable: z.boolean(),
  is_core: z.boolean(),
  core_charge: z.number().min(0).optional(),
});

type PartFormData = z.infer<typeof partSchema>;

export default function NewPartPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  // Fetch categories and suppliers
  const { data: categories = [] } = useQuery({
    queryKey: ["part-categories"],
    queryFn: () => inventoryApi.listCategories(),
  });

  const { data: suppliersResponse } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => inventoryApi.listSuppliers(),
  });
  
  const suppliers = Array.isArray(suppliersResponse) 
    ? suppliersResponse 
    : suppliersResponse?.results || [];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    watch,
  } = useForm<PartFormData>({
    resolver: zodResolver(partSchema),
    defaultValues: {
      quantity_in_stock: 0,
      reorder_point: 10,
      reorder_quantity: 20,
      minimum_stock: 5,
      unit: "piece",
      markup_percentage: 0,
      is_active: true,
      is_taxable: true,
      is_core: false,
      core_charge: 0,
    },
  });

  const costPrice = watch("cost_price");
  const markup = watch("markup_percentage") || 0;
  const calculatedSellingPrice = costPrice ? costPrice * (1 + markup / 100) : undefined;

  const createMutation = useMutation({
    mutationFn: (data: PartFormData) => {
      // Transform data to match API expectations (convert numbers to strings for financial fields)
      const apiData: any = {
        ...data,
        cost_price: data.cost_price?.toString(),
        selling_price: data.selling_price?.toString(),
        core_charge: data.core_charge?.toString(),
      };
      return inventoryApi.create(apiData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      router.push("/inventory");
    },
    onError: (error) => {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        Object.keys(errorData).forEach((field) => {
          if (field !== "non_field_errors" && field !== "detail") {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            setError(field as keyof PartFormData, {
              type: "server",
              message: fieldError,
            });
          }
        });
        if (errorData.non_field_errors) {
          setServerError(
            Array.isArray(errorData.non_field_errors)
              ? errorData.non_field_errors[0]
              : errorData.non_field_errors
          );
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        } else {
          setServerError("An error occurred while creating the part. Please check the form and try again.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    },
  });

  const onSubmit = async (data: PartFormData) => {
    setServerError(null);
    await createMutation.mutateAsync(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/inventory">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Part</h1>
          <p className="text-sm text-gray-500 mt-1">Add a new part to inventory</p>
        </div>
      </div>

      {serverError && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">{serverError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>Part identification and description</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="part_number" className="block text-sm font-medium text-gray-700 mb-1">
                      Part Number *
                    </label>
                    <Input
                      id="part_number"
                      {...register("part_number")}
                      className={errors.part_number ? "border-red-500" : ""}
                      placeholder="PART-001"
                    />
                    {errors.part_number && (
                      <p className="mt-1 text-sm text-red-600">{errors.part_number.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                      Category *
                    </label>
                    <Select
                      id="category"
                      {...register("category", { valueAsNumber: true })}
                      className={errors.category ? "border-red-500" : ""}
                    >
                      <option value="">Select a category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.full_path || cat.name}
                        </option>
                      ))}
                    </Select>
                    {errors.category && (
                      <p className="mt-1 text-sm text-red-600">{errors.category.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Part Name *
                  </label>
                  <Input
                    id="name"
                    {...register("name")}
                    className={errors.name ? "border-red-500" : ""}
                    placeholder="Brake Pad Set"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <Textarea
                    id="description"
                    {...register("description")}
                    rows={3}
                    placeholder="Detailed description of the part..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="manufacturer" className="block text-sm font-medium text-gray-700 mb-1">
                      Manufacturer
                    </label>
                    <Input
                      id="manufacturer"
                      {...register("manufacturer")}
                      placeholder="ACME Parts"
                    />
                  </div>
                  <div>
                    <label htmlFor="manufacturer_part_number" className="block text-sm font-medium text-gray-700 mb-1">
                      Manufacturer Part #
                    </label>
                    <Input
                      id="manufacturer_part_number"
                      {...register("manufacturer_part_number")}
                      placeholder="MPN-12345"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Inventory */}
            <Card>
              <CardHeader>
                <CardTitle>Inventory</CardTitle>
                <CardDescription>Stock levels and reorder settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="quantity_in_stock" className="block text-sm font-medium text-gray-700 mb-1">
                      Initial Stock
                    </label>
                    <Input
                      id="quantity_in_stock"
                      type="number"
                      {...register("quantity_in_stock", { valueAsNumber: true })}
                      min={0}
                    />
                  </div>
                  <div>
                    <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-1">
                      Unit *
                    </label>
                    <Select id="unit" {...register("unit")}>
                      <option value="piece">Piece</option>
                      <option value="set">Set</option>
                      <option value="pair">Pair</option>
                      <option value="gallon">Gallon</option>
                      <option value="quart">Quart</option>
                      <option value="liter">Liter</option>
                      <option value="bottle">Bottle</option>
                      <option value="can">Can</option>
                      <option value="box">Box</option>
                      <option value="package">Package</option>
                      <option value="roll">Roll</option>
                      <option value="foot">Foot</option>
                      <option value="meter">Meter</option>
                      <option value="other">Other</option>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="minimum_stock" className="block text-sm font-medium text-gray-700 mb-1">
                      Minimum Stock
                    </label>
                    <Input
                      id="minimum_stock"
                      type="number"
                      {...register("minimum_stock", { valueAsNumber: true })}
                      min={0}
                    />
                  </div>
                  <div>
                    <label htmlFor="reorder_point" className="block text-sm font-medium text-gray-700 mb-1">
                      Reorder Point
                    </label>
                    <Input
                      id="reorder_point"
                      type="number"
                      {...register("reorder_point", { valueAsNumber: true })}
                      min={0}
                    />
                  </div>
                  <div>
                    <label htmlFor="reorder_quantity" className="block text-sm font-medium text-gray-700 mb-1">
                      Reorder Quantity
                    </label>
                    <Input
                      id="reorder_quantity"
                      type="number"
                      {...register("reorder_quantity", { valueAsNumber: true })}
                      min={0}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pricing */}
            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
                <CardDescription>Cost and selling prices</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="cost_price" className="block text-sm font-medium text-gray-700 mb-1">
                      Cost Price
                    </label>
                    <Input
                      id="cost_price"
                      type="number"
                      step="0.01"
                      {...register("cost_price", { valueAsNumber: true })}
                      placeholder="0.00"
                    />
                    {errors.cost_price && (
                      <p className="mt-1 text-sm text-red-600">{errors.cost_price.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="markup_percentage" className="block text-sm font-medium text-gray-700 mb-1">
                      Markup %
                    </label>
                    <Input
                      id="markup_percentage"
                      type="number"
                      step="0.1"
                      {...register("markup_percentage", { valueAsNumber: true })}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="selling_price" className="block text-sm font-medium text-gray-700 mb-1">
                    Selling Price
                  </label>
                  <Input
                    id="selling_price"
                    type="number"
                    step="0.01"
                    {...register("selling_price", { valueAsNumber: true })}
                    placeholder="0.00"
                  />
                  {calculatedSellingPrice && (
                    <p className="mt-1 text-xs text-gray-500">
                      Calculated from cost + markup: ${calculatedSellingPrice.toFixed(2)}
                    </p>
                  )}
                  {errors.selling_price && (
                    <p className="mt-1 text-sm text-red-600">{errors.selling_price.message}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Location */}
            <Card>
              <CardHeader>
                <CardTitle>Location</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="bin_location" className="block text-sm font-medium text-gray-700 mb-1">
                      Bin Location
                    </label>
                    <Input
                      id="bin_location"
                      {...register("bin_location")}
                      placeholder="A-12"
                    />
                  </div>
                  <div>
                    <label htmlFor="shelf" className="block text-sm font-medium text-gray-700 mb-1">
                      Shelf
                    </label>
                    <Input
                      id="shelf"
                      {...register("shelf")}
                      placeholder="Shelf 3"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Supplier */}
            <Card>
              <CardHeader>
                <CardTitle>Supplier</CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <label htmlFor="preferred_supplier" className="block text-sm font-medium text-gray-700 mb-1">
                    Preferred Supplier
                  </label>
                  <Select
                    id="preferred_supplier"
                    {...register("preferred_supplier", { valueAsNumber: true })}
                  >
                    <option value="">None</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name} ({supplier.supplier_code})
                      </option>
                    ))}
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Status & Flags */}
            <Card>
              <CardHeader>
                <CardTitle>Status & Flags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register("is_active")}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register("is_taxable")}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Taxable</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register("is_core")}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Core Part (Requires Exchange)</span>
                </label>
                {watch("is_core") && (
                  <div>
                    <label htmlFor="core_charge" className="block text-sm font-medium text-gray-700 mb-1">
                      Core Charge
                    </label>
                    <Input
                      id="core_charge"
                      type="number"
                      step="0.01"
                      {...register("core_charge", { valueAsNumber: true })}
                      placeholder="0.00"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Part"}
                </Button>
                <Link href="/inventory">
                  <Button type="button" variant="outline" className="w-full">
                    Cancel
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

