"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { ApDueTab } from "./components/ApDueTab";
import { VendorBalancesTab } from "./components/VendorBalancesTab";
import { PurchaseReportsTab } from "./components/PurchaseReportsTab";

const VALID_TABS = ["due", "balances", "reports"] as const;
type PayablesTab = (typeof VALID_TABS)[number];

function parseTab(value: string | null): PayablesTab {
  if (value && VALID_TABS.includes(value as PayablesTab)) {
    return value as PayablesTab;
  }
  return "due";
}

export default function PayablesPage() {
  return (
    <PermissionPageGuard permission="view_billing">
      <Suspense fallback={null}>
        <PayablesContent />
      </Suspense>
    </PermissionPageGuard>
  );
}

function PayablesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const setTab = useCallback(
    (nextTab: string) => {
      router.replace(`/billing/payables?tab=${nextTab}`, { scroll: false });
    },
    [router]
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payables</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bills due, vendor balances, and purchase analytics.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="due">Bills Due</TabsTrigger>
          <TabsTrigger value="balances">Vendor Balances</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="due" className="mt-4">
          <ApDueTab />
        </TabsContent>
        <TabsContent value="balances" className="mt-4">
          <VendorBalancesTab />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <PurchaseReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
