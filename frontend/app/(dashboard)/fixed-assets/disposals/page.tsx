"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRightLeft, Search, Trash2 } from "lucide-react";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fixedAssetsApi, type FixedAsset } from "@/lib/api/fixed-assets";
import { getUserFacingError } from "@/lib/api/errors";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";

const terminalStatuses = new Set(["disposed", "sold", "retired"]);

export default function AssetDisposalsPage() {
  return (
    <PermissionPageGuard permission="edit_assets">
      <AssetDisposalsContent />
    </PermissionPageGuard>
  );
}

function AssetDisposalsContent() {
  const [search, setSearch] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [status, setStatus] = useState<"disposed" | "sold" | "retired">("disposed");
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().split("T")[0]);
  const [disposalMethod, setDisposalMethod] = useState("");
  const [disposalProceeds, setDisposalProceeds] = useState("");
  const [disposalNotes, setDisposalNotes] = useState("");
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["fixed-assets-disposals", search],
    queryFn: () => fixedAssetsApi.list({ search: search || undefined }),
  });

  const candidates = useMemo(
    () => {
      const assets = Array.isArray(data) ? data : data?.results ?? [];
      return assets.filter((asset: FixedAsset) => !terminalStatuses.has(asset.status));
    },
    [data]
  );

  const selectedAsset = useMemo(
    () => candidates.find((asset: FixedAsset) => asset.id === selectedAssetId) ?? candidates[0] ?? null,
    [candidates, selectedAssetId]
  );

  const disposalMutation = useMutation({
    mutationFn: (assetId: number) =>
      fixedAssetsApi.update(assetId, {
        status,
        disposal_date: disposalDate,
        disposal_method: disposalMethod || null,
        disposal_proceeds: disposalProceeds ? Number.parseFloat(disposalProceeds) : null,
        disposal_notes: disposalNotes,
      }),
    onSuccess: (_, assetId) => {
      queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
      queryClient.invalidateQueries({ queryKey: ["fixed-assets-disposals"] });
      queryClient.invalidateQueries({ queryKey: ["fixed-asset", assetId] });
      toast({ title: "Asset updated", description: "The asset disposal was recorded successfully." });
      setDisposalMethod("");
      setDisposalProceeds("");
      setDisposalNotes("");
    },
    onError: (error: unknown) => {
      toast({
        title: "Disposal failed",
        description: getUserFacingError(error, "Could not record the asset disposal."),
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <PageHeader
          title="Asset Disposal"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Fixed Assets", href: "/fixed-assets" },
            { label: "Disposals" },
          ]}
          actions={
            <div className="flex gap-2">
              <Link href="/fixed-assets">
                <Button variant="outline" size="sm">Asset Register</Button>
              </Link>
              <Link href="/fixed-assets/transfers">
                <Button variant="outline" size="sm">
                  <ArrowRightLeft className="mr-1.5 h-4 w-4" />
                  Transfers
                </Button>
              </Link>
            </div>
          }
        />

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">Assets Available for Disposal</CardTitle>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search asset number, name, or category..."
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Loading assets...</div>
              ) : candidates.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No active or inactive assets are available for disposal.
                </div>
              ) : (
                candidates.map((asset: FixedAsset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelectedAssetId(asset.id)}
                    className={`w-full rounded-lg border p-4 text-left transition ${
                      selectedAsset?.id === asset.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">{asset.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {asset.asset_number} · {asset.category_name}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{asset.branch_name}</div>
                        <div>{asset.location || "No location"}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Status: {asset.status}</span>
                      <span>Book value: {formatCurrency(asset.net_book_value)}</span>
                      <span>Assigned: {asset.assigned_to_name || "Unassigned"}</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Disposal Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedAsset ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Select an asset to record a disposal.
                </div>
              ) : (
                <>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="font-medium text-foreground">{selectedAsset.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedAsset.asset_number} · {selectedAsset.branch_name} · {selectedAsset.category_name}
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Net Book Value</div>
                        <div className="font-medium">{formatCurrency(selectedAsset.net_book_value)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Accumulated Depreciation</div>
                        <div className="font-medium">{formatCurrency(selectedAsset.accumulated_depreciation)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="disposal-status">Disposition</Label>
                    <Select value={status} onValueChange={(value: "disposed" | "sold" | "retired") => setStatus(value)}>
                      <SelectTrigger id="disposal-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="disposed">Disposed</SelectItem>
                        <SelectItem value="sold">Sold</SelectItem>
                        <SelectItem value="retired">Retired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="disposal-date">Disposal Date</Label>
                      <Input id="disposal-date" type="date" value={disposalDate} onChange={(event) => setDisposalDate(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="disposal-proceeds">Proceeds</Label>
                      <Input
                        id="disposal-proceeds"
                        type="number"
                        min="0"
                        step="0.01"
                        value={disposalProceeds}
                        onChange={(event) => setDisposalProceeds(event.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="disposal-method">Method</Label>
                    <Input
                      id="disposal-method"
                      value={disposalMethod}
                      onChange={(event) => setDisposalMethod(event.target.value)}
                      placeholder="Auction, scrap, private sale, donation..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="disposal-notes">Notes</Label>
                    <Textarea
                      id="disposal-notes"
                      value={disposalNotes}
                      onChange={(event) => setDisposalNotes(event.target.value)}
                      placeholder="Capture reason, approvals, and any handover details."
                      rows={5}
                    />
                  </div>

                  <Button
                    onClick={() => selectedAsset && disposalMutation.mutate(selectedAsset.id)}
                    disabled={disposalMutation.isPending || !disposalDate}
                    className="w-full"
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    {disposalMutation.isPending ? "Saving..." : "Record Disposal"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
