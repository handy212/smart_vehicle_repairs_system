"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, ComplianceDocument } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, FileText, Upload, Calendar, Search, Filter, Download } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function CompliancePage() {
    return (
        <PermissionGuard permission="view_compliance">
            <DynamicPageTitle title="Compliance" />
            <ComplianceContent />
        </PermissionGuard>
    );
}

function ComplianceContent() {
    const router = useRouter();
    const [showUpload, setShowUpload] = useState(false);
    const queryClient = useQueryClient();
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [searchTerm, setSearchTerm] = useState("");

    const { data: documentsData, isLoading } = useQuery({
        queryKey: ["hr", "compliance-documents", filterStatus, searchTerm],
        queryFn: async () => (await hrApi.complianceDocuments.list({
            status: filterStatus === "all" ? undefined : filterStatus,
            search: searchTerm || undefined
        })).data,
    });

    const { data: expiringSoon } = useQuery({
        queryKey: ["hr", "compliance-expiring"],
        queryFn: async () => (await hrApi.complianceDocuments.expiringSoon()).data,
    });

    const documents = documentsData?.results ?? [];

    const getStatusColor = (status: string) => {
        switch (status) {
            case "valid": return "bg-green-50 text-green-700 border-green-200";
            case "expiring_soon": return "bg-amber-50 text-amber-700 border-amber-200";
            case "expired": return "bg-red-50 text-red-700 border-red-200";
            default: return "bg-gray-100 text-gray-700 border-gray-200";
        }
    };

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Compliance & Documents"
                breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR", href: "/hr" }, { label: "Compliance" }]}
                actions={
                    <PermissionGuard permission="manage_compliance">
                        <Button onClick={() => setShowUpload(true)}><Upload className="h-4 w-4 mr-2" />Upload Document</Button>
                    </PermissionGuard>
                }
            />

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-amber-50 border-amber-200">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-amber-800 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Expiring Soon (30 Days)</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-amber-900">{expiringSoon?.length || 0}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" /> Total Documents</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{documentsData?.count || 0}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Shield className="h-4 w-4" /> Compliance Rate</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-green-600">98%</div></CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                        <CardTitle>Documents</CardTitle>
                        <div className="flex gap-2">
                            <div className="relative w-64">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search documents..." className="pl-8" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="valid">Valid</SelectItem>
                                    <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                                    <SelectItem value="expired">Expired</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Document Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Staff</TableHead>
                                <TableHead>Expiry Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [1, 2, 3].map(i => <TableRow key={i}><TableCell colSpan={6}><div className="h-10 bg-muted animate-pulse rounded" /></TableCell></TableRow>)
                            ) : documents.length > 0 ? (
                                documents.map(doc => (
                                    <TableRow key={doc.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-muted-foreground" />
                                                {doc.name}
                                            </div>
                                            {doc.document_number && <div className="text-xs text-muted-foreground ml-6">#{doc.document_number}</div>}
                                        </TableCell>
                                        <TableCell className="capitalize">{doc.document_type.replace("_", " ")}</TableCell>
                                        <TableCell>{doc.staff_name}</TableCell>
                                        <TableCell>{doc.expiry_date || "N/A"}</TableCell>
                                        <TableCell><Badge variant="outline" className={cn("capitalize shadow-none", getStatusColor(doc.status))}>{doc.status.replace("_", " ")}</Badge></TableCell>
                                        <TableCell className="text-right">
                                            {doc.document_file && (
                                                <Button variant="ghost" size="sm" asChild>
                                                    <a href={doc.document_file} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" /></a>
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No documents found</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <UploadDocumentDialog open={showUpload} onOpenChange={setShowUpload} onUploaded={() => { queryClient.invalidateQueries({ queryKey: ["hr", "compliance-documents"] }); setShowUpload(false); }} />
        </div>
    );
}

function UploadDocumentDialog({ open, onOpenChange, onUploaded }: { open: boolean, onOpenChange: (o: boolean) => void, onUploaded: () => void }) {
    const [empId, setEmpId] = useState("");
    const [type, setType] = useState("");
    const [name, setName] = useState("");
    const [number, setNumber] = useState(""); // Document number
    const [expiry, setExpiry] = useState("");
    const [file, setFile] = useState<File | null>(null);

    // Fetch staff
    const { data: staff } = useQuery({ queryKey: ["hr", "staff-list"], queryFn: async () => (await hrApi.staff.list()).data });

    const mut = useMutation({
        mutationFn: (formData: FormData) => hrApi.complianceDocuments.create(formData),
        onSuccess: () => { toast.success("Document uploaded"); onUploaded(); },
        onError: () => toast.error("Failed to upload"),
    });

    const handleSubmit = () => {
        if (!empId || !type || !name || !file) return;
        const fd = new FormData();
        fd.append("staff", empId);
        fd.append("document_type", type);
        fd.append("name", name);
        if (number) fd.append("document_number", number);
        if (expiry) fd.append("expiry_date", expiry);
        fd.append("document_file", file);

        mut.mutate(fd);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Upload Document</DialogTitle><DialogDescription>Add a new compliance document for an staff.</DialogDescription></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Staff</Label>
                        <Select value={empId} onValueChange={setEmpId}>
                            <SelectTrigger><SelectValue placeholder="Select Staff" /></SelectTrigger>
                            <SelectContent>
                                {staff?.results?.map(e => (
                                    <SelectItem key={e.id} value={e.id.toString()}>
                                        {e.full_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Document Type</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="license">License</SelectItem>
                                    <SelectItem value="certification">Certification</SelectItem>
                                    <SelectItem value="contract">Contract</SelectItem>
                                    <SelectItem value="nda">NDA</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2"><Label>Document Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Driver's License" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Doc Number (Optional)</Label><Input value={number} onChange={e => setNumber(e.target.value)} placeholder="ID #" /></div>
                        <div className="space-y-2"><Label>Expiry Date (Optional)</Label><Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></div>
                    </div>
                    <div className="space-y-2">
                        <Label>File</Label>
                        <Input type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
                    </div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={handleSubmit} disabled={!empId || !type || !name || !file || mut.isPending}>{mut.isPending ? "Uploading..." : "Upload"}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
