"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Link2, AlertTriangle, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuickBooksOnlineCard } from "@/components/integrations/QuickBooksOnlineCard";
import { QboSyncLogPanel } from "@/components/integrations/QboSyncLogPanel";
import { QboMappingIssuesPanel } from "@/components/integrations/QboMappingIssuesPanel";
import { useQboStatusNotifications } from "@/hooks/useQboStatusNotifications";

const QBO_TABS = [
  { id: "connection", label: "Connection", icon: Link2 },
  { id: "issues", label: "Sync issues", icon: AlertTriangle },
  { id: "logs", label: "Sync logs", icon: History },
] as const;

export type QboIntegrationsTab = (typeof QBO_TABS)[number]["id"];

export function QboIntegrationsSection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useQboStatusNotifications();
  const activeTab =
    (searchParams.get("qbo_tab") as QboIntegrationsTab | null) || "connection";

  const setTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("category", "accounting");
    params.set("qbo_tab", tab);
    router.push(`?${params.toString()}`);
  };

  return (
    <Tabs value={activeTab} onValueChange={setTab} className="space-y-4">
      <TabsList className="h-9">
        {QBO_TABS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1.5">
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="connection">
        <QuickBooksOnlineCard />
      </TabsContent>

      <TabsContent value="issues">
        <QboMappingIssuesPanel />
      </TabsContent>

      <TabsContent value="logs">
        <QboSyncLogPanel alwaysShow />
      </TabsContent>
    </Tabs>
  );
}
