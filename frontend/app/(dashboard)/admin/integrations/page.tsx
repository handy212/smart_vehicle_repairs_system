"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Puzzle, 
  ShieldCheck, 
  BarChart3, 
  MessageSquare, 
  Calculator,
  LayoutGrid,
  Search,
  Settings2
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useMemo } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { QuickBooksOnlineCard } from "@/components/integrations/QuickBooksOnlineCard";
import { IntegrationField } from "@/components/integrations/IntegrationField";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";

const CATEGORIES = [
  { id: "accounting", label: "Accounting", icon: Calculator },
  { id: "communication", label: "Communication", icon: MessageSquare },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "analytics", label: "Analytics & Marketing", icon: BarChart3 },
  { id: "advanced", label: "Advanced Props", icon: Settings2 },
];

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("manage_settings");

  const activeCategory = searchParams.get("category") || "accounting";
  const [searchQuery, setSearchQuery] = useState("");
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
      toast({ title: "Success", description: "Integration updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Update failed",
        variant: "destructive",
      });
    },
  });

  const settings = settingsData?.results || [];

  const filteredSettings = useMemo(() => {
    let base = settings;
    
    // Filter by category
    if (activeCategory === "accounting") {
        return []; // QBO is handled by a special card
    } else if (activeCategory === "security") {
        base = settings.filter(s => s.key.startsWith("recaptcha_"));
    } else if (activeCategory === "analytics") {
        base = settings.filter(s => /(google_analytics|facebook_pixel|google_tag_manager|gtm|pixel)/i.test(s.key));
    } else if (activeCategory === "communication") {
        base = settings.filter(s => 
            s.key.startsWith("firebase_") || 
            s.category === "sms" ||
            s.key.includes("sms") ||
            s.key.includes("twilio")
        );
    } else if (activeCategory === "advanced") {
        base = settings.filter(s => 
            !s.key.startsWith("recaptcha_") && 
            !s.key.startsWith("firebase_") && 
            !/(google_analytics|facebook_pixel|google_tag_manager|gtm|pixel)/i.test(s.key) &&
            !s.key.startsWith("quickbooks_") &&
            s.category !== "sms" &&
            !s.key.includes("twilio")
        );
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      base = base.filter(s => 
        (s.display_name || s.key).toLowerCase().includes(q) || 
        s.description?.toLowerCase().includes(q)
      );
    }

    return base;
  }, [settings, activeCategory, searchQuery]);

  const [rowEdits, setRowEdits] = useState<Record<number, string>>({});

  const groupedSettings = useMemo(() => {
    const groups: Record<string, { label: string; settings: SystemSetting[]; prefix: string }> = {};
    
    filteredSettings.forEach(s => {
      let provider = "General";
      let prefix = "";
      
      if (s.key.startsWith("firebase_")) {
        provider = "Firebase";
        prefix = "firebase_";
      } else if (s.key.startsWith("hubtel_")) {
        provider = "Hubtel";
        prefix = "hubtel_";
      } else if (s.key.startsWith("recaptcha_")) {
        provider = "Recaptcha";
        prefix = "recaptcha_";
      } else if (/(google_analytics|facebook_pixel|google_tag_manager|gtm|pixel)/i.test(s.key)) {
        provider = "Analytics & Tracking";
        prefix = ""; // Keep full labels for mixing
      } else if (s.category === "sms") {
        provider = "SMS Integration";
        prefix = "sms_";
      }
      
      if (!groups[provider]) {
        groups[provider] = { label: provider, settings: [], prefix };
      }
      groups[provider].settings.push(s);
    });
    
    return groups;
  }, [filteredSettings]);

  const handleSave = async (setting: SystemSetting) => {
    const value = rowEdits[setting.id];
    if (value === undefined) return;
    try {
      await updateMutation.mutateAsync({ id: setting.id, data: { value } });
      setRowEdits(prev => {
        const next = { ...prev };
        delete next[setting.id];
        return next;
      });
    } catch (e) { /* handled */ }
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
      <div className="border-b bg-card pt-6 pb-2 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0 -ml-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2 text-primary font-bold mb-1">
                  <Puzzle className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-widest">Integrations Dashboard</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">Connected Services</h1>
              </div>
            </div>
            
            <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Search integrations..." 
                    className="pl-9 h-10 bg-muted/50 border-border focus:bg-card transition-all text-xs"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
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
                  "h-8 rounded-full px-4 text-xs font-bold transition-all whitespace-nowrap",
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

      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8">
        {/* Content Area */}
        <main className="space-y-8">
          {/* Featured/Special Cards */}
          {activeCategory === "accounting" && !searchQuery && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <QuickBooksOnlineCard />
                {/* Future: Xero, Sage, etc. */}
                <Card className="border-dashed border-2 flex flex-col items-center justify-center p-8 bg-muted/20 opacity-60">
                    <LayoutGrid className="h-8 w-8 text-muted-foreground mb-3" />
                    <p className="text-sm font-bold text-muted-foreground">More accounting coming soon</p>
                </Card>
              </div>
          )}

          {/* Grouped Settings Sections */}
          {Object.keys(groupedSettings).length > 0 ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {Object.entries(groupedSettings).map(([provider, group]) => (
                <div key={provider} className="space-y-3">
                  <div className="flex items-center gap-3 px-1">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80">{group.label}</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent" />
                  </div>
                  
                  <Card className="border border-border/60 shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
                    <CardContent className="p-0 divide-y divide-border/30">
                      {group.settings.map(s => (
                        <div key={s.id} className="px-6">
                          <IntegrationField 
                            setting={s}
                            value={rowEdits[s.id] ?? (s.value || "")}
                            isSecret={s.is_secret}
                            showSecret={!!showSecret[s.id]}
                            onToggleSecret={() => setShowSecret(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                            onChange={(val) => setRowEdits(prev => ({ ...prev, [s.id]: val }))}
                            onSave={() => handleSave(s)}
                            onDiscard={() => setRowEdits(prev => {
                              const next = { ...prev };
                              delete next[s.id];
                              return next;
                            })}
                            onToggleActive={(active) => updateMutation.mutate({ id: s.id, data: { is_active: active } })}
                            canManage={canManage}
                            isPending={updateMutation.isPending}
                            prefix={group.prefix}
                          />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          ) : (activeCategory !== "accounting") && (
            <div className="flex flex-col items-center justify-center py-24 bg-muted/10 rounded-[2rem] border-2 border-dashed border-border/40">
                <div className="p-4 rounded-full bg-muted/20 mb-4">
                  <Puzzle className="h-8 w-8 text-muted-foreground/20" />
                </div>
                <p className="text-muted-foreground font-bold text-sm">No connected services found in this category.</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Try adjusting your filters or search query.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
