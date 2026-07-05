"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Landmark,
  Link2,
  RefreshCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { branchesApi, Branch } from "@/lib/api/branches";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BranchQboMappingPanel } from "@/components/branches/BranchQboMappingPanel";
import { BranchSettlementAccountsPanel } from "@/components/branches/BranchSettlementAccountsPanel";
import { BranchQboCoaMappingsPanel } from "@/components/branches/BranchQboCoaMappingsPanel";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

interface BranchQuickBooksHubProps {
  branches: Branch[];
  onOpenWizard: (branch: Branch) => void;
}

export function BranchQuickBooksHub({ branches, onOpenWizard }: BranchQuickBooksHubProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected, isApiReady, connectionIssue, isLoading: qboStatusLoading } = useQuickBooksConnection();
  const [open, setOpen] = useState(false);
  const [advancedTab, setAdvancedTab] = useState("locations");
  const [copySourceByBranch, setCopySourceByBranch] = useState<Record<number, string>>({});

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.is_active),
    [branches],
  );

  const unmappedCount = activeBranches.filter(
    (b) => !b.qbo_department_id || b.qbo_sync_status === "unmapped",
  ).length;

  const bulkMutation = useMutation({
    mutationFn: async (action: "locations" | "settlement") => {
      if (action === "locations") {
        return branchesApi.linkAllQboLocations();
      }
      return branchesApi.provisionAllSettlement();
    },
    onSuccess: (result, action) => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["qbo", "setup-status"] });
      const count =
        action === "locations"
          ? (result as { linked?: unknown[] }).linked?.length ?? 0
          : (result as { branches?: unknown[] }).branches?.length ?? 0;
      toast({
        title: action === "locations" ? "Locations linked" : "Settlement provisioned",
        description:
          action === "locations"
            ? `Processed ${count} branch location match(es).`
            : `Ran settlement match for ${count} branch(es).`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Bulk action failed",
        description: getUserFacingError(error, "Could not complete bulk QuickBooks action."),
        variant: "destructive",
      });
    },
  });

  const branchActionMutation = useMutation({
    mutationFn: ({
      branchId,
      action,
      sourceBranchId,
      dryRun,
    }: {
      branchId: number;
      action: "suggest" | "copy" | "resync";
      sourceBranchId?: number;
      dryRun?: boolean;
    }) => {
      if (action === "suggest") {
        return branchesApi.suggestQboMappings(branchId, { dry_run: dryRun ?? false });
      }
      if (action === "copy" && sourceBranchId) {
        return branchesApi.copyQboMappingsFrom(branchId, sourceBranchId);
      }
      return branchesApi.resyncQboDocuments(branchId);
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["branches", "qbo-coa-mappings"] });
      if (variables.action === "suggest") {
        const applied = (result as { applied?: number }).applied ?? 0;
        const suggestions = (result as { suggestions?: unknown[] }).suggestions ?? [];
        toast({
          title: applied ? "Mappings suggested" : "Preview complete",
          description: applied
            ? `Applied ${applied} branch chart mapping(s).`
            : `Found ${suggestions.length} suggestion(s). Run again without preview to apply.`,
        });
      } else if (variables.action === "copy") {
        toast({
          title: "Mappings copied",
          description: `Copied ${(result as { copied?: number }).copied ?? 0} override(s).`,
        });
      } else {
        toast({
          title: "Re-sync queued",
          description: `Queued ${(result as { queued_count?: number }).queued_count ?? 0} document(s) for QuickBooks.`,
        });
      }
    },
    onError: (error: unknown) => {
      toast({
        title: "Action failed",
        description: getUserFacingError(error, "Could not complete branch QuickBooks action."),
        variant: "destructive",
      });
    },
  });

  if (qboStatusLoading) {
    return null;
  }

  if (!isConnected) {
    return (
      <Card className="mx-4 border shadow-sm bg-muted/20">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Connect QuickBooks under{" "}
          <a href="/admin/integrations?category=accounting&qbo_tab=setup" className="text-primary hover:underline">
            Admin → Integrations → Setup
          </a>{" "}
          to configure branches.
        </CardContent>
      </Card>
    );
  }

  if (!isApiReady) {
    return (
      <Card className="mx-4 border shadow-sm border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 text-sm text-muted-foreground">
          {connectionIssue ||
            "QuickBooks is linked but the live API session is unavailable. Reconnect under Admin → Integrations."}
        </CardContent>
      </Card>
    );
  }

  if (activeBranches.length === 0) {
    return null;
  }

  return (
    <Card className="mx-4 border shadow-sm">
      <CardHeader className="py-3 px-4 border-b bg-muted/30">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-3 text-left"
          onClick={() => setOpen((value) => !value)}
        >
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Link2 className="w-4 h-4 text-primary" />
            Branch QuickBooks setup
          </CardTitle>
          <div className="flex items-center gap-2">
            {unmappedCount > 0 ? (
              <Badge variant="secondary" className="text-[10px]">
                {unmappedCount} need location
              </Badge>
            ) : (
              <Badge variant="success" className="text-[10px]">
                Locations mapped
              </Badge>
            )}
          </div>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b bg-muted/10 space-y-3">
            <p className="text-xs text-muted-foreground">
              Use the <strong>Setup wizard</strong> per branch for location + settlement in one step. Bulk actions below
              help when onboarding many branches. Chart overrides are only needed when AR, COGS, or income GL differs
              per site.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={bulkMutation.isPending}
                onClick={() => bulkMutation.mutate("locations")}
              >
                <Wand2 className="w-3.5 h-3.5 mr-1" />
                Link all QBO locations
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={bulkMutation.isPending}
                onClick={() => bulkMutation.mutate("settlement")}
              >
                <Landmark className="w-3.5 h-3.5 mr-1" />
                Match all settlement accounts
              </Button>
            </div>

            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Branch</th>
                    <th className="text-left px-3 py-2 font-medium">QBO location</th>
                    <th className="text-right px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeBranches.map((branch) => (
                    <tr key={branch.id} className="bg-card">
                      <td className="px-3 py-2">
                        <div className="font-medium">{branch.name}</div>
                        <code className="text-[10px] text-muted-foreground">{branch.code}</code>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {branch.qbo_department_name || branch.qbo_department_id || "Not mapped"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 text-[10px] px-2"
                            onClick={() => onOpenWizard(branch)}
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            Wizard
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            disabled={branchActionMutation.isPending}
                            onClick={() =>
                              branchActionMutation.mutate({
                                branchId: branch.id,
                                action: "suggest",
                                dryRun: true,
                              })
                            }
                          >
                            Preview COA
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            disabled={branchActionMutation.isPending}
                            onClick={() =>
                              branchActionMutation.mutate({ branchId: branch.id, action: "suggest" })
                            }
                          >
                            <BookOpen className="w-3 h-3 mr-1" />
                            Match COA
                          </Button>
                          <Select
                            value={copySourceByBranch[branch.id] ?? ""}
                            onValueChange={(value) =>
                              setCopySourceByBranch((current) => ({ ...current, [branch.id]: value }))
                            }
                          >
                            <SelectTrigger className="h-7 w-[110px] text-[10px]">
                              <SelectValue placeholder="Copy from…" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeBranches
                                .filter((candidate) => candidate.id !== branch.id)
                                .map((candidate) => (
                                  <SelectItem key={candidate.id} value={String(candidate.id)}>
                                    {candidate.code}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            disabled={
                              !copySourceByBranch[branch.id] || branchActionMutation.isPending
                            }
                            onClick={() =>
                              branchActionMutation.mutate({
                                branchId: branch.id,
                                action: "copy",
                                sourceBranchId: Number(copySourceByBranch[branch.id]),
                              })
                            }
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[10px] px-2"
                            disabled={branchActionMutation.isPending}
                            onClick={() =>
                              branchActionMutation.mutate({ branchId: branch.id, action: "resync" })
                            }
                            title="Re-queue invoices, estimates, and credit notes for this branch"
                          >
                            <RefreshCcw className="w-3 h-3 mr-1" />
                            Re-sync
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-4 py-3 border-t">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Advanced per-branch settings
            </p>
            <Tabs value={advancedTab} onValueChange={setAdvancedTab}>
              <TabsList className="h-8">
                <TabsTrigger value="locations" className="text-xs">
                  Locations
                </TabsTrigger>
                <TabsTrigger value="settlement" className="text-xs">
                  Cash &amp; bank
                </TabsTrigger>
                <TabsTrigger value="coa" className="text-xs">
                  Chart overrides
                </TabsTrigger>
              </TabsList>
              <TabsContent value="locations" className="mt-3">
                <BranchQboMappingPanel branches={activeBranches} embedded />
              </TabsContent>
              <TabsContent value="settlement" className="mt-3">
                <BranchSettlementAccountsPanel branches={activeBranches} embedded />
              </TabsContent>
              <TabsContent value="coa" className="mt-3">
                <BranchQboCoaMappingsPanel branches={activeBranches} embedded />
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
