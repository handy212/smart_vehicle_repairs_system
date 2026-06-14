"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { inventoryApi } from "@/lib/api/inventory";
import { useBranchStore } from "@/store/branchStore";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

type CountSession = {
  id: number;
  session_number: string;
  branch_name?: string;
  status: string;
  count_date: string;
  total_discrepancies?: number;
};

export default function PhysicalCountsPage() {
  const router = useRouter();
  const { activeBranchId } = useBranchStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [countDate, setCountDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const handleSort = (field: string) => {
    setSortConfig((current) => toggleSortConfig(current, field));
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["physical-counts", activeBranchId, sortConfig],
    queryFn: async () => {
      const res = await inventoryApi.listPhysicalCounts({
        ...(activeBranchId ? { branch: activeBranchId } : {}),
        ordering: sortOrderingParam(sortConfig) || "-count_date",
      });
      return Array.isArray(res) ? res : res.results ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!activeBranchId) throw new Error("Select a branch first");
      return inventoryApi.createPhysicalCount({
        branch: activeBranchId,
        count_date: countDate,
      });
    },
    onSuccess: (session: CountSession) => {
      queryClient.invalidateQueries({ queryKey: ["physical-counts"] });
      toast({ title: "Count session created" });
      const sessionId = session?.id;
      if (sessionId != null && !Number.isNaN(Number(sessionId))) {
        router.push(`/inventory/physical-counts/${sessionId}`);
      } else {
        toast({
          title: "Session created",
          description: "Open it from the sessions list below.",
        });
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sessions = (data as CountSession[]) ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Physical Inventory Counts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Start a count session, enter quantities, and complete to reconcile stock.
          </p>
        </div>
        <BranchReportChip />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New count session</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground">Count date</label>
            <Input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} className="w-40 mt-1" />
          </div>
          <Button
            disabled={!activeBranchId || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Start new count
          </Button>
          {!activeBranchId && (
            <p className="text-sm text-amber-600">Select an active branch to create a session.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
          {isError && <p className="text-sm text-destructive">Failed to load sessions.</p>}
          {!isLoading && !isError && sessions.length === 0 && (
            <p className="text-sm text-muted-foreground">No physical count sessions yet.</p>
          )}
          {sessions.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader field="session_number" sortConfig={sortConfig} onSort={handleSort}>
                    Session
                  </SortableHeader>
                  <SortableHeader field="branch__name" sortConfig={sortConfig} onSort={handleSort}>
                    Branch
                  </SortableHeader>
                  <SortableHeader field="count_date" sortConfig={sortConfig} onSort={handleSort}>
                    Date
                  </SortableHeader>
                  <SortableHeader field="status" sortConfig={sortConfig} onSort={handleSort}>
                    Status
                  </SortableHeader>
                  <TableHead>Discrepancies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/inventory/physical-counts/${s.id}`} className="text-primary hover:underline">
                        {s.session_number}
                      </Link>
                    </TableCell>
                    <TableCell>{s.branch_name ?? "—"}</TableCell>
                    <TableCell>{s.count_date}</TableCell>
                    <TableCell>{s.status}</TableCell>
                    <TableCell>{s.total_discrepancies ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
