"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { documentsApi, Document } from "@/lib/api/documents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, Trash2, Upload, File, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface DocumentListProps {
    customerId?: number;
    vehicleId?: number;
}

export function DocumentList({ customerId, vehicleId }: DocumentListProps) {
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data, isLoading } = useQuery({
        queryKey: ["documents", { customerId, vehicleId }],
        queryFn: () => documentsApi.list({ customer: customerId, vehicle: vehicleId }),
    });

    const documents = data?.results || [];

    const deleteMutation = useMutation({
        mutationFn: (id: number) => documentsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["documents"] });
            toast({ title: "Success", description: "Document deleted successfully" });
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to delete document", variant: "destructive" });
        },
    });

    const downloadMutation = useMutation({
        mutationFn: async (doc: Document) => {
            const blob = await documentsApi.download(doc.id);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", doc.original_filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to download document", variant: "destructive" });
        },
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Documents ({documents.length})</h3>
                <Button onClick={() => setShowUploadDialog(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Document
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Uploaded By</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8">
                                        Loading documents...
                                    </TableCell>
                                </TableRow>
                            ) : documents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No documents found. Upload one to get started.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                documents.map((doc) => (
                                    <TableRow key={doc.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                {doc.file_type.startsWith("image/") ? (
                                                    <ImageIcon className="w-4 h-4 text-primary" />
                                                ) : (
                                                    <FileText className="w-4 h-4 text-orange-500" />
                                                )}
                                                {doc.title}
                                            </div>
                                        </TableCell>
                                        <TableCell>{doc.description || "-"}</TableCell>
                                        <TableCell>{doc.original_filename.split('.').pop()?.toUpperCase()}</TableCell>
                                        <TableCell>{doc.uploaded_by_name || doc.uploaded_by_email || "Unknown"}</TableCell>
                                        <TableCell>{format(new Date(doc.uploaded_at), "MMM dd, yyyy")}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => downloadMutation.mutate(doc)}
                                                    title="Download"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-500 hover:text-red-700"
                                                    onClick={() => {
                                                        if (confirm("Are you sure?")) deleteMutation.mutate(doc.id);
                                                    }}
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <UploadDocumentDialog
                open={showUploadDialog}
                onOpenChange={setShowUploadDialog}
                customerId={customerId}
                vehicleId={vehicleId}
                onSuccess={() => {
                    setShowUploadDialog(false);
                    queryClient.invalidateQueries({ queryKey: ["documents"] });
                }}
            />
        </div>
    );
}

function UploadDocumentDialog({ open, onOpenChange, customerId, vehicleId, onSuccess }: any) {
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const { toast } = useToast();

    const uploadMutation = useMutation({
        mutationFn: (formData: FormData) => documentsApi.create(formData),
        onSuccess: () => {
            toast({ title: "Success", description: "Document uploaded successfully" });
            setFile(null);
            setTitle("");
            setDescription("");
            onSuccess();
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error?.response?.data?.detail || "Failed to upload document",
                variant: "destructive"
            });
        }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !title) return;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", title);
        formData.append("description", description);
        if (customerId) formData.append("customer", customerId.toString());
        if (vehicleId) formData.append("vehicle", vehicleId.toString());

        uploadMutation.mutate(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Upload Document</DialogTitle>
                    <DialogDescription>Upload a file related to this record.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="title">Title *</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., Insurance Policy"
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional notes about this file"
                        />
                    </div>
                    <div>
                        <Label htmlFor="file">File *</Label>
                        <Input
                            id="file"
                            type="file"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) {
                                    setFile(f);
                                    if (!title) setTitle(f.name);
                                }
                            }}
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={uploadMutation.isPending || !file}>
                            {uploadMutation.isPending ? "Uploading..." : "Upload"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
