"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { inventoryApi } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, Plus } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";
import { useEffect, useState } from "react";
import apiClient from "@/lib/api/client";
import { getUserFacingError } from "@/lib/api/errors";

type CountItem = {
  id: number;
  part?: number;
  part_number?: string;
  part_name?: string;
  stock_item?: number;
  system_quantity?: number;
  physical_quantity?: number;
  variance?: number;
  discrepancy?: number;
  reconciled?: boolean;
};

type StockRow = {
  id: number;
  part: number;
  part_number?: string;
  part_name?: string;
  quantity_in_stock?: number;
};

export default function PhysicalCountDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stockItemId, setStockItemId] = useState("");
  const [physicalQty, setPhysicalQty] = useState("");
  const [draftCounts, setDraftCounts] = useState<Record<number, string>>({});

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ["physical-count", id],
    queryFn: () => inventoryApi.getPhysicalCount(id),
    enabled: !Number.isNaN(id),
  });

  const s = session as {
    session_number: string;
    status: string;
    branch?: number;
    branch_name?: string;
    count_date: string;
    notes?: string;
    items?: CountItem[];
    unreconciled_count?: number;
  } | undefined;

  useEffect(() => {
    if (!s?.items) return;
    const next: Record<number, string> = {};
    for (const item of s.items) {
      next[item.id] = String(item.physical_quantity ?? "");
    }
    setDraftCounts(next);
  }, [s?.items]);

  const { data: stockData } = useQuery({
    queryKey: ["stock-items", "count", s?.branch],
    queryFn: () =>
      inventoryApi.listStockItems({
        branch: s?.branch,
        page_size: 200,
      } as { branch?: number; page_size?: number }),
    enabled: !!s?.branch && s.status === "in_progress",
  });

  const stockRows: StockRow[] = stockData?.results ?? [];

  const startMutation = useMutation({
    mutationFn: () => inventoryApi.startPhysicalCount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["physical-count", id] });
      toast({ title: "Count started" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => inventoryApi.completePhysicalCount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["physical-count", id] });
      toast({ title: "Count completed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addItemMutation = useMutation({
    mutationFn: async () => {
      const stock = stockRows.find((r) => String(r.id) === stockItemId);
      if (!stock) throw new Error("Select a stock line");
      const qty = parseInt(physicalQty, 10);
      if (Number.isNaN(qty) || qty < 0) throw new Error("Enter a valid whole-number count");
      return inventoryApi.addPhysicalCountItem(id, {
        part: stock.part,
        stock_item: stock.id,
        physical_quantity: qty,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["physical-count", id] });
      setStockItemId("");
      setPhysicalQty("");
      toast({ title: "Count line saved" });
    },
    onError: (e: unknown) => {
      toast({
        title: "Could not add line",
        description: getUserFacingError(e, "Request failed"),
        variant: "destructive",
      });
    },
  });

  const updateCountMutation = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: number; quantity: number }) =>
      inventoryApi.updatePhysicalCountItem(itemId, { physical_quantity: quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["physical-count", id] });
      toast({ title: "Counted quantity updated" });
    },
    onError: (e: unknown) => {
      toast({
        title: "Could not update count",
        description: getUserFacingError(e, "Request failed"),
        variant: "destructive",
      });
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const res = await apiClient.post(`/inventory/physical-count-items/${itemId}/reconcile/`, {
        create_adjustment: true,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["physical-count", id] });
      toast({ title: "Line reconciled" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Loader2 className="h-8 w-8 animate-spin m-6" />;
  if (isError || !s) {
    return <p className="p-6 text-destructive">Session not found.</p>;
  }

  const canEdit = s.status === "in_progress";
  const existingStockIds = new Set((s.items ?? []).map((item) => item.stock_item).filter(Boolean));
  const availableStockRows = stockRows.filter((row) => !existingStockIds.has(row.id));

  const saveCount = (item: CountItem) => {
    const raw = draftCounts[item.id];
    const qty = parseInt(raw ?? "", 10);
    if (Number.isNaN(qty) || qty < 0) {
      toast({
        title: "Invalid count",
        description: "Enter a valid whole-number quantity.",
        variant: "destructive",
      });
      return;
    }
    if (qty === item.physical_quantity) return;
    updateCountMutation.mutate({ itemId: item.id, quantity: qty });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Link href="/inventory/physical-counts" className="text-sm text-primary flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to counts
      </Link>
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{s.session_number}</h1>
          <p className="text-sm text-muted-foreground">
            {s.branch_name} · {s.count_date} · {s.status}
          </p>
          {s.notes ? <p className="text-xs text-muted-foreground mt-1">{s.notes}</p> : null}
        </div>
        <div className="flex gap-2">
          {s.status === "draft" && (
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              Start count
            </Button>
          )}
          {canEdit && (
            <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
              Complete count
            </Button>
          )}
        </div>
      </div>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add count line
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 items-end">
            <div className="min-w-[220px]">
              <Label className="text-xs">Stock line</Label>
              <select
                className="w-full border rounded px-3 py-2 h-9 text-sm mt-1"
                value={stockItemId}
                onChange={(e) => setStockItemId(e.target.value)}
              >
                <option value="">Select part…</option>
                {availableStockRows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {[row.part_number, row.part_name].filter(Boolean).join(" — ") ||
                      `Part #${row.part}`}{" "}
                    (on hand {row.quantity_in_stock ?? 0})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Counted qty</Label>
              <Input
                type="number"
                min={0}
                step="1"
                className="w-28 mt-1"
                value={physicalQty}
                onChange={(e) => setPhysicalQty(e.target.value)}
              />
            </div>
            <Button
              onClick={() => addItemMutation.mutate()}
              disabled={!stockItemId || physicalQty === "" || addItemMutation.isPending}
            >
              Add line
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Count lines</CardTitle>
        </CardHeader>
        <CardContent>
          {(s.items ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No lines yet. Start the session and add counts above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead>Counted</TableHead>
                  <TableHead>Variance</TableHead>
                  <TableHead>Reconciled</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(s.items ?? []).map((item) => {
                  const draft = draftCounts[item.id] ?? "";
                  const draftQty = parseInt(draft, 10);
                  const dirty =
                    !Number.isNaN(draftQty) && draftQty !== (item.physical_quantity ?? null);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        {[item.part_number, item.part_name].filter(Boolean).join(" — ") ||
                          (item.part ? `Part #${item.part}` : String(item.id))}
                      </TableCell>
                      <TableCell>{item.system_quantity ?? "—"}</TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            className="h-8 w-24"
                            value={draft}
                            onChange={(e) =>
                              setDraftCounts((current) => ({
                                ...current,
                                [item.id]: e.target.value,
                              }))
                            }
                            onBlur={() => saveCount(item)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                          />
                        ) : (
                          item.physical_quantity ?? "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {canEdit && dirty
                          ? draftQty - (item.system_quantity ?? 0)
                          : item.discrepancy ?? item.variance ?? "—"}
                      </TableCell>
                      <TableCell>{item.reconciled ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        {canEdit && dirty && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveCount(item)}
                            disabled={updateCountMutation.isPending}
                          >
                            Save
                          </Button>
                        )}
                        {!item.reconciled && s.status === "completed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reconcileMutation.mutate(item.id)}
                            disabled={reconcileMutation.isPending}
                          >
                            Reconcile
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {s.unreconciled_count != null && s.unreconciled_count > 0 && (
            <p className="text-sm text-amber-600 mt-4">{s.unreconciled_count} unreconciled line(s)</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
