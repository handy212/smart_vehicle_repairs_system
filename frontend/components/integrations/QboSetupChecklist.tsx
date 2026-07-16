"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, ListChecks, Wand2 } from "lucide-react";
import { qboMappingsApi } from "@/lib/api/qbo-mappings";
import { branchesApi } from "@/lib/api/branches";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

export function QboSetupChecklist() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected, isApiReady } = useQuickBooksConnection();

  const { data: status, isLoading } = useQuery({
    queryKey: ["qbo", "setup-status"],
    queryFn: () => qboMappingsApi.getSetupStatus(),
    enabled: isConnected,
    retry: false,
  });

  const applyTemplateMutation = useMutation({
    mutationFn: () => qboMappingsApi.applyOwnerTemplate({ wire_svr: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbo"] });
      toast({
        title: "Workshop template applied",
        description: "Company QBO mappings and branch locations were updated from patterns.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Template apply failed",
        description: getUserFacingError(error, "Could not apply workshop template."),
        variant: "destructive",
      });
    },
  });

  const linkLocationsMutation = useMutation({
    mutationFn: () => branchesApi.linkAllQboLocations(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["qbo", "setup-status"] });
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast({
        title: "Branch locations linked",
        description: `Linked ${result.linked?.length ?? 0} branch(es) to QBO locations.`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Link failed",
        description: getUserFacingError(error, "Could not link branch locations."),
        variant: "destructive",
      });
    },
  });

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Connect QuickBooks on the <strong>Connection</strong> tab first, then return here for the setup checklist.
        </CardContent>
      </Card>
    );
  }

  if (!isApiReady) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4 text-sm text-muted-foreground">
          QuickBooks is linked but the live API session is unavailable. Reconnect on the Connection tab, then continue setup.
        </CardContent>
      </Card>
    );
  }

  const steps = status?.next_steps ?? [];
  const allDone = steps.length > 0 && steps.every((step) => step.done);

  return (
    <Card>
      <CardHeader className="py-3 px-4 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-primary" />
            QuickBooks setup checklist
          </CardTitle>
          {allDone ? (
            <Badge variant="success" className="text-[10px]">Ready</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">In progress</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Three layers: <strong>company defaults</strong> (Accounting → Controls),{" "}
          <strong>branch location &amp; cash</strong> (Admin → Branches wizard), optional{" "}
          <strong>branch chart overrides</strong> when sub-COA differs per site.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading setup status…</p>
        ) : (
          <ul className="space-y-2">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2 text-sm">
                {step.done ? (
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span className={step.done ? "text-muted-foreground" : "text-foreground"}>
                  {step.href && !step.done ? (
                    <Link href={step.href} className="text-primary hover:underline">
                      {step.label}
                    </Link>
                  ) : (
                    step.label
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 pt-1 border-t">
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={applyTemplateMutation.isPending}
            onClick={() => applyTemplateMutation.mutate()}
          >
            <Wand2 className="w-3.5 h-3.5 mr-1.5" />
            Apply company template
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={linkLocationsMutation.isPending}
            onClick={() => linkLocationsMutation.mutate()}
          >
            Link all branch locations
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href="/admin/branches">Open branch setup</Link>
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href="/accounting/controls?qbo_tab=mapping">Company mappings</Link>
          </Button>
        </div>

        {status && (
          <p className="text-[10px] text-muted-foreground">
            Company mappings: {status.company_mappings.mapped}/{status.company_mappings.total} ·
            Branches without QBO location: {status.branches.unmapped_locations}/
            {status.branches.active_count}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
