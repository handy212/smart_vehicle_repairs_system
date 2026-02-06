"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workOrderPhotosApi, WorkOrderPhoto } from "@/lib/api/workorder-photos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Image as ImageIcon, X, Eye } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";

interface PhotosTabProps {
  workOrderId: number;
}

export default function PhotosTab({ workOrderId }: PhotosTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<WorkOrderPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
              <ImageIcon className="w-12 h-12 text-gray-300 text-muted-foreground mx-auto mb-4" />
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
                          src={photo.photo}
                          alt={photo.caption || "Work order photo"}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => handleViewPhoto(photo)}
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 flex space-x-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleViewPhoto(photo)}
                            >
                              <Eye className="w-4 h-4" />
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
                    src={previewUrl}
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
                    src={previewUrl}
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

