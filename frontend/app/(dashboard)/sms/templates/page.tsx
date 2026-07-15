"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { TemplateManager } from "@/components/sms/TemplateManager";

export default function SMSTemplatesPage() {
  return (
    <PermissionPageGuard permission="send_notifications">
      <div className="w-full space-y-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            SMS Templates
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage reusable message templates for SMS communications
          </p>
        </div>
        <TemplateManager />
      </div>
    </PermissionPageGuard>
  );
}
