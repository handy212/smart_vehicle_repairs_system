"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workOrderPhotosApi, WorkOrderPhoto } from "@/lib/api/workorder-photos";
import { getMediaUrl } from "@/lib/api/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Image as ImageIcon, Eye, Sparkles, Loader2, Info } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PhotosTabProps {
  workOrderId: number;
}

export default function PhotosTab({ workOrderId }: PhotosTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<WorkOrderPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<{
    detected_issues: string[];
    confidence_score: number;
    summary: string;
    suggested_severity: string;
  } | null>(null);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ["workorder-photos", workOrderId],
    queryFn: () => workOrderPhotosApi.list({ work_order: workOrderId }),
  });

  const uploadMutation = useMutation({
    mutationFn: (data: {
      photo: File;
      photo_type: string;
      caption?: string;
      description?: string;
    }) =>
      workOrderPhotosApi.create({
        work_order: workOrderId,
        photo: data.photo,

        photo_type: data.photo_type as any,
        caption: data.caption,
        description: data.description,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorder-photos", workOrderId] });
      toast({
        title: "Success",
        description: "Photo uploaded successfully",
      });
      setIsUploadDialogOpen(false);
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to upload photo",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => workOrderPhotosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorder-photos", workOrderId] });
      toast({
        title: "Success",
        description: "Photo deleted successfully",
      });
      setSelectedPhoto(null);
      setPreviewUrl(null);
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete photo",
        variant: "destructive",
      });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: (id: number) => workOrderPhotosApi.analyzeDamage(id),
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({
        title: "Analysis Complete",
        description: "AI has finished scanning the photo for damage.",
      });
    },

    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.response?.data?.error || "Failed to analyze photo",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File | null) => {
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "File size must be less than 10MB",
          variant: "destructive",
        });
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Error",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
    }
  };

  const handleViewPhoto = (photo: WorkOrderPhoto) => {
    setSelectedPhoto(photo);
    setPreviewUrl(photo.photo);
    setAnalysisResult(null); // Reset analysis when viewing new photo
  };

  const groupedPhotos = photos.reduce((acc, photo) => {
    if (!acc[photo.photo_type]) {
      acc[photo.photo_type] = [];
    }
    acc[photo.photo_type].push(photo);
    return acc;
  }, {} as Record<string, WorkOrderPhoto[]>);

  const photoTypeLabels: Record<string, string> = {
    before: "Before",
    during: "During",
    after: "After",
    part: "Parts",
    other: "Other",
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
          <h3 className="text-lg font-semibold">Work Order Photos</h3>
          <p className="text-sm text-muted-foreground">Document work progress with photos</p>
        </div>
        <UploadPhotoDialog
          isOpen={isUploadDialogOpen}
          onOpenChange={(open) => {
            setIsUploadDialogOpen(open);
            if (!open) {
              if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
              }
              setPreviewUrl(null);
            }
          }}
          onUpload={uploadMutation.mutate}
          isUploading={uploadMutation.isPending}
          previewUrl={previewUrl}
          onFileSelect={handleFileSelect}
        />
      </div>

      {photos.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">
                No photos uploaded yet
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Document work progress with before, during, and after photos.
              </p>
              <Button onClick={() => setIsUploadDialogOpen(true)} variant="secondary">
                <Plus className="w-4 h-4 mr-2" />
                Upload First Photo
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedPhotos).map(([type, typePhotos]) => (
            <Card key={type}>
              <CardHeader>
                <CardTitle>{photoTypeLabels[type] || type} ({typePhotos.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {typePhotos.map((photo) => (
                    <div
                      key={photo.id}
                      className="relative group border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <div className="aspect-square bg-muted relative">
                        <img
                          src={getMediaUrl(photo.photo)}
                          alt={photo.caption || "Work order photo"}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => handleViewPhoto(photo)}
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity">
                          <div className="flex space-x-2 transition-opacity">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleViewPhoto(photo)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              title="Smart Scan"
                              className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200"
                              onClick={() => {
                                handleViewPhoto(photo);
                                analyzeMutation.mutate(photo.id);
                              }}
                              disabled={analyzeMutation.isPending}
                            >
                              {analyzeMutation.isPending && analyzeMutation.variables === photo.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Sparkles className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this photo?")) {
                                  deleteMutation.mutate(photo.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      {photo.caption && (
                        <div className="p-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {photo.caption}
                          </p>
                          {photo.taken_by_name && (
                            <p className="text-xs text-muted-foreground">
                              by {photo.taken_by_name}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(photo.created_at), "MMM dd, yyyy")}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Photo Preview Modal */}
      {selectedPhoto && previewUrl && (
        <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {selectedPhoto.caption || photoTypeLabels[selectedPhoto.photo_type] || "Photo"}
              </DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6">
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={getMediaUrl(previewUrl)}
                    alt={selectedPhoto.caption || "Work order photo"}
                    className="w-full h-auto rounded-lg"
                  />
                </div>
                {selectedPhoto.description && (
                  <p className="text-sm text-muted-foreground">{selectedPhoto.description}</p>
                )}
                <div className="text-sm text-muted-foreground">
                  {selectedPhoto.taken_by_name && (
                    <p>Taken by: {selectedPhoto.taken_by_name}</p>
                  )}
                  <p>{format(new Date(selectedPhoto.created_at), "MMM dd, yyyy HH:mm")}</p>
                </div>

              // AI Analysis Section
                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-semibold flex items-center">
                      <Sparkles className="w-4 h-4 mr-2 text-purple-500" />
                      AI Visual Triage
                    </h4>
                    {!analysisResult && !analyzeMutation.isPending && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 border-purple-200 hover:bg-purple-50"
                        onClick={() => analyzeMutation.mutate(selectedPhoto.id)}
                      >
                        <Sparkles className="w-3 h-3 mr-1 text-purple-500" />
                        Run Smart Scan
                      </Button>
                    )}
                  </div>

                  {analyzeMutation.isPending && (
                    <div className="flex flex-col items-center justify-center py-8 bg-muted/30 rounded-lg border border-dashed">
                      <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
                      <p className="text-sm text-muted-foreground animate-pulse">
                        Analyzing photo for structural damage and wear...
                      </p>
                    </div>
                  )}

                  {analysisResult && (
                    <div className="space-y-4">
                      <Alert className="bg-purple-50/50 border-purple-100 italic">
                        <Info className="h-4 w-4 text-purple-600" />
                        <AlertDescription className="text-purple-900">
                          {analysisResult.summary}
                        </AlertDescription>
                      </Alert>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="bg-white shadow-none border-dashed border-purple-100">
                          <CardHeader className="p-3">
                            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                              Detected Issues
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-3 pt-0">
                            <ul className="space-y-1">
                              {analysisResult.detected_issues.map((issue, i) => (
                                <li key={i} className="text-sm flex items-start">
                                  <span className="text-purple-500 mr-2">•</span>
                                  {issue}
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>

                        <div className="space-y-4">
                          <div className="p-3 rounded-lg border bg-white border-purple-50">
                            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                              AI Confidence
                            </p>
                            <div className="flex items-center space-x-2">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500 rounded-full"
                                  style={{ width: `${analysisResult.confidence_score * 100}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium">
                                {Math.round(analysisResult.confidence_score * 100)}%
                              </span>
                            </div>
                          </div>

                          <div className="p-3 rounded-lg border bg-white border-purple-50">
                            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                              Suggested Severity
                            </p>
                            <Badge
                              variant="outline"
                              className={
                                analysisResult.suggested_severity === "critical"
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : analysisResult.suggested_severity === "major"
                                    ? "bg-orange-50 text-orange-700 border-orange-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                              }
                            >
                              {analysisResult.suggested_severity.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm("Are you sure you want to delete this photo?")) {
                    deleteMutation.mutate(selectedPhoto.id);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface UploadPhotoDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (data: {
    photo: File;
    photo_type: string;
    caption?: string;
    description?: string;
  }) => void;
  isUploading: boolean;
  previewUrl: string | null;
  onFileSelect: (file: File | null) => void;
}

function UploadPhotoDialog({
  isOpen,
  onOpenChange,
  onUpload,
  isUploading,
  previewUrl,
  onFileSelect,
}: UploadPhotoDialogProps) {
  const [photoType, setPhotoType] = useState("before");
  const [caption, setCaption] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      return;
    }
    onUpload({
      photo: selectedFile,
      photo_type: photoType,
      caption: caption || undefined,
      description: description || undefined,
    });
    // Reset form
    setCaption("");
    setDescription("");
    setSelectedFile(null);
    onFileSelect(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Upload Photo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Work Order Photo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Photo <span className="text-red-500">*</span>
              </label>
              <Input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                required
                disabled={isUploading}
                className="w-full"
              />
              {previewUrl && (
                <div className="mt-2">
                  <img
                    src={getMediaUrl(previewUrl)}
                    alt="Preview"
                    className="w-full h-48 object-cover rounded-lg border border-border"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Photo Type <span className="text-red-500">*</span>
              </label>
              <Select
                value={photoType}
                onValueChange={(val) => setPhotoType(val)}
                disabled={isUploading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="before">Before</SelectItem>
                  <SelectItem value="during">During</SelectItem>
                  <SelectItem value="after">After</SelectItem>
                  <SelectItem value="part">Part</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Caption
              </label>
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Brief caption for the photo"
                disabled={isUploading}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed description (optional)"
                rows={3}
                disabled={isUploading}
                className="w-full"
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!selectedFile || isUploading}>
            {isUploading ? "Uploading..." : "Upload Photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
