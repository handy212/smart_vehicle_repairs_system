"use client";

import { useQuery } from "@tanstack/react-query";
import { reportingApi } from "@/lib/api/reporting";
import { workordersApi } from "@/lib/api/workorders";
import { inventoryApi } from "@/lib/api/inventory";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { ReportExportMenu } from "@/components/reports/ReportExportMenu";
import { OpsDailyBriefing, OpsExceptionTriage, OpsAINarrativeButton, OpsTraceabilityQA, OpsWorkflowBottleneck } from "@/components/reports/OpsAIPanel";
import type { TableExportPayload } from "@/lib/utils/report-export";

type OpsTab = "exceptions" | "roadside" | "return" | "trace" | "usage" | "ap" | "capacity";

export default function OperationsReportsPage() {
  const { formatCurrency } = useCurrency();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activeTab, setActiveTab] = useState<OpsTab>("exceptions");
  const [traceWoId, setTraceWoId] = useState("");
  const [tracePartId, setTracePartId] = useState("");
  const [traceQuery, setTraceQuery] = useState<{ work_order_id?: number; part_id?: number } | null>(null);

  const { data: traceWoOptions } = useQuery({
    queryKey: ["ops-trace-wo-options"],
    queryFn: () => workordersApi.list({ ordering: "-created_at", page: 1 }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: tracePartOptions } = useQuery({
    queryKey: ["ops-trace-part-options"],
    queryFn: () => inventoryApi.list({ page: 1, is_active: true }),
    staleTime: 5 * 60 * 1000,
  });

  const params = { start_date: startDate, end_date: endDate };

  const { data: roadside, isLoading: l1 } = useQuery({
    queryKey: ["ops", "roadside", startDate, endDate],
    queryFn: () => reportingApi.getRoadsideRevenue(params),
  });
  const { data: exceptions } = useQuery({
    queryKey: ["ops", "exceptions"],
    queryFn: () => reportingApi.getExceptionLog(),
  });
  const { data: usage, isLoading: l2 } = useQuery({
    queryKey: ["ops", "usage", startDate, endDate],
    queryFn: () => reportingApi.getSystemUsage(params),
  });
  const { data: apCycle } = useQuery({
    queryKey: ["ops", "ap", startDate, endDate],
    queryFn: () => reportingApi.getApCycleTime(params),
  });
  const { data: capacity } = useQuery({
    queryKey: ["ops", "capacity", startDate, endDate],
    queryFn: () => reportingApi.getCapacityPlanning(params),
  });
  const { data: returnJobs, isLoading: lRet } = useQuery({
    queryKey: ["ops", "return", startDate, endDate],
    queryFn: () => reportingApi.getCostControlReturnJobs(params),
  });
  const { data: traceability, isLoading: lTrace, refetch: runTrace } = useQuery({
    queryKey: ["ops", "trace", traceQuery],
    queryFn: () => reportingApi.getTraceability(traceQuery!),
    enabled: !!traceQuery,
  });

  const roadsideTypes = (roadside as { by_service_type?: Array<{ service_type: string; count: number; revenue: number }> })?.by_service_type ?? [];
  const usageJobs = (usage as { jobs?: { fully_logged_percent?: number; total_work_orders?: number; fully_logged?: number }; active_users?: Array<{ name: string; actions: number }> })?.jobs;
  const usageUsers = (usage as { active_users?: Array<{ name: string; actions: number }> })?.active_users ?? [];
  const apDist = (apCycle as { distribution?: Record<string, number>; average_days_to_pay?: number })?.distribution;
  const returnList = (returnJobs as { return_jobs?: Array<{ work_order_number: string; branch: string; cost_variance: number; status: string }> })?.return_jobs ?? [];
  const traceChain = (traceability as { chain?: Array<{ date: string; type: string; part_number: string; quantity: number; work_order_id: number | null }> })?.chain ?? [];
  const exceptionList =
    (exceptions as { exceptions?: Array<{ type: string; reference: string; message: string; status?: string }> })
      ?.exceptions ?? [];

  const buildExportPayload = (): TableExportPayload | null => {
    const stamp = `${startDate}_${endDate}`;
    const dateInfo = `Period: ${startDate} to ${endDate}`;

    if (activeTab === "exceptions" && exceptionList.length > 0) {
      return {
        filename: `ops-exceptions_${stamp}`,
        reportTitle: "Operations — Exception log",
        dateInfo,
        headers: ["Type", "Reference", "Status", "Message"],
        rows: exceptionList.map((e) => [e.type, e.reference, e.status ?? "", e.message]),
      };
    }
    if (activeTab === "roadside" && roadsideTypes.length > 0) {
      return {
        filename: `ops-roadside_${stamp}`,
        reportTitle: "Operations — Roadside revenue",
        dateInfo,
        headers: ["Service type", "Count", "Revenue"],
        rows: roadsideTypes.map((r) => [r.service_type, r.count, r.revenue]),
        currencyColumnIndexes: [2],
      };
    }
    if (activeTab === "return" && returnList.length > 0) {
      return {
        filename: `ops-return-jobs_${stamp}`,
        reportTitle: "Operations — Return & rework jobs",
        dateInfo,
        headers: ["Work order", "Branch", "Status", "Cost variance"],
        rows: returnList.map((j) => [j.work_order_number, j.branch, j.status, j.cost_variance]),
        currencyColumnIndexes: [3],
      };
    }
    if (activeTab === "trace" && traceChain.length > 0) {
      return {
        filename: `ops-traceability_${stamp}`,
        reportTitle: "Operations — Traceability",
        dateInfo,
        headers: ["Date", "Type", "Part", "Qty", "Work order"],
        rows: traceChain.map((t) => [
          t.date.slice(0, 10),
          t.type,
          t.part_number,
          t.quantity,
          t.work_order_id ?? "",
        ]),
      };
    }
    if (activeTab === "usage" && usageUsers.length > 0) {
      return {
        filename: `ops-system-usage_${stamp}`,
        reportTitle: "Operations — System usage",
        dateInfo,
        headers: ["User", "Actions"],
        rows: usageUsers.map((u) => [u.name, u.actions]),
      };
    }
    if (activeTab === "ap" && apDist) {
      return {
        filename: `ops-ap-cycle_${stamp}`,
        reportTitle: "Operations — AP cycle time",
        dateInfo,
        headers: ["Bucket", "Count"],
        rows: [
          ["Under 15 days", apDist.under_15],
          ["15–30 days", apDist["15_30"]],
          ["30–60 days", apDist["30_60"]],
          ["Over 60 days", apDist.over_60],
        ],
      };
    }
    if (activeTab === "capacity" && capacity) {
      const c = capacity as Record<string, string | number>;
      return {
        filename: `ops-capacity_${stamp}`,
        reportTitle: "Operations — Capacity planning",
        dateInfo,
        headers: ["Metric", "Value"],
        rows: [
          ["Service bays", c.service_bays ?? 0],
          ["Appointments in period", c.appointments_in_period ?? 0],
          ["Active work orders", c.active_work_orders ?? 0],
          ["Note", String(c.utilization_note ?? "")],
        ],
      };
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Operations</h1>
        <ReportExportMenu getPayload={buildExportPayload} />
      </div>
      <div className="flex gap-4">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
      </div>

      <OpsDailyBriefing startDate={startDate} endDate={endDate} />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as OpsTab)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="exceptions">Exception Log</TabsTrigger>
          <TabsTrigger value="roadside">Roadside Revenue</TabsTrigger>
          <TabsTrigger value="return">Return / Rework Jobs</TabsTrigger>
          <TabsTrigger value="trace">Traceability</TabsTrigger>
          <TabsTrigger value="usage">System Usage</TabsTrigger>
          <TabsTrigger value="ap">AP Cycle Time</TabsTrigger>
          <TabsTrigger value="capacity">Capacity</TabsTrigger>
        </TabsList>

        <TabsContent value="exceptions">
          <Card>
            <CardHeader><CardTitle>Service delays & exceptions</CardTitle></CardHeader>
            <CardContent className="max-h-[480px] overflow-auto">
              <OpsExceptionTriage exceptionList={exceptionList} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptionList.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{e.type}</TableCell>
                      <TableCell>{e.reference}</TableCell>
                      <TableCell>{e.status ?? "—"}</TableCell>
                      <TableCell>{e.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roadside">
          <Card>
            <CardHeader><CardTitle>Roadside revenue</CardTitle></CardHeader>
            <CardContent>
              {l1 ? <Loader2 className="animate-spin h-6 w-6" /> : (
                <>
                  <p className="text-lg font-semibold mb-4">
                    Total: {formatCurrency((roadside as { total_revenue?: number })?.total_revenue ?? 0)}
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service type</TableHead>
                        <TableHead>Count</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roadsideTypes.map((r) => (
                        <TableRow key={r.service_type}>
                          <TableCell>{r.service_type}</TableCell>
                          <TableCell>{r.count}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="return">
          <Card>
            <CardHeader><CardTitle>Return & rework cost control</CardTitle></CardHeader>
            <CardContent className="max-h-[480px] overflow-auto">
              <OpsAINarrativeButton
                label="AI analyze return jobs"
                resultKey="analysis"
                onGenerate={() => reportingApi.analyzeReturnJobs(params)}
              />
              {lRet ? <Loader2 className="animate-spin h-6 w-6" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work order</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Cost variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnList.map((j, i) => (
                      <TableRow key={i}>
                        <TableCell>{j.work_order_number}</TableCell>
                        <TableCell>{j.branch}</TableCell>
                        <TableCell>{j.status}</TableCell>
                        <TableCell className="text-right">{formatCurrency(j.cost_variance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trace">
          <Card>
            <CardHeader><CardTitle>Traceability — receipt → WO → movement</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-end mb-4">
                <div>
                  <Label className="text-xs">Work order</Label>
                  <select
                    value={traceWoId}
                    onChange={(e) => setTraceWoId(e.target.value)}
                    className="flex h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select work order…</option>
                    {(traceWoOptions?.results ?? []).map((wo) => (
                      <option key={wo.id} value={String(wo.id)}>
                        {wo.work_order_number}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Part</Label>
                  <select
                    value={tracePartId}
                    onChange={(e) => setTracePartId(e.target.value)}
                    className="flex h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select part…</option>
                    {(tracePartOptions?.results ?? []).map((part) => (
                      <option key={part.id} value={String(part.id)}>
                        {part.part_number} — {part.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    const q: { work_order_id?: number; part_id?: number } = {};
                    if (traceWoId) q.work_order_id = Number(traceWoId);
                    if (tracePartId) q.part_id = Number(tracePartId);
                    if (q.work_order_id || q.part_id) setTraceQuery(q);
                  }}
                  disabled={!traceWoId && !tracePartId}
                >
                  Search
                </Button>
              </div>
              {lTrace ? (
                <Loader2 className="animate-spin h-6 w-6" />
              ) : traceQuery ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Part</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>WO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {traceChain.map((t, i) => (
                      <TableRow key={i}>
                        <TableCell>{t.date.slice(0, 10)}</TableCell>
                        <TableCell>{t.type}</TableCell>
                        <TableCell>{t.part_number}</TableCell>
                        <TableCell>{t.quantity}</TableCell>
                        <TableCell>{t.work_order_id ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Select a work order and/or part, then search.</p>
              )}
              <OpsTraceabilityQA traceQuery={traceQuery} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage">
          <Card>
            <CardHeader><CardTitle>System usage & job logging</CardTitle></CardHeader>
            <CardContent>
              <OpsWorkflowBottleneck />
              {l2 ? <Loader2 className="animate-spin h-6 w-6" /> : (
                <div className="space-y-4">
                  <p className="text-sm">
                    Jobs fully logged: {usageJobs?.fully_logged_percent ?? 0}% (
                    {usageJobs?.fully_logged ?? 0} / {usageJobs?.total_work_orders ?? 0})
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usageUsers.map((u, i) => (
                        <TableRow key={i}>
                          <TableCell>{u.name}</TableCell>
                          <TableCell className="text-right">{u.actions}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ap">
          <Card>
            <CardHeader><CardTitle>AP cycle time (days to pay)</CardTitle></CardHeader>
            <CardContent>
              <OpsAINarrativeButton
                label="AI AP cycle insights"
                onGenerate={() => reportingApi.apCycleNarrative(params)}
              />
              <p className="text-lg font-semibold mb-4">
                Average: {(apCycle as { average_days_to_pay?: number })?.average_days_to_pay ?? "—"} days
              </p>
              {apDist && (
                <ul className="text-sm space-y-1">
                  <li>Under 15 days: {apDist.under_15}</li>
                  <li>15–30 days: {apDist["15_30"]}</li>
                  <li>30–60 days: {apDist["30_60"]}</li>
                  <li>Over 60 days: {apDist.over_60}</li>
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capacity">
          <Card>
            <CardHeader><CardTitle>Capacity planning</CardTitle></CardHeader>
            <CardContent>
              <OpsAINarrativeButton
                label="AI capacity insights"
                onGenerate={() => reportingApi.capacityNarrative(params)}
              />
              <ul className="text-sm space-y-2">
                <li>Service bays: {(capacity as { service_bays?: number })?.service_bays ?? 0}</li>
                <li>Appointments in period: {(capacity as { appointments_in_period?: number })?.appointments_in_period ?? 0}</li>
                <li>Active work orders: {(capacity as { active_work_orders?: number })?.active_work_orders ?? 0}</li>
                <li>{(capacity as { utilization_note?: string })?.utilization_note}</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
