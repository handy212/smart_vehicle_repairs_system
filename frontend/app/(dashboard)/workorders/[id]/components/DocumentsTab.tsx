"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { documentsApi, Document } from "@/lib/api/documents";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { FileText, Plus, Trash2, Download, Mic, Play, Pause, AlertCircle, CheckCircle, Sparkles, Wand2, FileAudio } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";

interface DocumentsTabProps {
    workOrderId: number;
}

export default function DocumentsTab({ workOrderId }: DocumentsTabProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
    const [processingId, setProcessingId] = useState<number | null>(null);

    const { data: documentsData, isLoading } = useQuery({
        queryKey: ["workorder-documents", workOrderId],
        queryFn: () => documentsApi.list({ work_order: workOrderId }),
    });

    const documents = documentsData?.results || [];

    const uploadMutation = useMutation({
        mutationFn: (formData: FormData) => documentsApi.create(formData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["workorder-documents", workOrderId] });
            toast({
                title: "Success",
                description: "Document uploaded successfully",
            });
            setIsUploadDialogOpen(false);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (error: any) => {
        toast({
            title: "Error",
            description: error.response?.data?.detail || "Failed to upload document",
            variant: "destructive",
        });
    },
    });

const deleteMutation = useMutation({
    mutationFn: (id: number) => documentsApi.delete(id),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["workorder-documents", workOrderId] });
        toast({
            title: "Success",
            description: "Document deleted successfully",
        });
    },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (error: any) => {
    toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete document",
        variant: "destructive",
    });
},
    });

const processVoiceMutation = useMutation({
    mutationFn: (id: number) => documentsApi.processVoiceNote(id),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["workorder-documents", workOrderId] });
        toast({
            title: "AI Analysis Complete",
            description: "Voice note has been transcribed and analyzed.",
        });
        setProcessingId(null);
    },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (error: any) => {
    toast({
        title: "AI Analysis Failed",
        description: error.response?.data?.error || "Failed to process voice note",
        variant: "destructive",
    });
    setProcessingId(null);
},
    });

const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append("work_order", workOrderId.toString());
    uploadMutation.mutate(formData);
};

const handleProcessVoice = (id: number) => {
    setProcessingId(id);
    processVoiceMutation.mutate(id);
};

const isAudioFile = (doc: Document) => {
    return (
        doc.file_type.includes("audio") ||
        doc.original_filename.toLowerCase().endsWith(".mp3") ||
        doc.original_filename.toLowerCase().endsWith(".wav") ||
        doc.original_filename.toLowerCase().endsWith(".m4a")
    );
};

if (isLoading) {
    return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );
}

return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <div>
                <h3 className="text-lg font-semibold text-foreground">Documents & Voice Notes</h3>
                <p className="text-sm text-muted-foreground tracking-tight">Manage attachments and AI-powered voice diagnostics</p>
            </div>
            <Button onClick={() => setIsUploadDialogOpen(true)} className="bg-primary hover:bg-primary/90 shadow-sm border-orange-200">
                <Plus className="w-4 h-4 mr-2" />
                Add Document
            </Button>
        </div>

        {documents.length === 0 ? (
            <Card className="border-dashed border-2 bg-muted/30">
                <CardContent className="pt-10 pb-10">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                            <FileText className="w-8 h-8 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm font-medium text-foreground mb-1">
                            No documents yet
                        </p>
                        <p className="text-xs text-muted-foreground mb-6 max-w-xs mx-auto">
                            Upload reports, manuals, or record voice notes for AI analysis.
                        </p>
                        <Button onClick={() => setIsUploadDialogOpen(true)} variant="outline" size="sm" className="h-9">
                            <Plus className="w-3.5 h-3.5 mr-2" />
                            Upload File
                        </Button>
                    </div>
                </CardContent>
            </Card>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map((doc) => (
                    <Card key={doc.id} className="overflow-hidden border-none shadow-sm ring-1 ring-gray-900/5 hover:ring-primary/20 transition-all duration-200 bg-card/60 backdrop-blur-md">
                        <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-start justify-between space-y-0">
                            <div className="flex items-center space-x-3">
                                <div className={`p-2 rounded-lg ${isAudioFile(doc) ? 'bg-orange-100 dark:bg-orange-900/30 text-primary' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
                                    {isAudioFile(doc) ? <Mic className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <CardTitle className="text-sm font-bold truncate pr-2 tracking-tight">
                                        {doc.title}
                                    </CardTitle>
                                    <CardDescription className="text-[10px] uppercase font-semibold tracking-wider opacity-70">
                                        {doc.file_type.split('/')[1]?.toUpperCase() || 'FILE'} • {(doc.file_size / 1024 / 1024).toFixed(2)} MB
                                    </CardDescription>
                                </div>
                            </div>
                            <div className="flex space-x-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    onClick={() => window.open(doc.file, '_blank')}
                                >
                                    <Download className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => {
                                        if (confirm("Delete this document?")) {
                                            deleteMutation.mutate(doc.id);
                                        }
                                    }}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            {doc.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mb-3 bg-muted/50 p-2 rounded-md italic ring-1 ring-inset ring-black/5">
                                    "{doc.description}"
                                </p>
                            )}

                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {doc.tags?.split(',').map((tag, idx) => (
                                    <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-muted/30 border-border/50">
                                        {tag.trim()}
                                    </Badge>
                                ))}
                                {isAudioFile(doc) && !doc.tags?.includes('ai_transcribed') && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-primary/30 text-primary bg-primary/5">
                                        Ready for AI
                                    </Badge>
                                )}
                            </div>

                            {isAudioFile(doc) && (
                                <div className="flex flex-col space-y-2">
                                    <Button
                                        size="sm"
                                        variant={doc.tags?.includes('ai_transcribed') ? "outline" : "default"}
                                        className={`w-full h-8 text-[11px] font-bold ${doc.tags?.includes('ai_transcribed') ? 'border-orange-200' : 'bg-primary hover:bg-primary/90'}`}
                                        disabled={processingId === doc.id || processVoiceMutation.isPending}
                                        onClick={() => handleProcessVoice(doc.id)}
                                    >
                                        {processingId === doc.id ? (
                                            <>
                                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-2" />
                                                Analyzing...
                                            </>
                                        ) : doc.tags?.includes('ai_transcribed') ? (
                                            <>
                                                <Sparkles className="w-3 h-3 mr-2" />
                                                Re-analyze Voice Note
                                            </>
                                        ) : (
                                            <>
                                                <Wand2 className="w-3 h-3 mr-2" />
                                                Analyze with AI
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}

                            <div className="mt-3 pt-3 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground">
                                <span className="flex items-center">
                                    {format(new Date(doc.uploaded_at), "MMM dd, yyyy")}
                                </span>
                                <span>By: {doc.uploaded_by_name || 'System'}</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        )}

        {/* Upload Dialog */}
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        Upload Document
                    </DialogTitle>
                    <DialogDescription>
                        Upload PDF reports, images, or audio voice notes.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleUpload} className="space-y-4 pt-4">
                    <div className="grid w-full items-center gap-1.5">
                        <label htmlFor="title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title</label>
                        <Input id="title" name="title" placeholder="Diagnosis Note, Parts Manual, etc." required />
                    </div>
                    <div className="grid w-full items-center gap-1.5">
                        <label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                        <Input id="description" name="description" placeholder="Optional details..." />
                    </div>
                    <div className="grid w-full items-center gap-1.5">
                        <label htmlFor="file" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">File</label>
                        <div className="flex items-center justify-center w-full">
                            <label htmlFor="file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/30 hover:bg-muted/50 border-border transition-all duration-200">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <Plus className="w-8 h-8 mb-3 text-muted-foreground/50" />
                                    <p className="mb-2 text-xs text-muted-foreground"><span className="font-semibold text-primary">Click to upload</span> or drag and drop</p>
                                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">PDF, PNG, JPG or MP3 (MAX. 50MB)</p>
                                </div>
                                <Input id="file" name="file" type="file" className="hidden" required />
                            </label>
                        </div>
                    </div>
                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsUploadDialogOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={uploadMutation.isPending}>
                            {uploadMutation.isPending ? "Uploading..." : "Upload"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    </div>
);
}
