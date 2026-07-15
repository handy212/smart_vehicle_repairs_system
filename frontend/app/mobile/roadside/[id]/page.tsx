"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { roadsideApi, RoadsideRequest, RoadsideNote, RoadsidePhoto } from "@/lib/api/roadside";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { RoadsideJobHeader } from "@/components/mobile/roadside/RoadsideJobHeader";
import {
  RoadsideTechnicianWorkflow,
  RoadsideContactBar,
  getRoadsideWorkflowPhase,
  roadsideHasActionBar,
} from "@/components/mobile/roadside/RoadsideTechnicianWorkflow";
import {
  getRoadsideCustomerLabel,
  getRoadsideVehicleLabel,
  getRoadsideVehiclePlate,
  getRoadsideVehicleVin,
} from "@/lib/mobile/roadside-display";
import { getMediaUrl } from "@/lib/api/utils";
import {
  ArrowLeft,
  MapPin,
  User,
  Car,
  Camera,
  Image as ImageIcon,
  Loader2,
  StickyNote,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { photosDB, roadsideRequestsDB } from "@/lib/offline/db";
import { queueRequest } from "@/lib/offline/queue";
import { compressPhoto } from "@/lib/offline/photos";
import { useOfflineStore } from "@/store/offlineStore";
import { useAuthStore } from "@/store/authStore";
import {
  getEffectiveAssignmentStatus,
  isAssignmentAccepted,
} from "@/lib/mobile/roadside-assignment";
import { CheckCircle2 } from "lucide-react";

export default function RoadsideDetailPage() {
  const { isOnline } = useOfflineStore();
  const user = useAuthStore((s) => s.user);
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [request, setRequest] = useState<RoadsideRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [siteNote, setSiteNote] = useState("");
  const [photoCaption, setPhotoCaption] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id) loadRequest();
  }, [id, isOnline]);

  const loadRequest = async () => {
    try {
      if (isOnline) {
        const data = await roadsideApi.getRequest(id);
        setRequest(data);
        await roadsideRequestsDB.set(String(id), data, true);
      } else {
        const cached = await roadsideRequestsDB.get(String(id));
        if (cached) setRequest(cached);
        else toast.error("No cached data for this job");
      }
    } catch {
      const cached = await roadsideRequestsDB.get(String(id));
      if (cached) setRequest(cached);
      else toast.error("Failed to load job");
    } finally {
      setLoading(false);
    }
  };

  const openDirections = () => {
    if (!request) return;
    if (request.latitude && request.longitude) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${request.latitude},${request.longitude}`,
        "_blank"
      );
    } else if (request.breakdown_location) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(request.breakdown_location)}`,
        "_blank"
      );
    }
  };

  const handleAddSiteNote = async () => {
    if (!request || !siteNote.trim()) return;
    setSavingNote(true);
    const noteText = siteNote.trim();
    try {
      if (isOnline) {
        const note = await roadsideApi.addSiteNote(request.id, noteText);
        setRequest({ ...request, site_notes: [note, ...(request.site_notes || [])] });
        toast.success("Note added");
      } else {
        const tempNote: RoadsideNote = {
          id: Date.now(),
          request: request.id,
          note: noteText,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by_name: "You (offline)",
        };
        const updated = { ...request, site_notes: [tempNote, ...(request.site_notes || [])] };
        setRequest(updated);
        await roadsideRequestsDB.set(String(id), updated, false);
        await queueRequest(
          "create",
          `/roadside/requests/${request.id}/site-notes/`,
          "POST",
          { note: noteText }
        );
        toast.success("Note queued");
      }
      setSiteNote("");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setSavingNote(false);
    }
  };

  const handlePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!request || !files?.length) return;
    setUploadingPhoto(true);
    try {
      const photoType = request.status === "on_site" ? "arrival" : "repair";
      const caption = photoCaption.trim() || undefined;

      if (isOnline) {
        for (const file of Array.from(files)) {
          await roadsideApi.uploadSitePhoto(request.id, {
            image: file,
            photo_type: photoType,
            caption,
          });
        }
        const refreshed = await roadsideApi.getRequest(id);
        setRequest(refreshed);
        await roadsideRequestsDB.set(String(id), refreshed, true);
      } else {
        const uploaded: RoadsidePhoto[] = [];
        for (const file of Array.from(files)) {
          const blob = await compressPhoto(file);
          await photosDB.add(`roadside-${request.id}-${Date.now()}`, blob, {
            roadsideRequestId: String(request.id),
            caption,
            photoType,
          });
          uploaded.push({
            id: Date.now() + uploaded.length,
            request: request.id,
            image: URL.createObjectURL(blob),
            photo_type: photoType as RoadsidePhoto["photo_type"],
            caption,
            taken_at: new Date().toISOString(),
            uploaded_at: new Date().toISOString(),
          } as RoadsidePhoto);
        }
        const updated = { ...request, photos: [...uploaded, ...(request.photos || [])] };
        setRequest(updated);
        await roadsideRequestsDB.set(String(id), updated, false);
      }
      setPhotoCaption("");
      toast.success("Photo saved");
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
      event.target.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!request) {
    return (
      <MobilePageShell>
        <div className="space-y-4 py-8 text-center">
          <p className="text-muted-foreground">Job not found or not assigned to you.</p>
          <Button variant="outline" onClick={() => router.push("/mobile/roadside")}>
            Back to jobs
          </Button>
        </div>
      </MobilePageShell>
    );
  }

  const userId = user?.id ?? null;
  const assignmentStatus = getEffectiveAssignmentStatus(request, userId);
  const phase = getRoadsideWorkflowPhase(request, userId);
  const serviceLabel = request.service_type
    .replace("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const customerLabel = getRoadsideCustomerLabel(request);
  const vehicleLabel = getRoadsideVehicleLabel(request);
  const vehiclePlate = getRoadsideVehiclePlate(request);
  const vehicleVin = getRoadsideVehicleVin(request);
  const canDocumentSite = ["on_site", "in_progress"].includes(request.status);
  const accepted = isAssignmentAccepted(request, userId);
  const siteNotes = request.site_notes || [];
  const sitePhotos = request.photos || [];
  const showSiteSection =
    assignmentStatus !== "rejected" &&
    (accepted || phase === "done" || siteNotes.length > 0 || sitePhotos.length > 0);

  return (
    <div className="min-h-0 flex-1 bg-muted">
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-card px-3 py-3 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium text-muted-foreground">Roadside job</span>
      </div>

      <MobilePageShell
        withActionBar={roadsideHasActionBar(request, userId)}
        className="space-y-4"
      >
        <RoadsideJobHeader
          requestNumber={request.request_number}
          serviceLabel={serviceLabel}
          status={request.status}
          assignmentStatus={assignmentStatus}
        />

        <RoadsideTechnicianWorkflow
          request={request}
          requestId={id}
          userId={userId}
          onRequestUpdated={setRequest}
        />

        {phase === "done" && (
          <Card className="border-success/40 bg-success/5">
            <CardContent className="flex items-center gap-3 p-4">
              <CheckCircle2 className="h-8 w-8 shrink-0 text-success" />
              <div>
                <p className="font-medium text-foreground">Job {request.status}</p>
                {request.completed_at && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(request.completed_at).toLocaleString()}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="font-normal leading-snug">{request.breakdown_location}</span>
            </CardTitle>
          </CardHeader>
          {accepted && phase !== "done" && (
            <CardContent className="pt-0">
              <RoadsideContactBar
                request={request}
                userId={userId}
                onOpenDirections={openDirections}
              />
            </CardContent>
          )}
        </Card>

        {(request.description || request.notes) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Problem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              {request.description && <p>{request.description}</p>}
              {request.notes && (
                <p className="rounded-md border border-warning/30 bg-warning/10 p-2 text-warning dark:text-warning">
                  {request.notes}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Customer & vehicle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-sm">
            <div className="flex gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">{customerLabel}</p>
                {request.customer_number && (
                  <p className="text-xs text-muted-foreground">#{request.customer_number}</p>
                )}
                {request.customer_phone ? (
                  <a
                    href={`tel:${request.customer_phone}`}
                    className="mt-1 block text-primary underline-offset-2 hover:underline"
                  >
                    {request.customer_phone}
                  </a>
                ) : (
                  <p className="text-muted-foreground">No phone on file</p>
                )}
                {request.customer_email && (
                  <p className="text-xs text-muted-foreground">{request.customer_email}</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 border-t border-border pt-3">
              <Car className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">{vehicleLabel}</p>
                {vehiclePlate && (
                  <p className="text-muted-foreground">Plate: {vehiclePlate}</p>
                )}
                {vehicleVin && (
                  <p className="text-xs text-muted-foreground">VIN: {vehicleVin}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {showSiteSection && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Site notes & photos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              {!canDocumentSite && phase !== "done" && (
                <p className="text-sm text-muted-foreground">
                  Add notes and photos after you mark arrival on site.
                </p>
              )}

              {sitePhotos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {sitePhotos.map((photo) => (
                    <figure key={photo.id} className="overflow-hidden rounded-lg border border-border bg-card">
                      <img
                        src={getMediaUrl(photo.image)}
                        alt={photo.caption || "Site photo"}
                        className="aspect-square w-full object-cover"
                        loading="lazy"
                      />
                      {photo.caption && (
                        <figcaption className="line-clamp-2 p-1.5 text-[11px] text-muted-foreground">
                          {photo.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              )}

              {siteNotes.map((note) => (
                <div key={note.id} className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{note.note}</p>
                  {note.created_by_name && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{note.created_by_name}</p>
                  )}
                </div>
              ))}

              {canDocumentSite && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="site-note">Add note</Label>
                    <Textarea
                      id="site-note"
                      value={siteNote}
                      onChange={(e) => setSiteNote(e.target.value)}
                      rows={2}
                      placeholder="Findings, parts used…"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={handleAddSiteNote}
                      disabled={savingNote || !siteNote.trim()}
                    >
                      {savingNote ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <StickyNote className="mr-2 h-4 w-4" />
                      )}
                      Save note
                    </Button>
                  </div>
                  <Input
                    value={photoCaption}
                    onChange={(e) => setPhotoCaption(e.target.value)}
                    placeholder="Photo caption (optional)"
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={uploadingPhoto}
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Camera
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => galleryInputRef.current?.click()}
                      disabled={uploadingPhoto}
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Gallery
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </MobilePageShell>
    </div>
  );
}
