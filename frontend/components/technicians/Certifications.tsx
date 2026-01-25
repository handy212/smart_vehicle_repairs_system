"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { certificationsApi, Certification } from "@/lib/api/technicians";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, Award, AlertTriangle, CheckCircle, Clock, FileText, Upload } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { format, parseISO } from "date-fns";

interface CertificationsProps {
    technicianId: number;
}

export function Certifications({ technicianId }: CertificationsProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCert, setEditingCert] = useState<Certification | null>(null);
    const [formData, setFormData] = useState<{
        name: string;
        certification_number: string;
        issuing_authority: string;
        issue_date: string;
        expiry_date: string;
        status: Certification['status'];
        notes: string;
        document_file?: File;
    }>({
        name: "",
        certification_number: "",
        issuing_authority: "",
        issue_date: "",
        expiry_date: "",
        status: "active",
        notes: "",
    });

    const { data: certifications, isLoading } = useQuery({
        queryKey: ["certifications", technicianId],
        queryFn: () => certificationsApi.list({ technician: technicianId }),
    });

    const createMutation = useMutation({
        mutationFn: (data: Partial<Certification>) => certificationsApi.create({ ...data, technician: technicianId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["certifications", technicianId] });
            toast({
                title: "Success",
                description: "Certification added successfully",
            });
            handleCloseDialog();
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to add certification",
                variant: "destructive",
            });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<Certification> }) =>
            certificationsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["certifications", technicianId] });
            toast({
                title: "Success",
                description: "Certification updated successfully",
            });
            handleCloseDialog();
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to update certification",
                variant: "destructive",
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => certificationsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["certifications", technicianId] });
            toast({
                title: "Success",
                description: "Certification deleted successfully",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to delete certification",
                variant: "destructive",
            });
        },
    });

    const handleOpenDialog = (cert?: Certification) => {
        if (cert) {
            setEditingCert(cert);
            setFormData({
                name: cert.name,
                certification_number: cert.certification_number,
                issuing_authority: cert.issuing_authority,
                issue_date: cert.issue_date,
                expiry_date: cert.expiry_date || "",
                status: cert.status,
                notes: cert.notes || "",
            });
        } else {
            setEditingCert(null);
            setFormData({
                name: "",
                certification_number: "",
                issuing_authority: "",
                issue_date: "",
                expiry_date: "",
                status: "active",
                notes: "",
            });
        }
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setEditingCert(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Prepare base data
        const baseData = {
            technician: technicianId,
            name: formData.name,
            certification_number: formData.certification_number || '',
            issuing_authority: formData.issuing_authority,
            issue_date: formData.issue_date,
            expiry_date: formData.expiry_date || '',
            status: formData.status,
            notes: formData.notes || '',
        };

        // If there's a file, use FormData
        if (formData.document_file) {
            const formDataToSend = new FormData();

            // Explicitly append each field
            formDataToSend.append('technician', technicianId.toString());
            formDataToSend.append('name', formData.name);
            formDataToSend.append('certification_number', formData.certification_number || '');
            formDataToSend.append('issuing_authority', formData.issuing_authority);
            formDataToSend.append('issue_date', formData.issue_date);
            formDataToSend.append('expiry_date', formData.expiry_date || '');
            formDataToSend.append('status', formData.status);
            formDataToSend.append('notes', formData.notes || '');
            formDataToSend.append('document_file', formData.document_file);

            console.log('Submitting FormData with file:', {
                technician: technicianId,
                name: formData.name,
                issuing_authority: formData.issuing_authority,
                issue_date: formData.issue_date,
                hasFile: !!formData.document_file,
            });

            if (editingCert) {
                updateMutation.mutate({ id: editingCert.id, data: formDataToSend as any });
            } else {
                createMutation.mutate(formDataToSend as any);
            }
        } else {
            // Regular JSON submission
            console.log('Submitting JSON data:', baseData);

            if (editingCert) {
                updateMutation.mutate({ id: editingCert.id, data: baseData });
            } else {
                createMutation.mutate(baseData);
            }
        }
    };

    const handleDelete = (cert: Certification) => {
        if (confirm(`Are you sure you want to delete "${cert.name}"?`)) {
            deleteMutation.mutate(cert.id);
        }
    };

    const getStatusBadge = (cert: Certification) => {
        if (cert.is_expired) {
            return <Badge variant="danger"><AlertTriangle className="h-3 w-3 mr-1" />Expired</Badge>;
        }
        if (cert.is_expiring_soon) {
            return <Badge variant="warning" className="bg-orange-100 text-orange-800 border-orange-200"><Clock className="h-3 w-3 mr-1" />Expiring Soon</Badge>;
        }
        if (cert.status === 'active') {
            return <Badge variant="default" className="bg-green-100 text-green-800 border-green-200"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
        }
        return <Badge variant="outline">{cert.status}</Badge>;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }


    const activeCerts = (Array.isArray(certifications) ? certifications : (certifications as any)?.results || []).filter((c: Certification) => c.status === 'active');
    const expiringSoon = (Array.isArray(certifications) ? certifications : (certifications as any)?.results || []).filter((c: Certification) => c.is_expiring_soon);
    const allCerts: Certification[] = Array.isArray(certifications) ? certifications : (certifications as any)?.results || [];

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Active Certifications</p>
                                <p className="text-2xl font-bold">{activeCerts.length}</p>
                            </div>
                            <Award className="h-8 w-8 text-primary opacity-50" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Expiring Soon</p>
                                <p className="text-2xl font-bold text-orange-600">{expiringSoon.length}</p>
                            </div>
                            <AlertTriangle className="h-8 w-8 text-orange-500 opacity-50" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4 flex items-center justify-center">
                        <Button onClick={() => handleOpenDialog()} className="w-full">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Certification
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Certifications List */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Award className="h-5 w-5 text-primary" />
                        All Certifications ({allCerts.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {allCerts && allCerts.length > 0 ? (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Certification</TableHead>
                                        <TableHead>Number</TableHead>
                                        <TableHead>Issuer</TableHead>
                                        <TableHead>Issue Date</TableHead>
                                        <TableHead>Expiry</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {allCerts.map((cert) => (
                                        <TableRow key={cert.id}>
                                            <TableCell className="font-medium">{cert.name}</TableCell>
                                            <TableCell className="font-mono text-sm">{cert.certification_number || '-'}</TableCell>
                                            <TableCell className="text-sm">{cert.issuing_authority}</TableCell>
                                            <TableCell className="text-sm">{format(parseISO(cert.issue_date), 'MMM d, yyyy')}</TableCell>
                                            <TableCell className="text-sm">
                                                {cert.expiry_date ? (
                                                    <div>
                                                        {format(parseISO(cert.expiry_date), 'MMM d, yyyy')}
                                                        {cert.days_until_expiry !== null && cert.days_until_expiry > 0 && (
                                                            <div className="text-xs text-muted-foreground">
                                                                ({cert.days_until_expiry} days)
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">No expiry</span>
                                                )}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(cert)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleOpenDialog(cert)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(cert)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/5 border-dashed">
                            <Award className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <h3 className="text-lg font-semibold mb-1 text-foreground">No Certifications</h3>
                            <p>Add certifications to track professional credentials.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogClose onOpenChange={setIsDialogOpen} />
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>{editingCert ? "Edit Certification" : "Add New Certification"}</DialogTitle>
                            <DialogDescription>
                                {editingCert
                                    ? "Update certification details."
                                    : "Add a new professional certification or license."}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="px-6 py-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="name">Certification Name *</Label>
                                    <Input
                                        id="name"
                                        placeholder="e.g., ASE Master Technician"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="cert_number">Certification Number</Label>
                                    <Input
                                        id="cert_number"
                                        placeholder="e.g., ASE-12345"
                                        value={formData.certification_number}
                                        onChange={(e) => setFormData({ ...formData, certification_number: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="issuer">Issuing Authority *</Label>
                                    <Input
                                        id="issuer"
                                        placeholder="e.g., ASE, State DMV"
                                        value={formData.issuing_authority}
                                        onChange={(e) => setFormData({ ...formData, issuing_authority: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="issue_date">Issue Date *</Label>
                                    <Input
                                        id="issue_date"
                                        type="date"
                                        value={formData.issue_date}
                                        onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="expiry_date">Expiry Date</Label>
                                    <Input
                                        id="expiry_date"
                                        type="date"
                                        value={formData.expiry_date}
                                        onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                                    />
                                </div>

                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="status">Status</Label>
                                    <Select
                                        id="status"
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value as Certification['status'] })}
                                    >
                                        <option value="active">Active</option>
                                        <option value="expired">Expired</option>
                                        <option value="pending_renewal">Pending Renewal</option>
                                        <option value="suspended">Suspended</option>
                                    </Select>
                                </div>

                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="document">Upload Document</Label>
                                    <Input
                                        id="document"
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                setFormData({ ...formData, document_file: file });
                                            }
                                        }}
                                        className="cursor-pointer"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Accepted formats: PDF, JPG, PNG (Max 10MB)
                                    </p>
                                </div>

                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="notes">Notes</Label>
                                    <Textarea
                                        id="notes"
                                        placeholder="Additional notes..."
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={handleCloseDialog}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingCert ? "Update" : "Add"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
