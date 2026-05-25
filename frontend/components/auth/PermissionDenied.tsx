"use client";

import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PermissionDeniedProps {
  permission?: string;
  permissions?: string[];
  title?: string;
  description?: string;
}

function formatPermissionLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export function PermissionDenied({
  permission,
  permissions,
  title = "Access restricted",
  description,
}: PermissionDeniedProps) {
  const required = permissions?.length
    ? permissions.map(formatPermissionLabel).join(", ")
    : permission
      ? formatPermissionLabel(permission)
      : "the required permission";

  return (
    <Card className="max-w-lg mx-auto mt-8 border-border shadow-sm">
      <CardContent className="pt-8 pb-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldOff className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {description ??
              `You don't have permission to view this page. Required: ${required}. Contact your administrator if you need access.`}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
