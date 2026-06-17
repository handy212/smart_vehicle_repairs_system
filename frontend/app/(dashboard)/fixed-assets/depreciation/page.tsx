"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { fixedAssetsApi, type DepreciationRunResult } from "@/lib/api/fixed-assets";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calculator, Loader2 } from "lucide-react";

const previousMonth = subMonths(new Date(), 1);

export default function DepreciationPage() {
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canRun = hasPermission("run_depreciation");

  const [targetMonth, setTargetMonth] = useState(String(previousMonth.getMonth() + 1));
  const [targetYear, setTargetYear] = useState(String(previousMonth.getFullYear()));
  const [postToGl, setPostToGl] = useState(true);
  const [result, setResult] = useState<DepreciationRunResult | null>(null);

  const runMutation = useMutation({
    mutationFn: () =>
      fixedAssetsApi.runDepreciation({
        target_month: Number(targetMonth),
        target_year: Number(targetYear),
        post_to_gl: postToGl,
      }),
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: "Depreciation completed",
        description: `Processed ${data.assets_processed} assets.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Depreciation failed",
        description: getUserFacingError(error, "Unable to run depreciation."),
        variant: "destructive",
      });
    },
  });

  return (
    <PermissionPageGuard permission="view_assets">
      <div className="space-y-6 p-4 md:p-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monthly Depreciation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Run depreciation for all active assets for a selected month.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" />
              Run Depreciation
            </CardTitle>
            <CardDescription>
              Defaults to the previous calendar month if not specified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="target_month">Month</Label>
                <Input
                  id="target_month"
                  type="number"
                  min={1}
                  max={12}
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="target_year">Year</Label>
                <Input
                  id="target_year"
                  type="number"
                  min={1900}
                  max={2100}
                  value={targetYear}
                  onChange={(e) => setTargetYear(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="post_to_gl"
                checked={postToGl}
                onCheckedChange={(checked) => setPostToGl(checked === true)}
              />
              <Label htmlFor="post_to_gl" className="text-sm font-normal">
                Post journal entries to the general ledger
              </Label>
            </div>

            <Button
              onClick={() => runMutation.mutate()}
              disabled={!canRun || runMutation.isPending}
            >
              {runMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running…
                </>
              ) : (
                "Run Depreciation"
              )}
            </Button>

            {!canRun && (
              <p className="text-xs text-muted-foreground">
                You need the run_depreciation permission to execute this action.
              </p>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card className="border-primary/20">
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-base">Results</CardTitle>
              <CardDescription>
                {format(new Date(result.period_start), "MMM d, yyyy")} —{" "}
                {format(new Date(result.period_end), "MMM d, yyyy")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Assets Processed</p>
                  <p className="text-2xl font-semibold mt-1">{result.assets_processed}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Assets Skipped</p>
                  <p className="text-2xl font-semibold mt-1">{result.assets_skipped}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Total Depreciation</p>
                  <p className="text-2xl font-semibold mt-1">{formatCurrency(result.total_depreciation)}</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <Badge variant="destructive">{result.errors.length} errors</Badge>
                  <ul className="text-sm text-destructive space-y-1 list-disc pl-5">
                    {result.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PermissionPageGuard>
  );
}
