"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { QboIntegrationsSection } from "@/components/integrations/QboIntegrationsSection";
import { IntegrationField } from "@/components/integrations/IntegrationField";
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_PRODUCTS,
  type IntegrationCategoryId,
  productsForCategory,
  settingsForProduct,
} from "@/lib/integrations/catalog";
import { fieldPrefixForKey, isBooleanIntegrationSetting } from "@/lib/integrations/fieldLabels";
import { cn } from "@/lib/utils/cn";
import { getUserFacingError } from "@/lib/api/errors";

function isTruthySetting(value: string) {
  return ["true", "1", "yes", "on"].includes(value.toLowerCase().trim());
}

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("manage_settings");

  const activeCategory =
    (searchParams.get("category") as IntegrationCategoryId) || "accounting";
  const selectedMeta =
    INTEGRATION_CATEGORIES.find((c) => c.id === activeCategory) ||
    INTEGRATION_CATEGORIES[0];

  const [rowEdits, setRowEdits] = useState<Record<number, string>>({});
  const [showSecret, setShowSecret] = useState<Record<number, boolean>>({});

  const handleCategoryChange = (catId: IntegrationCategoryId) => {
    if (catId === activeCategory) return;
    const dirty = Object.keys(rowEdits).length;
    if (dirty > 0) {
      const discard = window.confirm(
        `You have ${dirty} unsaved change${dirty === 1 ? "" : "s"}. Discard them and switch tabs?`
      );
      if (!discard) return;
      setRowEdits({});
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("category", catId);
    params.delete("provider");
    if (catId !== "accounting") params.delete("qbo_tab");
    router.push(`?${params.toString()}`);
  };

  const { data: settingsData, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "settings", "integrations-multi"],
    queryFn: async () => {
      const [integrations, sms] = await Promise.all([
        adminApi.settings.list({ category: "integration" }),
        adminApi.settings.list({ category: "sms" }),
      ]);
      return {
        results: [...(integrations?.results || []), ...(sms?.results || [])],
      };
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: (payload: Array<{ id: number; value: string }>) =>
      adminApi.settings.bulkUpdate(payload),
    onSuccess: () => {
      setRowEdits({});
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "integrations-multi"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "integrations", "public"] });
      toast({ title: "Saved", description: "Integration settings updated" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(err, "Failed to update integrations"),
        variant: "destructive",
      });
    },
  });

  const settings = useMemo(() => settingsData?.results || [], [settingsData?.results]);
  const settingsByKey = useMemo(
    () => Object.fromEntries(settings.map((s) => [s.key, s])),
    [settings]
  );

  const products = useMemo(
    () => productsForCategory(activeCategory).filter((p) => !p.custom),
    [activeCategory]
  );

  const dirtyCount = Object.keys(rowEdits).length;

  const valueFor = (setting: SystemSetting) =>
    rowEdits[setting.id] ?? setting.value ?? "";

  const updateValue = (setting: SystemSetting, value: string) => {
    setRowEdits((prev) => {
      const next = { ...prev };
      if (value === (setting.value ?? "")) delete next[setting.id];
      else next[setting.id] = value;
      return next;
    });
  };

  const discardValue = (setting: SystemSetting) => {
    setRowEdits((prev) => {
      const next = { ...prev };
      delete next[setting.id];
      return next;
    });
  };

  const handleSaveAll = () => {
    bulkUpdateMutation.mutate(
      Object.entries(rowEdits).map(([id, value]) => ({ id: Number(id), value }))
    );
  };

  const discardAll = () => setRowEdits({});

  const renderFields = (keys: string[]) => {
    const rows = keys
      .map((key) => settingsByKey[key])
      .filter((s): s is SystemSetting => Boolean(s));

    if (!rows.length) return null;

    const allToggles = rows.every((s) => isBooleanIntegrationSetting(s.key));

    return (
      <div className={cn("grid sm:grid-cols-2", allToggles ? "gap-2.5" : "gap-4")}>
        {rows.map((setting) => {
          const wide =
            setting.key.includes("signature") ||
            setting.key.includes("credentials_path") ||
            setting.key.includes("api_url");

          return (
            <div key={setting.id} className={cn(wide && "sm:col-span-2")}>
              <IntegrationField
                setting={setting}
                value={valueFor(setting)}
                isSecret={setting.is_secret}
                showSecret={!!showSecret[setting.id]}
                onToggleSecret={() =>
                  setShowSecret((prev) => ({
                    ...prev,
                    [setting.id]: !prev[setting.id],
                  }))
                }
                onChange={(val) => updateValue(setting, val)}
                onSave={() => undefined}
                onDiscard={() => discardValue(setting)}
                onToggleActive={() => undefined}
                canManage={canManage}
                isPending={bulkUpdateMutation.isPending}
                prefix={fieldPrefixForKey(setting.key)}
                deferSave
                compact={allToggles}
              />
            </div>
          );
        })}
      </div>
    );
  };

  // Accounting is QuickBooks (live API), not settings fields — don't block the shell on settings.
  if (isLoading && activeCategory !== "accounting") {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const CategoryIcon = selectedMeta.icon;

  return (
    <div className="min-h-screen bg-muted/20 pb-20 sm:pb-6">
      <div className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="h-9 w-9 shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">Integrations</h1>
              <p className="truncate text-xs text-muted-foreground">
                {selectedMeta.description}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {dirtyCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="hidden h-9 sm:inline-flex"
                onClick={discardAll}
                disabled={bulkUpdateMutation.isPending}
              >
                Discard
              </Button>
            ) : null}
            <Button
              size="sm"
              className="h-9"
              disabled={!canManage || dirtyCount === 0 || bulkUpdateMutation.isPending}
              onClick={handleSaveAll}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {bulkUpdateMutation.isPending
                ? "Saving…"
                : dirtyCount
                  ? `Save (${dirtyCount})`
                  : "Save"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full gap-6 px-4 py-6 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-[4.25rem] lg:self-start">
          <nav
            className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:rounded-xl lg:border lg:border-border/80 lg:bg-background lg:p-2 lg:shadow-sm"
            aria-label="Integration categories"
          >
            {INTEGRATION_CATEGORIES.map((category) => {
              const selected = activeCategory === category.id;
              const CatIcon = category.icon;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleCategoryChange(category.id)}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground shadow-sm lg:bg-primary/10 lg:text-primary lg:shadow-none"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <CatIcon className="h-4 w-4 shrink-0 opacity-80" />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 space-y-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 hidden h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
              <CategoryIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">{selectedMeta.label}</h2>
                {isFetching && !isLoading ? (
                  <span className="text-xs text-muted-foreground">Refreshing…</span>
                ) : dirtyCount > 0 ? (
                  <Badge variant="secondary" className="text-[11px]">
                    {dirtyCount} unsaved
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{selectedMeta.description}</p>
            </div>
          </div>

          {isError ? (
            <Card className="border-destructive/30 shadow-none">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="text-sm text-destructive">
                  {getUserFacingError(error, "Failed to load integrations")}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {activeCategory === "accounting" ? <QboIntegrationsSection /> : null}

          {activeCategory !== "accounting" &&
            products.map((product) => {
              const productSettings = settingsForProduct(product, settings);
              if (!productSettings.length) return null;
              const Icon = product.icon;

              const smsEnabledSetting = settingsByKey.sms_enabled;
              const smsProviderSetting = settingsByKey.sms_provider;
              const aiEnabledSetting = settingsByKey.ai_enabled;
              const preferredProvider = (
                (smsProviderSetting ? valueFor(smsProviderSetting) : "hubtel") || "hubtel"
              )
                .toLowerCase()
                .trim();

              const visibleGroups = product.fieldGroups.filter((group) => {
                if (product.id === "sms") {
                  // Controls live in the SMS header row — skip the Delivery card.
                  if (group.id === "control") return false;
                  if (group.id === "hubtel") return preferredProvider === "hubtel";
                  if (group.id === "twilio") return preferredProvider === "twilio";
                  if (group.id === "infobip") return preferredProvider === "infobip";
                  return true;
                }
                return true;
              });

              return (
                <div key={product.id} className="space-y-4">
                  {product.id === "sms" && smsEnabledSetting && smsProviderSetting ? (
                    <Card className="border-border/80 shadow-none">
                      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <h3 className="text-sm font-semibold text-foreground">{product.name}</h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                            <Switch
                              id={`sms-enabled-${smsEnabledSetting.id}`}
                              checked={isTruthySetting(valueFor(smsEnabledSetting))}
                              onCheckedChange={(checked) =>
                                updateValue(smsEnabledSetting, checked ? "true" : "false")
                              }
                              disabled={!canManage || bulkUpdateMutation.isPending}
                              aria-label="SMS enabled"
                            />
                            <Label
                              htmlFor={`sms-enabled-${smsEnabledSetting.id}`}
                              className="cursor-pointer text-sm font-medium"
                            >
                              Enabled
                            </Label>
                          </div>

                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`sms-provider-${smsProviderSetting.id}`}
                              className="whitespace-nowrap text-xs text-muted-foreground"
                            >
                              Preferred provider
                            </Label>
                            <Select
                              value={preferredProvider || "hubtel"}
                              onValueChange={(val) => updateValue(smsProviderSetting, val)}
                              disabled={!canManage || bulkUpdateMutation.isPending}
                            >
                              <SelectTrigger
                                id={`sms-provider-${smsProviderSetting.id}`}
                                className="h-9 w-[140px]"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hubtel">Hubtel</SelectItem>
                                <SelectItem value="twilio">Twilio</SelectItem>
                                <SelectItem value="infobip">Infobip</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <Button variant="outline" size="sm" className="h-9" asChild>
                            <Link href="/sms">SMS console</Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : product.id === "gemini" && aiEnabledSetting ? (
                    <Card className="border-border/80 shadow-none">
                      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <h3 className="text-sm font-semibold text-foreground">{product.name}</h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                            <Switch
                              id={`ai-enabled-${aiEnabledSetting.id}`}
                              checked={isTruthySetting(valueFor(aiEnabledSetting))}
                              onCheckedChange={(checked) =>
                                updateValue(aiEnabledSetting, checked ? "true" : "false")
                              }
                              disabled={!canManage || bulkUpdateMutation.isPending}
                              aria-label="AI enabled"
                            />
                            <Label
                              htmlFor={`ai-enabled-${aiEnabledSetting.id}`}
                              className="cursor-pointer text-sm font-medium"
                            >
                              Enabled
                            </Label>
                          </div>
                          <Button variant="outline" size="sm" className="h-9" asChild>
                            <Link href="/admin/ai-audit">AI audit log</Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="flex items-center gap-2 px-0.5">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">{product.name}</h3>
                      {product.summary ? (
                        <span className="text-xs text-muted-foreground">· {product.summary}</span>
                      ) : null}
                    </div>
                  )}

                  {visibleGroups.map((group) => {
                    const groupKeys = group.keys.filter((key) => settingsByKey[key]);
                    if (!groupKeys.length) return null;

                    const title = group.title;

                    return (
                      <Card key={`${product.id}-${group.id}`} className="border-border/80 shadow-none">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base font-semibold">{title}</CardTitle>
                          {group.description ? (
                            <CardDescription className="text-xs">{group.description}</CardDescription>
                          ) : null}
                        </CardHeader>
                        <CardContent>{renderFields(groupKeys)}</CardContent>
                      </Card>
                    );
                  })}
                </div>
              );
            })}

          {activeCategory !== "accounting" &&
          products.every((p) => settingsForProduct(p, settings).length === 0) &&
          !isError ? (
            <Card className="border-dashed shadow-none">
              <CardContent className="py-14 text-center text-sm text-muted-foreground">
                No integration settings found for this category.
                {INTEGRATION_PRODUCTS.length ? " Seed system settings, then refresh." : null}
              </CardContent>
            </Card>
          ) : null}
        </main>
      </div>

      {dirtyCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={bulkUpdateMutation.isPending}
              onClick={discardAll}
            >
              Discard
            </Button>
            <Button
              className="flex-[2]"
              disabled={!canManage || bulkUpdateMutation.isPending}
              onClick={handleSaveAll}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save {dirtyCount}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
