"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import {
  FileText,
  Clock,
  Upload,
  History,
  Stethoscope,
  Loader2,
} from "lucide-react";
import { WorkOrder } from "@/lib/api/workorders";
import { workOrderNotesApi, WorkOrderNote } from "@/lib/api/workorder-notes";
import { documentsApi, Document } from "@/lib/api/documents";
import { vehiclesApi } from "@/lib/api/vehicles";
import WorkOrderTimeline from "@/app/(dashboard)/workorders/[id]/components/WorkOrderTimeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/useToast";
import { queueRequest } from "@/lib/offline/queue";
import { useOfflineStore } from "@/store/offlineStore";

interface MobileWorkOrderSectionsProps {
  workOrder: WorkOrder;
  workOrderId: number;
}

export function MobileWorkOrderSections({
  workOrder,
  workOrderId,
}: MobileWorkOrderSectionsProps) {
  const { toast } = useToast();
  const { isOnline } = useOfflineStore();
  const [notes, setNotes] = useState<WorkOrderNote[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [vehicleHistory, setVehicleHistory] = useState<
    Array<{ date?: string; description?: string; work_order_number?: string }>
  >([]);
  const [newNote, setNewNote] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);

  const vehicleId =
    typeof workOrder.vehicle === "number"
      ? workOrder.vehicle
      : (workOrder.vehicle as { id?: number })?.id;

  const showDiagnosis =
    workOrder.status === "diagnosis" ||
    ["intake", "inspection", "assigned"].includes(workOrder.status || "");

  useEffect(() => {
    const load = async () => {
      setLoadingNotes(true);
      setLoadingDocs(true);
      try {
        if (isOnline) {
          const [notesData, docsData] = await Promise.all([
            workOrderNotesApi.list({ work_order: workOrderId }),
            documentsApi.list({ work_order: workOrderId }),
          ]);
          setNotes(notesData);
          setDocuments(docsData.results || []);
        }
      } catch {
        // keep empty
      } finally {
        setLoadingNotes(false);
        setLoadingDocs(false);
      }

      if (vehicleId && isOnline) {
        try {
          const history = await vehiclesApi.history(vehicleId);
          const rows = Array.isArray(history)
            ? history
            : history?.results || history?.service_history || [];
          setVehicleHistory(Array.isArray(rows) ? rows.slice(0, 10) : []);
        } catch {
          setVehicleHistory([]);
        }
      }
    };
    load();
  }, [workOrderId, vehicleId, isOnline]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      if (isOnline) {
        const created = await workOrderNotesApi.create({
          work_order: workOrderId,
          note: newNote.trim(),
          note_type: "internal",
        });
        setNotes((prev) => [created, ...prev]);
      } else {
        await queueRequest("create", "/workorders/notes/", "POST", {
          work_order: workOrderId,
          note: newNote.trim(),
          note_type: "internal",
        });
        setNotes((prev) => [
          {
            id: Date.now(),
            work_order: workOrderId,
            note: newNote.trim(),
            note_type: "internal",
            created_at: new Date().toISOString(),
            created_by_name: "You (offline)",
          } as WorkOrderNote,
          ...prev,
        ]);
      }
      setNewNote("");
      toast({ title: isOnline ? "Note added" : "Note queued for sync" });
    } catch {
      toast({ title: "Failed to add note", variant: "destructive" });
    }
  };

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);
      formData.append("work_order", String(workOrderId));
      if (vehicleId) formData.append("vehicle", String(vehicleId));
      const doc = await documentsApi.create(formData);
      setDocuments((prev) => [doc, ...prev]);
      toast({ title: "Document uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {showDiagnosis && (
        <Card>
          <CardContent className="p-4">
            <Link href={`/mobile/workorders/${workOrderId}/diagnosis`}>
              <Button className="w-full" variant="outline">
                <Stethoscope className="mr-2 h-4 w-4" />
                Open Diagnosis
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="new-note">Add note</Label>
            <Textarea
              id="new-note"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Internal note..."
              rows={2}
            />
            <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}>
              Add Note
            </Button>
          </div>
          {loadingNotes ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet</p>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex justify-between gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {(note.note_type || "internal").replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{note.note}</p>
                  {note.created_by_name && (
                    <p className="text-xs text-muted-foreground mt-1">{note.created_by_name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <input
              type="file"
              id="wo-doc-upload"
              className="hidden"
              onChange={handleUploadDocument}
              disabled={uploading || !isOnline}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={uploading || !isOnline}
              onClick={() => document.getElementById("wo-doc-upload")?.click()}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload Document
            </Button>
            {!isOnline && (
              <p className="text-xs text-muted-foreground mt-1">Upload requires connection</p>
            )}
          </div>
          {loadingDocs ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <a
                    href={doc.file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    {doc.title || doc.original_filename}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WorkOrderTimeline workOrder={workOrder} notes={notes} />
        </CardContent>
      </Card>

      {vehicleId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Vehicle Service History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vehicleHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No prior service records</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {vehicleHistory.map((entry, i) => (
                  <li key={i} className="border-b border-border pb-2 last:border-0">
                    <p className="font-medium">
                      {entry.work_order_number || entry.description || "Service"}
                    </p>
                    {entry.date && (
                      <p className="text-xs text-muted-foreground">{entry.date}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
