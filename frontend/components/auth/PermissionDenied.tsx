"use client";

import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPermissionDeniedMessage } from "@/lib/api/errors";

interface PermissionDeniedProps {
  permission?: string;
  permissions?: string[];
  title?: string;
  description?: string;
}

export function PermissionDenied({
  title = "Access restricted",
  description,
}: PermissionDeniedProps) {
  return (
    <Card className="max-w-lg mx-auto mt-8 border-border shadow-sm">
      <CardContent className="pt-8 pb-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldOff className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {description ?? getPermissionDeniedMessage("view this page")}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
