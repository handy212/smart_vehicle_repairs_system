"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { TemplateManager } from "@/components/sms/TemplateManager";
import { Button } from "@/components/ui/button";

export default function SMSTemplatesPage() {
  return (
    <PermissionPageGuard permission="send_notifications">
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mb-1 h-8 px-2 text-muted-foreground hover:text-foreground"
              asChild
            >
              <Link href="/sms">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to Compose
              </Link>
            </Button>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Templates
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Reusable SMS drafts for reminders, pickups, and follow-ups
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-9 shrink-0" asChild>
            <Link href="/sms">Compose</Link>
          </Button>
        </div>
        <TemplateManager />
      </div>
    </PermissionPageGuard>
  );
}
