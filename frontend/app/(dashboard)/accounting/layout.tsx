"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function AccountingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PermissionPageGuard
      permission="view_accounting"
      deniedTitle="Accounting access required"
      deniedDescription="You don't have permission to access accounting. Contact your administrator if you believe this is an error."
    >
      <div className="flex flex-col h-full">{children}</div>
    </PermissionPageGuard>
  );
}
