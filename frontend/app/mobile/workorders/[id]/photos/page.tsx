"use client";

import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { workOrderPhotosApi } from "@/lib/api/workorder-photos";
import { photosDB, compressPhoto } from "@/lib/offline/photos";
import { useOfflineStore } from "@/store/offlineStore";
import { useToast } from "@/lib/hooks/useToast";
import {
    ArrowLeft,
    Camera,
    Image as ImageIcon,
    Upload,
    X,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Photo {
    id?: number;
    workOrderId: number;
    blob: Blob;
    caption?: string;
    timestamp: number;
    uploaded: boolean;
    url?: string;
}

export default function WorkOrderPhotosPage() {
    const params = useParams();
    const router = useRouter();
    const workOrderId = parseInt(params.id as string);
    const { isOnline } = useOfflineStore();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [photos, setPhotos] = useState<Photo[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [caption, setCaption] = useState("");

    const loadPhotos = async () => {
        setLoading(true);
        try {
            if (isOnline) {
                // Load from server
                const serverPhotos = await workOrderPhotosApi.list({ work_order: workOrderId });
                const formatted = serverPhotos.map((p: any) => ({
                    id: p.id,
                    workOrderId,
                    blob: null as any, // Server photos don't need blob
                    url: p.photo_url || p.photo,
                    caption: p.caption,
                    timestamp: new Date(p.created_at).getTime(),
                    uploaded: true,
                }));
                setPhotos(formatted);
            }

            // Always load offline photos
            const offlinePhotos = await photosDB.getByWorkOrder(workOrderId);
            const offlineFormatted = offlinePhotos.map((p) => ({
                ...p,
                url: URL.createObjectURL(p.blob),
            }));

            // Merge server and offline photos
            if (isOnline) {
                setPhotos((prev) => [...prev, ...offlineFormatted]);
            } else {
                setPhotos(offlineFormatted);
            }
        } catch (error) {
            console.error("Failed to load photos:", error);
            toast({
                title: "Error",
                description: "Failed to load photos",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                // Compress the photo
                const compressedBlob = await compressPhoto(file);

                if (isOnline) {
                    // Upload immediately
                    const photoFile = new File([compressedBlob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });

                    await workOrderPhotosApi.create({
                        work_order: workOrderId,
                        photo: photoFile,
                        photo_type: "during",
                        caption: caption || undefined,
                    });

                    toast({
                        title: "Success",
                        description: "Photo uploaded successfully",
                    });
                } else {
                    // Store offline
                    await photosDB.add(workOrderId, compressedBlob, caption);
                    toast({
                        title: "Saved Offline",
                        description: "Photo will upload when you're back online",
                    });
                }
            }

            setCaption("");
            await loadPhotos();
        } catch (error: any) {
            console.error("Failed to add photo:", error);
            toast({
                title: "Error",
                description: error.message || "Failed to add photo",
                variant: "destructive",
            });
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleDelete = async (photo: Photo) => {
        try {
            if (photo.id && isOnline) {
                await workOrderPhotosApi.delete(photo.id);
            }
            if (!photo.uploaded) {
                await photosDB.delete(photo.timestamp);
            }
            await loadPhotos();
            toast({
                title: "Success",
                description: "Photo deleted",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete photo",
                variant: "destructive",
            });
        }
    };

    useState(() => {
        loadPhotos();
    });

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            {/* Header */}
            <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
                <div className="px-4 py-3 flex items-center justify-between">
                    <Link href={`/mobile/workorders/${workOrderId}`}>
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back
                        </Button>
                    </Link>
                    <h1 className="text-lg font-semibold">Photos</h1>
                    <div className="w-20" /> {/* Spacer for centering */}
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* Upload Section */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="caption">Caption (Optional)</Label>
                                <Input
                                    id="caption"
                                    placeholder="Describe this photo..."
                                    value={caption}
                                    onChange={(e) => setCaption(e.target.value)}
                                />
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                multiple
                                onChange={handleFileSelect}
                                className="hidden"
                            />

                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="w-full"
                                >
                                    {uploading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <Camera className="h-4 w-4 mr-2" />
                                            Take Photo
                                        </>
                                    )}
                                </Button>

                                <Button
                                    onClick={() => {
                                        if (fileInputRef.current) {
                                            fileInputRef.current.removeAttribute("capture");
                                            fileInputRef.current.click();
                                        }
                                    }}
                                    disabled={uploading}
                                    variant="outline"
                                    className="w-full"
                                >
                                    <ImageIcon className="h-4 w-4 mr-2" />
                                    Choose Photo
                                </Button>
                            </div>

                            {!isOnline && (
                                <p className="text-xs text-orange-600 dark:text-orange-400 text-center">
                                    Offline - Photos will upload when connection restored
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Photos Grid */}
                {loading ? (
                    <div className="text-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                        <p className="mt-2 text-sm text-gray-500">Loading photos...</p>
                    </div>
                ) : photos.length === 0 ? (
                    <div className="text-center py-12">
                        <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No photos yet</p>
                        <p className="text-sm text-gray-400 mt-1">
                            Take photos to document your work
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {photos.map((photo) => (
                            <div
                                key={photo.timestamp}
                                className="relative group rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                            >
                                <div className="aspect-square relative">
                                    <img
                                        src={photo.url}
                                        alt={photo.caption || "Work order photo"}
                                        className="w-full h-full object-cover"
                                    />
                                    {!photo.uploaded && (
                                        <div className="absolute top-2 right-2">
                                            <div className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                                <Upload className="h-3 w-3" />
                                                Pending
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => handleDelete(photo)}
                                        className="absolute top-2 left-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                                {photo.caption && (
                                    <div className="p-2 bg-white dark:bg-gray-800">
                                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                            {photo.caption}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
