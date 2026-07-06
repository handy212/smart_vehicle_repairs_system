"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckInWizard } from "@/components/check-in/CheckInWizard";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PERMISSIONS } from "@/lib/utils/permissions";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { INTAKE_FORM_CLASS } from "@/lib/constants/layout";

export default function CheckInPage() {
  return (
    <PermissionPageGuard permission={PERMISSIONS.CREATE_WORKORDERS}>
      <DynamicPageTitle title="Vehicle Check-in" />
      <div className={`${INTAKE_FORM_CLASS} space-y-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" aria-label="Back to dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Vehicle Check-in</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Walk-in intake: customer, vehicle, and work order in one flow.
              </p>
            </div>
          </div>
        </div>
        <CheckInWizard />
      </div>
    </PermissionPageGuard>
  );
}
