"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  ShieldCheck, 
  MessageSquare, 
  Calculator,
  Save
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useMemo } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { QuickBooksOnlineCard } from "@/components/integrations/QuickBooksOnlineCard";
import { IntegrationField } from "@/components/integrations/IntegrationField";
import {
  fieldPrefixForKey,
  isHubtelSmsSetting,
  sortHubtelSmsSettings,
} from "@/lib/integrations/fieldLabels";
import { cn } from "@/lib/utils/cn";
import { getUserFacingError } from "@/lib/api/errors";

const CATEGORIES = [
  { id: "accounting", label: "Accounting", icon: Calculator },
  { id: "communication", label: "Communication", icon: MessageSquare },
  { id: "security", label: "Security", icon: ShieldCheck },
];

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("manage_settings");

  const activeCategory = searchParams.get("category") || "accounting";
  const [showSecret, setShowSecret] = useState<Record<number, boolean>>({});

  const handleCategoryChange = (catId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("category", catId);
    router.push(`?${params.toString()}`);
  };

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ["admin", "settings", "integrations-multi"],
    queryFn: async () => {
        const [integrations, sms] = await Promise.all([
            adminApi.settings.list({ category: "integration" }),
            adminApi.settings.list({ category: "sms" })
        ]);
        return {
            results: [...(integrations?.results || []), ...(sms?.results || [])]
        };
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SystemSetting> }) =>
      adminApi.settings.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "integrations-multi"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "integrations", "public"] });
      toast({ title: "Success", description: "Integration updated" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Update failed"),
        variant: "destructive",
      });
    },
  });
  const bulkUpdateMutation = useMutation({
    mutationFn: (payload: Array<{ id: number; value: string }>) => adminApi.settings.bulkUpdate(payload),
    onSuccess: () => {
      setRowEdits({});
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "integrations-multi"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "integrations", "public"] });
      toast({ title: "Saved", description: "Integration settings updated" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to update integrations"),
        variant: "destructive",
      });
    },
  });

  const settings = useMemo(() => settingsData?.results || [], [settingsData?.results]);

  const filteredSettings = useMemo(() => {
    let base = settings.filter(s => {
      if (activeCategory === "accounting") {
        return s.key.startsWith("quickbooks_");
      }
      if (activeCategory === "communication") {
        return s.category === "sms" || s.key.startsWith("firebase_") || s.key.startsWith("hubtel_");
      }
      if (activeCategory === "security") {
        return s.key.startsWith("recaptcha_");
      }
      return s.category === activeCategory;
    });

    return base;
  }, [settings, activeCategory]);

  const [rowEdits, setRowEdits] = useState<Record<number, string>>({});

  const groupedSettings = useMemo(() => {
    const groups: Record<string, { label: string; settings: SystemSetting[]; prefix: string }> = {};
    
    filteredSettings.forEach(s => {
      let provider = "General";
      let prefix = "";

      if (isHubtelSmsSetting(s)) {
        provider = "Hubtel SMS";
        prefix = "";
      } else if (s.key.startsWith("firebase_")) {
        provider = "Firebase";
        prefix = "firebase_";
      } else if (s.key.startsWith("recaptcha_")) {
        provider = "Recaptcha";
        prefix = "recaptcha_";
      } else if (s.key.startsWith("quickbooks_")) {
        provider = "QuickBooks Online";
        prefix = "quickbooks_";
      } else if (/(google_analytics|facebook_pixel|google_tag_manager|gtm|pixel)/i.test(s.key)) {
        provider = "Analytics & Tracking";
        prefix = "";
      }

      if (!groups[provider]) {
        groups[provider] = { label: provider, settings: [], prefix };
      }
      groups[provider].settings.push(s);
    });

    if (groups["Hubtel SMS"]) {
      groups["Hubtel SMS"].settings = sortHubtelSmsSettings(groups["Hubtel SMS"].settings);
    }

    return groups;
  }, [filteredSettings]);

  const dirtyCount = Object.keys(rowEdits).length;

  const handleSaveAll = () => {
    const payload = Object.entries(rowEdits).map(([id, value]) => ({ id: Number(id), value }));
    bulkUpdateMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background min-h-screen">
      {/* Header Area */}
      <div className="border-b bg-card px-4 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8 shrink-0 -ml-2">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-foreground">Integrations</h1>
                <p className="text-xs text-muted-foreground">Connected service credentials and toggles</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8"
                disabled={!canManage || dirtyCount === 0 || bulkUpdateMutation.isPending}
                onClick={handleSaveAll}
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save Changes{dirtyCount ? ` (${dirtyCount})` : ""}
              </Button>
            </div>
          </div>

          {/* Local Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? "default" : "ghost"}
                size="sm"
                onClick={() => handleCategoryChange(cat.id)}
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-medium transition-all whitespace-nowrap",
                  activeCategory === cat.id 
                    ? "bg-primary text-white shadow-sm" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <cat.icon className="h-3.5 w-3.5 mr-1.5" />
                {cat.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full p-4">
        {/* Content Area */}
        <main className="space-y-4">
          {/* Featured/Special Cards */}
          {activeCategory === "accounting" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <QuickBooksOnlineCard />
                </div>
              </div>
          )}

          {/* Grouped Settings Sections */}
          {Object.keys(groupedSettings).length > 0 ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {Object.entries(groupedSettings).map(([provider, group]) => (
                <div key={provider} className="space-y-3">
                  <div className="flex items-center gap-3 px-1">
                    <h2 className="text-xs font-semibold text-muted-foreground">{group.label}</h2>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  
                  <Card className="border border-border/60 shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
                    <CardContent className="p-0 divide-y divide-border/30">
                      {group.settings.map(s => (
                        <div key={s.id} className="px-3">
                          <IntegrationField 
                            setting={s}
                            value={rowEdits[s.id] ?? (s.value || "")}
                            isSecret={s.is_secret}
                            showSecret={!!showSecret[s.id]}
                            onToggleSecret={() => setShowSecret(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                            onChange={(val) => setRowEdits(prev => ({ ...prev, [s.id]: val }))}
                            onSave={() => undefined}
                            onDiscard={() => setRowEdits(prev => {
                              const next = { ...prev };
                              delete next[s.id];
                              return next;
                            })}
                            onToggleActive={(active) => updateMutation.mutate({ id: s.id, data: { is_active: active } })}
                            canManage={canManage}
                            isPending={updateMutation.isPending}
                            prefix={group.prefix || fieldPrefixForKey(s.key)}
                            deferSave
                          />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          ) : (activeCategory !== "accounting") && (
            <div className="flex flex-col items-center justify-center py-16 bg-muted/10 rounded-md border border-dashed border-border">
                <p className="text-muted-foreground font-bold text-sm">No connected services found in this category.</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Try another category tab above.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
