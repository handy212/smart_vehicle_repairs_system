"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Search, Truck } from "lucide-react";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { branchesApi } from "@/lib/api/branches";
import { getUserFacingError } from "@/lib/api/errors";
import { fixedAssetsApi, type FixedAsset } from "@/lib/api/fixed-assets";
import { hrApi } from "@/lib/api/hr";
import { useToast } from "@/lib/hooks/useToast";

const blockedStatuses = new Set(["disposed", "sold", "retired"]);

export default function AssetTransfersPage() {
  return (
    <PermissionPageGuard permission="edit_assets">
      <AssetTransfersContent />
    </PermissionPageGuard>
  );
}

function AssetTransfersContent() {
  const [search, setSearch] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [branch, setBranch] = useState("");
  const [assignedTo, setAssignedTo] = useState("none");
  const [location, setLocation] = useState("");
  const [draftAssetId, setDraftAssetId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: assetsData, isLoading } = useQuery({
    queryKey: ["fixed-assets-transfers", search],
    queryFn: () => fixedAssetsApi.list({ search: search || undefined }),
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active"],
    queryFn: () => branchesApi.list({ is_active: true }),
  });

  const { data: staffData } = useQuery({
    queryKey: ["staff-active"],
    queryFn: async () => (await hrApi.staff.list({ employment_status: "active" })).data,
  });

  const candidates = useMemo(
    () => {
      const assets = Array.isArray(assetsData) ? assetsData : assetsData?.results ?? [];
      return assets.filter((asset: FixedAsset) => !blockedStatuses.has(asset.status));
    },
    [assetsData]
  );
  const staff = Array.isArray(staffData) ? staffData : staffData?.results ?? [];
  const selectedAsset = useMemo(
    () => candidates.find((asset: FixedAsset) => asset.id === selectedAssetId) ?? candidates[0] ?? null,
    [candidates, selectedAssetId]
  );
  const effectiveBranch =
    draftAssetId === selectedAsset?.id ? branch : selectedAsset ? String(selectedAsset.branch) : "";
  const effectiveAssignedTo =
    draftAssetId === selectedAsset?.id
      ? assignedTo
      : selectedAsset?.assigned_to
        ? String(selectedAsset.assigned_to)
        : "none";
  const effectiveLocation =
    draftAssetId === selectedAsset?.id ? location : selectedAsset?.location || "";

  const handleAssetSelect = (asset: FixedAsset) => {
    setSelectedAssetId(asset.id);
    setDraftAssetId(asset.id);
    setBranch(String(asset.branch));
    setAssignedTo(asset.assigned_to ? String(asset.assigned_to) : "none");
    setLocation(asset.location || "");
  };

  const transferMutation = useMutation({
    mutationFn: (assetId: number) =>
      fixedAssetsApi.update(assetId, {
        branch: Number.parseInt(effectiveBranch, 10),
        assigned_to: effectiveAssignedTo === "none" ? null : Number.parseInt(effectiveAssignedTo, 10),
        location: effectiveLocation,
      }),
    onSuccess: (_, assetId) => {
      queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
      queryClient.invalidateQueries({ queryKey: ["fixed-assets-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["fixed-asset", assetId] });
      toast({ title: "Transfer saved", description: "Asset assignment details were updated successfully." });
    },
    onError: (error: unknown) => {
      toast({
        title: "Transfer failed",
        description: getUserFacingError(error, "Could not update the asset transfer."),
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <PageHeader
          title="Asset Transfer"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Fixed Assets", href: "/fixed-assets" },
            { label: "Transfers" },
          ]}
          actions={
            <div className="flex gap-2">
              <Link href="/fixed-assets">
                <Button variant="outline" size="sm">Asset Register</Button>
              </Link>
              <Link href="/fixed-assets/disposals">
                <Button variant="outline" size="sm">Disposals</Button>
              </Link>
            </div>
          }
        />

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">Transferable Assets</CardTitle>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search asset number, name, branch, or assignee..."
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Loading assets...</div>
              ) : candidates.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No assets are available for transfer.
                </div>
              ) : (
                candidates.map((asset: FixedAsset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handleAssetSelect(asset)}
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
                      <span>Assigned: {asset.assigned_to_name || "Unassigned"}</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transfer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedAsset ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Select an asset to update its branch or assignee.
                </div>
              ) : (
                <>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="font-medium text-foreground">{selectedAsset.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedAsset.asset_number} · Current branch: {selectedAsset.branch_name}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Current assignee: {selectedAsset.assigned_to_name || "Unassigned"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="transfer-branch">Destination Branch</Label>
                    <Select
                      value={effectiveBranch}
                      onValueChange={(value) => {
                        setDraftAssetId(selectedAsset.id);
                        setBranch(value);
                      }}
                    >
                      <SelectTrigger id="transfer-branch">
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((branchOption) => (
                          <SelectItem key={branchOption.id} value={String(branchOption.id)}>
                            {branchOption.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="transfer-location">Location</Label>
                    <Input
                      id="transfer-location"
                      value={effectiveLocation}
                      onChange={(event) => {
                        setDraftAssetId(selectedAsset.id);
                        setLocation(event.target.value);
                      }}
                      placeholder="Bay, room, office, shelf, or yard position"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="transfer-assignee">Assign To</Label>
                    <Select
                      value={effectiveAssignedTo}
                      onValueChange={(value) => {
                        setDraftAssetId(selectedAsset.id);
                        setAssignedTo(value);
                      }}
                    >
                      <SelectTrigger id="transfer-assignee">
                        <SelectValue placeholder="Select assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {staff.map((staffMember) => (
                          <SelectItem key={staffMember.id} value={String(staffMember.id)}>
                            {staffMember.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                    This transfer updates the asset&apos;s branch, assignee, and location with the fields the current API supports.
                  </div>

                  <Button
                    onClick={() => selectedAsset && transferMutation.mutate(selectedAsset.id)}
                    disabled={transferMutation.isPending || !effectiveBranch}
                    className="w-full"
                  >
                    <Truck className="mr-1.5 h-4 w-4" />
                    {transferMutation.isPending ? "Saving..." : "Save Transfer"}
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
