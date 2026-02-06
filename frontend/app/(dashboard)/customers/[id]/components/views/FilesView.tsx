"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Upload, File, Trash2, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";

interface FilesViewProps {
    customerId: number;
}

export function FilesView({ customerId }: FilesViewProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isUploading, setIsUploading] = useState(false);
    const [fileInputKey, setFileInputKey] = useState(0); // to reset input

    const { data: files = [], isLoading } = useQuery({
        queryKey: ["customer-files", customerId],
        queryFn: () => customersApi.documents.list(customerId),
    });

    const uploadMutation = useMutation({
        mutationFn: (file: File) => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("name", file.name);
            formData.append("customer", customerId.toString());
            return customersApi.documents.create(formData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-files", customerId] });
            toast({ title: "File uploaded successfully" });
            setIsUploading(false);
        },
        onError: () => {
            toast({ title: "Failed to upload file", variant: "destructive" });
            setIsUploading(false);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => customersApi.documents.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-files", customerId] });
            toast({ title: "File deleted" });
        },
        onError: () => {
            toast({ title: "Failed to delete file", variant: "destructive" });
        }
    });

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsUploading(true);
            uploadMutation.mutate(e.target.files[0]);
            setFileInputKey(prev => prev + 1); // Reset input
        }
    };

    const columns = [
        { header: "Name", accessorKey: "name", cell: (item: any) => <div className="flex items-center gap-2"><File className="w-4 h-4 text-primary" /><a href={item.file} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{item.name}</a></div> },
        { header: "Type", accessorKey: "extension" },
        { header: "Size", accessorKey: "size", cell: (item: any) => item.size ? `${(item.size / 1024).toFixed(0)} KB` : '-' },
        { header: "Uploaded By", accessorKey: "uploaded_by_name", cell: (item: any) => item.uploaded_by_name || "System" },
        { header: "Date", accessorKey: "created_at", cell: (item: any) => format(new Date(item.created_at), "MMM dd, yyyy") },
        {
            header: "Actions",
            accessorKey: "actions",
            cell: (item: any) => (
                <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" asChild>
                        <a href={item.file} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => { if (confirm("Delete file?")) deleteMutation.mutate(item.id); }}>
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            )
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Documents</h3>
                <div className="relative">
                    <input
                        key={fileInputKey}
                        type="file"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                        disabled={isUploading}
                    />
                    <label htmlFor="file-upload">
                        <Button asChild disabled={isUploading} className="cursor-pointer">
                            <span>
                                <Upload className="w-4 h-4 mr-2" />
                                {isUploading ? "Uploading..." : "Upload File"}
                            </span>
                        </Button>
                    </label>
                </div>
            </div>

            {files.length === 0 ? (
                <Card className="border-dashed shadow-none bg-muted/50">
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                        <File className="w-12 h-12 mb-4 text-gray-300" />
                        <h4 className="font-medium text-foreground mb-1">No files uploaded</h4>
                        <p className="text-sm text-muted-foreground mb-4">Upload documents related to this customer</p>
                        <label htmlFor="file-upload">
                            <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                                <span>Select File</span>
                            </Button>
                        </label>
                    </CardContent>
                </Card>
            ) : (
                <DataTable
                    data={files}
                    columns={columns as any}
                    isLoading={isLoading}
                    emptyMessage="No files found"
                />
            )}
        </div>
    );
}
