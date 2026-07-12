"use client";

import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertCircle, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AxiosError } from "axios";
import { Controller } from "react-hook-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GHANA_REGIONS } from "@/lib/constants/ghana-regions";

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  supplier_code: z.string().min(1, "Supplier code is required"),
  supplier_type: z.enum(["manufacturer", "distributor", "wholesaler", "retailer", "other"]),
  contact_person: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  area: z.string().optional(),
  country: z.string().optional(),
  tax_id: z.string().optional(),
  payment_terms: z.string().optional(),
  credit_limit: z.string().optional(),
  is_active: z.boolean(),
  is_preferred: z.boolean(),
  notes: z.string().optional(),
});

type SupplierFormData = z.infer<typeof supplierSchema>;

const coerceSupplierType = (value: unknown): SupplierFormData["supplier_type"] => {
  switch (value) {
    case "manufacturer":
    case "distributor":
    case "wholesaler":
    case "retailer":
    case "other":
      return value;
    default:
      return "distributor";
  }
};

export default function EditSupplierPage() {
  const router = useRouter();
  const params = useParams();
  const id = parseInt(params.id as string, 10);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: supplier, isLoading } = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => inventoryApi.getSupplier(id),
    enabled: Number.isFinite(id),
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    setError,
    reset,
  } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      supplier_type: "distributor",
      is_active: true,
      is_preferred: false,
      country: "Ghana",
    },
  });

  useEffect(() => {
    if (!supplier) return;
    reset({
      name: supplier.name ?? "",
      supplier_code: supplier.supplier_code ?? "",
      supplier_type: coerceSupplierType(supplier.supplier_type),
      contact_person: supplier.contact_person ?? "",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      website: supplier.website ?? "",
      address_line1: supplier.address_line1 ?? "",
      address_line2: supplier.address_line2 ?? "",
      city: supplier.city ?? "",
      state: supplier.region ?? "",
      country: supplier.country ?? "Ghana",
      tax_id: supplier.tax_id ?? "",
      payment_terms: supplier.payment_terms ?? "",
      credit_limit:
        supplier.credit_limit === null || supplier.credit_limit === undefined
          ? ""
          : String(supplier.credit_limit),
      is_active: !!supplier.is_active,
      is_preferred: !!supplier.is_preferred,
      notes: supplier.notes ?? "",
    });
  }, [supplier, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: SupplierFormData) => inventoryApi.updateSupplier(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplier", id] });
      router.push(`/inventory/suppliers/${id}`);
    },

    onError: (error: unknown) => {
      console.error("Error updating supplier:", error);
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;

        Object.keys(errorData).forEach((field) => {
          const fieldError = Array.isArray(errorData[field])
            ? errorData[field][0]
            : errorData[field];
          setError(field as keyof SupplierFormData, {
            type: "server",
            message: fieldError,
          });
        });

        if (errorData.detail || errorData.non_field_errors) {
          setServerError(
            errorData.detail ||
            (Array.isArray(errorData.non_field_errors)
              ? errorData.non_field_errors[0]
              : errorData.non_field_errors) ||
            "Failed to update supplier"
          );
        }
      } else {
        setServerError("Failed to update supplier. Please try again.");
      }
    },
  });

  const onSubmit = async (data: SupplierFormData) => {
    setServerError(null);
    try {
      await updateMutation.mutateAsync(data);
    } catch {
      // handled in onError
    }
  };

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

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href={`/inventory/suppliers/${id}`}>
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Edit Supplier</h1>
          <p className="text-sm text-muted-foreground mt-1">Update supplier details</p>
        </div>
      </div>

      {serverError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Supplier Name *
                </label>
                <Input {...register("name")} placeholder="Supplier name" />
                {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Supplier Code *
                </label>
                <Input {...register("supplier_code")} placeholder="SUP-001" />
                {errors.supplier_code && (
                  <p className="text-destructive text-xs mt-1">{errors.supplier_code.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Supplier Type *
                </label>
                <select
                  {...register("supplier_type")}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                >
                  <option value="manufacturer">Manufacturer</option>
                  <option value="distributor">Distributor</option>
                  <option value="wholesaler">Wholesaler</option>
                  <option value="retailer">Retailer</option>
                  <option value="other">Other</option>
                </select>
                {errors.supplier_type && (
                  <p className="text-destructive text-xs mt-1">{errors.supplier_type.message}</p>
                )}
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    {...register("is_active")}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <label className="ml-2 text-sm text-foreground">Active</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    {...register("is_preferred")}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <label className="ml-2 text-sm text-foreground">Preferred</label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Contact Person
                </label>
                <Input {...register("contact_person")} placeholder="John Doe" />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Email
                </label>
                <Input type="email" {...register("email")} placeholder="supplier@example.com" />
                {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Phone
                </label>
                <Input {...register("phone")} placeholder="030 123 4567" />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Website
                </label>
                <Input type="url" {...register("website")} placeholder="https://www.example.com" />
                {errors.website && (
                  <p className="text-destructive text-xs mt-1">{errors.website.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Address Line 1
                </label>
                <Input {...register("address_line1")} placeholder="123 Main St" />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Address Line 2
                </label>
                <Input {...register("address_line2")} placeholder="Suite 100" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Region</label>
                  <Controller
                    name="region"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent>
                          {GHANA_REGIONS.map((region) => (
                            <SelectItem key={region} value={region}>
                              {region}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">City</label>
                  <Input {...register("city")} placeholder="e.g. Accra" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Area
                  </label>
                  <Input {...register("area")} placeholder="e.g. East Legon" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Country
                  </label>
                  <Input {...register("country")} placeholder="Ghana" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Business Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Tax ID / EIN
                </label>
                <Input {...register("tax_id")} placeholder="12-3456789" />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Payment Terms
                </label>
                <Input {...register("payment_terms")} placeholder="Net 30, COD, etc." />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Credit Limit
                </label>
                <Input type="number" step="0.01" {...register("credit_limit")} placeholder="0.00" />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Notes
                </label>
                <Textarea {...register("notes")} placeholder="Additional notes..." rows={4} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end space-x-4 mt-6">
          <Link href={`/inventory/suppliers/${id}`}>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting}>
            <Save className="w-4 h-4 mr-2" />
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

