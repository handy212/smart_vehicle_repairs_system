"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { OverviewTab } from "./components/OverviewTab";
import { CustomerBalancesTab } from "./components/CustomerBalancesTab";
import { OverdueTab } from "./components/OverdueTab";

const VALID_TABS = ["overview", "balances", "overdue"] as const;
type ReceivablesTab = (typeof VALID_TABS)[number];

function parseTab(value: string | null): ReceivablesTab {
  if (value && VALID_TABS.includes(value as ReceivablesTab)) {
    return value as ReceivablesTab;
  }
  return "overview";
}

export default function ReceivablesPage() {
  return (
    <PermissionPageGuard permission="view_billing">
      <Suspense fallback={null}>
        <ReceivablesContent />
      </Suspense>
    </PermissionPageGuard>
  );
}

function ReceivablesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const setTab = useCallback(
    (nextTab: string) => {
      router.replace(`/billing/receivables?tab=${nextTab}`, { scroll: false });
    },
    [router]
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receivables</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open balances, overdue invoices, aging, and revenue snapshot.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="balances">Customer Balances</TabsTrigger>
          <TabsTrigger value="overdue">Overdue &amp; Aging</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="balances" className="mt-4">
          <CustomerBalancesTab />
        </TabsContent>
        <TabsContent value="overdue" className="mt-4">
          <OverdueTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
