"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { ReactNode } from "react";
import {
  ProductServiceType,
  getProductServiceTypeOption,
  productServiceTypeLabel,
} from "./product-service-types";

interface ProductServiceCreateLayoutProps {
  productType: ProductServiceType;
  children: ReactNode;
  backHref?: string;
  error?: string | null;
  actions?: ReactNode;
}

export function ProductServiceCreateLayout({
  productType,
  children,
  backHref = "/inventory",
  error,
  actions,
}: ProductServiceCreateLayoutProps) {
  const typeOption = getProductServiceTypeOption(productType);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 sm:gap-4">
          <Link href={backHref}>
            <Button variant="ghost" size="sm" className="mt-0.5">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Product/Service information
              </h1>
              <Badge variant="secondary" className="text-xs font-medium">
                {productServiceTypeLabel(productType)}
              </Badge>
            </div>
            {typeOption && (
              <p className="text-sm text-muted-foreground max-w-2xl">{typeOption.description}</p>
            )}
          </div>
        </div>
        {actions}
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {children}
    </div>
  );
}
