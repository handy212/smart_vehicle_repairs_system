"use client";

import { ReactNode } from "react";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { ShieldAlert } from "lucide-react";

/**
 * Layout-level permission gate for /admin/* routes.
 * Requires 'manage_settings' permission (or admin role via PermissionGuard).
 * Prevents non-admin staff from accessing admin pages even if
 * individual pages forget to add their own PermissionGuard.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <PermissionGuard
            permission="manage_settings"
            fallback={
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
                    <ShieldAlert className="w-16 h-16 text-destructive/60" />
                    <h2 className="text-2xl font-bold text-foreground">Access Denied</h2>
                    <p className="text-muted-foreground max-w-md">
                        You don&apos;t have permission to access the admin area.
                        Contact your administrator if you believe this is an error.
                    </p>
                </div>
            }
        >
            {children}
        </PermissionGuard>
    );
}
