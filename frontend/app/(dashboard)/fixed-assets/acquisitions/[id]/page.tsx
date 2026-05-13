"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    fixedAssetsApi,
    type AssetAcquisitionRequest,
} from "@/lib/api/fixed-assets";
import { documentsApi } from "@/lib/api/documents";
import { hrApi, type StaffListItem } from "@/lib/api/hr";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionButton } from "@/components/auth/PermissionButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, FileUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useAuthStore } from "@/store/authStore";
import {
    canApproveOrRejectAcquisition,
    canReceiveAcquisition,
    canSubmitAcquisitionDraft,
    canUploadAcquisitionInvoiceReceipt,
    hasInvoiceOrReceiptAttachment,
} from "@/lib/fixed-assets/acquisition-rules";
import type { Document } from "@/lib/api/documents";

export default function AcquisitionDetailPage() {
    return (
        <PermissionGuard permission="view_assets">
            <AcquisitionDetailContent />
        </PermissionGuard>
    );
}

function AcquisitionDetailContent() {
    const params = useParams();
    const id = Number(params.id);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user } = useAuthStore();

    const [approverIds, setApproverIds] = useState<number[]>([]);
    const [rejectReason, setRejectReason] = useState("");
    const [uploadKind, setUploadKind] = useState<"invoice" | "receipt">("invoice");

    const [recvCost, setRecvCost] = useState("");
    const [recvAcqDate, setRecvAcqDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [recvDepStart, setRecvDepStart] = useState("");
    const [recvAssetNumber, setRecvAssetNumber] = useState("");
    const [recvLocation, setRecvLocation] = useState("");
    const [recvNotes, setRecvNotes] = useState("");
    const [recvReceivedNotes, setRecvReceivedNotes] = useState("");
    const [recvTotalUnits, setRecvTotalUnits] = useState("");
    const [recvFormInitialized, setRecvFormInitialized] = useState(false);

    const { data: acq, isLoading } = useQuery({
        queryKey: ["fixed-assets-acquisition", id],
        queryFn: () => fixedAssetsApi.acquisitions.get(id),
        enabled: Number.isFinite(id),
    });

    const { data: docsResponse, refetch: refetchDocs } = useQuery({
        queryKey: ["acquisition-docs", id],
        queryFn: () => documentsApi.list({ asset_acquisition_request: id }),
        enabled: Number.isFinite(id),
    });

    const { data: staffResponse } = useQuery({
        queryKey: ["staff-list-acquisition"],
        queryFn: async () => {
            const r = await hrApi.staff.list({ employment_status: "active" });
            return r.data;
        },
    });

    const documents: Document[] = useMemo(() => {
        if (!docsResponse) return [];
        return Array.isArray(docsResponse) ? docsResponse : docsResponse.results || [];
    }, [docsResponse]);

    const staff: StaffListItem[] = useMemo(() => {
        if (!staffResponse) return [];
        return Array.isArray(staffResponse) ? staffResponse : staffResponse.results || [];
    }, [staffResponse]);

    const supportingOk = hasInvoiceOrReceiptAttachment(documents);

    const submitMutation = useMutation({
        mutationFn: () => fixedAssetsApi.acquisitions.submitForApproval(id, approverIds),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fixed-assets-acquisition", id] });
            queryClient.invalidateQueries({ queryKey: ["fixed-assets-acquisitions"] });
            toast({ title: "Submitted", description: "Sent for approval" });
        },
        onError: (err: unknown) =>
            toast({
                title: "Submit failed",
                description: getApiErrorMessage(err, "Could not submit"),
                variant: "destructive",
            }),
    });

    const approveMutation = useMutation({
        mutationFn: () => fixedAssetsApi.acquisitions.approve(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fixed-assets-acquisition", id] });
            queryClient.invalidateQueries({ queryKey: ["fixed-assets-acquisitions"] });
            toast({ title: "Approved" });
        },
        onError: (err: unknown) =>
            toast({
                title: "Approve failed",
                description: getApiErrorMessage(err, "Could not approve"),
                variant: "destructive",
            }),
    });

    const rejectMutation = useMutation({
        mutationFn: () => fixedAssetsApi.acquisitions.reject(id, rejectReason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fixed-assets-acquisition", id] });
            queryClient.invalidateQueries({ queryKey: ["fixed-assets-acquisitions"] });
            toast({ title: "Rejected" });
            setRejectReason("");
        },
        onError: (err: unknown) =>
            toast({
                title: "Reject failed",
                description: getApiErrorMessage(err, "Could not reject"),
                variant: "destructive",
            }),
    });

    const receiveMutation = useMutation({
        mutationFn: () =>
            fixedAssetsApi.acquisitions.receive(id, {
                acquisition_cost: Number(recvCost),
                acquisition_date: recvAcqDate,
                depreciation_start_date: recvDepStart || null,
                asset_number: recvAssetNumber.trim() || undefined,
                location: recvLocation,
                notes: recvNotes,
                received_notes: recvReceivedNotes,
                total_units: recvTotalUnits ? Number(recvTotalUnits) : null,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fixed-assets-acquisition", id] });
            queryClient.invalidateQueries({ queryKey: ["fixed-assets-acquisitions"] });
            queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
            toast({ title: "Received", description: "Asset capitalized" });
        },
        onError: (err: unknown) =>
            toast({
                title: "Receive failed",
                description: getApiErrorMessage(err, "Could not receive"),
                variant: "destructive",
            }),
    });

    const uploadMutation = useMutation({
        mutationFn: async (file: File) => {
            const fd = new FormData();
            fd.append("title", `${uploadKind === "invoice" ? "Invoice" : "Receipt"} — ${acq?.request_number || id}`);
            fd.append("file", file);
            fd.append("asset_acquisition_request", String(id));
            fd.append("acquisition_document_kind", uploadKind);
            return documentsApi.create(fd);
        },
        onSuccess: () => {
            refetchDocs();
            toast({ title: "Uploaded" });
        },
        onError: (err: unknown) =>
            toast({
                title: "Upload failed",
                description: getApiErrorMessage(err, "Could not upload"),
                variant: "destructive",
            }),
    });

    const toggleApprover = (userId: number) => {
        setApproverIds((prev) =>
            prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId],
        );
    };

    useEffect(() => {
        if (!acq || recvFormInitialized) return;
        const cost =
            typeof acq.expected_acquisition_cost === "string"
                ? acq.expected_acquisition_cost
                : String(acq.expected_acquisition_cost ?? "");
        setRecvCost(cost);
        setRecvFormInitialized(true);
    }, [acq, recvFormInitialized]);

    if (!Number.isFinite(id)) {
        return <div className="p-6 text-sm text-destructive">Invalid request</div>;
    }

    if (isLoading || !acq) {
        return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
    }

    const isRequester = user?.id === acq.requested_by;
    const showSubmit = canSubmitAcquisitionDraft(acq.status) && isRequester;
    const showApproveReject = canApproveOrRejectAcquisition(acq.status);
    const showInvoiceReceiptUpload = canUploadAcquisitionInvoiceReceipt(acq.status);

    return (
        <div className="flex-1 overflow-auto p-4 max-w-3xl mx-auto space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Link href="/fixed-assets/acquisitions">
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold text-primary">{acq.request_number}</span>
                            <Badge variant="secondary" className="text-[10px] uppercase">
                                {acq.status.replace(/_/g, " ")}
                            </Badge>
                        </div>
                        <h1 className="text-lg font-semibold">{acq.title}</h1>
                        <p className="text-xs text-muted-foreground">{acq.proposed_asset_name}</p>
                    </div>
                </div>
                {acq.created_asset_id ? (
                    <Link href={`/fixed-assets/${acq.created_asset_id}`}>
                        <Button size="sm" variant="outline" className="text-xs">
                            Open asset {acq.created_asset_number}
                        </Button>
                    </Link>
                ) : null}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Summary</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2 text-muted-foreground">
                    <div>
                        <span className="font-semibold text-foreground">Branch: </span>
                        {acq.branch_name || acq.branch}
                    </div>
                    <div>
                        <span className="font-semibold text-foreground">Category: </span>
                        {acq.category_name || acq.category}
                    </div>
                    <div>
                        <span className="font-semibold text-foreground">Expected cost: </span>
                        {String(acq.expected_acquisition_cost)}
                    </div>
                    {acq.description ? (
                        <div>
                            <span className="font-semibold text-foreground">Notes: </span>
                            {acq.description}
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            {showSubmit ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Submit for approval</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                            Choose approvers (must have approval permission). You cannot approve your own request.
                        </p>
                        <div className="max-h-48 overflow-auto border rounded-md divide-y">
                            {staff
                                .filter((s) => Number(s.user) !== Number(user?.id))
                                .map((s) => (
                                    <label
                                        key={s.id}
                                        className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                                    >
                                        <Checkbox
                                            checked={approverIds.includes(s.user)}
                                            onCheckedChange={() => toggleApprover(s.user)}
                                        />
                                        <span>{s.full_name}</span>
                                        <span className="text-xs text-muted-foreground">({s.role || "staff"})</span>
                                    </label>
                                ))}
                        </div>
                        <Button
                            size="sm"
                            disabled={submitMutation.isPending || approverIds.length === 0}
                            onClick={() => submitMutation.mutate()}
                        >
                            Submit for approval
                        </Button>
                    </CardContent>
                </Card>
            ) : null}

            {showApproveReject ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Approval</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            <PermissionButton
                                permissions={["approve_asset_acquisitions", "manage_assets"]}
                                size="sm"
                                disabled={approveMutation.isPending}
                                onClick={() => approveMutation.mutate()}
                            >
                                Approve
                            </PermissionButton>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Reject reason (optional)</Label>
                            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} />
                            <PermissionButton
                                permissions={["approve_asset_acquisitions", "manage_assets"]}
                                variant="destructive"
                                size="sm"
                                disabled={rejectMutation.isPending}
                                onClick={() => rejectMutation.mutate()}
                            >
                                Reject
                            </PermissionButton>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {showInvoiceReceiptUpload ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <FileUp className="w-4 h-4" />
                            {acq.status === "received"
                                ? "Invoice / receipt (acquisition records)"
                                : "Invoice / receipt (required before receive)"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {acq.status === "received" ? (
                            <p className="text-xs text-muted-foreground">
                                Add invoice or receipt files for this acquisition only. Legacy assets added directly to
                                the register are managed separately.
                            </p>
                        ) : null}
                        {!supportingOk ? (
                            <p className="text-xs text-destructive font-medium">
                                Upload at least one invoice or receipt linked to this request.
                            </p>
                        ) : (
                            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                Supporting documents attached.
                            </p>
                        )}
                        <div className="flex flex-wrap gap-2 items-center">
                            <select
                                value={uploadKind}
                                onChange={(e) => setUploadKind(e.target.value as "invoice" | "receipt")}
                                className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                            >
                                <option value="invoice">Invoice</option>
                                <option value="receipt">Receipt</option>
                            </select>
                            <Input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx"
                                className="max-w-xs h-9 text-xs"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) uploadMutation.mutate(f);
                                    e.target.value = "";
                                }}
                            />
                        </div>
                        <ul className="text-xs space-y-1 text-muted-foreground">
                            {documents.map((d) => (
                                <li key={d.id}>
                                    {d.original_filename}{" "}
                                    {d.acquisition_document_kind ? `(${d.acquisition_document_kind})` : ""}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            ) : null}

            {acq.status === "approved" ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Receive & capitalize</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {!supportingOk ? (
                            <p className="text-xs text-muted-foreground">Complete document upload above first.</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Actual acquisition cost *</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={recvCost}
                                            onChange={(e) => setRecvCost(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Acquisition date *</Label>
                                        <Input
                                            type="date"
                                            value={recvAcqDate}
                                            onChange={(e) => setRecvAcqDate(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Depreciation start (optional)</Label>
                                        <Input
                                            type="date"
                                            value={recvDepStart}
                                            onChange={(e) => setRecvDepStart(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Asset number (auto if empty)</Label>
                                        <Input
                                            value={recvAssetNumber}
                                            onChange={(e) => setRecvAssetNumber(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label className="text-xs">Location</Label>
                                        <Input value={recvLocation} onChange={(e) => setRecvLocation(e.target.value)} className="h-9" />
                                    </div>
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label className="text-xs">Total units (only for units-of-production)</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={recvTotalUnits}
                                            onChange={(e) => setRecvTotalUnits(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label className="text-xs">Asset notes</Label>
                                        <Textarea value={recvNotes} onChange={(e) => setRecvNotes(e.target.value)} rows={2} />
                                    </div>
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label className="text-xs">Receipt notes</Label>
                                        <Textarea
                                            value={recvReceivedNotes}
                                            onChange={(e) => setRecvReceivedNotes(e.target.value)}
                                            rows={2}
                                        />
                                    </div>
                                </div>
                                <PermissionButton
                                    permissions={["receive_asset_acquisitions", "manage_assets"]}
                                    size="sm"
                                    disabled={
                                        receiveMutation.isPending || !canReceiveAcquisition(acq.status, documents)
                                    }
                                    onClick={() => receiveMutation.mutate()}
                                >
                                    Complete receipt & create asset
                                </PermissionButton>
                            </>
                        )}
                    </CardContent>
                </Card>
            ) : null}

            {acq.status === "rejected" && acq.rejection_reason ? (
                <Card className="border-destructive/40">
                    <CardHeader>
                        <CardTitle className="text-base text-destructive">Rejected</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">{acq.rejection_reason}</CardContent>
                </Card>
            ) : null}
        </div>
    );
}
