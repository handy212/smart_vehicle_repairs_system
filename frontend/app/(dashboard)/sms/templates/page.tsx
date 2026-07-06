"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { TemplateManager } from "@/components/sms/TemplateManager";
import { useTheme } from "@/lib/hooks/useTheme";

export default function SMSTemplatesPage() {
  const { theme: activeTheme } = useTheme();
  const isPerfex = activeTheme.startsWith("perfex");

  return (
    <PermissionPageGuard permission="send_notifications">
      <div className={isPerfex ? "space-y-4 p-4" : "space-y-6 p-4 sm:p-6 max-w-[1600px] mx-auto"}>
        <div>
          <h1 className={isPerfex ? "text-base font-semibold text-foreground" : "text-2xl font-bold text-foreground tracking-tight"}>
            SMS Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage reusable message templates for SMS communications
          </p>
        </div>
        <TemplateManager />
      </div>
    </PermissionPageGuard>
  );
}
