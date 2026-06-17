"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { reportingApi } from "@/lib/api/reporting";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, BarChart3, Clock, Loader2, ShieldCheck } from "lucide-react";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";

export default function PurchaseReportsPage() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const apCycleQuery = useQuery({
    queryKey: ["reporting", "ap-cycle-time", startDate, endDate],
    queryFn: () => reportingApi.getApCycleTime({ start_date: startDate, end_date: endDate }),
  });

  const p2pQuery = useQuery({
    queryKey: ["inventory", "p2p-compliance", startDate, endDate],
    queryFn: () => inventoryApi.getP2PCompliance({ start_date: startDate, end_date: endDate }),
  });

  const apData = apCycleQuery.data as {
    average_days_to_pay?: number;
    bills_sampled?: number;
    payments_sampled?: number;
    distribution?: Record<string, number>;
  } | undefined;

  const p2pData = p2pQuery.data as {
    compliance_rate_percent?: number;
    violations?: Array<{ po_number: string; supplier: string; status: string; issues: string[] }>;
  } | undefined;

  const isLoading = apCycleQuery.isLoading || p2pQuery.isLoading;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AP cycle time and procure-to-pay compliance.
          </p>
        </div>
        <BranchReportChip />
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="start_date" className="text-xs">Start Date</Label>
            <Input id="start_date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label htmlFor="end_date" className="text-xs">End Date</Label>
            <Input id="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading reports…
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="h-4 w-4" />
                    AP Cycle Time
                  </CardTitle>
                  <CardDescription>Average days from bill date to first payment</CardDescription>
                </div>
                <Badge variant="outline">{apData?.average_days_to_pay ?? 0} days avg</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded border p-3">
                  <p className="text-muted-foreground">Bills sampled</p>
                  <p className="text-xl font-semibold">{apData?.bills_sampled ?? 0}</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-muted-foreground">With payments</p>
                  <p className="text-xl font-semibold">{apData?.payments_sampled ?? 0}</p>
                </div>
              </div>
              {apData?.distribution && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(apData.distribution).map(([bucket, count]) => (
                    <div key={bucket} className="flex justify-between rounded bg-muted/30 px-3 py-2">
                      <span className="capitalize">{bucket.replace(/_/g, " ")}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4" />
                    P2P Compliance
                  </CardTitle>
                  <CardDescription>Procure-to-pay policy violations</CardDescription>
                </div>
                <Badge variant="outline">{p2pData?.compliance_rate_percent ?? 0}% compliant</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {(p2pData?.violations?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No violations in this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p2pData?.violations?.slice(0, 8).map((row) => (
                      <TableRow key={row.po_number}>
                        <TableCell className="font-mono text-xs">{row.po_number}</TableCell>
                        <TableCell>{row.supplier}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.issues.join(", ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <Button variant="link" className="px-0 mt-3" asChild>
                <Link href="/inventory/reports/compliance">
                  Full compliance report
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/billing/ap-due" className="group rounded-lg border p-4 hover:border-primary/40 hover:bg-muted/20 transition-colors">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BarChart3 className="h-4 w-4 text-primary" />
            AP Due Dashboard
            <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-100" />
          </div>
        </Link>
        <Link href="/billing/vendor-balances" className="group rounded-lg border p-4 hover:border-primary/40 hover:bg-muted/20 transition-colors">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BarChart3 className="h-4 w-4 text-primary" />
            Vendor Balances
            <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-100" />
          </div>
        </Link>
      </div>
    </div>
  );
}
