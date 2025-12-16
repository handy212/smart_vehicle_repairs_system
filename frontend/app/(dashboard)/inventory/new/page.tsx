"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, Part } from "@/lib/api/inventory";
import { branchesApi } from "@/lib/api/branches";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, AlertCircle, Image as ImageIcon, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import Image from "next/image";

const partSchema = z.object({
  part_number: z.string().min(1, "Part number is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  category: z.number().min(1, "Category is required"),
  branch: z.number().optional(),
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
  list_price: z.number().min(0).optional(),
  bin_location: z.string().optional(),
  shelf: z.string().optional(),
  weight: z.number().min(0).optional(),
  dimensions: z.string().optional(),
  compatible_makes: z.string().optional(),
  compatible_models: z.string().optional(),
  compatible_years: z.string().optional(),
  warranty_months: z.number().min(0).optional(),
  warranty_notes: z.string().optional(),
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("basic");

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

  const { data: branchesResponse } = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesApi.list(),
  });

  const branches = Array.isArray(branchesResponse)
    ? branchesResponse
    : branchesResponse?.results || [];

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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const createMutation = useMutation({
    mutationFn: (data: FormData | Partial<Part>) => {
      return inventoryApi.create(data);
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
    try {
      if (imageFile) {
        const formData = new FormData();
        Object.keys(data).forEach((key) => {
          const value = data[key as keyof PartFormData];
          if (value !== undefined && value !== null) {
            formData.append(key, value.toString());
          }
        });
        formData.append('image', imageFile);
        await createMutation.mutateAsync(formData);
      } else {
        // Transform data to match API expectations (convert numbers to strings for financial fields)
        const apiData: Partial<Part> = {
          ...data,
          cost_price: data.cost_price?.toString(),
          selling_price: data.selling_price?.toString(),
          list_price: data.list_price?.toString(),
          weight: data.weight?.toString(),
          markup_percentage: data.markup_percentage?.toString(),
          core_charge: data.core_charge?.toString(),
        };
        await createMutation.mutateAsync(apiData);
      }
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/inventory">
          <Button variant="secondary">
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-3">
            {/* Part Image - Compact */}
            <Card className="mb-4">
              <CardContent className="pt-4">
                <div className="flex items-center gap-4">
                  {imagePreview ? (
                    <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex-shrink-0">
                      <Image
                        src={imagePreview}
                        alt="Part preview"
                        fill
                        className="object-cover"
                        unoptimized={imagePreview?.startsWith('data:')}
                      />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute -top-1 -right-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full p-1 shadow-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="relative w-24 h-24 cursor-pointer group flex-shrink-0">
                      <div className="flex flex-col items-center justify-center w-full h-full border-2 border-gray-200 dark:border-gray-700 border-dashed rounded-lg bg-gray-50 dark:bg-gray-900/20 group-hover:bg-gray-100 dark:group-hover:bg-gray-900/40 transition-colors">
                        <ImageIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleImageChange}
                      />
                    </label>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Part Image</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {imagePreview ? "Click image to change" : "Click to upload part image (optional)"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs for organized sections */}
            <Card>
              <CardContent className="p-0">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className="border-b border-gray-200 dark:border-gray-700 px-6 pt-4">
                    <TabsList>
                      <TabsTrigger value="basic">Basic Info</TabsTrigger>
                      <TabsTrigger value="inventory">Inventory</TabsTrigger>
                      <TabsTrigger value="pricing">Pricing</TabsTrigger>
                      <TabsTrigger value="additional">Additional</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="basic" className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                        <label htmlFor="part_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
                        <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Description
                  </label>
                  <Textarea
                    id="description"
                    {...register("description")}
                        rows={2}
                    placeholder="Detailed description of the part..."
                  />
                </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="branch" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Branch
                        </label>
                        <Select
                          id="branch"
                          {...register("branch", { valueAsNumber: true })}
                        >
                          <option value="">Any Branch</option>
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                  <div>
                        <label htmlFor="manufacturer" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Manufacturer
                    </label>
                    <Input
                      id="manufacturer"
                      {...register("manufacturer")}
                      placeholder="ACME Parts"
                    />
                  </div>
                  <div>
                        <label htmlFor="manufacturer_part_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Mfr Part #
                    </label>
                    <Input
                      id="manufacturer_part_number"
                      {...register("manufacturer_part_number")}
                      placeholder="MPN-12345"
                    />
                  </div>
                </div>
                  </TabsContent>

                  <TabsContent value="inventory" className="p-6 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                  <div>
                        <label htmlFor="quantity_in_stock" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
                        <label htmlFor="unit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
                      <div>
                        <label htmlFor="maximum_stock" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Max Stock
                        </label>
                        <Input
                          id="maximum_stock"
                          type="number"
                          {...register("maximum_stock", { valueAsNumber: true })}
                          min={0}
                          placeholder="Optional"
                        />
                      </div>
                </div>

                    <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div>
                        <label htmlFor="minimum_stock" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
                        <label htmlFor="reorder_point" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
                        <label htmlFor="reorder_quantity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <div>
                        <label htmlFor="bin_location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Bin Location
                        </label>
                        <Input
                          id="bin_location"
                          {...register("bin_location")}
                          placeholder="A-12"
                        />
                      </div>
                      <div>
                        <label htmlFor="shelf" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Shelf
                        </label>
                        <Input
                          id="shelf"
                          {...register("shelf")}
                          placeholder="Shelf 3"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="pricing" className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                        <label htmlFor="cost_price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
                        <label htmlFor="markup_percentage" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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

                    <div className="grid grid-cols-2 gap-4">
                <div>
                        <label htmlFor="selling_price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
                            Calculated: ${calculatedSellingPrice.toFixed(2)}
                    </p>
                  )}
                  {errors.selling_price && (
                    <p className="mt-1 text-sm text-red-600">{errors.selling_price.message}</p>
                  )}
                </div>
                      <div>
                        <label htmlFor="list_price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          List Price (MSRP)
                        </label>
                        <Input
                          id="list_price"
                          type="number"
                          step="0.01"
                          {...register("list_price", { valueAsNumber: true })}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="additional" className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                        <label htmlFor="weight" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Weight (lbs)
                        </label>
                        <Input
                          id="weight"
                          type="number"
                          step="0.01"
                          {...register("weight", { valueAsNumber: true })}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label htmlFor="dimensions" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Dimensions (L x W x H)
                        </label>
                        <Input
                          id="dimensions"
                          {...register("dimensions")}
                          placeholder="e.g., 10x5x3"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Vehicle Compatibility</p>
                      <div className="space-y-3">
                        <div>
                          <label htmlFor="compatible_makes" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Compatible Makes
                          </label>
                          <Input
                            id="compatible_makes"
                            {...register("compatible_makes")}
                            placeholder="Toyota, Honda, Ford"
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor="compatible_models" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Compatible Models
                    </label>
                    <Input
                            id="compatible_models"
                            {...register("compatible_models")}
                            placeholder="Camry, Accord, F-150"
                            className="text-sm"
                    />
                  </div>
                  <div>
                          <label htmlFor="compatible_years" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Compatible Years
                          </label>
                          <Input
                            id="compatible_years"
                            {...register("compatible_years")}
                            placeholder="2015-2023"
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Warranty</p>
                      <div className="space-y-3">
                        <div>
                          <label htmlFor="warranty_months" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Warranty Period (months)
                    </label>
                    <Input
                            id="warranty_months"
                            type="number"
                            {...register("warranty_months", { valueAsNumber: true })}
                            placeholder="12"
                            min={0}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor="warranty_notes" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Warranty Notes
                          </label>
                          <Textarea
                            id="warranty_notes"
                            {...register("warranty_notes")}
                            rows={2}
                            placeholder="Additional warranty information..."
                            className="text-sm"
                    />
                  </div>
                </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Supplier */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Supplier</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
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
              </CardContent>
            </Card>

            {/* Status & Flags */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register("is_active")}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register("is_taxable")}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Taxable</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    {...register("is_core")}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Core Part</span>
                </label>
                {watch("is_core") && (
                  <div className="pt-1">
                    <label htmlFor="core_charge" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Core Charge
                    </label>
                    <Input
                      id="core_charge"
                      type="number"
                      step="0.01"
                      {...register("core_charge", { valueAsNumber: true })}
                      placeholder="0.00"
                      className="text-sm"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardContent className="pt-4 space-y-2">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Part"}
                </Button>
                <Link href="/inventory">
                  <Button type="button" variant="secondary" className="w-full">
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

