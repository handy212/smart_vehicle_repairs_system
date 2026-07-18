"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, ListChecks, Wand2 } from "lucide-react";
import { qboMappingsApi } from "@/lib/api/qbo-mappings";
import { branchesApi } from "@/lib/api/branches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

export function QboSetupChecklist() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Single request — do not wait on /quickbooks/status/ (can hang on Intuit/OAuth).
  const { data: status, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["qbo", "setup-status"],
    queryFn: () => qboMappingsApi.getSetupStatus(),
    retry: false,
    staleTime: 60_000,
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
    onError: (err: unknown) => {
      toast({
        title: "Template apply failed",
        description: getUserFacingError(err, "Could not apply workshop template."),
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
    onError: (err: unknown) => {
      toast({
        title: "Link failed",
        description: getUserFacingError(err, "Could not link branch locations."),
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Loading setup status…
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-destructive">
            {getUserFacingError(error, "Could not load QuickBooks setup status.")}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!status?.is_connected) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Connect QuickBooks on the <strong>Connection</strong> tab first, then return here for the
          setup checklist.
        </CardContent>
      </Card>
    );
  }

  if (!status.is_api_ready) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4 text-sm text-muted-foreground">
          QuickBooks is linked but the live API session is unavailable. Reconnect on the Connection
          tab, then continue setup.
        </CardContent>
      </Card>
    );
  }

  const steps = status.next_steps ?? [];
  const allDone = steps.length > 0 && steps.every((step) => step.done);

  return (
    <Card>
      <CardHeader className="border-b bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" />
            QuickBooks setup checklist
          </CardTitle>
          {allDone ? (
            <Badge variant="success" className="text-[10px]">
              Ready
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              In progress
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <p className="text-xs text-muted-foreground">
          Three layers: <strong>company defaults</strong> (Accounting → Controls),{" "}
          <strong>branch location &amp; cash</strong> (Admin → Branches wizard), optional{" "}
          <strong>branch chart overrides</strong> when sub-COA differs per site.
        </p>

        <ul className="space-y-2">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-2 text-sm">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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

        <div className="flex flex-wrap gap-2 border-t pt-1">
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={applyTemplateMutation.isPending}
            onClick={() => applyTemplateMutation.mutate()}
          >
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
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

        <p className="text-[10px] text-muted-foreground">
          Company mappings: {status.company_mappings.mapped}/{status.company_mappings.total} ·
          Branches without QBO location: {status.branches.unmapped_locations}/
          {status.branches.active_count}
        </p>
      </CardContent>
    </Card>
  );
}
