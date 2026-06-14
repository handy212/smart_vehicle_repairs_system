"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { adminApi, DemoDataModuleSummary } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

function labelFor(moduleName: string) {
  return moduleName.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DemoDataPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [count, setCount] = useState(100);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "demo-data", "status", count],
    queryFn: () => adminApi.demoData.status({ count }),
  });

  const availableModules = useMemo(
    () => (data?.modules || []).filter((row) => row.installed && row.seedable),
    [data]
  );
  const availableModuleKeys = useMemo(() => availableModules.map((row) => row.module), [availableModules]);
  const selectedModules = (selected ?? availableModuleKeys).filter((moduleName) => availableModuleKeys.includes(moduleName));
  const selectedLabel =
    selectedModules.length === availableModuleKeys.length ? "all modules" : `${selectedModules.length} selected`;

  const totals = useMemo(() => {
    const rows = data?.modules || [];
    return rows.reduce(
      (acc, row) => {
        acc.existing += row.existing;
        acc.errors += row.errors.length;
        return acc;
      },
      { existing: 0, errors: 0 }
    );
  }, [data]);

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: ["admin", "demo-data"] });

  const loadMutation = useMutation({
    mutationFn: () => adminApi.demoData.load({ count, modules: selectedModules }),
    onSuccess: (result) => {
      refreshStatus();
      toast({ title: "Demo data loaded", description: `${result.modules.length} module(s) processed.` });
    },
    onError: (error: unknown) => {
      toast({ title: "Load failed", description: getUserFacingError(error, "Unable to load demo data"), variant: "destructive" });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => adminApi.demoData.refresh({ count, modules: selectedModules }),
    onSuccess: (result) => {
      refreshStatus();
      toast({ title: "Demo data refreshed", description: `${result.modules.length} module(s) rebuilt.` });
    },
    onError: (error: unknown) => {
      toast({ title: "Refresh failed", description: getUserFacingError(error, "Unable to refresh demo data"), variant: "destructive" });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: () => adminApi.demoData.purge({ count, modules: selectedModules }),
    onSuccess: (result) => {
      refreshStatus();
      setConfirmText("");
      toast({ title: "Demo data purged", description: `${result.modules.length} module(s) processed.` });
    },
    onError: (error: unknown) => {
      toast({ title: "Purge failed", description: getUserFacingError(error, "Unable to purge demo data"), variant: "destructive" });
    },
  });

  const toggleModule = (moduleName: string, checked: boolean) => {
    setSelected((current) => {
      const base = current ?? availableModuleKeys;
      return checked ? [...base, moduleName] : base.filter((item) => item !== moduleName);
    });
  };

  const busy = loadMutation.isPending || refreshMutation.isPending || purgeMutation.isPending;
  const hasModuleSelection = selectedModules.length > 0;
  const purgeEnabled = confirmText.trim().toUpperCase() === "PURGE DEMO DATA";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Demo Data</h1>
          <p className="text-sm text-muted-foreground">
            Load client-test demo records or purge only records created by this loader. SMS data is excluded.
          </p>
        </div>
        <Button variant="outline" onClick={refreshStatus} disabled={isLoading || busy}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Load Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <label className="space-y-2">
              <span className="text-sm font-medium">Records per module</span>
              <Input
                type="number"
                min={1}
                max={1000}
                value={count}
                onChange={(event) => setCount(Number(event.target.value) || 100)}
              />
            </label>
            <div className="rounded-md border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Modules</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(availableModuleKeys)}>
                  Use all
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {availableModules.map((row) => (
                  <label key={row.module} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={selectedModules.includes(row.module)} onCheckedChange={(checked) => toggleModule(row.module, checked === true)} />
                    {row.label || labelFor(row.module)}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => loadMutation.mutate()} disabled={busy || !hasModuleSelection}>
              <Database className="mr-2 h-4 w-4" />
              Load {selectedLabel}
            </Button>
            <Button variant="secondary" onClick={() => refreshMutation.mutate()} disabled={busy || !hasModuleSelection}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh {selectedLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purge Demo Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Purge deletes only records with the client demo identifiers or marker. Existing non-demo data is preserved.
          </p>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="Type PURGE DEMO DATA"
            />
            <Button variant="destructive" onClick={() => purgeMutation.mutate()} disabled={!purgeEnabled || busy || !hasModuleSelection}>
              <Trash2 className="mr-2 h-4 w-4" />
              Purge {selectedLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Demo records</div>
              <div className="text-xl font-semibold">{totals.existing}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Module errors</div>
              <div className="text-xl font-semibold">{totals.errors}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Module</th>
                  <th className="py-2 pr-4 font-medium">Target</th>
                  <th className="py-2 pr-4 font-medium">Existing Demo</th>
                  <th className="py-2 pr-4 font-medium">Warnings</th>
                  <th className="py-2 pr-4 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {(data?.modules || []).map((row: DemoDataModuleSummary) => (
                  <tr key={row.module} className="border-b">
                    <td className="py-2 pr-4 font-medium">{row.label || labelFor(row.module)}</td>
                    <td className="py-2 pr-4">{row.target}</td>
                    <td className="py-2 pr-4">{row.existing}</td>
                    <td className="py-2 pr-4">{row.warnings.length}</td>
                    <td className="py-2 pr-4">{row.errors.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
