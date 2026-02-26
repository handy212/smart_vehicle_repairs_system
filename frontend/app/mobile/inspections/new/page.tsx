"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inspectionsApi } from "@/lib/api/inspections";
import { useOfflineStore } from "@/store/offlineStore";
import { inspectionsDB } from "@/lib/offline/db";
import { photosDB } from "@/lib/offline/db";
import { queueRequest } from "@/lib/offline/queue";
import { ArrowLeft, Camera, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";

export default function NewInspectionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isOnline } = useOfflineStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    vehicle: "",
    inspection_type: "pre_service",
    notes: "",
  });
  const [photos, setPhotos] = useState<File[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const tempId = Date.now();
      const inspectionData = {
        ...formData,
        vehicle: parseInt(formData.vehicle),
        status: "in_progress" as const,
      };

      if (isOnline) {
        const inspection = await inspectionsApi.create(inspectionData);

        // TODO: Implement photo upload for inspections. 
        // Currently InspectionPhoto requires an InspectionResult, but these are general photos.
        /*
        for (const photo of photos) {
          const formData = new FormData();
          formData.append("photo", photo);
          formData.append("inspection", inspection.id.toString());
          await inspectionsApi.uploadPhoto(inspection.id, formData);
        }
        */

        toast({
          title: "Success",
          description: "Inspection created successfully",
        });
        router.push(`/mobile/inspections/${inspection.id}`);
      } else {
        // Save offline
        await inspectionsDB.set(tempId, { ...inspectionData, id: tempId }, false);

        // Store photos offline
        for (const photo of photos) {
          const photoId = `photo-${Date.now()}-${Math.random()}`;
          await photosDB.add(photoId, photo, undefined, tempId);
        }

        // Queue for sync
        await queueRequest("create", "/inspections/", "POST", inspectionData);

        toast({
          title: "Saved Offline",
          description: "Inspection will sync when online",
        });
        router.push("/mobile/inspections");
      }

    } catch (error: any) {
      console.error("Failed to create inspection:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to create inspection",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoCapture = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        setPhotos([...photos, file]);
      }
    };
    input.click();
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/mobile/inspections">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h2 className="text-xl font-bold text-foreground">
          New Inspection
        </h2>
        <div className="w-10" /> {/* Spacer */}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="vehicle">Vehicle ID</Label>
          <Input
            id="vehicle"
            type="number"
            value={formData.vehicle}
            onChange={(e) =>
              setFormData({ ...formData, vehicle: e.target.value })
            }
            required
            placeholder="Enter vehicle ID"
          />
        </div>

        <div>
          <Label htmlFor="inspection_type">Inspection Type</Label>
          <select
            id="inspection_type"
            value={formData.inspection_type}
            onChange={(e) =>
              setFormData({ ...formData, inspection_type: e.target.value })
            }
            className="w-full px-3 py-2 border border-border rounded-md bg-card text-foreground"
          >
            <option value="pre_service">Pre-Service</option>
            <option value="post_service">Post-Service</option>
            <option value="safety">Safety</option>
            <option value="quality">Quality</option>
          </select>
        </div>

        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
            placeholder="Add inspection notes..."
            rows={4}
          />
        </div>

        {/* Photos */}
        <div>
          <Label>Photos</Label>
          <div className="flex gap-2 mt-2">
            <Button type="button" variant="outline" onClick={handlePhotoCapture}>
              <Camera className="h-4 w-4 mr-2" />
              Add Photo
            </Button>
          </div>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {photos.map((photo, index) => (
                <div key={index} className="relative">
                  <img
                    src={URL.createObjectURL(photo)}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-24 object-cover rounded"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0"
                    onClick={() =>
                      setPhotos(photos.filter((_, i) => i !== index))
                    }
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex gap-2 pt-4">
          <Link href="/mobile/inspections" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={loading} className="flex-1">
            <Save className="h-4 w-4 mr-2" />
            {loading ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
