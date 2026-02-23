"use client";

import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowLeft, Edit, Building2, Mail, Phone, MapPin, Globe } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useCurrency } from "@/lib/hooks/useCurrency";
export default function SupplierDetailPage() {
    const { formatCurrency } = useCurrency();
  const params = useParams();
  const id = parseInt(params.id as string);

  const { data: supplier, isLoading } = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => inventoryApi.getSupplier(id),
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
          <Button className="mt-4"variant="secondary">
            Back to Suppliers
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/inventory/suppliers">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{supplier.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">Supplier Details</p>
          </div>
        </div>
        <Link href={`/inventory/suppliers/${id}/edit`}>
          <Button>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Supplier Code</label>
              <p className="text-lg font-mono">{supplier.supplier_code}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Type</label>
              <div className="mt-1">
                <Badge variant="secondary">{supplier.supplier_type || "N/A"}</Badge>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <div className="mt-1">
                  <Badge variant={supplier.is_active ? "success" : "secondary"}>
                    {supplier.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
              {supplier.is_preferred && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Preferred</label>
                  <div className="mt-1">
                    <Badge variant="success">Yes</Badge>
                  </div>
                </div>
              )}
            </div>
            {supplier.parts_count !== undefined && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Parts Count</label>
                <p className="text-lg">{supplier.parts_count}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {supplier.contact_person && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Contact Person</label>
                <p className="text-lg">{supplier.contact_person}</p>
              </div>
            )}
            {supplier.email && (
              <div>
                <label className="text-sm font-medium text-muted-foreground flex items-center">
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </label>
                <p className="text-lg">{supplier.email}</p>
              </div>
            )}
            {supplier.phone && (
              <div>
                <label className="text-sm font-medium text-muted-foreground flex items-center">
                  <Phone className="w-4 h-4 mr-2" />
                  Phone
                </label>
                <p className="text-lg">{supplier.phone}</p>
              </div>
            )}
            {supplier.fax && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Fax</label>
                <p className="text-lg">{supplier.fax}</p>
              </div>
            )}
            {supplier.website && (
              <div>
                <label className="text-sm font-medium text-muted-foreground flex items-center">
                  <Globe className="w-4 h-4 mr-2" />
                  Website
                </label>
                <a
                  href={supplier.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-orange-800"
                >
                  {supplier.website}
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Address */}
        {(supplier.address_line1 || supplier.city) && (
          <Card>
            <CardHeader>
              <CardTitle>Address</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {supplier.address_line1 && <p>{supplier.address_line1}</p>}
                {supplier.address_line2 && <p>{supplier.address_line2}</p>}
                {(supplier.city || supplier.state || supplier.postal_code) && (
                  <p>
                    {[supplier.city, supplier.state, supplier.postal_code]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                {supplier.country && <p>{supplier.country}</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Business Details */}
        <Card>
          <CardHeader>
            <CardTitle>Business Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {supplier.tax_id && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Tax ID / EIN</label>
                <p className="text-lg">{supplier.tax_id}</p>
              </div>
            )}
            {supplier.payment_terms && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Payment Terms</label>
                <p className="text-lg">{supplier.payment_terms}</p>
              </div>
            )}
            {supplier.credit_limit && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Credit Limit</label>
                <p className="text-lg">{formatCurrency(parseFloat(supplier.credit_limit))}</p>
              </div>
            )}
            {supplier.notes && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Notes</label>
                <p className="text-sm text-foreground whitespace-pre-wrap">{supplier.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

